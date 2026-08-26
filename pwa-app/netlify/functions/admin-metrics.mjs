// Devuelve la lista de usuarios reales y métricas agregadas para el panel
// de administrador (se entra desde el mismo formulario de "Iniciar
// sesión" de la app — ver tryAdminAuth en src/app.js), leyendo directo de
// la tabla public.profiles con la llave service_role (que ignora Row Level
// Security por diseño — es la única manera de ver TODAS las cuentas desde
// un solo lugar). Protegido por un usuario y contraseña (ver checkAdminAuth
// en _shared.mjs — admin_credentials si ya se cambió alguna vez desde el
// panel, o ADMIN_USERNAME/ADMIN_PASSWORD si no) — no es un sistema de
// autenticación completo (un solo usuario-administrador, sin tokens con
// expiración ni límite de intentos), es una cortina sencilla apropiada para
// un prototipo que solo el dueño del sitio va a usar. Ver README.md, "Cómo
// funciona el panel de administrador", para las limitaciones exactas.
//
// También atiende, con el mismo usuario/contraseña, action:'change-password'
// (ver "Cambiar contraseña" en el panel — src/app.js/adminClient.js), que
// guarda una nueva contraseña con hash en public.admin_credentials.
import { json, supabaseAdmin, checkAdminAuth, hashPassword } from './_shared.mjs';

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

    if (action === 'change-password') {
      const newPassword = body.newPassword;
      if (!newPassword || String(newPassword).length < 6) {
        return json({ ok: false, error: 'La nueva contraseña debe tener al menos 6 caracteres.' }, 400);
      }
      const { error } = await admin.from('admin_credentials').upsert({
        id: true,
        username,
        password_hash: hashPassword(newPassword),
        updated_at: new Date().toISOString()
      });
      if (error) throw error;
      return json({ ok: true });
    }

    // auth.users tiene el correo real; public.profiles tiene el resto — se
    // juntan aquí porque el panel de administrador es el único lugar de la
    // app que necesita ver ambos a la vez (todo lo demás usa el correo que
    // ya trae la propia sesión de quien inició sesión).
    const { data: profiles, error: profilesError } = await admin
      .from('profiles')
      .select('id, name, plan, created_at, updated_at')
      .order('created_at', { ascending: false });
    if (profilesError) throw profilesError;

    // listUsers pagina de 50 en 50 por defecto — se junta todo antes de
    // cruzar con los perfiles, para que el panel muestre bien la cuenta
    // número 100+ que pidió el usuario de Memoreo poder soportar.
    const emailById = {};
    let page = 1;
    for (;;) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      data.users.forEach((u) => { emailById[u.id] = u.email; });
      if (data.users.length < 200) break;
      page += 1;
    }

    const users = profiles.map((p) => ({
      accountId: p.id,
      name: p.name || '',
      email: emailById[p.id] || '',
      plan: p.plan || 'gratis',
      createdAt: p.created_at,
      updatedAt: p.updated_at
    }));

    const byPlan = { gratis: 0, premium: 0, premium_plus: 0 };
    users.forEach((u) => { byPlan[u.plan] = (byPlan[u.plan] || 0) + 1; });

    return json({ ok: true, total: users.length, byPlan, users });
  } catch (err) {
    return json({ ok: false, error: err.message }, 500);
  }
};
