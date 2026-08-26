// Solicitudes de pago manual (transferencia bancaria MX o PayPal): cada vez
// que alguien pide un plan de paga desde paymentRequestSheet (ver
// requestManualPayment en src/auth.js), se guarda un renglón en
// public.payment_requests con status "pendiente". Esta función es la única
// manera de verlas todas juntas (con nombre/correo, que viven en tablas
// distintas) y de activarlas/cancelarlas/revertirlas — necesita la llave
// service_role para eso, así que, igual que admin-metrics.mjs, va protegida
// por checkAdminAuth (ver _shared.mjs para la nota completa sobre esta
// "cortina" de administrador, y sobre admin_credentials/"Cambiar
// contraseña").
import { json, supabaseAdmin, checkAdminAuth } from './_shared.mjs';

const VALID_MONTHS = [1, 2, 3, 4, 5, 6, 12];

// Junta un renglón de payment_requests con el nombre (profiles) y el correo
// (auth.users) de quien lo pidió — se usa tanto para listar todas las
// solicitudes como para devolver la que se acaba de activar/cancelar/revertir.
async function attachPersonInfo(admin, rows) {
  if (!rows.length) return [];
  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const { data: profiles, error: profilesError } = await admin.from('profiles').select('id, name').in('id', userIds);
  if (profilesError) throw profilesError;
  const nameById = {};
  profiles.forEach((p) => { nameById[p.id] = p.name || ''; });

  const emailById = {};
  await Promise.all(userIds.map(async (id) => {
    const { data, error } = await admin.auth.admin.getUserById(id);
    if (!error && data && data.user) emailById[id] = data.user.email || '';
  }));

  return rows.map((r) => ({
    id: r.id,
    accountId: r.user_id,
    name: nameById[r.user_id] || '',
    email: emailById[r.user_id] || '',
    phone: r.phone,
    plan: r.plan,
    months: r.months,
    paymentMethod: r.payment_method,
    status: r.status,
    createdAt: r.created_at,
    activatedAt: r.activated_at,
    activatedBy: r.activated_by,
    expiresAt: r.expires_at,
    revertedAt: r.reverted_at
  }));
}

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  try {
    const body = await req.json();
    const { username, password, action } = body;
    const admin = supabaseAdmin();
    const auth = await checkAdminAuth(admin, username, password);
    if (!auth.ok) {
      if (auth.code === 'not-configured') {
        return json({ ok: false, error: 'ADMIN_USERNAME y ADMIN_PASSWORD no están configuradas en las variables de entorno de Netlify.' }, 500);
      }
      return json({ ok: false, error: 'Usuario o contraseña incorrectos.' }, 401);
    }

    if (action === 'activate' || action === 'cancel') {
      const requestId = body.requestId;
      if (!requestId) return json({ ok: false, error: 'Falta requestId.' }, 400);

      const { data: reqRow, error: reqError } = await admin.from('payment_requests').select('*').eq('id', requestId).maybeSingle();
      if (reqError) throw reqError;
      if (!reqRow) return json({ ok: false, error: 'No se encontró esa solicitud.' }, 404);
      if (reqRow.status !== 'pendiente') return json({ ok: false, error: 'Esa solicitud ya no está pendiente.' }, 409);

      if (action === 'cancel') {
        const { error } = await admin.from('payment_requests').update({ status: 'cancelado' }).eq('id', requestId);
        if (error) throw error;
        const [attached] = await attachPersonInfo(admin, [{ ...reqRow, status: 'cancelado' }]);
        return json({ ok: true, request: attached });
      }

      // Activar: sube el plan de esa cuenta y le pone (o extiende) fecha de
      // vencimiento. Si ya tenía un plan de paga vigente (todavía no vence),
      // los meses nuevos se SUMAN a partir de esa fecha en vez de reiniciar
      // desde hoy — así pagar por adelantado nunca hace perder tiempo ya
      // pagado. Si no tenía nada vigente (Gratis, o un plan ya vencido),
      // arranca desde ahora. Antes de tocar el perfil, se guarda cómo
      // estaba (previous_plan/previous_plan_expires_at) junto con a dónde
      // quedó (expires_at) — eso es lo único que necesita "revertir" más
      // abajo para deshacer exactamente esta activación.
      //
      // Esta misma acción también sirve para volver a activar una solicitud
      // que se había revertido (revert la deja en status 'pendiente' otra
      // vez, ver más abajo) — en ese caso el administrador puede elegir de
      // nuevo cuántos meses activar (body.months) en vez de repetir a la
      // fuerza los meses que se pidieron originalmente; si no manda un
      // valor válido, se usa reqRow.months como antes.
      const months = VALID_MONTHS.includes(body.months) ? body.months : reqRow.months;
      if (!VALID_MONTHS.includes(months)) return json({ ok: false, error: 'Duración inválida en la solicitud.' }, 400);
      const { data: profile, error: profileError } = await admin.from('profiles').select('plan, plan_expires_at').eq('id', reqRow.user_id).maybeSingle();
      if (profileError) throw profileError;
      const now = new Date();
      const previousPlan = (profile && profile.plan) || 'gratis';
      const previousExpiry = profile && profile.plan_expires_at ? profile.plan_expires_at : null;
      const currentExpiry = previousExpiry ? new Date(previousExpiry) : null;
      const base = currentExpiry && currentExpiry.getTime() > now.getTime() ? currentExpiry : now;
      const newExpiry = new Date(base);
      newExpiry.setMonth(newExpiry.getMonth() + months);

      const { error: updateProfileError } = await admin.from('profiles')
        .update({ plan: reqRow.plan, plan_expires_at: newExpiry.toISOString() })
        .eq('id', reqRow.user_id);
      if (updateProfileError) throw updateProfileError;

      const patch = {
        status: 'activado',
        months,
        activated_at: now.toISOString(),
        activated_by: username,
        expires_at: newExpiry.toISOString(),
        previous_plan: previousPlan,
        previous_plan_expires_at: previousExpiry,
        reverted_at: null
      };
      const { error: updateReqError } = await admin.from('payment_requests').update(patch).eq('id', requestId);
      if (updateReqError) throw updateReqError;

      const [attached] = await attachPersonInfo(admin, [{ ...reqRow, ...patch }]);
      return json({ ok: true, request: attached, planExpiresAt: newExpiry.toISOString() });
    }

    if (action === 'revert') {
      // Deshace una activación equivocada: regresa el plan y el
      // vencimiento de la cuenta a como estaban justo antes de activar
      // ESTA solicitud (previous_plan/previous_plan_expires_at, guardados
      // al activar), y la solicitud vuelve a "pendiente" para decidir de
      // nuevo (activarla bien, o cancelarla). No intenta reconstruir nada
      // si, después de esta activación, se activaron otras solicitudes de
      // la misma cuenta que también movieron su plan/vencimiento — revertir
      // siempre deja la cuenta tal cual estaba antes de ESTA, sin importar
      // qué pasó después; es una herramienta para deshacer un clic
      // equivocado al toque, no un historial completo de versiones.
      const requestId = body.requestId;
      if (!requestId) return json({ ok: false, error: 'Falta requestId.' }, 400);

      const { data: reqRow, error: reqError } = await admin.from('payment_requests').select('*').eq('id', requestId).maybeSingle();
      if (reqError) throw reqError;
      if (!reqRow) return json({ ok: false, error: 'No se encontró esa solicitud.' }, 404);
      if (reqRow.status !== 'activado') return json({ ok: false, error: 'Solo se puede revertir una solicitud activada.' }, 409);

      const { error: updateProfileError } = await admin.from('profiles')
        .update({ plan: reqRow.previous_plan || 'gratis', plan_expires_at: reqRow.previous_plan_expires_at || null })
        .eq('id', reqRow.user_id);
      if (updateProfileError) throw updateProfileError;

      const now = new Date();
      const patch = {
        status: 'pendiente',
        activated_at: null,
        activated_by: null,
        expires_at: null,
        reverted_at: now.toISOString()
      };
      const { error: updateReqError } = await admin.from('payment_requests').update(patch).eq('id', requestId);
      if (updateReqError) throw updateReqError;

      const [attached] = await attachPersonInfo(admin, [{ ...reqRow, ...patch }]);
      return json({ ok: true, request: attached });
    }

    if (action === 'delete') {
      // Quita el renglón de la lista para siempre — a diferencia de
      // "cancelar" (que solo cambia el status a 'cancelado' y lo deja ahí
      // como registro), esto lo borra de public.payment_requests. No toca
      // profiles.plan/plan_expires_at para nada: si la solicitud estaba
      // 'activado', el plan de esa cuenta sigue exactamente igual — esto
      // solo limpia la lista, no revierte ninguna activación (para eso está
      // action:'revert', que hay que usar primero si de verdad se quiere
      // deshacer el plan antes de borrar el renglón).
      const requestId = body.requestId;
      if (!requestId) return json({ ok: false, error: 'Falta requestId.' }, 400);
      const { error } = await admin.from('payment_requests').delete().eq('id', requestId);
      if (error) throw error;
      return json({ ok: true });
    }

    // action === 'list' (o sin action — por defecto lista todo)
    const { data: rows, error } = await admin.from('payment_requests').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    const payments = await attachPersonInfo(admin, rows);
    return json({ ok: true, payments });
  } catch (err) {
    return json({ ok: false, error: err.message }, 500);
  }
};
