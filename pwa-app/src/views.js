import { icon, logoMark } from './icons.js';
import { esc, fmtDate, toInputDate, formatMoney, trialInfo } from './utils.js';
import {
  CATS, catInfo, docInfo, isActivity, formMode, RECURRENCE_LABELS,
  HEALTH_TYPES, healthTypeInfo, healthTypeAllowed, planInfo, nonHealthCount, ACCENT_PALETTE, accentInfo,
  advancedHealthAllowed, colorPersonalizationAllowed, PAYMENT_DURATIONS, PAYMENT_METHODS
} from './store.js';

// Inicio/Buscar/Avisos/Perfil — SOLO para el celular (ver .tabbar-inline en
// style.css, oculto en escritorio con un media query). Cada pantalla la
// inserta ella misma justo después de su propio encabezado (el saludo +
// buscador en Inicio, el topbar en el resto), en vez de que sea una barra
// fija aparte arriba de todo — así queda debajo de lo que ya había ahí, tal
// como se pidió, y no encima. Al estar dentro de .screen (no en un elemento
// aparte) se puede pegar (position:sticky) apenas se le hace scroll por
// encima, sin importar cuánto mida lo que tenga arriba en cada pantalla. En
// escritorio la navegación sigue siendo la barra fija de siempre arriba de
// todo (#headerBar en app.js) — no cambió.
const NAV_TABS = [
  { route: 'home', icon: 'home', label: 'Inicio' },
  { route: 'search', icon: 'search', label: 'Buscar' },
  { route: 'reminders', icon: 'bell', label: 'Avisos' },
  { route: 'profile', icon: 'user', label: 'Perfil' }
];

export function navTabsHtml(activeRoute) {
  return `<div class="tabbar-inline">${NAV_TABS.map((t) => {
    const active = activeRoute === t.route;
    return `<button class="tab ${active ? 'active' : ''}" data-nav="${t.route}">${icon(t.icon)}<span>${t.label}</span></button>`;
  }).join('')}</div>`;
}

