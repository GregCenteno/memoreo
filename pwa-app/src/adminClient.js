// Cliente del panel de administrador: llama a /api/admin-metrics
// (netlify/functions/admin-metrics.mjs), que lee de Netlify Blobs — el
// mismo lugar donde src/adminTrack.js va guardando un perfil mínimo
// (nombre, correo, plan) cada vez que alguien se registra, inicia sesión o
// cambia de plan de verdad. Sin ese backend desplegado (ver README.md,
// "Cómo funciona el panel de administrador") esto no tiene nada que
// mostrar — no hay ningún dato de ejemplo ni modo demo aquí: si
// /api/admin-metrics no responde, el error se muestra tal cual.
//
// El panel ya no vive en una página aparte (admin.html) — se entra
// escribiendo el usuario y la contraseña de administrador en el mismo
// formulario de "Iniciar sesión" que usa cualquier cuenta (ver
// postRenderAuth() y tryAdminAuth() en app.js). El usuario y la contraseña
// se guardan solo en sessionStorage (se borran al cerrar la pestaña),
// nunca en localStorage — esto es una cortina simple, no un sistema de
// autenticación real: ver la nota en admin-metrics.mjs.
const API_BASE = import.meta.env.VITE_API_BASE || '';
const SESSION_KEY = 'memoreo_admin_session_v1';

export function loadAdminSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export function saveAdminSession(creds) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(creds)); }
  catch (e) { /* almacenamiento no disponible — la sesión solo dura esta pantalla */ }
}

export function clearAdminSession() {
  try { sessionStorage.removeItem(SESSION_KEY); }
  catch (e) { /* nada que limpiar */ }
}

async function callAdminMetrics(extra) {
  let res;
  try {
    res = await fetch(`${API_BASE}/api/admin-metrics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(extra)
    });
  } catch (e) {
    throw new Error(`No se pudo conectar con el servidor (${API_BASE || location.origin}). ¿Está desplegado en Netlify o corriendo "netlify dev"?`);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(body.error || `El servidor respondió con un error (${res.status}).`);
  return body;
}

export async function fetchAdminMetrics(creds) {
  return callAdminMetrics(creds);
}

// Cambia la contraseña del panel (ver "Cambiar contraseña" en el
// topbar del panel — src/app.js) — el usuario/contraseña actuales van
// primero para que el propio backend los verifique antes de aceptar la
// nueva (ver checkAdminAuth en _shared.mjs), igual que cualquier otra
// llamada a admin-metrics.
export async function changeAdminPassword(creds, newPassword) {
  return callAdminMetrics({ ...creds, action: 'change-password', newPassword });
}

// Solicitudes de pago manual (transferencia/PayPal) — ver
// netlify/functions/admin-payment-requests.mjs. Las tres funciones de aquí
// abajo llaman a esa misma función con distintos "action", igual que
// fetchAdminMetrics llama a admin-metrics.
async function callPaymentRequests(creds, extra) {
  let res;
  try {
    res = await fetch(`${API_BASE}/api/admin-payment-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...creds, ...extra })
    });
  } catch (e) {
    throw new Error(`No se pudo conectar con el servidor (${API_BASE || location.origin}). ¿Está desplegado en Netlify o corriendo "netlify dev"?`);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(body.error || `El servidor respondió con un error (${res.status}).`);
  return body;
}

export async function fetchPaymentRequests(creds) {
  const body = await callPaymentRequests(creds, { action: 'list' });
  return body.payments;
}

export async function activatePaymentRequest(creds, requestId) {
  return callPaymentRequests(creds, { action: 'activate', requestId });
}

export async function cancelPaymentRequest(creds, requestId) {
  return callPaymentRequests(creds, { action: 'cancel', requestId });
}

// Deshace una activación equivocada — ver la nota completa en
// admin-payment-requests.mjs (action: 'revert').
export async function revertPaymentRequest(creds, requestId) {
  return callPaymentRequests(creds, { action: 'revert', requestId });
}
