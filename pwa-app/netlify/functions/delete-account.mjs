// Elimina una cuenta de verdad — borrar a alguien de Supabase Auth solo se
// puede hacer con la llave service_role, así que esto no puede vivir en el
// navegador (ver deleteAccount en src/auth.js, que es quien llama a esta
// función). Antes de borrar nada, verifica con el propio token de sesión
// (el "access_token" que ya trae quien está pidiendo el borrado) que de
// verdad es dueño de esa cuenta — así nadie puede mandar cualquier
// accountId y borrar la cuenta de alguien más.
//
// Los documentos y el perfil de public.profiles se van solos por el
// "on delete cascade" del esquema en cuanto se borra el usuario de Auth
// (ver supabase/schema.sql) — pero los archivos de Supabase Storage
// (fotos/PDFs adjuntos, foto de perfil) NO están ligados a esa cascada, así
// que aquí se borran aparte, antes de borrar la cuenta.
import { supabaseAdmin, json } from './_shared.mjs';

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return json({ ok: false, error: 'Falta el token de sesión.' }, 401);

    const { accountId } = await req.json();
    if (!accountId) return json({ ok: false, error: 'Falta accountId.' }, 400);

    const admin = supabaseAdmin();

    // Confirma que el token pertenece de verdad a la cuenta que se pide
    // borrar — nunca confía en el accountId que manda el cuerpo por sí solo.
    const { data: tokenUser, error: tokenError } = await admin.auth.getUser(token);
    if (tokenError || !tokenUser || !tokenUser.user || tokenUser.user.id !== accountId) {
      return json({ ok: false, error: 'No autorizado para eliminar esta cuenta.' }, 403);
    }

    // Borra archivos de Storage — mejor esfuerzo: si algo falla aquí, igual
    // se sigue con el borrado de la cuenta (no queremos que un archivo
    // huérfano bloquee para siempre la eliminación de la cuenta).
    try {
      const { data: docs } = await admin.from('documents').select('attachment_path').eq('user_id', accountId).not('attachment_path', 'is', null);
      const attachmentPaths = (docs || []).map((d) => d.attachment_path).filter(Boolean);
      if (attachmentPaths.length) await admin.storage.from('attachments').remove(attachmentPaths);
      await admin.storage.from('avatars').remove([`${accountId}/avatar`]);
    } catch (storageErr) {
      console.error(`No se pudieron borrar los archivos de Storage de accountId=${accountId}:`, storageErr.message);
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(accountId);
    if (deleteError) throw deleteError;

    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: err.message || 'No se pudo eliminar la cuenta.' }, 500);
  }
};