function countLabel(cat, n) {
  const noun = cat.noun || 'documento';
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

// Vehículo y Hogar comparten el mismo filtro Documento/Mantenimiento, pero
// en Hogar ese primer grupo se llama "Servicios" (agua, luz, gas, internet…)
// en vez de "Documentos" — Vehículo conserva "Documentos" tal cual.
function docKindLabel(catId) {
  return catId === 'hogar' ? 'Servicios' : 'Documentos';
}
function docKindLabelSingular(catId) {
  return catId === 'hogar' ? 'Servicio' : 'Documento';
}

// Priority/"semáforo" bucket shared by the badge pill and the small dot shown
// on every list row, so the same red/amber/green reads the same everywhere.
export function urgencyClass(info) {
  return info.urgency === 'crit' ? 'crit' : info.urgency === 'warn' ? 'warn' : info.urgency === 'ok' ? 'ok' : 'none';
}

// "Vacunas, Alergias y Medicamentos" — Spanish list join with "y" before the
// last item, used for plan/Salud copy that has to name a variable-length set.
function joinEs(list) {
  if (list.length <= 1) return list.join('');
  return list.slice(0, -1).join(', ') + ' y ' + list[list.length - 1];
}

export function badge(info) {
  const cls = urgencyClass(info);
  return `<span class="badge ${cls}"><span class="dot"></span>${esc(info.label)}</span>`;
}

export function docThumb(doc) {
  const ci = catInfo(doc.category);
  if (doc.image) return `<div class="doc-thumb c-${doc.category}"><img src="${doc.image}" alt="" /></div>`;
  return `<div class="doc-thumb c-${doc.category}">${icon(ci.icon)}</div>`;
}

// Vehículo y Hogar mezclan documentos y registros de mantenimiento: la línea
// de meta distingue cuál es cuál en vez de repetir el nombre de la categoría.
// Préstamos muestra con quién es, que es lo primero que se quiere recordar.
function metaLabel(doc) {
  if (doc.category === 'prestamos') return doc.person || catInfo(doc.category).label;
  if (doc.category === 'salud') return healthTypeInfo(doc.healthType).singular;
  if (isActivity(doc)) return 'Mantenimiento';
  return catInfo(doc.category).label;
}

export function docCard(doc) {
  const info = docInfo(doc);
  let meta = `${esc(metaLabel(doc))} · ${esc(info.label)}`;
  // Préstamos siempre trae monto (es obligatorio ahí); Servicios (Pagos y
  // Hogar) y Mantenimiento (Vehículo/Hogar) lo traen solo si la persona lo
  // puso, ya que ahí el campo es opcional.
  if ((doc.category === 'prestamos' || doc.category === 'pagos' || doc.category === 'hogar' || isActivity(doc)) && doc.amount) {
    meta = `${esc(metaLabel(doc))} · ${formatMoney(doc.amount)} · ${esc(info.label)}`;
  }
  const dot = `<span class="urg-dot ${urgencyClass(info)}"></span>`;
  return `<div class="doc-card" data-open="${doc.id}">
    ${docThumb(doc)}
    <div class="doc-info">
      <div class="name">${esc(doc.name)}</div>
      <div class="meta">${dot}${meta}</div>
    </div>
    <span class="chev">${icon('chev')}</span>
  </div>`;
}

export function urgentCard(doc) {
  const info = docInfo(doc);
  return `<div class="urgent-card" data-open="${doc.id}">
    ${badge(info)}
    <div class="name">${esc(doc.name)}</div>
    <div class="cat">${esc(metaLabel(doc))}</div>
  </div>`;
}

// Tarjetas de ejemplo para la ilustración de la pantalla de bienvenida en
// escritorio (.welcome-visual, ver style.css) — solo decorativas, con datos
// inventados a propósito distintos de cualquier documento real, para dar
// una idea de la app sin ser un screenshot del celular estirado.
const WELCOME_PREVIEW_CARDS = [
  { cat: 'garantias', icon: 'tag', name: 'Garantía · Lavadora', info: { urgency: 'ok', label: 'Vence en 8 meses' } },
  { cat: 'seguros', icon: 'shield', name: 'Seguro · Auto', info: { urgency: 'warn', label: 'Vence en 12 días' } },
  { cat: 'pagos', icon: 'repeat', name: 'Pago · Renta', info: { urgency: 'crit', label: 'Vence mañana' } },
  { cat: 'salud', icon: 'health', name: 'Vacuna · Refuerzo', info: { urgency: 'ok', label: 'Al día' } }
];

// Puntos rápidos junto al llamado a la acción en escritorio (ver
// .welcome-highlights en style.css, oculto en celular) — tres funciones
// reales de la app, no cifras inventadas, para reforzar por qué crear una
// cuenta sin depender de "números de usuarios" que Memoreo no tiene forma
// de verificar.
const WELCOME_HIGHLIGHTS = [
  { icon: 'bell', text: 'Recordatorios antes de que algo venza' },
  { icon: 'repeat', text: 'Pagos recurrentes: se registran una sola vez' },
  { icon: 'doc', text: 'Documentos, garantías, seguros y más, todo junto' }
];

export function welcomeView() {
  const cards = WELCOME_PREVIEW_CARDS.map((c, i) => `
    <div class="wv-card wv-card-${i + 1} c-${c.cat}">
      <span class="wv-ic">${icon(c.icon)}</span>
      <div class="wv-txt">
        <div class="wv-name">${esc(c.name)}</div>
        <div class="wv-when">${badge(c.info)}</div>
      </div>
    </div>`).join('');

  const highlights = WELCOME_HIGHLIGHTS.map((h) => `
    <div class="wh-item"><span class="wh-ic">${icon(h.icon)}</span><span>${esc(h.text)}</span></div>`).join('');

  return `
  <div class="welcome-wrap">
    <div class="welcome-copy">
      <div class="welcome-mark-wrap">${logoMark(84)}</div>
      <h1>Memoreo</h1>
      <p class="tag">Todo lo importante de tu vida &mdash; documentos, garantías, seguros &mdash; organizado y recordado a tiempo.</p>
      <div class="welcome-actions">
        <button class="btn btn-primary" data-nav="auth" data-auth-mode="signup">Crear cuenta</button>
        <button class="btn btn-ghost" data-nav="auth" data-auth-mode="login">Iniciar sesión</button>
      </div>
      <div class="welcome-highlights">${highlights}</div>
      <p class="welcome-foot">Sin listas de pendientes. Sin complicaciones.<br/>Solo lo que necesitas guardar y recordar.</p>
    </div>
    <div class="welcome-visual"><div class="wv-panel">${cards}</div></div>
  </div>`;
}

export function authView({ mode, error }) {
  const isSignup = mode === 'signup';
  let html = `<div class="topbar"><button class="icon-btn" data-nav="welcome">${icon('back')}</button><h1>${isSignup ? 'Crear cuenta' : 'Iniciar sesión'}</h1></div>`;
  html += `<div class="auth-wrap">`;
  html += `<p class="auth-lead">${isSignup ? 'Tu información queda guardada en este dispositivo, separada de cualquier otra cuenta.' : 'Entra con el correo y la contraseña de tu cuenta.'}</p>`;
  if (isSignup) {
    html += `<div class="field"><label for="authName">Nombre</label><input type="text" id="authName" placeholder="Tu nombre" autocomplete="name" /></div>`;
  }
  html += `<div class="field"><label for="authEmail">Correo</label><input type="${isSignup ? 'email' : 'text'}" id="authEmail" placeholder="tu@correo.com" autocomplete="${isSignup ? 'email' : 'username'}" /></div>`;
  html += `<div class="field"><label for="authPassword">Contraseña</label>
    <div class="password-field">
      <input type="password" id="authPassword" placeholder="${isSignup ? 'Crea una contraseña' : 'Tu contraseña'}" autocomplete="${isSignup ? 'new-password' : 'current-password'}" />
      <button type="button" class="password-toggle" id="authPasswordToggle" aria-label="Mostrar contraseña" aria-pressed="false" tabindex="-1">${icon('eye')}</button>
    </div>
  </div>`;
  if (error) html += `<p class="auth-error">${esc(error)}</p>`;
  html += `<button class="btn btn-primary" id="authSubmitBtn" disabled>${isSignup ? 'Crear cuenta' : 'Iniciar sesión'}</button>`;
  html += `<p class="auth-switch">${isSignup ? '¿Ya tienes cuenta?' : '¿Nuevo en Memoreo?'} <button type="button" class="link-inline" data-switch-auth="${isSignup ? 'login' : 'signup'}">${isSignup ? 'Inicia sesión' : 'Crea una cuenta'}</button></p>`;
  html += `</div>`;
  return html;
}

export function homeView({ docs, installDismissed, canInstall, account }) {
  const urgent = docs
    .filter((d) => ['crit', 'warn'].includes(docInfo(d).urgency))
    .sort((a, b) => docInfo(a).days - docInfo(b).days);
  const recent = [...docs].sort((a, b) => b.id - a.id).slice(0, 4);

  let html = '';
  if (!installDismissed && canInstall) {
    html += `<div class="install-banner">${icon('bolt')}
      <div class="txt"><b>Instala Memoreo</b>Ábrela como app desde tu pantalla de inicio.</div>
      <button class="install-cta" data-action="install-app">Instalar</button>
      <button class="dismiss" data-action="dismiss-install">${icon('close')}</button></div>`;
  }
  const firstName = account && account.name ? account.name.trim().split(/\s+/)[0] : 'de nuevo';
  html += `<div class="screen-sticky-head">
    <div class="greeting"><h1>Hola, ${esc(firstName)}</h1><p>Esto es lo que tienes guardado y lo que se acerca.</p></div>
    <button class="search-entry" data-nav="search">${icon('search')} Buscar un documento&hellip;</button>
    ${navTabsHtml('home')}
  </div>`;

  if (urgent.length) {
    html += `<div class="section-head"><h2>Vence pronto</h2></div>`;
    html += `<div class="urgent-row">${urgent.map(urgentCard).join('')}</div>`;
  }

  html += `<div class="section-head"><h2>Categorías</h2></div>`;
  html += `<div class="cat-grid">${CATS.map((c) => {
    const count = docs.filter((d) => d.category === c.id).length;
    return `<button class="cat-tile c-${c.id}" data-cat-open="${c.id}">
      <span class="cat-icon">${icon(c.icon)}</span>
      <span class="cat-label">${esc(c.label)}</span>
      <span class="cat-count">${countLabel(c, count)}</span>
    </button>`;
  }).join('')}</div>`;

  html += `<div class="section-head"><h2>Agregado recientemente</h2><button class="link" data-nav="search">Ver todo</button></div>`;
  html += `<div class="doc-list">${recent.map(docCard).join('')}</div>`;
  return html;
}

export function categoryView(catId, docs, kindFilter, plan) {
  const ci = catInfo(catId);
  let list = docs.filter((d) => d.category === catId);
  const showKindFilter = !!ci.activityCapable;
  const showHealthFilter = !!ci.healthGated;
  if (showKindFilter && kindFilter) {
    list = list.filter((d) => (kindFilter === 'activity' ? isActivity(d) : !isActivity(d)));
  }
  if (showHealthFilter && kindFilter) {
    list = list.filter((d) => d.healthType === kindFilter);
  }
  list.sort((a, b) => {
    const da = docInfo(a).days, db = docInfo(b).days;
    if (da === null && db === null) {
      const pa = a.performedAt ? a.performedAt.getTime() : -Infinity;
      const pb = b.performedAt ? b.performedAt.getTime() : -Infinity;
      return pb - pa;
    }
    if (da === null) return 1;
    if (db === null) return -1;
    return da - db;
  });
  let html = `<div class="screen-sticky-head">
    <div class="topbar"><button class="icon-btn" data-nav="home">${icon('back')}</button>
    <div><h1>${esc(ci.label)}</h1><div class="sub">${countLabel(ci, list.length)}</div></div></div>
    ${navTabsHtml()}
  </div>`;

  if (showHealthFilter) {
    const unlockedAll = HEALTH_TYPES.every((h) => healthTypeAllowed(plan, h.id));
    if (!unlockedAll) {
      const planLabel = planInfo(plan).label;
      const included = joinEs(HEALTH_TYPES.filter((h) => healthTypeAllowed(plan, h.id)).map((h) => h.label));
      const missing = joinEs(HEALTH_TYPES.filter((h) => !healthTypeAllowed(plan, h.id)).map((h) => h.label.toLowerCase()));
      html += `<div class="plan-nudge"><span>${icon('lock')}</span><div><b>Tu ${esc(planLabel)} incluye ${esc(included)} sin límite.</b> Actualiza para desbloquear ${esc(missing)}.</div>
        <button class="link" data-action="open-plans">Ver planes</button></div>`;
    }
    html += `<div class="chip-row" style="margin-bottom:16px;">
      <button class="chip ${!kindFilter ? 'selected' : ''}" data-kind-filter="">Todos</button>
      ${HEALTH_TYPES.map((h) => {
        const allowed = healthTypeAllowed(plan, h.id);
        return allowed
          ? `<button class="chip ${kindFilter === h.id ? 'selected' : ''}" data-kind-filter="${h.id}">${icon(h.icon)} ${esc(h.label)}</button>`
          : `<button class="chip chip-locked" data-health-locked="${h.id}">${icon('lock')} ${esc(h.label)}</button>`;
      }).join('')}
    </div>`;
    if (kindFilter === 'laboratorio' && !advancedHealthAllowed(plan)) {
      html += `<div class="plan-nudge"><span>${icon('lock')}</span><div><b>Premium Plus agrega más a Pruebas de laboratorio.</b> Agrega tu próxima cita médica y recibe un recordatorio antes de que llegue.</div>
        <button class="link" data-action="open-plans">Ver planes</button></div>`;
    }
  } else if (showKindFilter) {
    html += `<div class="chip-row" style="margin-bottom:16px;">
      <button class="chip ${!kindFilter ? 'selected' : ''}" data-kind-filter="">Todos</button>
      <button class="chip ${kindFilter === 'doc' ? 'selected' : ''}" data-kind-filter="doc">${icon('doc')} ${docKindLabel(catId)}</button>
      <button class="chip ${kindFilter === 'activity' ? 'selected' : ''}" data-kind-filter="activity">${icon('wrench')} Mantenimiento</button>
    </div>`;
  }
  if (!list.length) {
    const emptyCopy = showKindFilter && kindFilter === 'activity'
      ? 'Aún no has registrado mantenimientos aquí.<br/>Toca + para agregar el primero.'
      : showKindFilter && kindFilter === 'doc'
      ? (catId === 'hogar'
          ? 'Aún no tienes servicios guardados aquí.<br/>Toca + para agregar el primero.'
          : 'Aún no tienes documentos guardados aquí.<br/>Toca + para agregar el primero.')
      : catId === 'prestamos'
      ? 'Aún no tienes préstamos registrados.<br/>Toca + para agregar el primero.'
      : catId === 'pagos'
      ? 'Aún no tienes pagos recurrentes registrados.<br/>Toca + para agregar el primero.'
      : catId === 'salud'
      ? 'Aún no tienes nada guardado en Salud.<br/>Toca + para agregar tu primer registro.'
      : 'Aún no tienes nada guardado aquí.<br/>Toca + para agregar tu primer documento.';
    html += `<div class="empty-state">${icon(ci.icon)}<p>${emptyCopy}</p></div>`;
  } else {
    html += `<div class="doc-list">${list.map(docCard).join('')}</div>`;
  }
  return html;
}

export function searchView({ docs, search, filterCat }) {
  const q = search.trim().toLowerCase();
  let list = docs;
  if (filterCat) list = list.filter((d) => d.category === filterCat);
  if (q) {
    list = list.filter((d) =>
      d.name.toLowerCase().includes(q) ||
      catInfo(d.category).label.toLowerCase().includes(q) ||
      (d.person && d.person.toLowerCase().includes(q))
    );
  }
  list = [...list].sort((a, b) => {
    const da = docInfo(a).days, db = docInfo(b).days;
    if (da === null) return 1;
    if (db === null) return -1;
    return da - db;
  });

  let html = `<div class="screen-sticky-head">
    <div class="topbar"><button class="icon-btn" data-nav="home">${icon('back')}</button><h1>Buscar</h1></div>
    ${navTabsHtml('search')}
  </div>`;
  html += `<div class="search-bar">${icon('search')}<input id="searchInput" type="text" placeholder="Nombre del documento&hellip;" value="${esc(search)}" /></div>`;
  html += `<div class="chip-row" style="margin-bottom:18px;">`;
  html += `<button class="chip ${!filterCat ? 'selected' : ''}" data-filter-cat="">Todos</button>`;
  CATS.filter((c) => !c.locked).forEach((c) => {
    html += `<button class="chip ${filterCat === c.id ? 'selected' : ''}" data-filter-cat="${c.id}">${icon(c.icon)} ${esc(c.label)}</button>`;
  });
  html += `</div>`;
  if (!list.length) {
    html += `<div class="empty-state">${icon('search')}<p>No encontramos nada con esos filtros.<br/>Intenta con otra palabra o categoría.</p></div>`;
  } else {
    html += `<div class="doc-list">${list.map(docCard).join('')}</div>`;
  }
  return html;
}

export function remindersView(docs) {
  const withDates = docs.filter((d) => d.expiresAt);
  const groups = { vencidos: [], semana: [], mes: [], adelante: [] };
  withDates.forEach((d) => {
    const days = docInfo(d).days;
    if (days < 0) groups.vencidos.push(d);
    else if (days <= 7) groups.semana.push(d);
    else if (days <= 30) groups.mes.push(d);
    else groups.adelante.push(d);
  });
  Object.values(groups).forEach((g) => g.sort((a, b) => docInfo(a).days - docInfo(b).days));
  const noExp = docs.filter((d) => !d.expiresAt);

  let html = `<div class="screen-sticky-head">
    <div class="topbar"><h1>Recordatorios</h1></div>
    ${navTabsHtml('reminders')}
  </div>`;
  html += `<p style="color:var(--ink-soft);font-size:0.85rem;margin:-8px 0 4px;">Todo ordenado por urgencia, para que nada se te pase.</p>`;

  const group = (title, items) => {
    if (!items.length) return '';
    return `<div class="group-head">${title} &middot; ${items.length}</div><div class="doc-list">${items.map(docCard).join('')}</div>`;
  };
  html += group('Vencidos', groups.vencidos);
  html += group('Esta semana', groups.semana);
  html += group('Este mes', groups.mes);
  html += group('Más adelante', groups.adelante);
  if (noExp.length) html += group('Sin recordatorio activo', noExp);
  if (!withDates.length && !noExp.length) {
    html += `<div class="empty-state">${icon('bell')}<p>No tienes recordatorios todavía.</p></div>`;
  }
  return html;
}

const PLANS_ORDER_LABEL = { premium: 'Memoreo Premium', premium_plus: 'Memoreo Premium Plus' };

const THEME_LABELS = { sistema: 'Automático', claro: 'Claro', oscuro: 'Oscuro' };

export function profileView(docs, account, themePref) {
  const name = (account && account.name) || 'Invitado';
  const email = (account && account.email) || '';
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  const avatar = account && account.avatar;
  const plan = planInfo(account && account.plan);
  const accent = accentInfo(account && account.accentColor);
  const used = nonHealthCount(docs);
  const limitLabel = plan.limit === Infinity ? '∞' : plan.limit;

  let html = `<div class="screen-sticky-head">
    <div class="topbar"><h1>Perfil</h1></div>
    ${navTabsHtml('profile')}
  </div>`;
  html += `<div class="profile-card">
    <button type="button" class="profile-avatar-btn" data-action="edit-avatar" aria-label="Cambiar foto de perfil">
      <div class="profile-avatar">${avatar ? `<img src="${esc(avatar)}" alt="" />` : esc(initial)}</div>
      <span class="avatar-edit-badge">${icon('camera')}</span>
    </button>
    <div><div class="profile-name">${esc(name)}</div><div class="profile-email">${esc(email)}</div></div></div>`;
  html += `<div class="stat-strip">
    <div class="stat-box"><div class="num">${used}/${limitLabel}</div><div class="lbl">Elementos usados</div></div>
    <div class="stat-box"><div class="num">${docs.filter((d) => d.expiresAt).length}</div><div class="lbl">Con recordatorio</div></div>
  </div>`;

  // trial.active solo puede ser cierto en cuentas viejas que sí pasaron por
  // Stripe (el nuevo sistema de pago manual nunca pone trialEndsAt) — se
  // conserva por si alguna cuenta así queda por ahí, pero ya no es el
  // camino nuevo de nadie.
  const trial = trialInfo(account);
  const expiresAt = account && account.planExpiresAt ? new Date(account.planExpiresAt) : null;
  const expiresLine = expiresAt ? `<span style="display:block;margin-top:4px;font-weight:400;color:var(--ink-faint);">Vence el ${esc(fmtDate(expiresAt))}</span>` : '';
  if (trial.active) {
    const last4 = (account && account.paymentMethod && account.paymentMethod.last4) || '----';
    const cancelLabel = account && account.stripeCustomerId ? 'Cancelar en Stripe' : 'Cancelar prueba';
    html += `<div class="plan-card trial"><div class="eyebrow">Prueba gratis · ${esc(plan.label)}</div><h3>Quedan ${trial.daysLeft} día${trial.daysLeft === 1 ? '' : 's'}</h3>
      <p>El ${esc(fmtDate(trial.endsAt))} Stripe cobrará ${esc(plan.price.replace('desde ', ''))} a tu tarjeta terminada en ${esc(last4)}, a menos que canceles antes.</p>
      <div style="display:flex;gap:10px;"><button class="btn" data-action="open-plans">Ver planes</button><button class="btn btn-ghost" data-action="cancel-trial">${esc(cancelLabel)}</button></div></div>`;
  } else if (plan.id === 'premium_plus') {
    html += `<div class="plan-card"><div class="eyebrow">${esc(plan.label)}${expiresLine}</div><h3>Ya tienes todo desbloqueado</h3>
      <p>Elementos ilimitados, Recetas médicas, Pruebas de laboratorio con próxima cita médica, y color de la app personalizado.</p>
      <button class="btn" data-action="open-plans">Ver planes</button></div>`;
  } else if (plan.id === 'premium') {
    html += `<div class="plan-card"><div class="eyebrow">${esc(plan.label)}${expiresLine}</div><h3>Desbloquea ${esc(PLANS_ORDER_LABEL.premium_plus)}</h3>
      <p>Elementos ilimitados, Recetas médicas, próxima cita médica en Pruebas de laboratorio y color de la app personalizado.</p>
      <button class="btn" data-action="open-plans">Ver planes</button></div>`;
  } else {
    html += `<div class="plan-card"><div class="eyebrow">${esc(plan.label)}</div><h3>Desbloquea ${esc(PLANS_ORDER_LABEL.premium)}</h3>
      <p>Más elementos guardados y el módulo de salud un poco más completo (agrega Medicamentos y Pruebas de laboratorio).</p>
      <button class="btn" data-action="open-plans">Ver planes</button></div>`;
  }

  const colorAllowed = colorPersonalizationAllowed(account && account.plan);
  const themeLabel = THEME_LABELS[themePref || 'sistema'];
  html += `<div class="settings-list">
    <button class="settings-row" data-action="appearance-settings">${icon('moon')}<span>Apariencia</span><span class="chev" style="color:var(--ink-soft);font-weight:600;">${esc(themeLabel)}</span></button>
    ${colorAllowed
      ? `<button class="settings-row" data-action="color-settings">${icon('palette')}<span>Color de la app</span><span class="chev" style="display:inline-flex;align-items:center;gap:6px;"><span class="swatch-dot" style="background:${accent.swatch}"></span>${esc(accent.label)}</span></button>`
      : `<button class="settings-row" data-action="color-locked">${icon('palette')}<span>Color de la app</span><span class="chev" style="display:inline-flex;align-items:center;gap:6px;color:var(--ink-faint);font-weight:600;">${icon('lock')} Premium Plus</span></button>`}
    <button class="settings-row" data-action="open-plans">${icon('cash')}<span>Mi plan</span><span class="chev" style="color:var(--ink-soft);font-weight:600;">${esc(plan.label)}${trial.active ? ' · prueba' : ''}</span></button>
    <button class="settings-row" data-action="open-subscription">${icon('receipt')}<span>Mi suscripción</span><span class="chev">${icon('chev')}</span></button>
    <button class="settings-row" data-action="open-security">${icon('lock')}<span>Seguridad y privacidad</span><span class="chev">${icon('chev')}</span></button>
    <button class="settings-row" data-action="logout">${icon('user')}<span>Cerrar sesión</span><span class="chev">${icon('chev')}</span></button>
  </div>`;
  return html;
}

// Mi suscripción (antes "Facturación" — ya no manda a ningún portal de
// Stripe, ni aunque la cuenta traiga un stripeCustomerId viejo: ver
// openSubscription() en app.js, que siempre abre esta hoja). Muestra el
// plan activo y, lo más importante ahora que el pago es manual
// (transferencia/PayPal, activado a mano por el administrador), hasta
// cuándo queda vigente — account.planExpiresAt, que le pone el
// administrador al activar una solicitud (ver
// netlify/functions/admin-payment-requests.mjs).
export function subscriptionSheet(account) {
  const plan = planInfo(account && account.plan);
  const expiresAt = account && account.planExpiresAt ? new Date(account.planExpiresAt) : null;

  const rows = [];
  if (plan.id !== 'gratis' && expiresAt) {
    rows.push({
      icon: 'cash',
      title: `${plan.label} activo`,
      when: `Vence el ${fmtDate(expiresAt)}`,
      amount: plan.price
    });
  } else if (plan.id !== 'gratis') {
    // Plan de paga sin fecha de vencimiento guardada (cuenta activada antes
    // de este sistema, o de forma manual desde la base de datos) — se
    // muestra igual, nomás sin la fecha.
    rows.push({ icon: 'cash', title: `${plan.label} activo`, when: 'Sin fecha de vencimiento registrada', amount: plan.price });
  }

  const list = rows.length
    ? `<div class="info-card">${rows.map((r) => `<div class="info-row"><span class="k" style="display:flex;align-items:center;gap:8px;">${icon(r.icon)} <span>${esc(r.title)}<br><span style="font-weight:400;color:var(--ink-faint);">${esc(r.when)}</span></span></span><span class="v wrap">${esc(r.amount)}</span></div>`).join('')}</div>`
    : '';

  const intro = rows.length
    ? `<p>Los planes de paga se activan por transferencia bancaria o PayPal, a mano — aquí ves hasta cuándo vale el tuyo. Para renovar o pagar más meses, solicita tu plan de nuevo desde "Ver planes".</p>`
    : `<p>Estás en el Plan Gratis. Los planes de paga (Premium y Premium Plus) se activan por transferencia bancaria (México) o PayPal: eliges cuántos meses, dejas un celular, te contactamos para el pago y en cuanto se confirma, activamos tu plan.</p>`;

  return `<div class="sheet-handle"></div><h3>${icon('receipt')} Mi suscripción</h3>
    ${intro}
    ${list}
    <button class="btn btn-primary" data-action="open-plans">Ver planes</button>`;
}

export function securitySheet() {
  return `<div class="sheet-handle"></div><h3>Seguridad y privacidad</h3>
    <p>Cambia tu contraseña o elimina tu cuenta. Como Memoreo guarda todo en este navegador (ver "Cómo funcionan las cuentas" en el README), estos cambios son reales y afectan solo a este dispositivo.</p>
    <div class="field"><label for="curPass">Contraseña actual</label><input type="password" id="curPass" autocomplete="current-password" /></div>
    <div class="field"><label for="newPass">Nueva contraseña</label><input type="password" id="newPass" autocomplete="new-password" placeholder="Mínimo 4 caracteres" /></div>
    <div class="field"><label for="newPass2">Confirmar nueva contraseña</label><input type="password" id="newPass2" autocomplete="new-password" /></div>
    <p class="auth-error" id="passError" style="display:none;"></p>
    <button class="btn btn-primary" id="changePassBtn" style="margin-bottom:22px;">Cambiar contraseña</button>
    <div style="border-top:1px solid var(--border);padding-top:18px;">
      <p style="color:var(--critical);"><b>Eliminación de cuenta</b><br />Se eliminará <b>permanentemente</b> tu cuenta y toda tu información guardada en este navegador — documentos, recordatorios, fechas de vencimiento, fotos y preferencias. Una vez eliminada, no hay forma de recuperarla.</p>
      <button class="btn btn-danger" id="deleteAccountBtn">Eliminar mi cuenta</button>
    </div>`;
}

export function plansSheet(account) {
  const currentPlanId = (account && account.plan) || 'gratis';
  const order = ['gratis', 'premium', 'premium_plus'];
  let html = `<div class="sheet-handle"></div><h3>Elige tu plan</h3>
    <p>Los planes de paga se activan por transferencia bancaria (México) o PayPal: eliges cuántos meses quieres pagar y dejas un celular — te contactamos con los datos para pagar, y en cuanto se confirme, activamos tu plan por ese tiempo.</p>
    <div class="plan-options">`;
  order.forEach((id) => {
    const p = planInfo(id);
    const isCurrent = currentPlanId === id;
    const saludLabel = joinEs(p.salud.map((s) => healthTypeInfo(s).label.toLowerCase()));
    const saludCopy = `Salud incluye ${saludLabel}, sin límite.`;
    const limitCopy = p.limit === Infinity ? 'Elementos guardados ilimitados.' : `Hasta ${p.limit} elementos guardados.`;
    const extraCopy = p.id === 'premium_plus' ? ' Además: próxima cita médica en Pruebas de laboratorio y color de la app personalizado.' : '';
    const btnLabel = id === 'gratis' ? 'Elegir Gratis' : `Solicitar ${p.label.replace('Plan ', '')}`;
    html += `<div class="plan-option ${isCurrent ? 'current' : ''}">
      <div class="plan-option-head"><b>${esc(p.label)}</b><span>${esc(p.price)}</span></div>
      <p>${limitCopy} ${saludCopy}${extraCopy}</p>
      ${isCurrent
        ? `<button class="btn btn-outline" disabled>Tu plan actual</button>`
        : `<button class="btn ${id === 'gratis' ? 'btn-outline' : 'btn-primary'}" data-choose-plan="${id}">${esc(btnLabel)}</button>`}
    </div>`;
  });
  html += `</div>`;
  return html;
}

// Hoja de "solicitar pago" — se abre al elegir Premium o Premium Plus en
// plansSheet (ver openPaymentRequest en app.js). Los chips de duración y
// método se activan/desactivan con JS (data-duration / data-method); el
// total (#prTotalAmount) y el botón de enviar se recalculan ahí mismo cada
// vez que cambia algo, así que aquí solo se dibuja el estado inicial (nada
// elegido todavía, botón deshabilitado).
export function paymentRequestSheet(planId, account) {
  const p = planInfo(planId);
  const durationChips = PAYMENT_DURATIONS.map((d) =>
    `<button type="button" class="chip" data-duration="${d.months}">${esc(d.label)}</button>`).join('');
  const methodChips = PAYMENT_METHODS.map((m) =>
    `<button type="button" class="chip chip-wide" data-method="${esc(m.id)}"><b>${esc(m.label)}</b><span>${esc(m.hint)}</span></button>`).join('');
  return `<div class="sheet-handle"></div><h3>${icon('cash')} Solicitar ${esc(p.label.replace('Plan ', ''))}</h3>
    <p>Elige cuántos meses quieres pagar y cómo — te vamos a contactar al celular que dejes con los datos bancarios o la liga de PayPal para pagar. En cuanto confirmemos el pago, activamos tu plan por ese tiempo.</p>
    <div class="field"><label>¿Cuántos meses?</label><div class="chip-row" id="prDurations">${durationChips}</div></div>
    <div class="field"><label>¿Cómo vas a pagar?</label><div class="chip-row chip-col" id="prMethods">${methodChips}</div></div>
    <div class="field"><label for="prPhone">Tu celular (para contactarte)</label><input type="tel" id="prPhone" inputmode="tel" autocomplete="tel" placeholder="10 dígitos" value="${esc((account && account.phone) || '')}" /></div>
    <div class="pr-total"><span>Total a pagar</span><b id="prTotalAmount">—</b></div>
    <p class="auth-error" id="prError" style="display:none;"></p>
    <button class="btn btn-primary" id="prSubmitBtn" data-plan="${esc(planId)}" data-monthly="${p.monthlyPrice}" disabled>Enviar solicitud</button>`;
}


// Apariencia: claro/oscuro/automático. "Automático" no guarda ningún color
// fijo — deja que el celular decida según su propio ajuste de sistema (ver
// applyTheme en app.js, que solo pone o quita el atributo data-theme; los
// colores de cada tema ya están definidos en style.css con prefers-color-scheme).
const THEME_OPTIONS = [
  { id: 'sistema', label: 'Automático', hint: 'Sigue el ajuste de tu celular' },
  { id: 'claro', label: 'Claro', hint: 'Fondo claro siempre' },
  { id: 'oscuro', label: 'Oscuro', hint: 'Fondo oscuro siempre' }
];

export function themeSheet(current) {
  let html = `<div class="sheet-handle"></div><h3>${icon('moon')} Apariencia</h3>
    <p>Elige cómo se ve Memoreo, o deja que siga el ajuste de tu celular.</p>
    <div class="theme-options">`;
  THEME_OPTIONS.forEach((t) => {
    const sel = (current || 'sistema') === t.id;
    html += `<button type="button" class="theme-option ${sel ? 'selected' : ''}" data-choose-theme="${t.id}">
      <span class="theme-option-txt"><b>${esc(t.label)}</b><span>${esc(t.hint)}</span></span>
      ${sel ? icon('check') : ''}
    </button>`;
  });
  html += `</div><button class="btn btn-ghost" data-action="close-sheet">Listo</button>`;
  return html;
}

export function colorSheet(currentAccent) {
  let html = `<div class="sheet-handle"></div><h3>Color de la app</h3>
    <p>Elige el acento que más te guste — se aplica al instante en toda la app.</p>
    <div class="swatch-grid">`;
  ACCENT_PALETTE.forEach((a) => {
    const sel = (currentAccent || 'turquesa') === a.id;
    html += `<button type="button" class="swatch-btn ${sel ? 'selected' : ''}" data-choose-accent="${a.id}" aria-label="${esc(a.label)}">
      <span class="swatch-circle" style="background:${a.swatch}">${sel ? icon('check') : ''}</span>
      <span class="swatch-label">${esc(a.label)}</span>
    </button>`;
  });
  html += `</div><button class="btn btn-ghost" data-action="close-sheet">Listo</button>`;
  return html;
}

function reminderDayOptions(mode) {
  if (mode === 'pago') return [1, 3, 7];
  if (mode === 'activity') return [3, 7, 15];
  return [3, 7, 15, 30];
}

function reminderLabel(mode, healthType) {
  if (mode === 'pago') return 'Recordarme antes de pagar';
  if (mode === 'activity') return 'Recordarme la próxima vez';
  if (mode === 'prestamo') return 'Recordarme de este préstamo';
  if (mode === 'salud' && healthType === 'medicamento') return 'Recordarme antes de que se agote';
  if (mode === 'salud' && healthType === 'laboratorio') return 'Recordarme antes de la cita';
  if (mode === 'salud' && healthType === 'receta') return 'Recordarme antes de que venza la receta';
  return 'Recordarme antes de que venza';
}

function reminderBlock(draft, mode) {
  const days = reminderDayOptions(mode);
  return `<div class="field" style="margin-top:18px;"><div class="toggle-row"><span class="t">${reminderLabel(mode, draft.healthType)}</span><div class="switch ${draft.reminderOn ? 'on' : ''}" id="reminderSwitch"></div></div></div>
    <div id="reminderDaysWrap" class="field" style="display:${draft.reminderOn ? 'block' : 'none'};margin-top:10px;"><label>Avisarme</label><div class="chip-row" id="reminderChips">${days
      .map((n) => `<button type="button" class="chip ${draft.reminderDays === n ? 'selected' : ''}" data-reminder-days="${n}">${n} día${n === 1 ? '' : 's'} antes</button>`)
      .join('')}</div></div>`;
}

const HEALTH_NAME_PLACEHOLDERS = {
  vacuna: 'Ej. Refuerzo COVID-19, Influenza',
  medicamento: 'Ej. Losartán, Metformina',
  laboratorio: 'Ej. Control anual, Chequeo de rutina',
  receta: 'Ej. Receta de amoxicilina, receta oftalmológica'
};

export function addView({ draft, editing, plan }) {
  const ci = draft.category ? catInfo(draft.category) : null;
  const mode = formMode(draft.category, draft.kind);
  const noun = mode === 'pago' ? 'servicio' : mode === 'prestamo' ? 'préstamo' : mode === 'activity' ? 'registro'
    : mode === 'salud' ? healthTypeInfo(draft.healthType).singular.toLowerCase() : 'documento';
  const title = editing ? `Editar ${noun}` : `Agregar ${noun}`;

  let html = `<div class="screen-sticky-head">
    <div class="topbar"><button class="icon-btn" data-nav="${editing ? 'detail' : 'home'}" data-open="${editing ? editing.id : ''}">${icon('close')}</button><h1>${title}</h1></div>
    ${navTabsHtml()}
  </div>`;

  html += `<div id="uploadZone"></div>`;

  const namePlaceholders = {
    activity: 'Ej. Servicio mayor, cambio de aceite, revisión eléctrica',
    pago: 'Ej. Luz, Agua, Celular',
    prestamo: 'Ej. Préstamo para el auto (opcional)'
  };
  const namePlaceholder = mode === 'salud' ? (HEALTH_NAME_PLACEHOLDERS[draft.healthType] || HEALTH_NAME_PLACEHOLDERS.vacuna) : (namePlaceholders[mode] || 'Ej. INE, Pasaporte, Garantía de lavadora');
  html += `<div class="field"><label for="fName">Nombre</label><input type="text" id="fName" placeholder="${namePlaceholder}" value="${esc(draft.name)}" /></div>`;

  html += `<div class="field"><label>Categoría</label><div class="chip-row" id="catChips">${CATS
    .map((c) => `<button type="button" class="chip ${draft.category === c.id ? 'selected' : ''}" data-set-cat="${c.id}">${icon(c.icon)} ${esc(c.label)}</button>`)
    .join('')}</div></div>`;

  if (ci && ci.activityCapable) {
    html += `<div class="field"><label>Tipo de registro</label><div class="chip-row" id="kindChips">
      <button type="button" class="chip ${mode !== 'activity' ? 'selected' : ''}" data-set-kind="doc">${icon('doc')} ${docKindLabelSingular(ci.id)}</button>
      <button type="button" class="chip ${mode === 'activity' ? 'selected' : ''}" data-set-kind="activity">${icon('wrench')} Mantenimiento</button>
    </div></div>`;
  }

  if (mode === 'salud') {
    html += `<div class="field"><label>Tipo</label><div class="chip-row" id="healthTypeChips">${HEALTH_TYPES.map((h) => {
      const allowed = healthTypeAllowed(plan, h.id);
      const sel = draft.healthType === h.id;
      return allowed
        ? `<button type="button" class="chip ${sel ? 'selected' : ''}" data-set-health-type="${h.id}">${icon(h.icon)} ${esc(h.singular)}</button>`
        : `<button type="button" class="chip chip-locked" data-health-locked="${h.id}">${icon('lock')} ${esc(h.singular)}</button>`;
    }).join('')}</div></div>`;

    if (draft.healthType === 'medicamento') {
      html += `<div class="field"><label for="fDose">Dosis</label><input type="text" id="fDose" placeholder="Ej. 500mg" value="${esc(draft.dose)}" /></div>`;
      html += `<div class="field"><label for="fFrequency">Frecuencia</label><input type="text" id="fFrequency" placeholder="Ej. Cada 8 horas" value="${esc(draft.frequency)}" /></div>`;
      html += `<div class="field"><label for="fDate">¿Cuándo se te acaba? (opcional)</label><input type="date" id="fDate" value="${draft.expiresAt ? toInputDate(draft.expiresAt) : ''}" /></div>
        <p class="preset-hint">Memoreo avisa antes de esa fecha, para que sepas cuándo comprar más.</p>`;
      html += reminderBlock(draft, mode);
    } else if (draft.healthType === 'laboratorio') {
      html += `<div class="field"><label for="fPerformed">Fecha de la prueba (opcional)</label><input type="date" id="fPerformed" value="${draft.performedAt ? toInputDate(draft.performedAt) : ''}" /></div>
        <p class="preset-hint">Adjunta el PDF o foto de tus resultados arriba — no hace falta escribir nada más.</p>`;
      if (advancedHealthAllowed(plan)) {
        html += `<div class="field"><label for="fDate">Próxima cita médica (opcional)</label><input type="date" id="fDate" value="${draft.expiresAt ? toInputDate(draft.expiresAt) : ''}" /></div>`;
        html += reminderBlock(draft, mode);
      } else {
        html += `<div class="plan-nudge"><span>${icon('lock')}</span><div><b>Premium Plus agrega más aquí.</b> Agrega tu próxima cita médica y recibe un recordatorio antes de que llegue.</div>
          <button class="link" data-action="open-plans">Ver planes</button></div>`;
      }
    } else if (draft.healthType === 'receta') {
      html += `<div class="field"><label for="fPerformed">¿Cuándo se expidió? (opcional)</label><input type="date" id="fPerformed" value="${draft.performedAt ? toInputDate(draft.performedAt) : ''}" /></div>`;
      html += `<div class="field"><label for="fDate">Vence o se debe renovar (opcional)</label><input type="date" id="fDate" value="${draft.expiresAt ? toInputDate(draft.expiresAt) : ''}" /></div>
        <p class="preset-hint">Adjunta la foto o el PDF de la receta médica arriba — con fecha o sin ella, Memoreo la guarda igual.</p>`;
      html += reminderBlock(draft, mode);
    } else {
      html += `<div class="field"><label for="fPerformed">¿Cuándo te la aplicaste? (opcional)</label><input type="date" id="fPerformed" value="${draft.performedAt ? toInputDate(draft.performedAt) : ''}" /></div>`;
      html += `<div class="field"><label for="fDate">Próxima dosis (opcional)</label><input type="date" id="fDate" value="${draft.expiresAt ? toInputDate(draft.expiresAt) : ''}" /></div>`;
      html += reminderBlock(draft, mode);
    }
  } else if (mode === 'pago') {
    html += `<div class="field"><label>¿Cada cuánto se paga?</label><div class="chip-row" id="recurrenceChips">${Object.keys(RECURRENCE_LABELS)
      .map((r) => `<button type="button" class="chip ${draft.recurrence === r ? 'selected' : ''}" data-set-recurrence="${r}">${RECURRENCE_LABELS[r]}</button>`)
      .join('')}</div></div>`;
    html += `<div class="field"><label for="fDate">Próxima fecha de pago</label><input type="date" id="fDate" value="${draft.expiresAt ? toInputDate(draft.expiresAt) : ''}" /></div>
      <p class="preset-hint">Con cualquier fecha de pago que conozcas, Memoreo calcula sola la siguiente cada vez que pase — un solo registro de "Luz" o "Internet" es suficiente, nunca hay que volver a registrarlo cada bimestre o cada mes.</p>`;
    html += `<div class="field"><label for="fAmount">Monto (opcional)</label><input type="number" inputmode="decimal" min="0" step="0.01" id="fAmount" placeholder="0.00" value="${esc(draft.amount)}" /></div>`;
    html += reminderBlock(draft, mode);
  } else if (mode === 'prestamo') {
    html += `<div class="field"><label>Tipo</label><div class="chip-row" id="directionChips">
      <button type="button" class="chip ${draft.direction === 'me_deben' ? 'selected' : ''}" data-set-direction="me_deben">Me deben</button>
      <button type="button" class="chip ${draft.direction === 'debo' ? 'selected' : ''}" data-set-direction="debo">Yo debo</button>
    </div></div>`;
    html += `<div class="field"><label for="fPerson">Persona</label><input type="text" id="fPerson" placeholder="Nombre de la persona" value="${esc(draft.person)}" /></div>`;
    html += `<div class="field"><label for="fAmount">Monto</label><input type="number" inputmode="decimal" min="0" step="0.01" id="fAmount" placeholder="0.00" value="${esc(draft.amount)}" /></div>`;
    html += `<div class="field"><label for="fDate">Fecha de pago (opcional)</label><input type="date" id="fDate" value="${draft.expiresAt ? toInputDate(draft.expiresAt) : ''}" /></div>`;
    const presets = [{ l: '1 mes', v: 30 }, { l: '3 meses', v: 91 }, { l: '6 meses', v: 182 }];
    html += `<div class="chip-row" id="presetChips" style="margin:-10px 0 6px;">${presets
      .map((p) => `<button type="button" class="chip" data-preset="${p.v}">${p.l}</button>`)
      .join('')}<button type="button" class="chip" data-preset="none">Sin fecha</button></div>`;
    html += reminderBlock(draft, mode);
  } else if (mode === 'activity') {
    html += `<div class="field"><label for="fPerformed">¿Cuándo lo hiciste?</label><input type="date" id="fPerformed" value="${draft.performedAt ? toInputDate(draft.performedAt) : toInputDate(new Date())}" /></div>`;
    html += `<div class="field"><label for="fAmount">Monto (opcional)</label><input type="number" inputmode="decimal" min="0" step="0.01" id="fAmount" placeholder="0.00" value="${esc(draft.amount)}" /></div>`;
    const nextPresets = [{ l: '3 meses', v: 91 }, { l: '6 meses', v: 182 }, { l: '1 año', v: 365 }];
    html += `<div class="field" style="margin-top:18px;"><div class="toggle-row"><span class="t">${reminderLabel(mode)}</span><div class="switch ${draft.reminderOn ? 'on' : ''}" id="reminderSwitch"></div></div></div>`;
    html += `<div id="reminderDaysWrap" style="display:${draft.reminderOn ? 'block' : 'none'};margin-top:10px;">
      <div class="field"><label>Próxima vez en</label><div class="chip-row" id="presetChips">${nextPresets
        .map((p) => `<button type="button" class="chip" data-preset="${p.v}">${p.l}</button>`)
        .join('')}</div></div>
      <div class="field"><label>Avisarme</label><div class="chip-row" id="reminderChips">${reminderDayOptions(mode)
        .map((n) => `<button type="button" class="chip ${draft.reminderDays === n ? 'selected' : ''}" data-reminder-days="${n}">${n} días antes</button>`)
        .join('')}</div></div>
    </div>`;
  } else {
    html += `<div class="field"><label for="fDate">Fecha de vencimiento</label><input type="date" id="fDate" value="${draft.expiresAt ? toInputDate(draft.expiresAt) : ''}" /></div>`;
    const presets = [{ l: '1 mes', v: 30 }, { l: '6 meses', v: 182 }, { l: '1 año', v: 365 }];
    html += `<div class="chip-row" id="presetChips" style="margin:-10px 0 6px;">${presets
      .map((p) => `<button type="button" class="chip" data-preset="${p.v}">${p.l}</button>`)
      .join('')}<button type="button" class="chip" data-preset="none">No vence</button></div>`;
    html += reminderBlock(draft, mode);
  }

  html += `<div class="field"><label for="fNotes">Notas (opcional)</label><textarea id="fNotes" placeholder="Ej. número de póliza, teléfono de servicio&hellip;">${esc(draft.notes)}</textarea></div>`;

  html += `<button class="btn btn-primary" id="saveDocBtn" style="margin-top:8px;" disabled>${editing ? 'Guardar cambios' : `Guardar ${noun}`}</button>`;
  return html;
}

export function detailView(doc, { plan } = {}) {
  const info = docInfo(doc);
  const ci = catInfo(doc.category);
  const activity = isActivity(doc);
  // "Servicios" dentro de Hogar usa exactamente el mismo detalle que Pagos
  // (frecuencia, próximo pago, monto) — ver formMode()/docInfo() en store.js.
  const isPago = doc.category === 'pagos' || (doc.category === 'hogar' && !activity);
  const isPrestamo = doc.category === 'prestamos';
  const isSalud = doc.category === 'salud';
  let html = `<div class="screen-sticky-head">
    <div class="topbar"><button class="icon-btn" data-nav="home">${icon('back')}</button>
    <div style="margin-left:auto;display:flex;gap:8px;">
      <button class="icon-btn" data-action="share">${icon('share')}</button>
      <button class="icon-btn" data-edit="${doc.id}">${icon('edit')}</button>
    </div></div>
    ${navTabsHtml()}
  </div>`;

  // La foto/PDF adjunto vive en el bucket privado de Supabase Storage (ver
  // src/store.js) — doc.image trae la URL firmada solo cuando el adjunto es
  // una foto (para mostrarla de una vez en la portada); doc.attachmentUrl
  // trae la URL firmada para CUALQUIER tipo de adjunto (foto o PDF), y es lo
  // que abre el botón de abajo — así un PDF adjunto sí se puede ver, que
  // antes no había forma de hacerlo.
  const heroImg = doc.image ? `<a href="${doc.image}" target="_blank" rel="noopener"><img src="${doc.image}" alt="" /></a>` : icon(ci.icon);
  html += `<div class="detail-hero c-${doc.category}"><div class="icon-lg">${heroImg}</div>
    <h1>${esc(doc.name)}</h1>${badge(info)}</div>`;
  if (doc.attachmentUrl && doc.attachmentType === 'pdf') {
    html += `<a class="btn btn-outline" style="display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:12px;" href="${doc.attachmentUrl}" target="_blank" rel="noopener">${icon('doc')} Ver ${esc(doc.attachmentName || 'PDF adjunto')}</a>`;
  }

  html += `<div class="info-card">
    <div class="info-row"><span class="k">Categoría</span><span class="v wrap">${esc(ci.label)}</span></div>`;
  if (ci.activityCapable) {
    html += `<div class="info-row"><span class="k">Tipo</span><span class="v wrap">${activity ? 'Mantenimiento' : docKindLabelSingular(doc.category)}</span></div>`;
  }
  if (isPago) {
    html += `<div class="info-row"><span class="k">Frecuencia</span><span class="v wrap">${esc(RECURRENCE_LABELS[doc.recurrence] || '—')}</span></div>
    <div class="info-row"><span class="k">Próximo pago</span><span class="v">${info.nextDate ? fmtDate(info.nextDate) : 'Sin fecha'}</span></div>
    ${doc.amount ? `<div class="info-row"><span class="k">Monto</span><span class="v">${formatMoney(doc.amount)}</span></div>` : ''}
    <div class="info-row"><span class="k">Recordatorio</span><span class="v wrap">${doc.reminderDays ? `${doc.reminderDays} día${doc.reminderDays === 1 ? '' : 's'} antes` : 'Desactivado'}</span></div>`;
  } else if (isPrestamo) {
    html += `<div class="info-row"><span class="k">Persona</span><span class="v wrap">${esc(doc.person || '—')}</span></div>
    <div class="info-row"><span class="k">Monto</span><span class="v">${formatMoney(doc.amount)}</span></div>
    <div class="info-row"><span class="k">Tipo</span><span class="v wrap">${doc.direction === 'me_deben' ? 'Me deben' : 'Yo debo'}</span></div>
    <div class="info-row"><span class="k">Fecha de pago</span><span class="v">${doc.expiresAt ? fmtDate(doc.expiresAt) : 'Sin fecha'}</span></div>
    <div class="info-row"><span class="k">Recordatorio</span><span class="v wrap">${doc.reminderDays ? `${doc.reminderDays} días antes` : 'Desactivado'}</span></div>`;
  } else if (isSalud) {
    html += `<div class="info-row"><span class="k">Tipo</span><span class="v wrap">${esc(healthTypeInfo(doc.healthType).singular)}</span></div>`;
    if (doc.healthType === 'medicamento') {
      html += `<div class="info-row"><span class="k">Dosis</span><span class="v wrap">${esc(doc.dose || '—')}</span></div>
      <div class="info-row"><span class="k">Frecuencia</span><span class="v wrap">${esc(doc.frequency || '—')}</span></div>
      <div class="info-row"><span class="k">Se agota</span><span class="v">${doc.expiresAt ? fmtDate(doc.expiresAt) : 'Sin fecha'}</span></div>`;
    } else if (doc.healthType === 'laboratorio') {
      html += `<div class="info-row"><span class="k">Fecha de la prueba</span><span class="v">${doc.performedAt ? fmtDate(doc.performedAt) : 'Sin registrar'}</span></div>
      <div class="info-row"><span class="k">Próxima cita médica</span><span class="v">${doc.expiresAt ? fmtDate(doc.expiresAt) : 'Sin fecha'}</span></div>`;
    } else if (doc.healthType === 'receta') {
      html += `<div class="info-row"><span class="k">Expedida</span><span class="v">${doc.performedAt ? fmtDate(doc.performedAt) : 'Sin registrar'}</span></div>
      <div class="info-row"><span class="k">Vence</span><span class="v">${doc.expiresAt ? fmtDate(doc.expiresAt) : 'No vence'}</span></div>
      <div class="info-row"><span class="k">Recordatorio</span><span class="v wrap">${doc.reminderDays ? `${doc.reminderDays} días antes` : 'Desactivado'}</span></div>`;
    } else {
      html += `<div class="info-row"><span class="k">Aplicada</span><span class="v">${doc.performedAt ? fmtDate(doc.performedAt) : 'Sin registrar'}</span></div>
      <div class="info-row"><span class="k">Próxima dosis</span><span class="v">${doc.expiresAt ? fmtDate(doc.expiresAt) : 'Sin fecha'}</span></div>`;
    }
  } else if (activity) {
    html += `<div class="info-row"><span class="k">Realizado</span><span class="v">${doc.performedAt ? fmtDate(doc.performedAt) : 'Sin registrar'}</span></div>
    <div class="info-row"><span class="k">Próxima vez</span><span class="v">${doc.expiresAt ? fmtDate(doc.expiresAt) : 'No programada'}</span></div>
    ${doc.amount ? `<div class="info-row"><span class="k">Monto</span><span class="v">${formatMoney(doc.amount)}</span></div>` : ''}`;
    if (doc.expiresAt) {
      html += `<div class="info-row"><span class="k">Recordatorio</span><span class="v wrap">${doc.reminderDays ? `${doc.reminderDays} días antes` : 'Desactivado'}</span></div>`;
    }
  } else {
    html += `<div class="info-row"><span class="k">Vencimiento</span><span class="v">${doc.expiresAt ? fmtDate(doc.expiresAt) : 'No vence'}</span></div>
    <div class="info-row"><span class="k">Recordatorio</span><span class="v wrap">${doc.reminderDays ? `${doc.reminderDays} días antes` : 'Desactivado'}</span></div>`;
  }
  html += `${doc.notes ? `<div class="info-row"><span class="k">Notas</span><span class="v wrap">${esc(doc.notes)}</span></div>` : ''}
  </div>`;

  if (isSalud && doc.healthType === 'laboratorio' && !advancedHealthAllowed(plan)) {
    html += `<div class="plan-nudge" style="margin-top:0;margin-bottom:16px;"><span>${icon('lock')}</span><div><b>Premium Plus agrega próxima cita médica.</b> Recibe un recordatorio antes de tu siguiente cita.</div>
      <button class="link" data-action="open-plans">Ver planes</button></div>`;
  }

  html += `<div class="action-row"><button class="btn btn-outline" data-edit="${doc.id}">Editar</button>
    <button class="btn btn-danger" data-delete="${doc.id}">Eliminar</button></div>`;
  return html;
}

/* =========================================================
   Panel de administrador — vive dentro de #adminShell (ver
   app.js), no en una página aparte: se entra escribiendo el
   usuario y la contraseña de administrador en el mismo
   formulario de "Iniciar sesión" que usa cualquier cuenta (ver
   postRenderAuth() en app.js). Esta vista solo tiene que dibujar
   la carga inicial (mientras se confirma una sesión guardada) y
   el tablero ya autenticado — nunca dibuja su propio formulario
   de acceso, porque ese formulario es el de authView().
   ========================================================= */
const ADMIN_PLAN_LABEL = { gratis: 'Plan Gratis', premium: 'Premium', premium_plus: 'Premium Plus' };
const ADMIN_PLAN_FILTERS = [
  { id: 'todos', label: 'Todos' },
  { id: 'gratis', label: 'Gratis' },
  { id: 'premium', label: 'Premium' },
  { id: 'premium_plus', label: 'Premium Plus' }
];

function adminFmtDateTime(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }); }
  catch (e) { return iso; }
}
function adminFmtClock(date) {
  try { return date.toLocaleTimeString('es-MX', { timeStyle: 'short' }); }
  catch (e) { return ''; }
}
function adminInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}
function adminStatCards(data) {
  const byPlan = data.byPlan || {};
  const total = data.total || 0;
  const pct = (n) => (total > 0 ? Math.round((n / total) * 100) : 0);
  const planCard = (id) => `
    <div class="stat-card c-${id}">
      <div class="l">${ADMIN_PLAN_LABEL[id]}</div>
      <div class="n">${byPlan[id] || 0}</div>
      <div class="bar"><i style="width:${pct(byPlan[id] || 0)}%"></i></div>
    </div>`;
  return `
    <div class="stat-grid">
      <div class="stat-card total"><div class="l">Usuarios totales</div><div class="n">${total}</div></div>
      ${planCard('gratis')}${planCard('premium')}${planCard('premium_plus')}
    </div>`;
}
function adminFilteredUsers(data, search, planFilter) {
  const users = (data && data.users) || [];
  const q = (search || '').trim().toLowerCase();
  return users.filter((u) => {
    if (planFilter !== 'todos' && (u.plan || 'gratis') !== planFilter) return false;
    if (!q) return true;
    return String(u.name || '').toLowerCase().includes(q) || String(u.email || '').toLowerCase().includes(q);
  });
}
function adminUsersTable(users, totalCount) {
  if (!totalCount) {
    return `<div class="admin-empty">${icon('user')}<p>Todavía no hay usuarios registrados.<br/>En cuanto alguien cree una cuenta real (no la demo), va a aparecer aquí.</p></div>`;
  }
  if (!users.length) {
    return `<div class="admin-empty">${icon('search')}<p>Nada coincide con ese filtro.</p></div>`;
  }
  const rows = users.map((u) => `
    <tr>
      <td class="name"><div class="name-cell"><div class="avatar">${esc(adminInitials(u.name))}</div>${esc(u.name || '—')}</div></td>
      <td class="email">${esc(u.email || '—')}</td>
      <td><span class="plan-badge ${u.plan || 'gratis'}">${ADMIN_PLAN_LABEL[u.plan] || u.plan || 'Plan Gratis'}</span></td>
      <td class="mono">${adminFmtDateTime(u.createdAt)}</td>
      <td class="mono">${adminFmtDateTime(u.updatedAt)}</td>
    </tr>`).join('');
  const cards = users.map((u) => `
    <div class="admin-user-card">
      <div class="top">
        <div class="who">
          <div class="avatar" style="width:32px;height:32px;border-radius:9px;background:var(--brand-soft);color:var(--brand-ink);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.8rem;flex-shrink:0;">${esc(adminInitials(u.name))}</div>
          <div style="min-width:0;">
            <div class="name">${esc(u.name || '—')}</div>
            <div class="email">${esc(u.email || '—')}</div>
          </div>
        </div>
        <span class="plan-badge ${u.plan || 'gratis'}">${ADMIN_PLAN_LABEL[u.plan] || u.plan || 'Plan Gratis'}</span>
      </div>
      <div class="meta"><span>Registrado ${adminFmtDateTime(u.createdAt)}</span><span>Activo ${adminFmtDateTime(u.updatedAt)}</span></div>
    </div>`).join('');
  return `
    <div class="admin-table-card"><div class="admin-table-scroll"><table class="admin-table">
      <thead><tr><th>Nombre</th><th>Correo</th><th>Plan</th><th>Registrado</th><th>Última actividad</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div></div>
    <div class="admin-card-list">${cards}</div>`;
}

