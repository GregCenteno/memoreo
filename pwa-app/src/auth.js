// Cuentas reales: Supabase Auth guarda el correo y la contraseña (nunca
// pasan por nuestro propio código, ni en texto plano ni hasheados — eso lo
// hace Supabase del lado del servidor), y la tabla public.profiles guarda
// todo lo demás de la cuenta (plan, color, avatar, datos de Stripe...),
// ligada 1 a 1 al usuario de Auth por su mismo id (ver supabase/schema.sql).
//
// Patrón de caché en memoria: las funciones de lectura (currentAccount) y
// de escritura de aquí son todas asíncronas (hablan con Supabase), pero
// devuelven siempre el mismo objeto "cuenta pública" de siempre para que
// src/app.js necesite cambiar lo menos posible — nomás agregarle `await`.
//
// Pagos: ya no se cobra automático. Quien quiere Premium o Premium Plus
// elige cuántos meses paga y si prefiere transferencia bancaria (México) o
// PayPal, deja un celular, y eso queda guardado como una "solicitud" (ver
// requestManualPayment más abajo) a la espera de que el administrador la
// active a mano desde su panel, una vez que de verdad recibió el pago —
// ver netlify/functions/admin-payment-requests.mjs. Un plan de paga NUNCA
// se activa aquí directamente: setPlan() solo sirve para bajar a Gratis
// (sin cobro). planExpiresAt (ver buildAccount) es hasta cuándo vale ese
// plan activado a mano.
//
// A propósito la cuenta NO se baja sola a Gratis en la base de datos en
// cuanto pasa esa fecha (a diferencia de una versión anterior de esto) —
// en vez de eso, buildAccount() calcula subscriptionExpired comparando
// planExpiresAt contra la hora actual, sin escribir nada. src/app.js usa
// esa bandera para bloquear el resto de la app con una pantalla de
// "renueva tu suscripción" (ver renewalRequiredView en views.js) hasta que
// la persona o renueva (vuelve a solicitar un plan de paga) o elige
// quedarse en Gratis a propósito (setPlan) — así nunca seguiría usando
// Premium gratis sin darse cuenta, pero tampoco se queda con la cuenta
// bloqueada para siempre sin poder al menos volver a Gratis. (Las
// funciones y campos relacionados con Stripe — applyStripeSubscription,
// trialEndsAt, trialUsed, stripeCustomerId — se conservan sin usar por si
// alguna cuenta vieja todavía los trae, pero ya no los llama ninguna
// pantalla nueva.)

import { supabase, SIGNED_URL_TTL_SECONDS, setRememberSession } from './supabaseClient.js';

// Qué grupos de categorías pueden disparar un aviso (ver testNotification en
// src/app.js, y notifGroupForCategory ahí mismo para el mapeo categoría →
// grupo). Por defecto los tres están activados.
export const DEFAULT_NOTIFICATION_PREFS = { vencimientos: true, pagos: true, salud: true };

