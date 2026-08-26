// Solicitudes de pago manual (transferencia bancaria MX o PayPal): cada vez
// que alguien pide un plan de paga desde paymentRequestSheet (ver
// requestManualPayment en src/auth.js), se guarda un renglón en
// public.payment_requests con status "pendiente". Esta función es la única
// manera de verlas todas juntas (con nombre/correo, que viven en tablas
// distintas) y de activarlas/cancelarlas — necesita la llave service_role
// para eso, así que, igual que admin-metrics.mjs, va protegida por un
// usuario y contraseña simples comparados contra ADMIN_USERNAME/
// ADMIN_PASSWORD (ver esa función para la nota completa sobre esta
// "cortina" de administrador).
import { timingSafeEqual } from 'node:crypto';
import { json, supabaseAdmin } from './_shared.mjs';

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a ?? ''));
  const bufB = Buffer.from(String(b ?? ''));
  if (bufA.length !== bufB.length) {
    return timingSafeEqual(bufA, Buffer.alloc(bufA.length)) && false;
  }
  return timingSafeEqual(bufA, bufB);
}

const VALID_MONTHS = [1, 2, 3, 4, 5, 6, 12];

// Junta un renglón de payment_requests con el nombre (profiles) y el correo
// (auth.users) de quien lo pidió — se usa tanto para listar todas las
// solicitudes como para devolver la que se acaba de activar/cancelar.
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
    activatedBy: r.activated_by
  }));
}

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) {
    return json({ ok: false, error: 'ADMIN_USERNAME y ADMIN_PASSWORD no están configuradas en las variables de entorno de Netlify.' }, 500);
  }
  try {
    const body = await req.json();
    const { username, password, action } = body;
    const validUser = safeEqual(username, process.env.ADMIN_USERNAME);
    const validPass = safeEqual(password, process.env.ADMIN_PASSWORD);
    if (!validUser || !validPass) {
      return json({ ok: false, error: 'Usuario o contraseña incorrectos.' }, 401);
    }

    const admin = supabaseAdmin();

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
      // arranca desde ahora.
      if (!VALID_MONTHS.includes(reqRow.months)) return json({ ok: false, error: 'Duración inválida en la solicitud.' }, 400);
      const { data: profile, error: profileError } = await admin.from('profiles').select('plan_expires_at').eq('id', reqRow.user_id).maybeSingle();
      if (profileError) throw profileError;
      const now = new Date();
      const currentExpiry = profile && profile.plan_expires_at ? new Date(profile.plan_expires_at) : null;
      const base = currentExpiry && currentExpiry.getTime() > now.getTime() ? currentExpiry : now;
      const newExpiry = new Date(base);
      newExpiry.setMonth(newExpiry.getMonth() + reqRow.months);

      const { error: updateProfileError } = await admin.from('profiles')
        .update({ plan: reqRow.plan, plan_expires_at: newExpiry.toISOString() })
        .eq('id', reqRow.user_id);
      if (updateProfileError) throw updateProfileError;

      const { error: updateReqError } = await admin.from('payment_requests')
        .update({ status: 'activado', activated_at: now.toISOString(), activated_by: username })
        .eq('id', requestId);
      if (updateReqError) throw updateReqError;

      const [attached] = await attachPersonInfo(admin, [{ ...reqRow, status: 'activado', activated_at: now.toISOString(), activated_by: username }]);
      return json({ ok: true, request: attached, planExpiresAt: newExpiry.toISOString() });
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
