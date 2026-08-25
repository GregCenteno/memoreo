// Envía un correo real con Resend (ver server/index.js para la versión
// Express de este mismo endpoint). Quien llama a esta función (ver
// src/emailClient.js) ya arma el asunto y el cuerpo — esta función solo se
// encarga de mandarlo.
//
// Nota importante (ver README.md, "Cómo funciona el correo con Resend"):
// mientras no se verifique un dominio propio en Resend, la cuenta de
// Resend solo puede enviar a la dirección con la que se registró esa
// cuenta de Resend — no a cualquier destinatario. Este archivo detecta ese
// caso y regresa un mensaje claro en vez de un error genérico.
import { Resend } from 'resend';
import { json } from './_shared.mjs';

const resend = new Resend(process.env.RESEND_API_KEY || 're_placeholder');
const FROM = process.env.RESEND_FROM || 'Memoreo <onboarding@resend.dev>';

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!process.env.RESEND_API_KEY) {
    return json({ ok: false, error: 'RESEND_API_KEY no está configurada en las variables de entorno de Netlify.' }, 500);
  }
  try {
    const { to, subject, html } = await req.json();
    if (!to || !subject || !html) return json({ ok: false, error: 'Falta to, subject o html.' }, 400);

    const { data, error } = await resend.emails.send({ from: FROM, to: [to], subject, html });
    if (error) {
      const msg = /only send testing emails|verify a domain/i.test(error.message || '')
        ? 'Con el remitente de prueba de Resend (onboarding@resend.dev) solo puedes enviarte correos a la dirección con la que te registraste en Resend. Verifica tu propio dominio en Resend (o inicia sesión con esa misma cuenta) para enviar a cualquier correo.'
        : (error.message || 'Resend no pudo enviar el correo.');
      return json({ ok: false, error: msg }, 400);
    }
    return json({ ok: true, id: data && data.id });
  } catch (err) {
    return json({ ok: false, error: err.message || 'No se pudo enviar el correo.' }, 500);
  }
};
