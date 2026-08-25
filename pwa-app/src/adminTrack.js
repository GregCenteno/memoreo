// Antes de la migración a Supabase, el panel de administrador leía de
// Netlify Blobs, y esta función mandaba (fire-and-forget) el nombre/correo/
// plan de cada cuenta cada vez que se registraba o cambiaba de plan, para
// que hubiera algo que leer ahí — ver netlify/functions/track-account.mjs
// (ya retirado).
//
// Ahora el panel de administrador (netlify/functions/admin-metrics.mjs) lee
// directo de la tabla public.profiles con la llave service_role, que ya
// tiene el dato correcto en el mismo instante en que se guarda en Supabase
// — no hace falta "avisarle" a nada por separado. Esta función se deja como
// no-operación (en vez de borrar sus llamadas de src/app.js) para no tener
// que tocar cada lugar donde se usaba; no hace ninguna petición de red.
export function trackAccount(_account) {
  // Intencionalmente vacío — ver el comentario de arriba.
}
