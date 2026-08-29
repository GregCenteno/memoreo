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
import { openStoreForAccount } from './store.js';

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

// Pista rápida (sin red) de si este navegador guarda algo de una sesión —
// en localStorage si se eligió "Mantener la sesión iniciada", en
// sessionStorage si no (ver dynamicSessionStorage en supabaseClient.js).
// Sirve para decidir si vale la pena reintentar en currentAccount() más
// abajo: si de verdad no hay nada guardado (nunca inició sesión, o cerró
// sesión), reintentar no serviría de nada y solo agregaría una espera
// innecesaria a cualquiera que apenas visita la pantalla de bienvenida.
function hasStoredSessionHint() {
  try {
    const re = /^sb-.*-auth-token$/;
    for (let i = 0; i < localStorage.length; i++) {
      if (re.test(localStorage.key(i) || '')) return true;
    }
    for (let i = 0; i < sessionStorage.length; i++) {
      if (re.test(sessionStorage.key(i) || '')) return true;
    }
  } catch (e) { /* sin storage disponible */ }
  return false;
}

// Quita a mano cualquier token de sesión guardado (mismo patrón de nombre
// que hasStoredSessionHint arriba) sin pasar por Supabase — es el respaldo
// de forceLocalSignOut() más abajo para cuando el propio signOut() de
// Supabase no se pudo completar a tiempo (ver esa función).
function clearStoredSessionTokens() {
  try {
    const re = /^sb-.*-auth-token$/;
    [localStorage, sessionStorage].forEach((s) => {
      const toRemove = [];
      for (let i = 0; i < s.length; i++) {
        const k = s.key(i);
        if (re.test(k || '')) toRemove.push(k);
      }
      toRemove.forEach((k) => s.removeItem(k));
    });
  } catch (e) { /* sin storage disponible */ }
}

// Ninguna llamada de red (a Supabase Auth o a las tablas) debe poder dejar
// a alguien esperando para siempre: con wifi o datos móviles inestables, una
// petición puede quedarse "colgada" sin responder ni con éxito ni con
// error — sin este límite, eso se sentía exactamente como "el botón no
// funciona" (iniciar sesión que nunca termina de cargar, cerrar sesión que
// no hace nada al tocarlo). Si `promise` no resuelve dentro de `ms`, esto
// se rechaza con un mensaje claro en español en vez de dejar la promesa
// original colgada para siempre (la original sigue corriendo de fondo,
// pero ya no bloquea a quien está esperando una respuesta).
const NETWORK_TIMEOUT_MS = 15000;
const NETWORK_TIMEOUT_MESSAGE = 'No se pudo conectar — revisa tu internet e intenta de nuevo.';
function withTimeout(promise, ms, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

// El perfil (nombre, plan, color…) y los documentos guardados son dos
// cosas independientes en cuanto se sabe quién es la sesión — antes se
// pedían una después de la otra (fetchProfile y luego, ya en src/app.js,
// openStoreForAccount), dos viajes de red completos en fila en vez de al
// mismo tiempo. Eso era buena parte de "tarda mucho en dar acceso" al
// entrar, sobre todo en una conexión lenta: con Promise.all el tiempo
// total pasa a ser el del más lento de los dos, no la suma de ambos.
// openStoreForAccount() deja la lista de documentos ya cargada en `store`
// (store.js) desde aquí mismo, así que quien llama a currentAccount()
// (initApp, ver src/app.js) ya no necesita volver a pedirla aparte.
//
// `withDocuments` se apaga (ver currentAccount() más abajo) en las
// llamadas que solo quieren refrescar datos de la CUENTA — por ejemplo
// después de canjear un código promocional o de volver de Stripe — donde
// los documentos no cambiaron para nada y pedirlos de nuevo sería un viaje
// de red de más, justo lo que esta función intenta evitar.
async function tryCurrentAccount(withDocuments) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session || !session.user) return null;
  try {
    const profilePromise = fetchProfile(session.user.id);
    const [profile] = await withTimeout(
      Promise.all(withDocuments ? [profilePromise, openStoreForAccount(session.user.id)] : [profilePromise]),
      NETWORK_TIMEOUT_MS,
      NETWORK_TIMEOUT_MESSAGE
    );
    return buildAccount(session.user, profile);
  } catch (e) {
    // Incluye el caso de que se haya agotado el tiempo de espera (arriba) —
    // en ambos casos es mejor mandar a la persona a la pantalla de bienvenida
    // (para que pueda reintentar a mano) que dejar la pantalla de "Cargando…"
    // pegada para siempre.
    console.warn('Memoreo: no se pudo cargar el perfil de la cuenta', e);
    return null;
  }
}

