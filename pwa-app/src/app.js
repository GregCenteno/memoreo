import {
  store, catInfo, docInfo, formMode, docNoun, openStoreForAccount, clearStore, initAccountDocs,
  planInfo, nonHealthCount, healthTypeAllowed, healthTypeInfo, accentInfo, colorPersonalizationAllowed
} from './store.js';
import { addDays, fromInputDate, fmtDate } from './utils.js';
import { icon, logoMark } from './icons.js';
import {
  currentAccount, register, login, logout, setPlan, setAccentColor, setAvatar,
  applyStripeSubscription, changePassword, deleteAccount
} from './auth.js';
import { startCheckout, confirmCheckout, openBillingPortal, fetchSubscriptionStatus } from './stripeClient.js';
import { trackAccount } from './adminTrack.js';
import { fetchAdminMetrics, loadAdminSession, saveAdminSession, clearAdminSession } from './adminClient.js';
import {
  welcomeView, authView, homeView, categoryView, searchView, remindersView,
  profileView, addView, detailView, plansSheet, colorSheet, securitySheet, billingSheet, themeSheet, adminDashboardView
} from './views.js';

// El botón de Agregar NO va aquí — es un elemento aparte, flotante, fuera de
// esta barra (ver #fabBtn en initApp y su CSS .fab-tab), para que su
// posición (esquina inferior izquierda de .app) no dependa de la barra de
// navegación ni se vea afectada si esta cambia de lugar o de forma.
const TABS = [
  { route: 'home', icon: 'home', label: 'Inicio' },
  { route: 'search', icon: 'search', label: 'Buscar' },
  { route: 'reminders', icon: 'bell', label: 'Avisos' },
  { route: 'profile', icon: 'user', label: 'Perfil' }
];

const state = {
  route: 'welcome',
  params: {},
  search: '',
  filterCat: null,
  kindFilter: null,
  draft: null,
  editingId: null,
  installDismissed: false,
  canInstall: false,
  deferredPrompt: null,
  account: null,
  authError: null,
  // Panel de administrador: se entra con usuario y contraseña desde el
  // mismo formulario de "Iniciar sesión" (ver postRenderAuth/tryAdminAuth
  // más abajo), no desde una página aparte.
  adminAuthed: false,
  adminCreds: null,
  adminData: null,
  adminLoading: false,
  adminError: null,
  adminLastUpdated: null,
  adminSearch: '',
  adminPlanFilter: 'todos'
};

let screenEl, headerBarEl, tabbarEl, fabBtnEl, sheetLayerEl, sheetBodyEl, toastEl, toastMsgEl, appShellEl, adminShellEl;
let toastTimer = null;

export async function initApp(root) {
  applyTheme(loadThemePref());
  root.innerHTML = `
    <div id="appShell" class="app">
      <div id="screen" class="screen"></div>
      <div id="headerBar" class="header-bar">
        <button type="button" class="header-search" id="headerSearchBtn" data-nav="search">${icon('search')}<span>Buscar un documento&hellip;</span></button>
        <div id="tabbar" class="tabbar"></div>
      </div>
      <button type="button" class="fab-tab" id="fabBtn" data-nav="add" aria-label="Agregar"><span class="fab">${icon('plus')}</span></button>
    </div>
    <div id="adminShell" style="display:none;"></div>
    <div id="sheetLayer" class="sheet-backdrop"><div class="sheet" id="sheetBody"></div></div>
    <div id="toast" class="toast"><span class="icon" data-i="check"></span><span id="toastMsg"></span></div>
  `;
  appShellEl = document.getElementById('appShell');
  adminShellEl = document.getElementById('adminShell');
  screenEl = document.getElementById('screen');
  headerBarEl = document.getElementById('headerBar');
  tabbarEl = document.getElementById('tabbar');
  fabBtnEl = document.getElementById('fabBtn');
  sheetLayerEl = document.getElementById('sheetLayer');
  sheetBodyEl = document.getElementById('sheetBody');
  toastEl = document.getElementById('toast');
  toastMsgEl = document.getElementById('toastMsg');

  screenEl.addEventListener('click', handleClick);
  fabBtnEl.addEventListener('click', handleClick);
  headerBarEl.addEventListener('click', handleClick);
  sheetLayerEl.addEventListener('click', (e) => {
    if (e.target === sheetLayerEl) closeSheet();
    handleClick(e);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSheet();
  });

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.deferredPrompt = e;
    state.canInstall = true;
    if (state.route === 'home') render();
  });
  window.addEventListener('appinstalled', () => {
    state.canInstall = false;
    state.deferredPrompt = null;
    toast('Memoreo instalada ✓');
  });

  // A diferencia de la versión anterior (localStorage, prácticamente
  // instantánea), preguntarle a Supabase si ya hay una sesión abierta
  // implica un viaje de red — mientras tanto se ve esta pantalla mínima de
  // carga en vez de la app en blanco.
  screenEl.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:12px;color:var(--muted, #6b7280);">${logoMark(40)}<span>Cargando…</span></div>`;
  tabbarEl.style.display = 'none';

  // Sessions persist across reloads: if this browser already has an active
  // account, skip straight past the welcome screen. Supabase guarda la
  // sesión sola (localStorage interno del SDK, con refresco automático), así
  // que currentAccount() solo necesita preguntarle a Supabase si ya hay una
  // sesión válida.
  const existing = await currentAccount();
  if (existing) {
    state.account = existing;
    await openStoreForAccount(existing.id);
    state.route = 'home';
    applyAccentColor(effectiveAccentColor(existing));
  } else {
    // Igual, pero para una sesión de administrador guardada en esta pestaña
    // (ver adminClient.js) — nunca ambas sesiones a la vez: si hay una
    // cuenta normal, gana esa.
    const savedAdmin = loadAdminSession();
    if (savedAdmin) {
      state.route = 'admin';
      state.adminLoading = true;
      tryAdminAuth(savedAdmin).then((ok) => {
        state.adminLoading = false;
        if (!ok) { state.route = 'welcome'; clearAdminSession(); }
        render();
      });
    }
  }

  render();
  handleCheckoutReturn();
}

