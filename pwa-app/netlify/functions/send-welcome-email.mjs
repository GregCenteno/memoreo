// Correo de bienvenida al registrarse (ver sendWelcomeEmail()/register() en
// src/auth.js, que llama a esto justo después de que signUp() responde
// bien). Usa Resend (ya instalado como dependencia del proyecto — ver
// package.json) porque Supabase Auth no deja mandar un correo con
// contenido propio desde el código: sus propios correos (confirmación de
// cuenta, recuperar contraseña) usan una plantilla fija que Supabase manda
// solo, configurable en el dashboard (Authentication → Email Templates),
// no algo que esta función controle.
//
// A propósito NUNCA manda la contraseña — un correo no es un lugar seguro
// para guardar una contraseña en texto plano (puede quedar guardado para
// siempre en la bandeja de entrada, reenviarse por error, o filtrarse si el
// correo de quien sea se ve comprometido). En vez de eso, el correo
// confirma cuál es su usuario (el mismo correo con el que se registró) y
// explica que, si olvida la contraseña, puede pedir una nueva desde
// "¿Olvidaste tu contraseña?" en la pantalla de inicio de sesión (ver
// requestPasswordReset()/beginPasswordRecovery()/setNewPassword() en
// src/auth.js, y newPasswordView() en src/views.js).
//
// Si RESEND_API_KEY no está configurada, responde ok:false sin tronar —
// register() llama a esto sin esperar la respuesta (fire-and-forget), así
// que un correo que no se pudo mandar nunca bloquea ni retrasa que alguien
// termine de crear su cuenta.
import { Resend } from 'resend';
import { json } from './_shared.mjs';

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function welcomeEmailHtml(name, email) {
  const greeting = name ? `Hola, ${escapeHtml(name)}` : 'Hola';
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;color:#1f2430;">
    <h1 style="font-size:22px;margin:0 0 12px;">${greeting}, bienvenido a Memoreo 👋</h1>
    <p style="font-size:15px;line-height:1.6;">Ya tienes tu cuenta lista. Memoreo te ayuda a guardar tus documentos importantes y avisarte antes de que venzan — identificaciones, seguros, garantías, pagos recurrentes y más, todo en un solo lugar.</p>
    <p style="font-size:15px;line-height:1.6;">Tu usuario para entrar es tu correo:</p>
    <p style="font-size:16px;font-weight:700;background:#f3f1f8;padding:10px 14px;border-radius:10px;display:inline-block;">${escapeHtml(email)}</p>
    <p style="font-size:15px;line-height:1.6;">Guarda tu contraseña en un lugar seguro (como un gestor de contraseñas) — por tu seguridad, nunca te la mandamos por correo. Si la olvidas, puedes pedir una nueva desde "¿Olvidaste tu contraseña?" en la pantalla de inicio de sesión.</p>
    <p style="font-size:13px;color:#6b7280;margin-top:28px;">— El equipo de Memoreo</p>
  </div>`;
}

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  try {
    if (!process.env.RESEND_API_KEY) {
      return json({ ok: false, error: 'RESEND_API_KEY no está configurada en las variables de entorno de Netlify.' }, 500);
    }
    const { name, email } = await req.json();
    if (!email) return json({ ok: false, error: 'Falta email.' }, 400);
    const cleanName = (name || '').trim();
    // Remitente configurable — mientras no se verifique un dominio propio
    // en Resend, solo se puede usar su dirección de prueba
    // (onboarding@resend.dev), y esa SOLO manda correos a la cuenta dueña
    // de la llave de Resend, a nadie más (ver README.md, "Correo de
    // bienvenida al registrarse", para verificar un dominio y mandarle a
    // cualquier persona que se registre).
    const from = process.env.RESEND_FROM || 'Memoreo <onboarding@resend.dev>';

    const resend = new Resend(process.env.RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from,
      to: email,
      subject: '¡Bienvenido a Memoreo!',
      html: welcomeEmailHtml(cleanName, email)
    });
    if (error) return json({ ok: false, error: error.message || 'Resend no pudo mandar el correo.' }, 500);
    return json({ ok: true, id: data && data.id });
  } catch (err) {
    return json({ ok: false, error: err.message || 'No se pudo mandar el correo de bienvenida.' }, 500);
  }
};