// "Solicitudes de pago": lo que llega cada vez que alguien pide un plan de
// paga por transferencia/PayPal (ver paymentRequestSheet en esta misma
// pantalla y requestManualPayment en auth.js) — el administrador ve el
// celular para contactar a la persona y, en cuanto confirma que ya pagó,
// activa la solicitud (o la cancela, si nunca se completó el pago). Ver
// netlify/functions/admin-payment-requests.mjs y activatePayment/
// cancelPayment en app.js.
const PAYMENT_DURATION_LABEL = Object.fromEntries(PAYMENT_DURATIONS.map((d) => [d.months, d.label]));
const PAYMENT_METHOD_LABEL = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.id, m.label]));
const PAYMENT_STATUS_LABEL = { pendiente: 'Pendiente', activado: 'Activado', cancelado: 'Cancelado' };

function adminPaymentRequestsSection(payments, loading, error) {
  const list = payments || [];
  const pendingCount = list.filter((r) => r.status === 'pendiente').length;
  let body;
  if (loading && !list.length) {
    body = `<div class="admin-empty">${icon('repeat', 'admin-spin')}<p>Cargando solicitudes…</p></div>`;
  } else if (error) {
    body = `<div class="admin-error-banner">${icon('lock')} ${esc(error)}</div>`;
  } else if (!list.length) {
    body = `<div class="admin-empty">${icon('cash')}<p>Todavía no hay ninguna solicitud de pago.</p></div>`;
  } else {
    const rows = list.map((r) => {
      const isPending = r.status === 'pendiente';
      const isActive = r.status === 'activado';
      let statusNote;
      if (isActive && r.activatedAt) {
        statusNote = `Activado ${adminFmtDateTime(r.activatedAt)}${r.activatedBy ? ` · ${esc(r.activatedBy)}` : ''}`;
      } else if (r.status === 'cancelado') {
        statusNote = 'Cancelado';
      } else if (isPending && r.revertedAt) {
        statusNote = `Revertida ${adminFmtDateTime(r.revertedAt)} — vuelve a decidir`;
      } else {
        statusNote = `Solicitado ${adminFmtDateTime(r.createdAt)}`;
      }
      const expiresLabel = isActive && r.expiresAt ? fmtDate(new Date(r.expiresAt)) : '—';
      const actions = isPending
        ? `<div style="display:flex;gap:6px;"><button class="btn btn-primary" style="padding:8px 12px;font-size:0.78rem;" data-activate-request="${esc(r.id)}">Activar</button><button class="btn btn-ghost" style="padding:8px 12px;font-size:0.78rem;" data-cancel-request="${esc(r.id)}">Cancelar</button></div>`
        : (isActive
          ? `<button class="btn btn-outline" style="padding:8px 12px;font-size:0.78rem;" data-revert-request="${esc(r.id)}">Revertir</button>`
          : '—');
      return `
      <tr>
        <td class="name"><div class="name-cell"><div class="avatar">${esc(adminInitials(r.name))}</div>${esc(r.name || '—')}</div></td>
        <td class="email">${esc(r.email || '—')}</td>
        <td class="mono">${esc(r.phone || '—')}</td>
        <td><span class="plan-badge ${r.plan || 'gratis'}">${ADMIN_PLAN_LABEL[r.plan] || r.plan}</span></td>
        <td>${esc(PAYMENT_DURATION_LABEL[r.months] || (r.months + ' mes(es)'))}</td>
        <td>${esc(PAYMENT_METHOD_LABEL[r.paymentMethod] || r.paymentMethod)}</td>
        <td><span class="payment-status-badge ${r.status}">${esc(PAYMENT_STATUS_LABEL[r.status] || r.status)}</span><br/><span style="font-size:0.72rem;color:var(--ink-faint);">${esc(statusNote)}</span></td>
        <td class="mono">${esc(expiresLabel)}</td>
        <td>${actions}</td>
      </tr>`;
    }).join('');
    const cards = list.map((r) => {
      const isPending = r.status === 'pendiente';
      const isActive = r.status === 'activado';
      const expiresLabel = isActive && r.expiresAt ? fmtDate(new Date(r.expiresAt)) : null;
      let actions = '';
      if (isPending) {
        actions = `<div style="display:flex;gap:8px;margin-top:10px;"><button class="btn btn-primary" style="flex:1;padding:9px;font-size:0.82rem;" data-activate-request="${esc(r.id)}">Activar</button><button class="btn btn-ghost" style="flex:1;padding:9px;font-size:0.82rem;" data-cancel-request="${esc(r.id)}">Cancelar</button></div>`;
      } else if (isActive) {
        actions = `<div style="margin-top:10px;"><button class="btn btn-outline" style="width:100%;padding:9px;font-size:0.82rem;" data-revert-request="${esc(r.id)}">Revertir activación</button></div>`;
      }
      return `
      <div class="admin-user-card">
        <div class="top">
          <div class="who">
            <div class="avatar" style="width:32px;height:32px;border-radius:9px;background:var(--brand-soft);color:var(--brand-ink);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.8rem;flex-shrink:0;">${esc(adminInitials(r.name))}</div>
            <div style="min-width:0;">
              <div class="name">${esc(r.name || '—')}</div>
              <div class="email">${esc(r.email || '—')} · ${esc(r.phone || '—')}</div>
            </div>
          </div>
          <span class="plan-badge ${r.plan || 'gratis'}">${ADMIN_PLAN_LABEL[r.plan] || r.plan}</span>
        </div>
        <div class="meta"><span>${esc(PAYMENT_DURATION_LABEL[r.months] || r.months)} · ${esc(PAYMENT_METHOD_LABEL[r.paymentMethod] || r.paymentMethod)}</span><span class="payment-status-badge ${r.status}">${esc(PAYMENT_STATUS_LABEL[r.status] || r.status)}</span></div>
        ${expiresLabel ? `<div class="meta" style="border-top:none;padding-top:2px;"><span>Vence ${esc(expiresLabel)}</span></div>` : ''}
        ${actions}
      </div>`;
    }).join('');
    body = `
      <div class="admin-table-card"><div class="admin-table-scroll"><table class="admin-table">
        <thead><tr><th>Nombre</th><th>Correo</th><th>Celular</th><th>Plan</th><th>Meses</th><th>Método</th><th>Estado</th><th>Vencimiento</th><th>Acciones</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div></div>
      <div class="admin-card-list">${cards}</div>`;
  }
  return `
    <div class="admin-page-head" style="margin-top:32px;">
      <div><h1 style="font-size:1.3rem;">Solicitudes de pago${pendingCount ? ` <span class="payment-status-badge pendiente" style="margin-left:8px;">${pendingCount} pendiente${pendingCount === 1 ? '' : 's'}</span>` : ''}</h1>
      <div class="sub">Transferencia bancaria o PayPal, activadas a mano — contacta al celular, confirma el pago y activa.</div></div>
    </div>
    ${body}`;
}