// Se ejecuta al cargar la app y revisa si el navegador acaba de volver de
// Stripe (Checkout o el portal de facturación). Es el único lugar donde un
// plan de paga pasa a estar activo — y solo llama a applyStripeSubscription
// después de que el propio backend, consultando a Stripe, confirma que de
// verdad hay un cobro o una prueba en curso (ver src/stripeClient.js y
// /server/index.js). Si Stripe no lo confirma, la cuenta se queda como
// estaba antes de salir a pagar.
function handleCheckoutReturn() {
  const params = new URLSearchParams(window.location.search);
  const checkout = params.get('checkout');
  const portal = params.get('portal');
  if (!checkout && !portal) return;
  const sessionId = params.get('session_id');
  window.history.replaceState(null, '', window.location.pathname);

  if (checkout === 'cancelled') {
    toast('Pago cancelado — sigues en tu plan actual.');
    return;
  }
  if (checkout === 'success' && sessionId && state.account) {
    toast('Confirmando tu pago con Stripe…');
    confirmCheckout(sessionId).then(async (data) => {
      if (data && data.ok) {
        const updated = await applyStripeSubscription(state.account.id, data);
        if (updated) state.account = updated;
        applyAccentColor(effectiveAccentColor(state.account));
        trackAccount(state.account);
        toast(data.trialEndsAt
          ? `Prueba gratis confirmada por Stripe — termina el ${fmtDate(new Date(data.trialEndsAt))}`
          : `Pago confirmado por Stripe — plan activado`);
      } else {
        toast('Stripe todavía no confirma el pago. Espera un momento y vuelve a abrir "Ver planes".');
      }
      render();
    });
    return;
  }
  if (portal === 'return' && state.account && state.account.stripeSubscriptionId) {
    toast('Sincronizando con Stripe…');
    fetchSubscriptionStatus(state.account.stripeSubscriptionId).then(async (data) => {
      if (data && data.ok) {
        const updated = await applyStripeSubscription(state.account.id, data);
        if (updated) state.account = updated;
        applyAccentColor(effectiveAccentColor(state.account));
        trackAccount(state.account);
        toast(data.active ? 'Tu suscripción sigue activa.' : 'Suscripción cancelada en Stripe — de vuelta a Plan Gratis');
      }
      render();
    });
  }
}

/* ---------------- Apariencia (claro / oscuro / automático) ---------------- */
// Es una preferencia del dispositivo, no de la cuenta (como el color
// personalizado sí lo es) — se guarda en este mismo navegador con
// localStorage, igual que installDismissed. "sistema" es el valor por
// defecto y no pone ningún atributo: deja que style.css siga la propia
// preferencia del sistema operativo (@media prefers-color-scheme) como
// hacía antes de que existiera este selector.
const THEME_PREF_KEY = 'memoreo:theme';
function loadThemePref() {
  try {
    const v = localStorage.getItem(THEME_PREF_KEY);
    return (v === 'claro' || v === 'oscuro') ? v : 'sistema';
  } catch { return 'sistema'; }
}
function saveThemePref(v) {
  try { localStorage.setItem(THEME_PREF_KEY, v); } catch { /* modo privado, etc. — no pasa nada */ }
}
function applyTheme(themePref) {
  const root = document.documentElement;
  if (themePref === 'claro') root.setAttribute('data-theme', 'light');
  else if (themePref === 'oscuro') root.setAttribute('data-theme', 'dark');
  else root.removeAttribute('data-theme');
}

/* ---------------- Personalized accent color ---------------- */
// Injects a small stylesheet mirroring the exact light/dark pattern used by
// the app's built-in tokens (see style.css :root), so a personalized accent
// gets the same guaranteed contrast in both themes instead of a flat
// override that would break dark mode.
// Color de la app es exclusivo de Premium Plus: si el plan actual no lo
// incluye, siempre se aplica el turquesa por defecto sin importar qué color
// tenga guardado la cuenta — así, si alguien baja de plan, la app vuelve al
// color por defecto pero su elección queda guardada para cuando regrese a
// Premium Plus (ver openPlans, donde se reaplica al subir de plan).
function effectiveAccentColor(account) {
  if (!account) return 'turquesa';
  return colorPersonalizationAllowed(account.plan) ? (account.accentColor || 'turquesa') : 'turquesa';
}

let accentStyleEl = null;
function applyAccentColor(colorId) {
  const a = accentInfo(colorId);
  if (!accentStyleEl) {
    accentStyleEl = document.createElement('style');
    accentStyleEl.id = 'accentOverride';
    document.head.appendChild(accentStyleEl);
  }
  accentStyleEl.textContent = `
    :root{ --brand:${a.light.brand}; --brand-solid:${a.light.solid}; --brand-solid-dark:${a.light.solidDark}; --brand-ink:${a.light.ink}; --brand-soft:${a.light.soft}; --focus:${a.light.brand}; }
    @media (prefers-color-scheme: dark){
      :root:not([data-theme="light"]){ --brand:${a.dark.brand}; --brand-ink:${a.dark.ink}; --brand-soft:${a.dark.soft}; --focus:${a.dark.brand}; }
    }
    :root[data-theme="dark"]{ --brand:${a.dark.brand}; --brand-ink:${a.dark.ink}; --brand-soft:${a.dark.soft}; --focus:${a.dark.brand}; }
  `;
}

/* ---------------- Navigation ---------------- */
function go(route, params) {
  state.route = route;
  state.params = params || {};
  if (route === 'category') state.kindFilter = null;
  render();
  if (screenEl) screenEl.scrollTop = 0;
}