// Traduce los mensajes de error de Supabase Auth (en inglés) a español, para
// los casos más comunes — el resto se muestra tal cual viene.
function translateAuthError(message) {
  const m = (message || '').toLowerCase();
  if (m.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.';
  if (m.includes('user already registered') || m.includes('already registered')) return 'Ya existe una cuenta con ese correo.';
  if (m.includes('password should be at least')) return 'La contraseña debe tener al menos 6 caracteres.';
  if (m.includes('email not confirmed')) return 'Confirma tu correo antes de iniciar sesión — revisa tu bandeja de entrada.';
  if (m.includes('unable to validate email') || m.includes('invalid email')) return 'Escribe un correo válido.';
  return message || 'Ocurrió un error inesperado.';
}

async function signedAvatarUrl(avatarPath) {
  if (!avatarPath) return null;
  const { data, error } = await supabase.storage.from('avatars').createSignedUrl(avatarPath, SIGNED_URL_TTL_SECONDS);
  if (error) {
    console.warn('Memoreo: no se pudo generar la URL de la foto de perfil', error);
    return null;
  }
  return data.signedUrl;
}

// Junta el usuario de Supabase Auth (id, email) con su renglón de
// public.profiles y arma el mismo objeto "cuenta pública" que usaba la
// versión anterior (localStorage) — así el resto de la app casi no nota el
// cambio de backend.
async function buildAccount(user, profile) {
  const plan = (profile && profile.plan) || 'gratis';
  const planExpiresAt = (profile && profile.plan_expires_at) || null;
  // true solo cuando la cuenta tuvo un plan de paga con fecha de
  // vencimiento (activado a mano por el administrador) Y esa fecha ya
  // pasó — nunca para Plan Gratis (que no vence). src/app.js usa esta
  // bandera para bloquear el resto de la app hasta que se renueve o se
  // elija Gratis a propósito (ver la nota arriba de este archivo).
  const subscriptionExpired = plan !== 'gratis' && !!planExpiresAt && new Date(planExpiresAt).getTime() <= Date.now();
  return {
    id: user.id,
    name: (profile && profile.name) || '',
    email: user.email,
    plan,
    accentColor: (profile && profile.accent_color) || 'turquesa',
    avatar: await signedAvatarUrl(profile && profile.avatar_path),
    avatarPath: (profile && profile.avatar_path) || null,
    paymentMethod: (profile && profile.payment_method) || null,
    trialEndsAt: (profile && profile.trial_ends_at) || null,
    trialUsed: !!(profile && profile.trial_used),
    stripeCustomerId: (profile && profile.stripe_customer_id) || null,
    stripeSubscriptionId: (profile && profile.stripe_subscription_id) || null,
    // Vencimiento del plan de paga activado a mano por el administrador (ver
    // requestManualPayment más abajo y netlify/functions/admin-payment-requests.mjs) —
    // null si nunca se ha pagado un plan así (Plan Gratis, o una cuenta vieja
    // activada por Stripe, que no usa este campo).
    planExpiresAt,
    subscriptionExpired,
    notificationPrefs: (profile && profile.notification_prefs && Object.keys(profile.notification_prefs).length)
      ? profile.notification_prefs
      : DEFAULT_NOTIFICATION_PREFS
  };
}

// Trae el perfil de una cuenta ya autenticada. El trigger on_auth_user_created
// (ver schema.sql) crea el renglón de profiles en el mismo instante en que
// se registra alguien en Supabase Auth, así que normalmente ya está listo —
// pero por si acaso hay un instante de por medio (o el trigger no llegó a
// correr en un proyecto donde el SQL no se ejecutó bien), reintenta una vez
// antes de darse por vencido, en vez de dejar a alguien con una cuenta a
// medias.
async function fetchProfile(userId, { retry = true } = {}) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  if (data) return data;
  if (retry) {
    await new Promise((r) => setTimeout(r, 600));
    return fetchProfile(userId, { retry: false });
  }
  return null;
}

// La cuenta ligada a la sesión activa de Supabase Auth en este navegador, si
// hay una (Supabase guarda la sesión sola, con refresco automático — ver
// supabaseClient.js). Devuelve null si nadie ha iniciado sesión.
export async function currentAccount() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session || !session.user) return null;
  try {
    const profile = await fetchProfile(session.user.id);
    return buildAccount(session.user, profile);
  } catch (e) {
    console.warn('Memoreo: no se pudo cargar el perfil de la cuenta', e);
    return null;
  }
}

