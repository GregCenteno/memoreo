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
// Pagos: el método de pago es siempre tarjeta, procesada de verdad por
// Stripe en modo prueba (ver /server y src/stripeClient.js) — este archivo
// nunca ve un número de tarjeta completo, solo lo que Stripe regresa
// después de confirmar un cobro (marca y últimos 4 dígitos). Un plan de
// paga NUNCA se activa aquí directamente: setPlan() solo sirve para bajar a
// Gratis (sin cobro) y startPremiumTrial() solo para sembrar la cuenta
// demo — el camino real es applyStripeSubscription(), llamado únicamente
// después de que el backend confirma con la propia Stripe que se cobró (ver
// handleCheckoutReturn en src/app.js). Plan Premium incluye una prueba
// gratis de 7 días la primera vez que alguien la usa (trialUsed evita
// repetirla, y ahora la controla Stripe con trial_period_days); trialEndsAt
// marca cuándo se cobrará el primer mes si nadie cancela antes.

import { addDays } from './utils.js';
import { supabase, SIGNED_URL_TTL_SECONDS } from './supabaseClient.js';

// Qué grupos de categorías pueden disparar un aviso (ver testNotification en
// src/app.js, y notifGroupForCategory ahí mismo para el mapeo categoría →
// grupo). Por defecto los tres están activados.
export const DEFAULT_NOTIFICATION_PREFS = { vencimientos: true, pagos: true, salud: true };

export const DEMO_EMAIL = 'demo@memoreo.com';
const DEMO_PASSWORD = 'memoreo-demo';
const DEMO_NAME = 'Sofía Demo';

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
  return {
    id: user.id,
    name: (profile && profile.name) || '',
    email: user.email,
    plan: (profile && profile.plan) || 'gratis',
    accentColor: (profile && profile.accent_color) || 'turquesa',
    avatar: await signedAvatarUrl(profile && profile.avatar_path),
    avatarPath: (profile && profile.avatar_path) || null,
    paymentMethod: (profile && profile.payment_method) || null,
    trialEndsAt: (profile && profile.trial_ends_at) || null,
    trialUsed: !!(profile && profile.trial_used),
    stripeCustomerId: (profile && profile.stripe_customer_id) || null,
    stripeSubscriptionId: (profile && profile.stripe_subscription_id) || null,
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

export async function register({ name, email, password }) {
  const cleanName = (name || '').trim();
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanName) return { ok: false, error: 'Escribe tu nombre.' };
  if (!cleanEmail.includes('@')) return { ok: false, error: 'Escribe un correo válido.' };
  if (!password || password.length < 6) return { ok: false, error: 'La contraseña debe tener al menos 6 caracteres.' };

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

export async function login({ email, password }) {
  const cleanEmail = (email || '').trim().toLowerCase();
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
// since it never charges anything. Also used as the fallback "cancel" path
// for accounts that were never charged through real Stripe (e.g. the demo
// account, seeded directly by startPremiumTrial below). Real paid-plan
// activation goes through applyStripeSubscription(), not this function.
export async function setPlan(accountId, plan, paymentMethod) {
  const patch = { plan, trial_ends_at: null };
  if (paymentMethod) patch.payment_method = paymentMethod;
  const { data, error } = await supabase.from('profiles').update(patch).eq('id', accountId).select().single();
  if (error) { console.warn('Memoreo: no se pudo actualizar el plan', error); return null; }
  const { data: { user } } = await supabase.auth.getUser();
  return buildAccount(user, data);
}

// Directly seeds an account into an active Premium trial, bypassing Stripe
// entirely. Used ONLY by startDemoSession() below, so the demo account
// shows the trial UI out of the box without needing a running payments
// server. A real account never reaches this function — its trial always
// starts through Stripe Checkout (see applyStripeSubscription above).
export async function startPremiumTrial(accountId, paymentMethod) {
  const patch = {
    plan: 'premium',
    payment_method: paymentMethod,
    trial_ends_at: addDays(new Date(), 7).toISOString(),
    trial_used: true
  };
  const { data, error } = await supabase.from('profiles').update(patch).eq('id', accountId).select().single();
  if (error) { console.warn('Memoreo: no se pudo iniciar la prueba', error); return null; }
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

// One-click way to explore the app: reuses the same demo account across
// visits (so its data persists like any real account) instead of creating a
// throwaway one each time.
export async function startDemoSession() {
  const signIn = await supabase.auth.signInWithPassword({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
  if (!signIn.error) {
    const profile = await fetchProfile(signIn.data.user.id);
    return { account: await buildAccount(signIn.data.user, profile), isNew: false };
  }
  // La cuenta demo todavía no existe en este proyecto de Supabase — se crea
  // una vez y de ahí en adelante siempre es la misma (igual que antes con
  // localStorage). Si tu proyecto tiene "Confirm email" activado, este
  // primer intento puede no abrir sesión de inmediato — ver la nota en
  // register() de arriba.
  const r = await register({ name: DEMO_NAME, email: DEMO_EMAIL, password: DEMO_PASSWORD });
  if (!r.ok || !r.account) {
    throw new Error(r.error || 'No se pudo iniciar la sesión demo — revisa la configuración de Supabase Auth (confirmación de correo).');
  }
  // La cuenta demo viene precargada con 20 elementos de ejemplo (para mostrar
  // bien la app llena de información), así que arranca en Premium — su
  // límite de 20 calza justo con la siembra — en vez de quedar "sobre su
  // límite" desde el inicio si arrancara en Gratis. Arranca a mitad de la
  // prueba gratis de 7 días (con una tarjeta de ejemplo ya "guardada") para
  // que se vea de inmediato la tarjeta de estado de la prueba en Perfil.
  const upgraded = await startPremiumTrial(r.account.id, { brand: 'Visa', last4: '4242' });
  return { account: upgraded || r.account, isNew: true };
}