function render() {
  if (state.route === 'admin') {
    appShellEl.style.display = 'none';
    adminShellEl.style.display = '';
    adminShellEl.innerHTML = adminDashboardView({
      loading: state.adminLoading,
      error: state.adminError,
      data: state.adminData,
      lastUpdated: state.adminLastUpdated,
      search: state.adminSearch,
      planFilter: state.adminPlanFilter,
      username: state.adminCreds && state.adminCreds.username
    });
    postRenderAdmin();
    return;
  }
  adminShellEl.style.display = 'none';
  appShellEl.style.display = '';

  switch (state.route) {
    case 'welcome': screenEl.innerHTML = welcomeView(); break;
    case 'auth': screenEl.innerHTML = authView({ mode: state.params.mode || 'login', error: state.authError }); break;
    case 'home': screenEl.innerHTML = homeView({ docs: store.all(), installDismissed: state.installDismissed, canInstall: state.canInstall, account: state.account }); break;
    case 'search': screenEl.innerHTML = searchView({ docs: store.all(), search: state.search, filterCat: state.filterCat }); break;
    case 'reminders': screenEl.innerHTML = remindersView(store.all()); break;
    case 'profile': screenEl.innerHTML = profileView(store.all(), state.account, loadThemePref()); break;
    case 'category': screenEl.innerHTML = categoryView(state.params.id, store.all(), state.kindFilter, (state.account && state.account.plan) || 'gratis'); break;
    case 'add': {
      const editing = state.editingId ? store.get(state.editingId) : null;
      screenEl.innerHTML = addView({ draft: state.draft, editing, plan: (state.account && state.account.plan) || 'gratis' });
      break;
    }
    case 'detail': {
      const raw = store.get(state.params.id);
      if (!raw) { go('home'); return; }
      const live = {
        ...raw,
        expiresAt: raw.expiresAt ? new Date(raw.expiresAt) : null,
        performedAt: raw.performedAt ? new Date(raw.performedAt) : null
      };
      screenEl.innerHTML = detailView(live, { plan: (state.account && state.account.plan) || 'gratis' });
      break;
    }
    default: screenEl.innerHTML = homeView({ docs: store.all(), installDismissed: state.installDismissed, canInstall: state.canInstall, account: state.account });
  }

  renderTabbar();

  if (state.route === 'add') postRenderAdd();
  if (state.route === 'auth') postRenderAuth();
  if (state.route === 'search') {
    const si = document.getElementById('searchInput');
    si.focus();
    si.addEventListener('input', () => {
      state.search = si.value;
      render();
      const el = document.getElementById('searchInput');
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }
}

function renderTabbar() {
  const hide = state.route === 'welcome' || state.route === 'auth';
  headerBarEl.style.display = hide ? 'none' : 'flex';
  fabBtnEl.style.display = hide ? 'none' : 'flex';
  if (hide) return;
  // En la pantalla de Buscar ya hay un campo de búsqueda de verdad arriba
  // del todo — mostrar también el atajo genérico sería un segundo botón
  // redundante que no hace nada nuevo, así que aquí se oculta (con una
  // clase, no con style.display directo, para no pisar el display:none que
  // ya le pone la hoja de estilos en escritorio — ver el media query de
  // 640px en style.css).
  const headerSearchEl = document.getElementById('headerSearchBtn');
  if (headerSearchEl) headerSearchEl.classList.toggle('hidden-on-search', state.route === 'search');
  tabbarEl.innerHTML = TABS.map((t) => {
    const active = state.route === t.route;
    return `<button class="tab ${active ? 'active' : ''}" data-nav="${t.route}">${icon(t.icon)}<span>${t.label}</span></button>`;
  }).join('');
}

/* ---------------- Toast ---------------- */
function toast(msg) {
  toastMsgEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

/* ---------------- Sheet ----------------
   Todas las hojas (Seguridad, Mi plan, Facturación, etc.) pasan por aquí, así
   que el botón de cerrar (✕) se agrega una sola vez, en un solo lugar, en vez
   de que cada hoja en views.js tenga que acordarse de ponerlo — antes
   securitySheet() y plansSheet() no traían ningún botón de "Cancelar" ni
   "Listo", así que si la persona no quería cambiar su contraseña ni escoger
   un plan nuevo, no había manera de salir de ahí. Va sticky (top:0) dentro de
   la propia hoja, para seguir visible sin importar cuánto se haya bajado el
   scroll — ver también el límite de alto + scroll interno en .sheet
   (style.css), que evita que una hoja larga crezca más alto que la pantalla
   y se lleve consigo cualquier botón de cerrar que hubiera más abajo. */
function openSheet(html) {
  sheetBodyEl.innerHTML = `<div class="sheet-topbar"><button type="button" class="sheet-close" data-action="close-sheet" aria-label="Cerrar">${icon('close')}</button></div>${html}`;
  sheetLayerEl.classList.add('show');
}
function closeSheet() {
  sheetLayerEl.classList.remove('show');
}

// Botón de "mostrar/ocultar contraseña": alterna el input entre type="password"
// y type="text" para que la persona pueda revisar que escribió bien antes de
// enviar, en vez de tener que confiar a ciegas en los puntos.
function wirePasswordToggle(input, btn) {
  if (!input || !btn) return;
  btn.addEventListener('click', () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.innerHTML = icon(show ? 'eyeOff' : 'eye');
    btn.setAttribute('aria-pressed', show ? 'true' : 'false');
    btn.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
    input.focus();
    const v = input.value;
    input.setSelectionRange(v.length, v.length);
  });
}

/* ---------------- Auth flow ---------------- */
function postRenderAuth() {
  const mode = state.params.mode || 'login';
  const nameInput = document.getElementById('authName');
  const emailInput = document.getElementById('authEmail');
  const passwordInput = document.getElementById('authPassword');
  const submitBtn = document.getElementById('authSubmitBtn');

  function validate() {
    // En modo "Iniciar sesión" el mismo campo también sirve para entrar
    // como administrador (ver el manejador de submit más abajo), y un
    // usuario de administrador no tiene por qué parecer un correo — solo
    // en "Crear cuenta" se exige el formato de correo.
    const emailOk = mode === 'signup' ? emailInput.value.trim().includes('@') : emailInput.value.trim().length > 0;
    const passOk = mode === 'signup' ? passwordInput.value.length >= 4 : passwordInput.value.length > 0;
    const nameOk = mode === 'login' || (nameInput && nameInput.value.trim().length > 0);
    submitBtn.disabled = !(emailOk && passOk && nameOk);
  }
  if (nameInput) nameInput.addEventListener('input', validate);
  emailInput.addEventListener('input', validate);
  passwordInput.addEventListener('input', validate);
  validate();
  wirePasswordToggle(passwordInput, document.getElementById('authPasswordToggle'));

  const switchBtn = document.querySelector('[data-switch-auth]');
  if (switchBtn) {
    switchBtn.addEventListener('click', () => {
      state.authError = null;
      go('auth', { mode: switchBtn.getAttribute('data-switch-auth') });
    });
  }

  submitBtn.addEventListener('click', async () => {
    submitBtn.disabled = true;
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const result = mode === 'signup'
      ? await register({ name: nameInput.value.trim(), email, password })
      : await login({ email, password });
    if (result.ok && result.needsConfirmation) {
      // El proyecto de Supabase tiene activada la confirmación por correo:
      // la cuenta ya existe pero todavía no hay sesión abierta hasta que la
      // persona toque el enlace que le llegó por correo. Ver la nota en
      // register() (src/auth.js) sobre cómo desactivar esto si se prefiere
      // el alta instantánea de siempre.
      submitBtn.disabled = false;
      state.authError = null;
      openSheet(`
        <div class="sheet-handle"></div>
        <h3>${icon('mail')} Revisa tu correo</h3>
        <p>Te mandamos un enlace de confirmación a <b>${esc(email)}</b>. Ábrelo para activar tu cuenta y luego inicia sesión aquí.</p>
        <button class="btn btn-primary" data-action="close-sheet">Entendido</button>
      `);
      return;
    }
    if (result.ok) {
      state.authError = null;
      state.account = result.account;
      if (mode === 'signup') await initAccountDocs(result.account.id, false);
      await openStoreForAccount(result.account.id);
      applyAccentColor(effectiveAccentColor(result.account));
      trackAccount(result.account);
      go('home');
      toast(mode === 'signup' ? 'Cuenta creada' : 'Bienvenido de nuevo');
      return;
    }
    // No es una cuenta normal — antes de mostrar el error, prueba si lo que
    // se escribió es el usuario y la contraseña del administrador (ver
    // "Una sola web, un solo login": el panel de administrador se entra
    // desde este mismo formulario, no desde una página aparte). Si tampoco
    // es eso, se muestra el error normal de siempre — quien administra el
    // sitio es la única persona que sabe que este segundo intento existe.
    if (mode === 'login') {
      const isAdmin = await tryAdminAuth({ username: email, password });
      if (isAdmin) {
        state.authError = null;
        state.route = 'admin';
        state.params = {};
        render();
        if (screenEl) screenEl.scrollTop = 0;
        return;
      }
    }
    state.authError = result.error;
    go('auth', { mode });
  });
}

/* ---------------- Panel de administrador (mismo login que la app) ---------------- */
// Intenta autenticar como administrador contra /api/admin-metrics — se usa
// tanto al escribir credenciales en el formulario normal de "Iniciar
// sesión" (arriba) como para restaurar una sesión de administrador
// guardada al abrir la app (ver initApp). Nunca lanza: devuelve
// true/false, y en caso de éxito ya deja state.adminData listo para
// pintar el tablero.
async function tryAdminAuth(creds) {
  try {
    const data = await fetchAdminMetrics(creds);
    state.adminAuthed = true;
    state.adminData = data;
    state.adminLastUpdated = new Date();
    state.adminCreds = creds;
    saveAdminSession(creds);
    return true;
  } catch (e) {
    return false;
  }
}

async function refreshAdmin() {
  if (!state.adminCreds) return;
  state.adminLoading = true;
  render();
  try {
    state.adminData = await fetchAdminMetrics(state.adminCreds);
    state.adminLastUpdated = new Date();
    state.adminError = null;
  } catch (e) {
    state.adminError = e.message;
  } finally {
    state.adminLoading = false;
    render();
  }
}

function logoutAdmin() {
  state.adminAuthed = false;
  state.adminCreds = null;
  state.adminData = null;
  state.adminError = null;
  clearAdminSession();
  go('welcome');
  toast('Sesión cerrada');
}

function postRenderAdmin() {
  if (!state.adminData) return; // pantalla de carga — nada que enganchar todavía
  document.getElementById('admin-refresh')?.addEventListener('click', refreshAdmin);
  document.getElementById('admin-logout')?.addEventListener('click', logoutAdmin);
  const searchInput = document.getElementById('admin-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      state.adminSearch = searchInput.value;
      render();
      // Después de re-renderizar, regresa el foco y el cursor al campo de
      // búsqueda — si no, cada tecleo pierde el foco porque render()
      // reconstruye todo el HTML de la pantalla desde cero.
      const again = document.getElementById('admin-search-input');
      if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
    });
  }
  document.querySelectorAll('[data-plan-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.adminPlanFilter = btn.getAttribute('data-plan-filter');
      render();
    });
  });
}