export async function register({ name, email, password, remember = true }) {
  const cleanName = (name || '').trim();
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanName) return { ok: false, error: 'Escribe tu nombre.' };
  if (!cleanEmail.includes('@')) return { ok: false, error: 'Escribe un correo válido.' };
  if (!password || password.length < 6) return { ok: false, error: 'La contraseña debe tener al menos 6 caracteres.' };

  // Se pone ANTES de pedirle a Supabase que abra la sesión — en cuanto
  // signUp() responda con una sesión, el SDK la guarda solo, y para
  // entonces ya tiene que estar decidido a cuál storage (ver
  // supabaseClient.js, "Mantener la sesión iniciada").
  setRememberSession(remember);
  const { data, error } = await supabase.auth.signUp({
    email: cleanEmail,
    password,
    options: { data: { name: cleanName } }
  });
  if (error) return { ok: false, error: translateAuthError(error.message) };

  // Si el proyecto de Supabase tiene activado "Confirm email" (la opción por
  // defecto), signUp() no abre sesión de inmediato: data.session viene
  // vacío hasta que la persona confirme desde el correo que le llega. En ese
  // caso no hay cuenta pública que devolver todavía — src/app.js muestra un
  // aviso de "revisa tu correo" en vez de entrar directo. Para conservar el
  // alta instantánea que tenía la versión anterior, desactiva "Confirm
  // email" en tu proyecto: Authentication → Providers → Email.
  if (!data.session) {
    return { ok: true, needsConfirmation: true, account: null, isNew: true };
  }
  const profile = await fetchProfile(data.user.id);
  const account = await buildAccount(data.user, profile);
  return { ok: true, account, isNew: true };
}

export async function login({ email, password, remember = true }) {
  const cleanEmail = (email || '').trim().toLowerCase();
  setRememberSession(remember);
  const { data, error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password: password || '' });
  if (error) return { ok: false, error: translateAuthError(error.message) };
  const profile = await fetchProfile(data.user.id);
  const account = await buildAccount(data.user, profile);
  return { ok: true, account };
}

export async function logout() {
  await supabase.auth.signOut();
}

// Downgrades to Gratis — the only plan change that doesn't need Stripe,
// since it never charges anything. Real paid-plan activation goes through
// applyStripeSubscription(), not this function. Limpia plan_expires_at
// también — Gratis nunca vence, así que no debe quedar ninguna fecha vieja
// que luego confunda a subscriptionExpired si la cuenta vuelve a subir de
// plan más adelante.
export async function setPlan(accountId, plan, paymentMethod) {
  const patch = { plan, trial_ends_at: null, plan_expires_at: null };
  if (paymentMethod) patch.payment_method = paymentMethod;
  const { data, error } = await supabase.from('profiles').update(patch).eq('id', accountId).select().single();
  if (error) { console.warn('Memoreo: no se pudo actualizar el plan', error); return null; }
  const { data: { user } } = await supabase.auth.getUser();
  return buildAccount(user, data);
}

// El único lugar donde un plan de paga se activa de verdad. Se llama desde
// dos puntos en src/app.js, ambos después de preguntarle a Stripe (nunca al
// navegador) si realmente hay un cobro o una prueba en curso:
//   1. Al volver de Stripe Checkout, con lo que confirmCheckout() trajo del
//      backend — aquí `data.active` siempre es true (el backend no
//      responde `ok:true` si Stripe no confirmó el pago o la prueba).
//   2. Al volver del portal de facturación de Stripe, con lo que
//      fetchSubscriptionStatus() trajo — aquí `data.active` puede ser
//      false (por ejemplo, si la persona canceló su suscripción en el
//      portal), y entonces la cuenta baja a Gratis para reflejarlo.
// En ambos casos se conserva trialUsed y la tarjeta guardada tal cual
// quedaron; solo cambian plan, trialEndsAt y los identificadores de Stripe.
export async function applyStripeSubscription(accountId, data) {
  const patch = {};
  if (data.active === false) {
    patch.plan = 'gratis';
    patch.trial_ends_at = null;
  } else {
    if (data.plan) patch.plan = data.plan;
    patch.trial_ends_at = data.trialEndsAt || null;
    if (data.trialEndsAt) patch.trial_used = true;
    if (data.paymentMethod) patch.payment_method = data.paymentMethod;
  }
  if (data.stripeCustomerId) patch.stripe_customer_id = data.stripeCustomerId;
  if (data.stripeSubscriptionId !== undefined) patch.stripe_subscription_id = data.stripeSubscriptionId;

  const { data: row, error } = await supabase.from('profiles').update(patch).eq('id', accountId).select().single();
  if (error) { console.warn('Memoreo: no se pudo aplicar la suscripción de Stripe', error); return null; }
  const { data: { user } } = await supabase.auth.getUser();
  return buildAccount(user, row);
}

