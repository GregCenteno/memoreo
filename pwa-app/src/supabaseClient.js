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

// "Mantener la sesión iniciada" (ver authView en views.js): quien inicia
// sesión o crea una cuenta elige si quiere que Memoreo la recuerde entre
// visitas (localStorage, lo de siempre) o solo mientras esa pestaña siga
// abierta (sessionStorage, se cierra sola al cerrar el navegador). Como
// supabase-js guarda la sesión sola en cuanto el login/registro responde,
// no hay forma de decírselo "después" — en vez de eso, este storage
// personalizado decide en cada lectura/escritura A CUÁL de los dos
// localStorage/sessionStorage escribir, según lo último que se haya
// elegido (guardado aparte, en REMEMBER_KEY, siempre en localStorage
// porque es solo una preferencia, no la sesión en sí). login()/register()
// en auth.js llaman a setRememberSession(remember) justo antes de pedirle
// a Supabase que inicie sesión, para que la preferencia ya esté puesta
// cuando el SDK guarde el token por primera vez.
const REMEMBER_KEY = 'memoreo:remember-session';

function rememberSessionPref() {
  try {
    // Por defecto true (mantener la sesión) — es el comportamiento que
    // tenía Memoreo antes de que existiera esta opción, así que quien
    // nunca ha visto el interruptor sigue exactamente igual.
    const v = localStorage.getItem(REMEMBER_KEY);
    return v === null ? true : v === '1';
  } catch (e) {
    return true;
  }
}

export function setRememberSession(remember) {
  try { localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0'); } catch (e) { /* sin storage disponible — se queda en el valor por defecto */ }
}

const dynamicSessionStorage = {
  getItem(key) {
    try {
      const store = rememberSessionPref() ? window.localStorage : window.sessionStorage;
      return store.getItem(key);
    } catch (e) {
      return null;
    }
  },
  setItem(key, value) {
    try {
      const remember = rememberSessionPref();
      (remember ? window.localStorage : window.sessionStorage).setItem(key, value);
      // Limpia cualquier copia vieja en el otro storage — si no, cambiar la
      // preferencia entre un inicio de sesión y el siguiente podría dejar
      // un token duplicado y desactualizado tirado por ahí.
      (remember ? window.sessionStorage : window.localStorage).removeItem(key);
    } catch (e) { /* sin storage disponible — la sesión solo dura esta pestaña, en memoria */ }
  },
  removeItem(key) {
    try { window.localStorage.removeItem(key); window.sessionStorage.removeItem(key); } catch (e) {}
  }
};

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storage: dynamicSessionStorage
  }
});

// Cuánto duran las URLs firmadas de los archivos adjuntos (fotos/PDFs) antes
// de vencer. Se generan de nuevo cada vez que se cargan los documentos de la
// cuenta (ver refreshDocsCache en store.js), así que en la práctica casi
// nunca llegan a vencer mientras la persona use la app con cierta
// regularidad — y si vencieran, basta con recargar la página.
export const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 días