async function doLogout() {
  await logout();
  clearStore();
  state.account = null;
  state.editingId = null;
  state.draft = null;
  applyAccentColor('turquesa');
  go('welcome');
  toast('Sesión cerrada');
}

/* ---------------- Add / edit flow ---------------- */
// Builds a fresh draft object shaped for a given form mode (doc/activity/pago/prestamo).
function defaultDraftForMode(category, mode) {
  const draft = {
    name: '',
    category: category || null,
    kind: mode === 'activity' ? 'activity' : (category && catInfo(category).activityCapable ? 'doc' : null),
    expiresAt: null,
    performedAt: mode === 'activity' ? new Date() : null,
    reminderOn: mode !== 'prestamo',
    reminderDays: mode === 'pago' ? 3 : 7,
    recurrence: mode === 'pago' ? 'mensual' : null,
    direction: mode === 'prestamo' ? 'me_deben' : null,
    person: '',
    amount: '',
    notes: '',
    image: null,
    fileName: null,
    // Adjuntos: `file` es el objeto File real recién elegido (pendiente de
    // subir al guardar), `attachmentType`/`attachmentPath` reflejan lo que
    // YA está guardado en Supabase Storage cuando se edita un documento
    // existente, y `removeAttachment` marca que la persona pidió quitar ese
    // adjunto guardado sin poner uno nuevo (ver renderUploadZone/saveDraft).
    file: null,
    attachmentType: null,
    attachmentPath: null,
    removeAttachment: false,
    // Salud only — vacuna is always unlocked on every plan, so it's a safe default.
    healthType: mode === 'salud' ? 'vacuna' : null,
    dose: '',
    frequency: '',
    labTestType: mode === 'salud' ? 'quimica4' : null,
    labValues: {}
  };
  return draft;
}

function startAdd(catId) {
  state.editingId = null;
  const mode = formMode(catId, catId && catInfo(catId).activityCapable ? 'doc' : null);
  state.draft = defaultDraftForMode(catId, mode);
  go('add');
}
function startEdit(doc) {
  state.editingId = doc.id;
  const mode = formMode(doc.category, doc.kind);
  state.draft = {
    name: doc.name,
    category: doc.category,
    kind: doc.kind || (catInfo(doc.category).activityCapable ? 'doc' : null),
    expiresAt: doc.expiresAt ? new Date(doc.expiresAt) : null,
    performedAt: doc.performedAt ? new Date(doc.performedAt) : (mode === 'activity' ? new Date() : null),
    reminderOn: !!doc.reminderDays,
    reminderDays: doc.reminderDays || (mode === 'pago' ? 3 : 7),
    recurrence: doc.recurrence || (mode === 'pago' ? 'mensual' : null),
    direction: doc.direction || (mode === 'prestamo' ? 'me_deben' : null),
    person: doc.person || '',
    amount: doc.amount != null ? String(doc.amount) : '',
    notes: doc.notes || '',
    image: doc.image || null,
    fileName: doc.attachmentName || (doc.image ? 'Foto adjunta' : null),
    file: null,
    attachmentType: doc.attachmentType || null,
    attachmentPath: doc.attachmentPath || null,
    removeAttachment: false,
    healthType: doc.healthType || (mode === 'salud' ? 'vacuna' : null),
    dose: doc.dose || '',
    frequency: doc.frequency || '',
    labTestType: doc.labTestType || (mode === 'salud' ? 'quimica4' : null),
    labValues: doc.labValues ? { ...doc.labValues } : {}
  };
  go('add');
}

// Category or kind changed in a way that alters the field set — start a
// fresh draft for the new mode but keep what the person already typed.
function applyModeReset(newCategory, newKind) {
  const preserved = {
    name: state.draft.name, notes: state.draft.notes, image: state.draft.image, fileName: state.draft.fileName,
    file: state.draft.file, attachmentType: state.draft.attachmentType, attachmentPath: state.draft.attachmentPath, removeAttachment: state.draft.removeAttachment
  };
  const mode = formMode(newCategory, newKind);
  state.draft = Object.assign(defaultDraftForMode(newCategory, mode), preserved);
}

function validateAddForm() {
  const btn = document.getElementById('saveDocBtn');
  if (!btn) return;
  const d = state.draft;
  const mode = formMode(d.category, d.kind);
  let ok;
  if (mode === 'pago') ok = d.name.trim().length > 0 && !!d.category && !!d.recurrence && !!d.expiresAt;
  else if (mode === 'prestamo') ok = !!d.category && !!d.direction && d.person.trim().length > 0 && !!d.amount && +d.amount > 0;
  else if (mode === 'activity') ok = d.name.trim().length > 0 && !!d.category && !!d.performedAt;
  else if (mode === 'salud') ok = d.name.trim().length > 0 && !!d.category && !!d.healthType;
  else ok = d.name.trim().length > 0 && !!d.category;
  btn.disabled = !ok;
}