// Cambia la contraseña de verdad, a través de Supabase Auth — primero
// confirma la contraseña actual volviendo a iniciar sesión con ella (Auth no
// tiene un "changePassword" que pida la contraseña vieja directamente), y
// solo si eso funciona pide el cambio a la nueva.
export async function changePassword(accountId, currentPassword, newPassword) {
  if (!newPassword || newPassword.length < 6) return { ok: false, error: 'La nueva contraseña debe tener al menos 6 caracteres.' };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'No se encontró la cuenta.' };
  const { error: verifyError } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword || '' });
  if (verifyError) return { ok: false, error: 'La contraseña actual no es correcta.' };
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { ok: false, error: translateAuthError(error.message) };
  return { ok: true };
}

// Elimina la cuenta de verdad — a diferencia de todo lo demás en este
// archivo, esto SÍ necesita la llave service_role (borrar a alguien de
// Supabase Auth no se puede hacer desde el navegador con la llave pública),
// así que pasa por una función de servidor (ver
// netlify/functions/delete-account.mjs) que primero verifica, con el propio
// token de la sesión, que quien pide el borrado es dueño de esa cuenta.
// Los documentos y el perfil se van solos por el "on delete cascade" del
// esquema (ver supabase/schema.sql) en cuanto Auth borra al usuario.
export async function deleteAccount(accountId) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: 'No se encontró la sesión.' };
  try {
    const res = await fetch('/api/delete-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ accountId })
    });
    const data = await res.json();
    if (!res.ok || !data.ok) return { ok: false, error: data.error || 'No se pudo eliminar la cuenta.' };
    await supabase.auth.signOut();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: 'No se pudo conectar con el servidor para eliminar la cuenta.' };
  }
}

// Personalized accent color (see ACCENT_PALETTE in store.js).
export async function setAccentColor(accountId, colorId) {
  const { data, error } = await supabase.from('profiles').update({ accent_color: colorId }).eq('id', accountId).select().single();
  if (error) { console.warn('Memoreo: no se pudo guardar el color', error); return null; }
  const { data: { user } } = await supabase.auth.getUser();
  return buildAccount(user, data);
}

// Foto de perfil: ahora es un archivo de verdad en el bucket privado
// "avatars" de Supabase Storage (antes era un data URL guardado directo en
// localStorage). Siempre se sube a la misma ruta ("<userId>/avatar", con
// upsert) para que actualizar la foto reemplace la anterior sola, sin dejar
// archivos huérfanos. Pasa `file` como null para quitar la foto (vuelve a
// la inicial del nombre).
export async function setAvatar(accountId, file) {
  const path = `${accountId}/avatar`;
  if (file) {
    const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type || 'image/jpeg' });
    if (uploadError) { console.warn('Memoreo: no se pudo subir la foto de perfil', uploadError); return null; }
    const { data, error } = await supabase.from('profiles').update({ avatar_path: path }).eq('id', accountId).select().single();
    if (error) { console.warn('Memoreo: no se pudo guardar la foto de perfil', error); return null; }
    const { data: { user } } = await supabase.auth.getUser();
    return buildAccount(user, data);
  }
  await supabase.storage.from('avatars').remove([path]).catch(() => {});
  const { data, error } = await supabase.from('profiles').update({ avatar_path: null }).eq('id', accountId).select().single();
  if (error) { console.warn('Memoreo: no se pudo quitar la foto de perfil', error); return null; }
  const { data: { user } } = await supabase.auth.getUser();
  return buildAccount(user, data);
}