// state: { loading, error, data, lastUpdated, search, planFilter, username, payments, paymentsLoading, paymentsError }
export function adminDashboardView(state) {
  const { loading, error, data, lastUpdated, search, planFilter, username, payments, paymentsLoading, paymentsError } = state;

  // Solo hay datos que mostrar una vez autenticado (ver tryAdminAuth en
  // app.js) — mientras tanto (restaurando una sesión guardada al abrir la
  // app, o justo después de escribir las credenciales en el formulario de
  // acceso normal) se ve nada más una pantalla de carga centrada, sin
  // barra superior todavía.
  if (!data) {
    return `<div class="admin-shell-loading"><div class="admin-loading">${icon('repeat', 'admin-spin')}<p>Entrando al panel de administrador…</p></div></div>`;
  }

  const users = adminFilteredUsers(data, search, planFilter);
  return `
    <div class="admin-topbar">
      <div class="admin-brand">${logoMark(34)}<div class="txt"><b>Memoreo</b><span>Panel de administrador</span></div></div>
      <div class="actions">
        <div class="admin-user-chip"><span class="dot"></span>${esc(username || '')}</div>
        <button class="btn btn-ghost" id="admin-refresh" ${loading ? 'disabled' : ''}>${icon('repeat')}<span class="btn-label">${loading ? ' Actualizando…' : ' Actualizar'}</span></button>
        <button class="btn btn-ghost" id="admin-change-password">${icon('lock')}<span class="btn-label"> Cambiar contraseña</span></button>
        <button class="btn btn-outline" id="admin-logout">${icon('lock')}<span class="btn-label">Cerrar sesión</span></button>
      </div>
    </div>
    <div class="admin-main">
      <div class="admin-wrap">
        <div class="admin-page-head">
          <div>
            <h1>Usuarios y métricas</h1>
            <div class="sub">Datos reales de Memoreo, desde cualquier dispositivo — nunca la cuenta de demostración.</div>
          </div>
          ${lastUpdated ? `<div class="updated">Actualizado ${adminFmtClock(lastUpdated)}</div>` : ''}
        </div>
        ${error ? `<div class="admin-error-banner">${icon('lock')} ${esc(error)}</div>` : ''}
        ${adminStatCards(data)}
        <div class="admin-toolbar">
          <div class="admin-search">${icon('search')}<input type="text" id="admin-search-input" placeholder="Buscar por nombre o correo…" value="${esc(search || '')}" /></div>
          <div class="admin-plan-filter">${ADMIN_PLAN_FILTERS.map((f) => `<button data-plan-filter="${f.id}" class="${planFilter === f.id ? 'active' : ''}">${f.label}</button>`).join('')}</div>
        </div>
        ${adminUsersTable(users, data.users.length)}
        <p class="admin-footnote">Solo se guarda nombre, correo, plan e id de cuenta — nunca la contraseña ni documentos. La cuenta de demostración nunca aparece aquí.</p>
        ${adminPaymentRequestsSection(payments, paymentsLoading, paymentsError)}
      </div>
    </div>`;
}