// El adjunto se sube de verdad a Supabase Storage hasta que se guarda el
// documento (ver saveDraft) — mientras tanto, aquí solo se guarda el objeto
// File elegido (state.draft.file) más, para una foto, un data URL nomás
// para la vista previa (nunca se guarda ese data URL en la base de datos).
// Si se está editando un documento que YA tenía un adjunto guardado
// (state.draft.attachmentPath), "quitar" lo marca para borrarlo al guardar
// (removeAttachment) en vez de borrarlo ahí mismo — así "Cancelar" en el
// formulario no deja el archivo a medio borrar.
function renderUploadZone() {
  const wrap = document.getElementById('uploadZone');
  if (!wrap) return;
  const draft = state.draft;
  if (draft.image) {
    wrap.innerHTML = `<div class="upload-preview"><img src="${draft.image}" alt="" />
      <div class="fname">${esc(draft.fileName || 'Foto adjunta')}</div>
      <button type="button" id="removeUpload">${icon('close')}</button></div>
      <input type="file" id="fileInput" accept="image/*,.pdf" style="display:none" />`;
  } else if (draft.fileName && !draft.removeAttachment) {
    wrap.innerHTML = `<div class="upload-preview"><div class="ph">${icon('doc')}</div>
      <div class="fname">${esc(draft.fileName)}</div>
      <button type="button" id="removeUpload">${icon('close')}</button></div>
      <input type="file" id="fileInput" accept="image/*,.pdf" style="display:none" />`;
  } else {
    wrap.innerHTML = `<label class="upload-box" for="fileInput">${icon('camera')}
      <div class="t1">Toca para tomar foto o subir archivo</div>
      <div class="t2">JPG, PNG o PDF</div>
      <input type="file" id="fileInput" accept="image/*,.pdf" style="display:none" /></label>`;
  }

  const input = document.getElementById('fileInput');
  if (input) {
    input.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      state.draft.file = file;
      state.draft.removeAttachment = false;
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          state.draft.image = ev.target.result;
          state.draft.fileName = file.name;
          renderUploadZone();
          validateAddForm();
        };
        reader.readAsDataURL(file);
      } else {
        state.draft.image = null;
        state.draft.fileName = file.name;
        renderUploadZone();
        validateAddForm();
      }
    });
  }
  const rm = document.getElementById('removeUpload');
  if (rm) {
    rm.addEventListener('click', () => {
      state.draft.image = null;
      state.draft.fileName = null;
      state.draft.file = null;
      state.draft.removeAttachment = !!state.draft.attachmentPath;
      renderUploadZone();
    });
  }
}

function postRenderAdd() {
  renderUploadZone();

  const nameInput = document.getElementById('fName');
  nameInput.addEventListener('input', () => { state.draft.name = nameInput.value; validateAddForm(); });

  document.getElementById('catChips').addEventListener('click', function (e) {
    const b = e.target.closest('[data-set-cat]');
    if (!b) return;
    const newCat = b.getAttribute('data-set-cat');
    if (newCat === state.draft.category) return;
    // The field set can change shape in several ways (kind row appearing,
    // doc vs. activity vs. pago vs. prestamo fields), so always rebuild the
    // draft for the new category rather than trying to patch chips in place.
    applyModeReset(newCat, catInfo(newCat).activityCapable ? 'doc' : null);
    render();
  });

  const kindChips = document.getElementById('kindChips');
  if (kindChips) {
    kindChips.addEventListener('click', function (e) {
      const b = e.target.closest('[data-set-kind]');
      if (!b) return;
      const newKind = b.getAttribute('data-set-kind');
      if (newKind === state.draft.kind) return;
      applyModeReset(state.draft.category, newKind);
      render();
    });
  }

  const recurrenceChips = document.getElementById('recurrenceChips');
  if (recurrenceChips) {
    recurrenceChips.addEventListener('click', function (e) {
      const b = e.target.closest('[data-set-recurrence]');
      if (!b) return;
      state.draft.recurrence = b.getAttribute('data-set-recurrence');
      this.querySelectorAll('.chip').forEach((c) => c.classList.remove('selected'));
      b.classList.add('selected');
      validateAddForm();
    });
  }

  const healthTypeChips = document.getElementById('healthTypeChips');
  if (healthTypeChips) {
    healthTypeChips.addEventListener('click', function (e) {
      const locked = e.target.closest('[data-health-locked]');
      if (locked) { openHealthUpsell(locked.getAttribute('data-health-locked')); return; }
      const b = e.target.closest('[data-set-health-type]');
      if (!b) return;
      const type = b.getAttribute('data-set-health-type');
      if (type === state.draft.healthType) return;
      const preserved = {
    name: state.draft.name, notes: state.draft.notes, image: state.draft.image, fileName: state.draft.fileName,
    file: state.draft.file, attachmentType: state.draft.attachmentType, attachmentPath: state.draft.attachmentPath, removeAttachment: state.draft.removeAttachment
  };
      state.draft = Object.assign(defaultDraftForMode('salud', 'salud'), preserved, { healthType: type });
      render();
    });
  }
  const doseInput = document.getElementById('fDose');
  if (doseInput) doseInput.addEventListener('input', () => { state.draft.dose = doseInput.value; });
  const frequencyInput = document.getElementById('fFrequency');
  if (frequencyInput) frequencyInput.addEventListener('input', () => { state.draft.frequency = frequencyInput.value; });

  const directionChips = document.getElementById('directionChips');
  if (directionChips) {
    directionChips.addEventListener('click', function (e) {
      const b = e.target.closest('[data-set-direction]');
      if (!b) return;
      state.draft.direction = b.getAttribute('data-set-direction');
      this.querySelectorAll('.chip').forEach((c) => c.classList.remove('selected'));
      b.classList.add('selected');
      validateAddForm();
    });
  }

  const personInput = document.getElementById('fPerson');
  if (personInput) personInput.addEventListener('input', () => { state.draft.person = personInput.value; validateAddForm(); });
  const amountInput = document.getElementById('fAmount');
  if (amountInput) amountInput.addEventListener('input', () => { state.draft.amount = amountInput.value; validateAddForm(); });

  const mode = formMode(state.draft.category, state.draft.kind);

  const dateInput = document.getElementById('fDate');
  if (dateInput) {
    dateInput.addEventListener('change', () => {
      state.draft.expiresAt = dateInput.value ? fromInputDate(dateInput.value) : null;
      validateAddForm();
    });
  }
  const performedInput = document.getElementById('fPerformed');
  if (performedInput) {
    performedInput.addEventListener('change', () => {
      state.draft.performedAt = performedInput.value ? fromInputDate(performedInput.value) : null;
      validateAddForm();
    });
  }

  const presetChips = document.getElementById('presetChips');
  if (presetChips) {
    presetChips.addEventListener('click', function (e) {
      const b = e.target.closest('[data-preset]');
      if (!b) return;
      const v = b.getAttribute('data-preset');
      if (v === 'none') {
        state.draft.expiresAt = null;
        if (dateInput) dateInput.value = '';
      } else if (mode === 'activity') {
        const base = state.draft.performedAt || new Date();
        const d = addDays(base, +v);
        state.draft.expiresAt = d;
      } else {
        const d = addDays(new Date(), +v);
        state.draft.expiresAt = d;
        if (dateInput) dateInput.value = d.toISOString().slice(0, 10);
      }
      this.querySelectorAll('.chip').forEach((c) => c.classList.remove('selected'));
      b.classList.add('selected');
      validateAddForm();
    });
  }

  const reminderSwitch = document.getElementById('reminderSwitch');
  if (reminderSwitch) {
    reminderSwitch.addEventListener('click', function () {
      state.draft.reminderOn = !state.draft.reminderOn;
      this.classList.toggle('on', state.draft.reminderOn);
      document.getElementById('reminderDaysWrap').style.display = state.draft.reminderOn ? 'block' : 'none';
    });
  }
  const reminderChips = document.getElementById('reminderChips');
  if (reminderChips) {
    reminderChips.addEventListener('click', function (e) {
      const b = e.target.closest('[data-reminder-days]');
      if (!b) return;
      state.draft.reminderDays = +b.getAttribute('data-reminder-days');
      this.querySelectorAll('.chip').forEach((c) => c.classList.remove('selected'));
      b.classList.add('selected');
    });
  }

  document.getElementById('fNotes').addEventListener('input', (e) => { state.draft.notes = e.target.value; });
  document.getElementById('saveDocBtn').addEventListener('click', saveDraft);
  validateAddForm();
}