// Pago manual (transferencia bancaria MX o PayPal): en vez de cobrar solo,
// la app guarda la solicitud (plan, cuántos meses y método) en
// public.payment_requests — una policy de RLS ("insert own") deja que cada
// quien inserte la suya, nada más. El plan NO cambia todavía: el usuario
// contacta al administrador por WhatsApp (ver el botón "Pagar vía
// WhatsApp" en paymentRequestSheet, views.js), le pasa los datos bancarios
// o la liga de PayPal por fuera de la app, y en cuanto confirma que ya se
// pagó, activa la solicitud desde su panel — eso es lo único que de
// verdad sube el plan (ver netlify/functions/admin-payment-requests.mjs).
// Ya no se pide ni se guarda el celular: es el usuario quien inicia la
// conversación de WhatsApp, así que no hace falta que Memoreo lo llame.
export async function requestManualPayment(accountId, { plan, months, paymentMethod }) {
  if (!['premium', 'premium_plus'].includes(plan)) return { ok: false, error: 'Elige un plan de paga.' };
  if (![1, 2, 3, 4, 5, 6, 12].includes(months)) return { ok: false, error: 'Elige cuántos meses quieres pagar.' };
  if (!['transferencia', 'paypal'].includes(paymentMethod)) return { ok: false, error: 'Elige cómo vas a pagar.' };

  const { data, error } = await supabase.from('payment_requests').insert({
    user_id: accountId,
    plan,
    months,
    payment_method: paymentMethod
  }).select().single();
  if (error) { console.warn('Memoreo: no se pudo enviar la solicitud de pago', error); return { ok: false, error: 'No se pudo enviar tu solicitud — intenta de nuevo.' }; }
  return { ok: true, request: data };
}

// Historial de pagos YA activados de esta cuenta, para "Mi suscripción" (ver
// subscriptionSheet en views.js y openSubscription en app.js) — la misma
// policy de RLS "select own" en payment_requests que ya deja insertar la
// solicitud propia también deja leer las propias, sin pasar por el panel de
// administrador. Solo trae status 'activado': 'pendiente'/'cancelado' no
// son pagos hechos todavía, así que no cuentan como historial.
export async function paymentHistory(accountId) {
  const { data, error } = await supabase
    .from('payment_requests')
    .select('id, plan, months, payment_method, activated_at, expires_at')
    .eq('user_id', accountId)
    .eq('status', 'activado')
    .order('activated_at', { ascending: false });
  if (error) { console.warn('Memoreo: no se pudo cargar el historial de pagos', error); return []; }
  return data.map((r) => ({
    id: r.id,
    plan: r.plan,
    months: r.months,
    paymentMethod: r.payment_method,
    activatedAt: r.activated_at,
    expiresAt: r.expires_at
  }));
}

// Código promocional: 15 días gratis de Premium Plus, limitado a un número
// fijo de usos (ver public.promo_codes/promo_redemptions y la función
// redeem_promo_code() en supabase/schema.sql — "Elige tu plan", último
// recuadro, ver plansSheet en views.js). Todo el trabajo de verificar el
// código, que no esté agotado, que esta cuenta no lo haya usado antes, y de
// otorgar/extender el plan pasa por esa función de Postgres (security
// definer, usa auth.uid() del lado del servidor) en vez de hacerse aquí a
// mano — así ninguna cuenta puede otorgarse el plan directo actualizando su
// perfil, y el límite de usos queda garantizado aunque dos personas
// canjeen al mismo tiempo (la función bloquea el renglón del código
// mientras cuenta cuántas veces se ha usado). Si sale bien, el plan/
// vencimiento de la cuenta ya quedaron actualizados en la base de datos —
// quien llama debe volver a pedir la cuenta (ver currentAccount) para
// reflejarlo, igual que refreshAccountAfterPayment en app.js.
export async function redeemPromoCode(code) {
  const clean = (code || '').trim();
  if (!clean) return { ok: false, error: 'Escribe un código.' };
  const { data, error } = await supabase.rpc('redeem_promo_code', { p_code: clean });
  if (error) { console.warn('Memoreo: no se pudo canjear el código', error); return { ok: false, error: 'No se pudo canjear el código — intenta de nuevo.' }; }
  if (!data || !data.ok) return { ok: false, error: (data && data.error) || 'Código inválido.' };
  return { ok: true, days: data.days, plan: data.plan };
}