// La cuenta ligada a la sesión activa de Supabase Auth en este navegador, si
// hay una (Supabase guarda la sesión sola, con refresco automático — ver
// supabaseClient.js). Devuelve null si nadie ha iniciado sesión.
//
// Reintenta una vez si la primera vez no encontró sesión pero SÍ hay algo
// guardado en este navegador (ver hasStoredSessionHint arriba): esto es a
// propósito por "Mantener la sesión iniciada" — el token guardado dura
// (Supabase lo refresca solo), pero refrescarlo es una llamada de red, y
// justo al abrir la app en el celular (la pantalla se prende, la conexión
// todavía se está reestableciendo, el service worker recién arrancó) esa
// llamada puede fallar por una razón pasajera de la red, no porque la
// sesión de verdad haya vencido. Sin este reintento, esa falla pasajera se
// veía idéntica a "nunca iniciaste sesión" y mandaba a la persona de vuelta
// a la pantalla de inicio de sesión aunque su sesión siguiera siendo
// válida — justo el problema de "tengo que iniciar sesión de nuevo cada
// que abro la página" a pesar de haber elegido mantenerla iniciada.
export async function currentAccount({ withDocuments = true } = {}) {
  const account = await tryCurrentAccount(withDocuments);
  if (account) return account;
  if (!hasStoredSessionHint()) return null;
  await new Promise((r) => setTimeout(r, 800));
  return tryCurrentAccount(withDocuments);
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
  // Cuenta recién creada: todavía no tiene documentos (initAccountDocs en
  // src/app.js ya no siembra nada — ver la nota junto a esa función en
  // store.js), así que no hay nada que valga la pena precargar en paralelo
  // aquí. src/app.js sí llama a openStoreForAccount() después de esto, para
  // dejar `store` listo antes de mostrar Inicio.
  const profile = await fetchProfile(data.user.id);
  const account = await buildAccount(data.user, profile);
  return { ok: true, account, isNew: true };
}

export async function login({ email, password, remember = true }) {
  const cleanEmail = (email || '').trim().toLowerCase();
  setRememberSession(remember);
  let data, error;
  try {
    // Con timeout: sin esto, una conexión inestable podía dejar esta
    // llamada colgada para siempre — el botón "Iniciar sesión" se quedaba
    // deshabilitado sin ningún aviso, exactamente como "tarda mucho y no
    // entra". Con el límite, en vez de eso se muestra un error claro y el
    // botón se vuelve a habilitar (ver el manejador en app.js) para
    // reintentar.
    ({ data, error } = await withTimeout(
      supabase.auth.signInWithPassword({ email: cleanEmail, password: password || '' }),
      NETWORK_TIMEOUT_MS,
      NETWORK_TIMEOUT_MESSAGE
    ));
  } catch (e) {
    return { ok: false, error: e.message || NETWORK_TIMEOUT_MESSAGE };
  }
  if (error) return { ok: false, error: translateAuthError(error.message) };
  // Ver el comentario junto a tryCurrentAccount() más arriba: perfil y
  // documentos se piden al mismo tiempo, no uno después del otro — es la
  // misma espera que se sentía como lentitud al iniciar sesión. src/app.js
  // ya NO vuelve a llamar a openStoreForAccount() después de login() (ver
  // postRenderAuth), porque aquí ya queda hecho.
  try {
    const [profile] = await withTimeout(
      Promise.all([fetchProfile(data.user.id), openStoreForAccount(data.user.id)]),
      NETWORK_TIMEOUT_MS,
      NETWORK_TIMEOUT_MESSAGE
    );
    const account = await buildAccount(data.user, profile);
    return { ok: true, account };
  } catch (e) {
    // La sesión en Supabase Auth ya quedó abierta (signInWithPassword arriba
    // sí terminó) — lo que no se pudo cargar a tiempo fue el perfil/los
    // documentos. Se avisa como error para no dejar a la persona en una
    // pantalla a medias; como la sesión ya está guardada en este navegador,
    // basta con que vuelva a intentar (o vuelva a abrir la app) para que
    // currentAccount() la recupere normalmente, ahora sin tener que volver a
    // escribir la contraseña.
    return { ok: false, error: e.message || NETWORK_TIMEOUT_MESSAGE };
  }
}

// Cerrar sesión avisa al servidor (para invalidar el token ahí también),
// pero eso es una llamada de red — si la conexión está mal y esa llamada se
// queda colgada, antes el botón de "Cerrar sesión" se sentía como que "no
// funciona" (nunca terminaba). Con un límite más corto que el de
// login/currentAccount (aquí no hace falta tanta paciencia: cerrar sesión
// en este navegador no depende de verdad de que el servidor conteste), y
// si aun así no se pudo confirmar a tiempo, se borra el token guardado a
// mano (clearStoredSessionTokens arriba) para que este navegador quede
// desconectado de todas formas — src/app.js (doLogout) ya limpia el resto
// del estado de la app y manda a la pantalla de bienvenida pase lo que
// pase aquí.
const LOGOUT_TIMEOUT_MS = 6000;
export async function logout() {
  try {
    await withTimeout(supabase.auth.signOut(), LOGOUT_TIMEOUT_MS, 'timeout cerrando sesión');
  } catch (e) {
    console.warn('Memoreo: no se pudo confirmar el cierre de sesión con el servidor a tiempo — se cierra localmente', e);
    clearStoredSessionTokens();
  }
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