async function saveDraft() {
  const d = state.draft;
  const mode = formMode(d.category, d.kind);
  if (!d.category) return;
  if (mode === 'pago' && (!d.name.trim() || !d.recurrence || !d.expiresAt)) return;
  if (mode === 'prestamo' && (!d.direction || !d.person.trim() || !d.amount || +d.amount <= 0)) return;
  if (mode === 'activity' && (!d.name.trim() || !d.performedAt)) return;
  if (mode === 'salud' && (!d.name.trim() || !d.healthType)) return;
  if (mode === 'doc' && !d.name.trim()) return;

  // Plan gating: only applies to brand-new items (editing something you
  // already have never increases the count), and Salud has its own
  // per-subcategory unlock instead of the general item limit.
  if (!state.editingId) {
    const plan = (state.account && state.account.plan) || 'gratis';
    if (mode === 'salud') {
      if (!healthTypeAllowed(plan, d.healthType)) { openHealthUpsell(d.healthType); return; }
    } else {
      const limit = planInfo(plan).limit;
      if (nonHealthCount(store.all()) >= limit) { openPlanLimitReached(plan); return; }
    }
  }

  const finalName = mode === 'prestamo' && !d.name.trim()
    ? (d.direction === 'me_deben' ? 'Préstamo a ' : 'Préstamo de ') + d.person.trim()
    : d.name.trim();

  const payload = {
    name: finalName,
    category: d.category,
    kind: catInfo(d.category).activityCapable ? d.kind : null,
    expiresAt: d.expiresAt ? d.expiresAt.toISOString() : null,
    performedAt: d.performedAt ? d.performedAt.toISOString() : null,
    reminderDays: d.reminderOn ? d.reminderDays : null,
    recurrence: mode === 'pago' ? d.recurrence : null,
    direction: mode === 'prestamo' ? d.direction : null,
    person: mode === 'prestamo' ? d.person.trim() : null,
    amount: mode === 'prestamo' ? Number(d.amount) : null,
    notes: d.notes,
    healthType: mode === 'salud' ? d.healthType : null,
    dose: mode === 'salud' && d.healthType === 'medicamento' ? d.dose : null,
    frequency: mode === 'salud' && d.healthType === 'medicamento' ? d.frequency : null,
    labTestType: mode === 'salud' && d.healthType === 'laboratorio' ? d.labTestType : null,
    labValues: mode === 'salud' && d.healthType === 'laboratorio' ? { ...d.labValues } : null
  };
  const saveBtn = document.getElementById('saveDocBtn');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Guardando…'; }
  try {
    if (state.editingId) {
      await store.update(state.editingId, payload, d.file, d.removeAttachment);
      toast('Cambios guardados');
      go('detail', { id: state.editingId });
    } else {
      const record = await store.add(payload, d.file);
      const msgMap = { pago: 'Servicio guardado', prestamo: 'Préstamo guardado', activity: 'Registro guardado', doc: 'Documento guardado', salud: healthTypeInfo(d.healthType).savedLabel };
      toast(msgMap[mode]);
      go('detail', { id: record.id });
    }
  } catch (err) {
    toast(err.message || 'No se pudo guardar — revisa tu conexión e intenta de nuevo.');
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = state.editingId ? 'Guardar cambios' : `Guardar ${docNounForMode(mode, d)}`; }
  }
}

// Mismo texto que usa el botón "Guardar ___" del formulario (ver addView en
// views.js) — se repite aquí solo para poder restaurarlo si saveDraft()
// falla y hay que reactivar el botón sin perder la etiqueta correcta.
function docNounForMode(mode, d) {
  if (mode === 'pago') return 'servicio';
  if (mode === 'prestamo') return 'préstamo';
  if (mode === 'activity') return 'registro';
  if (mode === 'salud') return healthTypeInfo(d.healthType).singular.toLowerCase();
  return 'documento';
}

function confirmDelete(id) {
  const doc = store.get(id);
  if (!doc) return;
  const noun = docNoun(doc);
  const delMsg = { documento: 'Documento eliminado', registro: 'Registro eliminado', servicio: 'Servicio eliminado', 'préstamo': 'Préstamo eliminado' };
  openSheet(`
    <div class="sheet-handle"></div>
    <h3>¿Eliminar ${doc.name}?</h3>
    <p>Esta acción no se puede deshacer. Este ${noun} se borrará junto con su recordatorio.</p>
    <button class="btn btn-danger" id="confirmDeleteBtn">Eliminar</button>
    <button class="btn btn-ghost" data-action="close-sheet">Cancelar</button>
  `);
  document.getElementById('confirmDeleteBtn').addEventListener('click', async () => {
    try {
      await store.remove(id);
      closeSheet();
      toast(delMsg[noun] || 'Eliminado');
      go('home');
    } catch (err) {
      toast(err.message || 'No se pudo eliminar — intenta de nuevo.');
    }
  });
}

/* ---------------- Plans (real payment — Stripe Checkout, test mode) ---------------- */
function openPlans() {
  openSheet(plansSheet(state.account));
  const wrap = sheetBodyEl.querySelector('.plan-options');
  if (wrap) {
    wrap.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-choose-plan]');
      if (!b || !state.account || b.disabled) return;
      const plan = b.getAttribute('data-choose-plan');
      if (plan === 'gratis') {
        const updated = await setPlan(state.account.id, 'gratis');
        if (updated) state.account = updated;
        applyAccentColor(effectiveAccentColor(state.account));
        trackAccount(state.account);
        closeSheet();
        toast('Plan actualizado a Plan Gratis');
        render();
        return;
      }
      // Cualquier plan de paga sale a Stripe Checkout — Premium ofrece 7
      // días gratis la primera vez (trialUsed evita repetirla, y Stripe la
      // controla con trial_period_days); Premium Plus y un Premium fuera de
      // la prueba se cobran de inmediato. El plan NO cambia aquí: solo
      // cambia al volver, si Stripe confirma el cobro (ver
      // handleCheckoutReturn).
      const trial = plan === 'premium' && !state.account.trialUsed;
      const originalLabel = b.textContent;
      b.disabled = true;
      b.textContent = 'Conectando con Stripe…';
      startCheckout({ accountId: state.account.id, email: state.account.email, plan, trial }).catch((err) => {
        b.disabled = false;
        b.textContent = originalLabel;
        toast(err.message || 'No se pudo conectar con Stripe.');
      });
    });
  }
}