// "Cambiar contraseña" del panel — abierta desde el topbar (ver
// wireAdminChangePassword en app.js). Reutiliza el mismo layout de hoja
// (.sheet-handle + campos) que securitySheet() para el cambio de
// contraseña de una cuenta normal, pero pide la contraseña ACTUAL del
// administrador en vez de reautenticar con Supabase — el propio backend
// (checkAdminAuth en _shared.mjs) la verifica antes de aceptar la nueva.
export function adminChangePasswordSheet() {
  return `<div class="sheet-handle"></div><h3>${icon('lock')} Cambiar contraseña</h3>
    <p>Esta es la contraseña con la que entras al panel de administrador (usuario y contraseña, en el mismo formulario de "Iniciar sesión" de la app) — no tiene nada que ver con la contraseña de ninguna cuenta de usuario.</p>
    <div class="field"><label for="adminCurPass">Contraseña actual</label><input type="password" id="adminCurPass" autocomplete="current-password" /></div>
    <div class="field"><label for="adminNewPass">Nueva contraseña</label><input type="password" id="adminNewPass" autocomplete="new-password" placeholder="Mínimo 6 caracteres" /></div>
    <div class="field"><label for="adminNewPass2">Confirmar nueva contraseña</label><input type="password" id="adminNewPass2" autocomplete="new-password" /></div>
    <p class="auth-error" id="adminPassError" style="display:none;"></p>
    <button class="btn btn-primary" id="adminChangePassBtn">Cambiar contraseña</button>`;
}
