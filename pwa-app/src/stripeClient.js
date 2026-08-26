// Cliente para el backend de pagos. El backend es el único que tiene la
// llave secreta de Stripe — este archivo solo llama a sus endpoints (todos
// bajo /api/...) y redirige el navegador a las páginas que hospeda Stripe
// (Checkout y el portal de facturación). Nunca se maneja un número de
// tarjeta directamente en el frontend.
//
// Por defecto apunta al mismo origen (API_BASE = ''), que es lo que hace
// falta cuando el backend son las funciones de Netlify en
// netlify/functions/ (ver netlify.toml, que redirige /api/* hacia ellas) —
// funciona igual en local con `netlify dev` que ya desplegado. Si en vez de
// eso corres el servidor Express independiente de /server (ver su propio
// README), pon VITE_API_BASE=http://localhost:4242 en pwa-app/.env.
const API_BASE = import.meta.env.VITE_API_BASE || '';

async function readError(res) {
  const body = await res.json().catch(() => ({}));
  return body.error || `El servidor de pagos respondió con un error (${res.status}).`;
}

// Crea la sesión de Stripe Checkout y redirige de inmediato — el plan NO
// cambia todavía en esta llamada. Solo cambia cuando el navegador vuelve y
// confirmCheckout() confirma con Stripe que de verdad se cobró (o empezó la
// prueba). Si el servidor de /server no está corriendo, esto lanza un error
// claro en vez de fallar en silencio.
export async function startCheckout({ accountId, email, plan, trial }) {
  let res;
  try {
    res = await fetch(`${API_BASE}/api/create-checkout-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId, email, plan, trial })
    });
  } catch (e) {
    throw new Error(`No se pudo conectar con el servidor de pagos (${API_BASE}). ¿Está corriendo "npm start" en /server?`);
  }
  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json();
  window.location.href = data.url;
}

// Se llama al volver de Stripe Checkout con ?checkout=success&session_id=...
export async function confirmCheckout(sessionId) {
  try {
    const res = await fetch(`${API_BASE}/api/checkout-status?session_id=${encodeURIComponent(sessionId)}`);
    if (!res.ok) return { ok: false };
    return await res.json();
  } catch (e) {
    return { ok: false };
  }
}

// Abre el portal de facturación de Stripe (cancelar/cambiar tarjeta de
// verdad vive ahí, no en una hoja simulada dentro de la app).
export async function openBillingPortal(customerId) {
  let res;
  try {
    res = await fetch(`${API_BASE}/api/create-portal-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId })
    });
  } catch (e) {
    throw new Error(`No se pudo conectar con el servidor de pagos (${API_BASE}). ¿Está corriendo "npm start" en /server?`);
  }
  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json();
  window.location.href = data.url;
}

// Se llama al volver del portal de facturación con ?portal=return, para
// reflejar en la cuenta local lo que de verdad quedó en Stripe.
export async function fetchSubscriptionStatus(subscriptionId) {
  try {
    const res = await fetch(`${API_BASE}/api/subscription-status?subscription_id=${encodeURIComponent(subscriptionId)}`);
    if (!res.ok) return { ok: false };
    return await res.json();
  } catch (e) {
    return { ok: false };
  }
}