async function cancelPremiumTrial() {
  if (!state.account) return;
  // Cuentas que sí pasaron por Stripe de verdad cancelan en el portal de
  // facturación de Stripe (ver handleCheckoutReturn para la sincronización
  // al volver). La cuenta demo, sembrada directamente sin pasar por Stripe,
  // conserva el atajo local de siempre.
  if (state.account.stripeCustomerId) {
    openBillingPortal(state.account.stripeCustomerId).catch((err) => {
      toast(err.message || 'No se pudo abrir el portal de Stripe.');
    });
    return;
  }
  const updated = await setPlan(state.account.id, 'gratis');
  if (updated) state.account = updated;
  applyAccentColor(effectiveAccentColor(state.account));
  toast('Prueba cancelada — de vuelta a Plan Gratis');
  render();
}

function openPlanLimitReached(plan) {
  const p = planInfo(plan);
  openSheet(`
    <div class="sheet-handle"></div>
    <h3>Llegaste al límite de tu ${esc(p.label)}</h3>
    <p>Ya guardaste ${p.limit} elementos, el máximo de tu plan actual. Actualiza tu plan para seguir guardando — Salud no cuenta en este límite.</p>
    <button class="btn btn-primary" data-action="open-plans">Ver planes</button>
    <button class="btn btn-ghost" data-action="close-sheet">Ahora no</button>
  `);
}

function joinEs(list) {
  if (list.length <= 1) return list.join('');
  return list.slice(0, -1).join(', ') + ' y ' + list[list.length - 1];
}

function openHealthUpsell(healthType) {
  const h = healthTypeInfo(healthType);
  const currentPlan = planInfo((state.account && state.account.plan) || 'gratis');
  // Vacunas es lo único que ya incluye el plan Gratis; todo lo demás en
  // Salud (Medicamentos, Pruebas de laboratorio) se desbloquea en Premium.
  const neededPlan = planInfo('premium');
  const included = joinEs(currentPlan.salud.map((id) => healthTypeInfo(id).label));
  openSheet(`
    <div class="sheet-handle"></div>
    <h3>${esc(h.label)} es parte de ${esc(neededPlan.label)}</h3>
    <p>Tu ${esc(currentPlan.label)} ya incluye ${esc(included)} sin límite. Actualiza a ${esc(neededPlan.label)} para desbloquear ${esc(h.label.toLowerCase())}.</p>
    <button class="btn btn-primary" data-action="open-plans">Ver planes</button>
    <button class="btn btn-ghost" data-action="close-sheet">Ahora no</button>
  `);
}

/* ---------------- Apariencia ---------------- */
function openThemeSettings() {
  openSheet(themeSheet(loadThemePref()));
  wireThemeSheet();
}
function wireThemeSheet() {
  const list = sheetBodyEl.querySelector('.theme-options');
  if (!list) return;
  list.addEventListener('click', (e) => {
    const b = e.target.closest('[data-choose-theme]');
    if (!b) return;
    const themeId = b.getAttribute('data-choose-theme');
    saveThemePref(themeId);
    applyTheme(themeId);
    if (state.route === 'profile') render(); // refresh the "Apariencia" row's label behind the sheet
    openSheet(themeSheet(themeId));
    wireThemeSheet();
  });
}

/* ---------------- Personalized color ---------------- */
function wireColorSheet() {
  const grid = sheetBodyEl.querySelector('.swatch-grid');
  if (!grid) return;
  grid.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-choose-accent]');
    if (!b || !state.account) return;
    const colorId = b.getAttribute('data-choose-accent');
    const updated = await setAccentColor(state.account.id, colorId);
    if (updated) state.account = updated;
    applyAccentColor(colorId);
    render(); // refresh the page behind the sheet too (e.g. the "Color de la app" row on Profile)
    openSheet(colorSheet(colorId));
    wireColorSheet();
  });
}
// Facturación (registro de los pagos de la propia membresía, no un lugar
// para guardar facturas de compra — ver la nota en billingSheet()). Si la
// cuenta ya tiene un cliente de Stripe real, va directo al portal de
// facturación de Stripe (mismo camino que "Cancelar en Stripe" en
// cancelPremiumTrial) — ahí es donde de verdad viven las facturas, no en
// una hoja simulada dentro de la app. Si nunca ha tenido un plan de paga,
// no hay nada que mostrar todavía: se ve una hoja explicándolo con un
// atajo a "Ver planes".
function openBilling() {
  if (!state.account) return;
  if (state.account.stripeCustomerId) {
    openBillingPortal(state.account.stripeCustomerId).catch((err) => {
      toast(err.message || 'No se pudo abrir el portal de Stripe.');
    });
    return;
  }
  openSheet(billingSheet(state.account));
}

function openColorSettings() {
  openSheet(colorSheet((state.account && state.account.accentColor) || 'turquesa'));
  wireColorSheet();
}

function openColorUpsell() {
  openSheet(`
    <div class="sheet-handle"></div>
    <h3>Color de la app es parte de Premium Plus</h3>
    <p>Personaliza el acento de toda la app con tu color favorito — disponible al actualizar a Plan Premium Plus.</p>
    <button class="btn btn-primary" data-action="open-plans">Ver planes</button>
    <button class="btn btn-ghost" data-action="close-sheet">Ahora no</button>
  `);
}

/* ---------------- Compartir (Web Share API real, con respaldo al portapapeles) ---------------- */
// Comparte de verdad con otras apps a través del share sheet nativo del
// sistema (WhatsApp, Mensajes, correo, lo que sea que la persona tenga
// instalado). Si el documento tiene una foto o PDF adjunto, se manda el
// archivo tal cual — no solo su descripción — para que se pueda reenviar la
// garantía, póliza o identificación de verdad. Si el navegador no puede
// compartir archivos (o no hay adjunto), se comparte el resumen de texto
// con la liga firmada del adjunto; si ni eso se puede, se copia al
// portapapeles — siempre con un mensaje que dice exactamente qué pasó,
// nunca un botón que no hace nada.
async function shareDoc() {
  const doc = store.get(state.params.id);
  if (!doc) return;
  const info = docInfo(doc);
  const parts = [doc.name, catInfo(doc.category).label];
  if (info && info.label) parts.push(info.label);
  const text = parts.join(' — ');
  const title = 'Memoreo';

  if (navigator.share) {
    let file = null;
    if (doc.attachmentUrl && navigator.canShare) {
      try {
        const res = await fetch(doc.attachmentUrl);
        if (res.ok) {
          const blob = await res.blob();
          const fname = doc.attachmentName || `${doc.name}${doc.attachmentType === 'pdf' ? '.pdf' : ''}`;
          const candidate = new File([blob], fname, {
            type: blob.type || (doc.attachmentType === 'pdf' ? 'application/pdf' : 'image/jpeg')
          });
          if (navigator.canShare({ files: [candidate] })) file = candidate;
        }
      } catch (e) {
        // Sin conexión o el adjunto ya no se pudo descargar — se sigue sin
        // archivo, con el resumen de texto (y su liga) más abajo.
      }
    }
    try {
      if (file) await navigator.share({ title, text, files: [file] });
      else if (doc.attachmentUrl) await navigator.share({ title, text, url: doc.attachmentUrl });
      else await navigator.share({ title, text });
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return; // cerró el share sheet sin elegir nada
      // Cualquier otro error real (el navegador rechazó compartir el
      // archivo, por ejemplo): se sigue con el portapapeles en vez de
      // quedarse sin hacer nada.
    }
  }
  const clipboardText = doc.attachmentUrl ? `${text}\n${doc.attachmentUrl}` : text;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(clipboardText);
      toast('Copiado al portapapeles');
    } catch (e) {
      toast('No se pudo compartir ni copiar al portapapeles');
    }
    return;
  }
  toast('Tu navegador no soporta compartir');
}

