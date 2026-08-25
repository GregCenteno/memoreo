// Cliente para el backend de correo (misma idea que src/stripeClient.js):
// el backend es el único que tiene la API key de Resend, así que este
// archivo solo llama a /api/send-reminder-email con el contenido ya armado.
//
// Por defecto apunta al mismo origen (API_BASE = ''), correcto tanto con
// `netlify dev` (netlify/functions/send-reminder-email.mjs) como ya
// desplegado en Netlify. Si en vez de eso usas el servidor Express
// independiente de /server, pon VITE_API_BASE=http://localhost:4242 en
// pwa-app/.env — igual que para Stripe.
const API_BASE = import.meta.env.VITE_API_BASE || '';

export async function sendReminderEmail({ to, subject, html }) {
  let res;
  try {
    res = await fetch(`${API_BASE}/api/send-reminder-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, subject, html })
    });
  } catch (e) {
    throw new Error('No se pudo conectar con el backend de correo. ¿Está corriendo?');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || 'No se pudo enviar el correo.');
  return data;
}
