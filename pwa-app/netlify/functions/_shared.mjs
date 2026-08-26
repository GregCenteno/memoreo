// Pequeñas utilidades compartidas entre las funciones de Netlify. El guion
// bajo al inicio del nombre del archivo hace que Netlify NO la publique como
// su propia función — es solo un módulo interno que las demás importan.
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual, scryptSync, randomBytes } from 'node:crypto';

// Cliente de Supabase con la llave service_role — SOLO se usa del lado del
// servidor (aquí, dentro de una función de Netlify), nunca en el código que
// corre en el navegador (ver src/supabaseClient.js para ese, que usa la
// llave pública "anon"). La service_role ignora Row Level Security por
// diseño, así que solo se le da a funciones que ya verificaron por su cuenta
// quién está pidiendo qué (ver delete-account.mjs) o que están protegidas
// por su propio usuario/contraseña de administrador (ver admin-metrics.mjs).
let _admin = null;
export function supabaseAdmin() {
  if (_admin) return _admin;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY no están configuradas en las variables de entorno de Netlify.');
  _admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _admin;
}

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// Compara dos strings en tiempo constante (no corta la comparación en el
// primer carácter distinto) para no filtrar, por cuánto tarda la respuesta,
// cuántos caracteres acertó quien está adivinando. timingSafeEqual exige
// que ambos buffers midan lo mismo, así que primero se igualan de tamaño
// con un valor que nunca va a coincidir — eso solo cambia el resultado de
// "true" a "false" cuando las longitudes ya eran distintas, nunca al revés.
export function safeEqual(a, b) {
  const bufA = Buffer.from(String(a ?? ''));
  const bufB = Buffer.from(String(b ?? ''));
  if (bufA.length !== bufB.length) {
    return timingSafeEqual(bufA, Buffer.alloc(bufA.length)) && false;
  }
  return timingSafeEqual(bufA, bufB);
}

// Hash de la contraseña del panel de administrador (ver
// public.admin_credentials en supabase/schema.sql) — scrypt con una sal
// nueva por hash, ambos guardados juntos como "sal:hash" en hexadecimal.
// Nunca se guarda ni compara la contraseña en texto plano.
export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(String(password ?? ''), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPasswordHash(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const candidateHash = scryptSync(String(password ?? ''), salt, 64).toString('hex');
  const a = Buffer.from(candidateHash);
  const b = Buffer.from(hash);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// La cortina de acceso del panel de administrador, compartida por
// admin-metrics.mjs y admin-payment-requests.mjs (para que cambiar la
// contraseña desde uno se respete en el otro sin duplicar esta lógica).
// Primero busca el renglón único de public.admin_credentials (ver
// schema.sql) — si ya existe, MANDA ÉL, contraseña con hash. Si todavía no
// existe (nadie ha usado "Cambiar contraseña" nunca), cae de vuelta a
// comparar contra ADMIN_USERNAME/ADMIN_PASSWORD de las variables de entorno
// de Netlify, como siempre — así ningún proyecto ya desplegado se queda
// fuera de su propio panel de un día para otro.
//   { ok: true }
//   { ok: false, code: 'invalid' }         — usuario o contraseña incorrectos
//   { ok: false, code: 'not-configured' }  — ni admin_credentials ni las
//                                             variables de entorno existen
export async function checkAdminAuth(admin, username, password) {
  const { data, error } = await admin.from('admin_credentials').select('*').eq('id', true).maybeSingle();
  if (error) throw error;
  if (data) {
    const ok = safeEqual(username, data.username) && verifyPasswordHash(password, data.password_hash);
    return ok ? { ok: true } : { ok: false, code: 'invalid' };
  }
  if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) {
    return { ok: false, code: 'not-configured' };
  }
  const ok = safeEqual(username, process.env.ADMIN_USERNAME) && safeEqual(password, process.env.ADMIN_PASSWORD);
  return ok ? { ok: true } : { ok: false, code: 'invalid' };
}

// Netlify pone la URL pública del sitio en la variable de entorno URL (en
// producción) o DEPLOY_PRIME_URL (en un deploy preview) — con eso construimos
// success_url/cancel_url/return_url sin tener que escribir el dominio a mano.
// Si por lo que sea no está (por ejemplo corriendo con `netlify dev`), se usa
// el origen de la propia petición como respaldo.
export function siteUrl(req) {
  return process.env.URL || process.env.DEPLOY_PRIME_URL || new URL(req.url).origin;
}
