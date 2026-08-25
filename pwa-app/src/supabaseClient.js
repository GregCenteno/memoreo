// Cliente único de Supabase para todo el frontend — a partir de aquí, las
// cuentas y los documentos ya NO viven en localStorage del navegador de cada
// quien: viven en una base de datos Postgres real y compartida (ver
// supabase/schema.sql), con Supabase Auth para las cuentas y Supabase
// Storage para las fotos/PDFs adjuntos.
//
// Estas dos variables se configuran como variables de entorno de Netlify
// (Site settings → Environment variables) y se inyectan en el build de Vite
// con el prefijo VITE_ — son valores públicos hechos para usarse desde el
// navegador (no son secretos: la seguridad real la dan las políticas de Row
// Level Security del esquema, no esconder esta llave). La llave
// "service_role" (la que sí es secreta) NUNCA se usa aquí — solo vive del
// lado del servidor, en las funciones de Netlify que la necesitan.
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // No lanza el error hasta que de verdad se intente usar Supabase (ver
  // auth.js/store.js) para que el resto de la app (p. ej. la pantalla de
  // bienvenida) no truene si alguien corre `npm run dev` sin haber
  // configurado todavía el archivo .env — pero sí lo avisa fuerte en consola.
  console.error(
    'Memoreo: faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. ' +
    'Configúralas en un archivo .env (desarrollo local) o en las variables ' +
    'de entorno del sitio de Netlify (producción). Ver README.md.'
  );
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false
  }
});

// Cuánto duran las URLs firmadas de los archivos adjuntos (fotos/PDFs) antes
// de vencer. Se generan de nuevo cada vez que se cargan los documentos de la
// cuenta (ver refreshDocsCache en store.js), así que en la práctica casi
// nunca llegan a vencer mientras la persona use la app con cierta
// regularidad — y si vencieran, basta con recargar la página.
export const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 días
