// Pequeñas utilidades compartidas entre las funciones de Netlify. El guion
// bajo al inicio del nombre del archivo hace que Netlify NO la publique como
// su propia función — es solo un módulo interno que las demás importan.
import { createClient } from '@supabase/supabase-js';

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

// Netlify pone la URL pública del sitio en la variable de entorno URL (en
// producción) o DEPLOY_PRIME_URL (en un deploy preview) — con eso construimos
// success_url/cancel_url/return_url sin tener que escribir el dominio a mano.
// Si por lo que sea no está (por ejemplo corriendo con `netlify dev`), se usa
// el origen de la propia petición como respaldo.
export function siteUrl(req) {
  return process.env.URL || process.env.DEPLOY_PRIME_URL || new URL(req.url).origin;
}