/* ---------------- Profile photo (sube de verdad al bucket privado "avatars" de Supabase Storage) ---------------- */
function editAvatar() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    if (!file || !state.account) return;
    toast('Subiendo foto…');
    const updated = await setAvatar(state.account.id, file);
    if (updated) {
      state.account = updated;
      render();
      toast('Foto de perfil actualizada');
    } else {
      toast('No se pudo subir la foto — intenta de nuevo.');
    }
  });
  input.click();
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function openSecuritySettings() {
  openSheet(securitySheet());
  const curPass = document.getElementById('curPass');
  const newPass = document.getElementById('newPass');
  const newPass2 = document.getElementById('newPass2');
  const errEl = document.getElementById('passError');
  const changeBtn = document.getElementById('changePassBtn');
  const deleteBtn = document.getElementById('deleteAccountBtn');

  changeBtn.addEventListener('click', async () => {
    if (!state.account) return;
    errEl.style.display = 'none';
    if (newPass.value !== newPass2.value) {
      errEl.textContent = 'Las contraseñas nuevas no coinciden.';
      errEl.style.display = 'block';
      return;
    }
    const result = await changePassword(state.account.id, curPass.value, newPass.value);
    if (!result.ok) {
      errEl.textContent = result.error;
      errEl.style.display = 'block';
      return;
    }
    closeSheet();
    toast('Contraseña actualizada');
  });

  deleteBtn.addEventListener('click', () => {
    openSheet(`
      <div class="sheet-handle"></div>
      <h3>¿Eliminar tu cuenta?</h3>
      <p>Se eliminará <b>permanentemente</b> toda tu información de este navegador: documentos, recordatorios, fechas de vencimiento, fotos y preferencias. No hay forma de recuperarla después.</p>
      <button class="btn btn-danger" id="confirmDeleteAccountBtn">Sí, eliminar mi cuenta</button>
      <button class="btn btn-ghost" data-action="close-sheet">Cancelar</button>
    `);
    document.getElementById('confirmDeleteAccountBtn').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = 'Eliminando…';
      const accountId = state.account.id;
      const result = await deleteAccount(accountId);
      if (!result.ok) {
        btn.disabled = false;
        btn.textContent = 'Sí, eliminar mi cuenta';
        toast(result.error || 'No se pudo eliminar la cuenta.');
        return;
      }
      clearStore();
      state.account = null;
      applyAccentColor('turquesa');
      closeSheet();
      go('welcome');
      toast('Cuenta eliminada');
    });
  });
}

/* ---------------- Install prompt ---------------- */
async function installApp() {
  if (!state.deferredPrompt) {
    openSheet(`
      <div class="sheet-handle"></div>
      <h3>Instalar Memoreo</h3>
      <p>En Chrome o Edge de escritorio y Android, usa el menú del navegador y elige "Instalar app" o "Agregar a pantalla de inicio". En iPhone, toca el ícono de compartir en Safari y elige "Agregar a pantalla de inicio".</p>
      <button class="btn btn-primary" data-action="close-sheet">Entendido</button>
    `);
    return;
  }
  state.deferredPrompt.prompt();
  const { outcome } = await state.deferredPrompt.userChoice;
  state.deferredPrompt = null;
  state.canInstall = false;
  if (outcome === 'accepted') toast('Instalando Memoreo…');
  render();
}

/* ---------------- Event delegation ---------------- */
function handleClick(e) {
  const t = e.target;

  const navEl = t.closest('[data-nav]');
  if (navEl) {
    const route = navEl.getAttribute('data-nav');
    const openId = navEl.getAttribute('data-open');
    if (route === 'add' && !openId) { startAdd(null); return; }
    if (route === 'detail' && openId) { go('detail', { id: openId }); return; }
    if (route === 'auth') { state.authError = null; go('auth', { mode: navEl.getAttribute('data-auth-mode') || 'login' }); return; }
    go(route);
    return;
  }
  const openEl = t.closest('[data-open]');
  if (openEl && !openEl.hasAttribute('data-nav')) {
    go('detail', { id: openEl.getAttribute('data-open') });
    return;
  }
  const catEl = t.closest('[data-cat-open]');
  if (catEl) { go('category', { id: catEl.getAttribute('data-cat-open') }); return; }

  const filterEl = t.closest('[data-filter-cat]');
  if (filterEl) {
    state.filterCat = filterEl.getAttribute('data-filter-cat') || null;
    render();
    const si = document.getElementById('searchInput');
    if (si) si.focus();
    return;
  }
  const kindFilterEl = t.closest('[data-kind-filter]');
  if (kindFilterEl) {
    state.kindFilter = kindFilterEl.getAttribute('data-kind-filter') || null;
    render();
    return;
  }
  const healthLockedEl = t.closest('[data-health-locked]');
  if (healthLockedEl) { openHealthUpsell(healthLockedEl.getAttribute('data-health-locked')); return; }

  const editEl = t.closest('[data-edit]');
  if (editEl) {
    const doc = store.get(editEl.getAttribute('data-edit'));
    if (doc) startEdit(doc);
    return;
  }
  const delEl = t.closest('[data-delete]');
  if (delEl) { confirmDelete(delEl.getAttribute('data-delete')); return; }

  const act = t.closest('[data-action]');
  if (act) {
    const a = act.getAttribute('data-action');
    if (a === 'close-sheet') closeSheet();
    else if (a === 'dismiss-install') { state.installDismissed = true; render(); }
    else if (a === 'install-app') installApp();
    else if (a === 'open-plans') openPlans();
    else if (a === 'open-billing') openBilling();
    else if (a === 'cancel-trial') cancelPremiumTrial();
    else if (a === 'open-security') openSecuritySettings();
    else if (a === 'appearance-settings') openThemeSettings();
    else if (a === 'color-settings') openColorSettings();
    else if (a === 'color-locked') openColorUpsell();
    else if (a === 'edit-avatar') editAvatar();
    else if (a === 'share') shareDoc();
    else if (a === 'logout') doLogout();
    return;
  }
}
