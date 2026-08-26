import { addDays, daysInfo, activityInfo, recurrenceInfo, loanInfo, healthInfo } from './utils.js';
import { supabase, SIGNED_URL_TTL_SECONDS } from './supabaseClient.js';

// Cada cuenta accede solo a sus propios documentos — ya no porque cada
// quien tenga su propia llave de localStorage, sino porque la tabla
// public.documents tiene Row Level Security activado y cada renglón está
// ligado a su dueño (user_id = auth.uid(), ver supabase/schema.sql). Es la
// base de datos, no el navegador, quien ahora hace cumplir esa separación.

export const CATS = [
  { id: 'personal', label: 'Personal', icon: 'doc' },
  { id: 'garantias', label: 'Garantías', icon: 'tag' },
  { id: 'seguros', label: 'Seguros', icon: 'shield' },
  // Vehículo y Hogar aceptan dos tipos de registro: un documento normal
  // (con vencimiento) o un registro de mantenimiento (bitácora de cuándo
  // se hizo algo), para que al abrir la categoría se vea todo junto.
  { id: 'vehiculo', label: 'Vehículo', icon: 'car', activityCapable: true },
  { id: 'hogar', label: 'Hogar', icon: 'home', activityCapable: true },
  { id: 'estudios', label: 'Estudios', icon: 'grad' },
  // Pagos recurrentes: se registran una sola vez con una fecha conocida y
  // una frecuencia, y Memoreo calcula sola la siguiente fecha de pago. La
  // categoría se muestra como "Servicios" (luz, agua, celular…) aunque el
  // id interno siga siendo 'pagos' — así no hay que migrar nada en Supabase.
  { id: 'pagos', label: 'Servicios', icon: 'repeat', noun: 'servicio' },
  // Dinero prestado o debido, con quién y cuánto.
  { id: 'prestamos', label: 'Préstamos', icon: 'cash', noun: 'préstamo' },
  // Salud ya no está totalmente bloqueada: cada plan desbloquea distintas
  // subcategorías (ver HEALTH_TYPES/PLANS más abajo) en vez de un todo-o-nada.
  { id: 'salud', label: 'Salud', icon: 'health', healthGated: true }
];

export const RECURRENCE_LABELS = { mensual: 'Mensual', bimestral: 'Bimestral', anual: 'Anual' };

// Las 4 subcategorías del módulo de Salud. Cada plan desbloquea un subconjunto
// (ver PLANS) — el plan Gratis ya incluye Vacunas sin límite, para que la
// persona conozca el módulo y quiera el resto. Premium agrega Medicamentos
// (recordatorio de cuándo comprar más, no un vencimiento) y Pruebas de
// laboratorio. Recetas (foto o PDF de la receta médica, con su propia fecha
// de vencimiento/renovación) es exclusiva de Premium Plus, igual que la
// función avanzada dentro de Pruebas de laboratorio (ver `advancedHealth`
// en PLANS): próxima cita médica.
export const HEALTH_TYPES = [
  { id: 'vacuna', label: 'Vacunas', singular: 'Vacuna', icon: 'health', savedLabel: 'Vacuna guardada' },
  { id: 'medicamento', label: 'Medicamentos', singular: 'Medicamento', icon: 'pill', savedLabel: 'Medicamento guardado' },
  { id: 'laboratorio', label: 'Pruebas de laboratorio', singular: 'Prueba de laboratorio', icon: 'flask', savedLabel: 'Prueba de laboratorio guardada' },
  { id: 'receta', label: 'Recetas', singular: 'Receta', icon: 'rx', savedLabel: 'Receta guardada' }
];

export function healthTypeInfo(id) {
  return HEALTH_TYPES.find((h) => h.id === id) || HEALTH_TYPES[0];
}

// Los 5 tipos de prueba dentro de Pruebas de laboratorio. Cada uno trae sus
// propios campos numéricos rastreables — química sanguínea de 4 elementos
// trae sus 4 valores clásicos (glucosa, urea, creatinina, ácido úrico); los
// demás traen el valor principal que normalmente se sigue con el tiempo.
export const LAB_TEST_TYPES = [
  { id: 'quimica4', label: 'Química sanguínea (4 elementos)', fields: [
    { key: 'glucosa', label: 'Glucosa', unit: 'mg/dL' },
    { key: 'urea', label: 'Urea', unit: 'mg/dL' },
    { key: 'creatinina', label: 'Creatinina', unit: 'mg/dL' },
    { key: 'acidoUrico', label: 'Ácido úrico', unit: 'mg/dL' }
  ] },
  { id: 'biometria', label: 'Biometría hemática', fields: [
    { key: 'hemoglobina', label: 'Hemoglobina', unit: 'g/dL' }
  ] },
  { id: 'hepaticas', label: 'Funciones hepáticas', fields: [
    { key: 'alt', label: 'ALT (TGP)', unit: 'U/L' }
  ] },
  { id: 'hba1c', label: 'Hemoglobina glicada', fields: [
    { key: 'hba1c', label: 'HbA1c', unit: '%' }
  ] },
  { id: 'lipidos', label: 'Perfil de lípidos', fields: [
    { key: 'colesterol', label: 'Colesterol total', unit: 'mg/dL' }
  ] }
];

export function labTestTypeInfo(id) {
  return LAB_TEST_TYPES.find((t) => t.id === id) || LAB_TEST_TYPES[0];
}

// Los tres planes: límite de elementos generales (todo excepto Salud, que
// tiene su propio desbloqueo por subcategoría), qué subcategorías de Salud
// están disponibles, si la función avanzada de Pruebas de laboratorio
// (próxima cita médica) está disponible, y si el color de la app se puede
// personalizar — estas dos últimas son exclusivas de Premium Plus.
export const PLANS = {
  gratis: { id: 'gratis', label: 'Plan Gratis', price: '$0', monthlyPrice: 0, limit: 5, salud: ['vacuna'], advancedHealth: false, colorPersonalization: false },
  premium: { id: 'premium', label: 'Plan Premium', price: '$59/mes', monthlyPrice: 59, limit: 20, salud: ['vacuna', 'medicamento', 'laboratorio'], advancedHealth: false, colorPersonalization: false },
  premium_plus: { id: 'premium_plus', label: 'Plan Premium Plus', price: '$99/mes', monthlyPrice: 99, limit: Infinity, salud: ['vacuna', 'medicamento', 'laboratorio', 'receta'], advancedHealth: true, colorPersonalization: true }
};

export function planInfo(planId) {
  return PLANS[planId] || PLANS.gratis;
}

// Pagos manuales (transferencia bancaria MX o PayPal): duraciones que se
// pueden pagar de una vez, y los dos métodos entre los que puede elegir
// quien solicita un plan de paga (ver paymentRequestSheet en views.js y
// requestManualPayment en auth.js). "months" es lo que de verdad se manda a
// guardar — la etiqueta es solo para mostrar en pantalla.
export const PAYMENT_DURATIONS = [
  { months: 1, label: '1 mes' },
  { months: 2, label: '2 meses' },
  { months: 3, label: '3 meses' },
  { months: 4, label: '4 meses' },
  { months: 5, label: '5 meses' },
  { months: 6, label: '6 meses' },
  { months: 12, label: '1 año' }
];

export const PAYMENT_METHODS = [
  { id: 'transferencia', label: 'Transferencia bancaria', hint: 'Cuenta bancaria en México' },
  { id: 'paypal', label: 'PayPal', hint: 'Liga de pago de PayPal' }
];

// Número de WhatsApp del negocio para el botón "Pagar vía WhatsApp" (ver
// paymentRequestSheet en views.js) — se configura con la variable de
// entorno VITE_WHATSAPP_NUMBER (mismo patrón que VITE_SUPABASE_URL: Vite la
// incluye en el build porque empieza con VITE_; no es secreta, es
// justo el número al que se supone que cualquiera le puede escribir).
// Formato internacional, solo dígitos, sin "+" ni espacios — por ejemplo
// 5215512345678 para un celular mexicano (52 + 1 + los 10 dígitos). Sin
// esa variable configurada, WHATSAPP_NUMBER queda vacío y el botón
// simplemente no aparece (ver paymentRequestSheet) en vez de mandar a un
// número que no existe.
export const WHATSAPP_NUMBER = (import.meta.env.VITE_WHATSAPP_NUMBER || '').replace(/\D/g, '');

// Arma el mensaje prellenado para pedir un plan por WhatsApp — funciona
// tanto apenas se elige el plan (sin duración ni método todavía) como ya
// con duración/método elegidos en paymentRequestSheet, ajustando el texto
// solo con lo que ya se sabe.
export function whatsappPayMessage(planId, months, methodId) {
  const p = planInfo(planId);
  let text = `Hola, quiero contratar el ${p.label} de Memoreo`;
  const duration = PAYMENT_DURATIONS.find((d) => d.months === months);
  if (duration) text += ` por ${duration.label}`;
  const method = PAYMENT_METHODS.find((m) => m.id === methodId);
  if (method) text += ` (${method.label})`;
  return text + '. ¿Me pasas los datos para pagar?';
}

// El plan más barato (en orden Gratis → Premium → Premium Plus) que ya
// incluye esa subcategoría de Salud — lo usa la hoja de "esto es de plan de
// paga" (ver openHealthUpsell en app.js) para ofrecer el plan correcto en
// vez de siempre sugerir Premium. Antes de Recetas (exclusiva de Premium
// Plus) todo lo bloqueado en Salud pertenecía a Premium, así que ese botón
// siempre decía "Premium" sin que fuera un problema — ahora ya no alcanza
// con eso.
const PLAN_ORDER = ['gratis', 'premium', 'premium_plus'];
export function planForHealthType(healthType) {
  const id = PLAN_ORDER.find((pid) => PLANS[pid].salud.includes(healthType));
  return PLANS[id || 'premium_plus'];
}

// El límite de elementos del plan aplica a todo excepto Salud — Salud tiene
// su propio desbloqueo ilimitado por subcategoría (ver healthTypeAllowed).
export function nonHealthCount(docs) {
  return docs.filter((d) => d.category !== 'salud').length;
}

export function healthTypeAllowed(planId, healthType) {
  return planInfo(planId).salud.includes(healthType);
}

export function advancedHealthAllowed(planId) {
  return !!planInfo(planId).advancedHealth;
}

export function colorPersonalizationAllowed(planId) {
  return !!planInfo(planId).colorPersonalization;
}

export function catInfo(id) {
  return CATS.find((c) => c.id === id) || CATS[0];
}

// Curated accent colors a person can pick for their own account, each tuned
// for contrast in both light and dark like the default turquoise brand —
// a free color picker could land on something unreadable in one theme, so
// personalization stays inside a palette we've already checked.
// --brand-solid/--brand-solid-dark stay constant across themes (used for
// filled buttons, always paired with white text), matching the app's
// existing brand-token pattern.
export const ACCENT_PALETTE = [
  { id: 'turquesa', label: 'Turquesa', swatch: '#0EA5A6',
    light: { brand: '#0A7A78', solid: '#0EA5A6', solidDark: '#075E5C', ink: '#06413F', soft: '#D8F5F3' },
    dark: { brand: '#4FE0DB', ink: '#E4FFFC', soft: '#0B302E' } },
  { id: 'magenta', label: 'Magenta', swatch: '#E31C79',
    light: { brand: '#C71368', solid: '#E31C79', solidDark: '#6E1149', ink: '#6E1149', soft: '#FCE0EE' },
    dark: { brand: '#FF6FB4', ink: '#FDE1EE', soft: '#3A1428' } },
  { id: 'azul', label: 'Azul', swatch: '#2E6BFF',
    light: { brand: '#1D4ED8', solid: '#2E6BFF', solidDark: '#15317A', ink: '#1E3A8A', soft: '#DCE9FE' },
    dark: { brand: '#8FB6FF', ink: '#EAF1FF', soft: '#16233E' } },
  { id: 'verde', label: 'Verde', swatch: '#0EA55E',
    light: { brand: '#047857', solid: '#0EA55E', solidDark: '#064E3B', ink: '#064E3B', soft: '#D1FAE5' },
    dark: { brand: '#6EE7B7', ink: '#ECFDF5', soft: '#0B2B22' } },
  { id: 'violeta', label: 'Violeta', swatch: '#7C3AED',
    light: { brand: '#6D28D9', solid: '#7C3AED', solidDark: '#4C1D95', ink: '#4C1D95', soft: '#EDE4FE' },
    dark: { brand: '#C4B5FD', ink: '#F5F3FF', soft: '#2E1065' } },
  { id: 'ambar', label: 'Ámbar', swatch: '#F59E0B',
    light: { brand: '#B45309', solid: '#F59E0B', solidDark: '#78350F', ink: '#78350F', soft: '#FEF3C7' },
    dark: { brand: '#FCD34D', ink: '#FFFBEB', soft: '#3D2A05' } }
];

export function accentInfo(id) {
  return ACCENT_PALETTE.find((a) => a.id === id) || ACCENT_PALETTE[0];
}

// A document is a "Mantenimiento" entry only within a category that accepts
// both kinds (Vehículo, Hogar) — everywhere else kind is irrelevant.
export function isActivity(doc) {
  return doc.kind === 'activity';
}

// Which Add-screen field set applies: a normal document, a maintenance log
// entry, a recurring payment, or a loan.
export function formMode(category, kind) {
  if (category === 'pagos') return 'pago';
  if (category === 'prestamos') return 'prestamo';
  if (category === 'salud') return 'salud';
  if (category && catInfo(category).activityCapable && kind === 'activity') return 'activity';
  // Hogar es la única categoría con TRES tipos de registro (Vehículo solo
  // tiene dos): Documentos (kind === 'documento' — contrato de renta,
  // garantías, recibos de pago ya hechos… un documento normal con su
  // propia fecha de vencimiento si aplica) y Servicios (agua, luz, gas,
  // internet…), que es, en el fondo, el mismo tipo de gasto recurrente que
  // la categoría Pagos — mismo nombre, misma idea — así que usa exactamente
  // su mismo formulario (frecuencia + próxima fecha + monto opcional) en
  // vez del de documento normal. Cualquier kind que no sea 'documento' cae
  // en Servicios — incluye el valor 'doc' que ya traían guardados los
  // registros de Servicios creados antes de que existiera esta distinción
  // de tres, para no romper nada de lo que ya está en Supabase. Mantenimiento
  // (kind === 'activity', ya filtrado arriba) sigue siendo su propia
  // bitácora, sin cambios.
  if (category === 'hogar') return kind === 'documento' ? 'doc' : 'pago';
  return 'doc';
}

// The word used in toasts/confirmations for a given document.
export function docNoun(doc) {
  if (doc.category === 'pagos') return 'servicio';
  if (doc.category === 'prestamos') return 'préstamo';
  if (doc.category === 'salud') return healthTypeInfo(doc.healthType).singular.toLowerCase();
  if (doc.category === 'hogar' && !isActivity(doc) && doc.kind !== 'documento') return 'servicio';
  if (isActivity(doc)) return 'registro';
  return 'documento';
}

// Picks the right label/urgency logic depending on what kind of entry this is.
export function docInfo(doc) {
  if (doc.category === 'pagos') return recurrenceInfo(doc);
  if (doc.category === 'prestamos') return loanInfo(doc);
  if (doc.category === 'salud') return healthInfo(doc);
  // Igual que Pagos: "Servicios" dentro de Hogar es un gasto recurrente
  // (agua, luz, gas, internet), así que calcula su próxima fecha sola en
  // vez de usar el vencimiento fijo de un documento normal — ver el
  // comentario junto a formMode() más arriba.
  if (doc.category === 'hogar' && !isActivity(doc) && doc.kind !== 'documento') return recurrenceInfo(doc);
  return isActivity(doc) ? activityInfo(doc) : daysInfo(doc);
}

// Sample documents so the app feels alive on first run. Dates are relative
// to "today" so the demo stays realistic no matter when it's opened.
export function seedData() {
  const today = new Date();
  return [
    { id: 1, name: 'INE', category: 'personal', expiresAt: addDays(today, 12).toISOString(), reminderDays: 7, notes: 'Credencial para votar vigente. Renovación en módulo INE cercano.', image: null, performedAt: null },
    { id: 2, name: 'Pasaporte', category: 'personal', expiresAt: addDays(today, 265).toISOString(), reminderDays: 30, notes: '', image: null, performedAt: null },
    { id: 3, name: 'Garantía Lavadora LG', category: 'garantias', expiresAt: addDays(today, 6).toISOString(), reminderDays: 7, notes: 'Guardar ticket de compra. Servicio: 800 026 3283.', image: null, performedAt: null },
    { id: 4, name: 'Seguro de Auto GNP', category: 'seguros', expiresAt: addDays(today, 29).toISOString(), reminderDays: 15, notes: 'Póliza #4521-908. Renovar antes de la fecha límite.', image: null, performedAt: null },
    { id: 5, name: 'Tarjeta de Circulación', category: 'vehiculo', kind: 'doc', expiresAt: addDays(today, 101).toISOString(), reminderDays: 15, notes: '', image: null, performedAt: null },
    { id: 6, name: 'Contrato de Renta', category: 'hogar', kind: 'documento', expiresAt: addDays(today, 146).toISOString(), reminderDays: 30, notes: 'Depósito: 1 mes. Contacto casero: Sra. Martínez.', image: null, performedAt: null },
    { id: 7, name: 'Garantía Refrigerador', category: 'garantias', expiresAt: addDays(today, 44).toISOString(), reminderDays: 7, notes: '', image: null, performedAt: null },
    { id: 8, name: 'Verificación Vehicular', category: 'vehiculo', kind: 'doc', expiresAt: addDays(today, -12).toISOString(), reminderDays: 7, notes: 'Pendiente de renovar, revisar posible multa.', image: null, performedAt: null },
    { id: 9, name: 'Acta de Nacimiento', category: 'personal', expiresAt: null, reminderDays: null, notes: 'No vence. Guardada como respaldo digital.', image: null, performedAt: null },
    { id: 10, name: 'Colegiatura Septiembre', category: 'estudios', expiresAt: addDays(today, 18).toISOString(), reminderDays: 5, notes: 'Transferencia SPEI a cuenta de la universidad.', image: null, performedAt: null },
    { id: 11, name: 'Inscripción Semestre', category: 'estudios', expiresAt: addDays(today, 95).toISOString(), reminderDays: 15, notes: '', image: null, performedAt: null },
    { id: 12, name: 'Servicio mayor del auto', category: 'vehiculo', kind: 'activity', expiresAt: addDays(today, 110).toISOString(), reminderDays: 7, notes: 'Cambio de aceite, filtros y frenos en agencia.', image: null, performedAt: addDays(today, -70).toISOString() },
    { id: 13, name: 'Presión de llantas', category: 'vehiculo', kind: 'activity', expiresAt: null, reminderDays: null, notes: '32 psi en las cuatro llantas.', image: null, performedAt: addDays(today, -10).toISOString() },
    { id: 14, name: 'Mantenimiento de aire acondicionado', category: 'hogar', kind: 'activity', expiresAt: addDays(today, -20).toISOString(), reminderDays: 7, notes: 'Limpieza de filtros y recarga de gas.', image: null, performedAt: addDays(today, -200).toISOString() },
    { id: 15, name: 'Revisión de cableado eléctrico', category: 'hogar', kind: 'activity', expiresAt: null, reminderDays: null, notes: 'Electricista revisó los contactos de la cocina.', image: null, performedAt: addDays(today, -365).toISOString() },
    { id: 16, name: 'Luz', category: 'pagos', recurrence: 'bimestral', expiresAt: addDays(today, 9).toISOString(), reminderDays: 3, notes: 'CFE, recibo bimestral.', image: null, performedAt: null },
    { id: 17, name: 'Agua', category: 'pagos', recurrence: 'mensual', expiresAt: addDays(today, 4).toISOString(), reminderDays: 3, notes: '', image: null, performedAt: null },
    { id: 18, name: 'Celular', category: 'pagos', recurrence: 'mensual', expiresAt: addDays(today, 18).toISOString(), reminderDays: 1, notes: 'Plan con datos ilimitados.', image: null, performedAt: null },
    { id: 19, name: 'Préstamo para reparación del carro', category: 'prestamos', direction: 'me_deben', person: 'Carlos Ruiz', amount: 1500, expiresAt: addDays(today, 20).toISOString(), reminderDays: 7, notes: '', image: null, performedAt: null },
    { id: 20, name: 'Préstamo de Ana López', category: 'prestamos', direction: 'debo', person: 'Ana López', amount: 800, expiresAt: null, reminderDays: null, notes: 'Sin fecha definida para pagar.', image: null, performedAt: null },
    // Salud: Vacunas viene incluida en el plan Gratis desde el primer uso;
    // esta muestra también incluye Medicamentos y dos Pruebas de laboratorio
    // del mismo tipo con fechas distintas — para que la gráfica de tendencia
    // (Premium Plus) tenga algo real que mostrar en cuanto se actualiza el
    // plan a uno que los desbloquee.
    { id: 21, name: 'Refuerzo COVID-19', category: 'salud', healthType: 'vacuna', performedAt: addDays(today, -200).toISOString(), expiresAt: addDays(today, 165).toISOString(), reminderDays: 14, notes: 'Aplicada en clínica particular, dosis de refuerzo anual.', image: null },
    { id: 22, name: 'Losartán 50mg', category: 'salud', healthType: 'medicamento', dose: '50mg', frequency: '1 vez al día', expiresAt: addDays(today, 6).toISOString(), reminderDays: 5, notes: 'Comprar en farmacia de siempre, caja de 30 tabletas.', performedAt: null, image: null },
    { id: 23, name: 'Química sanguínea', category: 'salud', healthType: 'laboratorio', labTestType: 'quimica4', labValues: { glucosa: '98', urea: '30', creatinina: '0.95', acidoUrico: '5.5' }, performedAt: addDays(today, -90).toISOString(), expiresAt: null, reminderDays: null, notes: 'Chequeo de control anual.', image: null },
    { id: 24, name: 'Química sanguínea', category: 'salud', healthType: 'laboratorio', labTestType: 'quimica4', labValues: { glucosa: '92', urea: '27', creatinina: '0.88', acidoUrico: '5.1' }, performedAt: addDays(today, -10).toISOString(), expiresAt: null, reminderDays: null, notes: 'Seguimiento después de ajustar la dieta.', image: null }
  ];
}

// Convierte un renglón de la tabla documents (snake_case, tal cual lo
// devuelve Supabase) al objeto que el resto de la app espera (camelCase,
// mismos nombres que usaba la versión de localStorage). `signedUrl`, si se
// pasa, es la URL firmada ya generada para el archivo adjunto de este
// documento (ver _refresh/_hydrate más abajo) — nunca se genera aquí adentro
// para poder pedir varias de un jalón en vez de una por una.
function rowToDoc(row, signedUrl) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    kind: row.kind === 'activity' ? 'activity' : (catInfo(row.category).activityCapable ? 'doc' : null),
    expiresAt: row.expires_at,
    performedAt: row.performed_at,
    reminderDays: row.reminder_days,
    recurrence: row.recurrence,
    direction: row.direction,
    person: row.person,
    amount: row.amount,
    notes: row.notes || '',
    // `image` mantiene el mismo nombre que en la versión anterior (así
    // docThumb()/detailView() en views.js no tuvieron que cambiar) — ahora es
    // una URL firmada de Supabase Storage en vez de un data URL en base64, y
    // solo se llena cuando el adjunto es una foto (para un PDF, ver
    // attachmentUrl más abajo).
    image: row.attachment_type === 'image' ? (signedUrl || null) : null,
    attachmentUrl: signedUrl || null,
    attachmentType: row.attachment_type || null,
    attachmentName: row.attachment_name || null,
    attachmentPath: row.attachment_path || null,
    healthType: row.health_type,
    dose: row.dose,
    frequency: row.frequency,
    labTestType: row.lab_test_type,
    labValues: row.lab_values || {}
  };
}

// Convierte el payload que arma saveDraft() en src/app.js (camelCase) al
// formato de renglón de la tabla documents (snake_case). Los campos del
// archivo adjunto (attachment_path/type/name) NO se tocan aquí — los maneja
// add()/update() por separado, porque dependen de si de verdad se subió un
// archivo nuevo.
function payloadToRow(payload) {
  return {
    name: payload.name,
    category: payload.category,
    kind: payload.kind || 'doc',
    expires_at: payload.expiresAt || null,
    performed_at: payload.performedAt || null,
    reminder_days: payload.reminderDays ?? null,
    recurrence: payload.recurrence || null,
    direction: payload.direction || null,
    person: payload.person || null,
    amount: payload.amount ?? null,
    notes: payload.notes || '',
    health_type: payload.healthType || null,
    dose: payload.dose || null,
    frequency: payload.frequency || null,
    lab_test_type: payload.labTestType || null,
    lab_values: payload.labValues || {}
  };
}

function attachmentPathFor(accountId, docId) {
  return `${accountId}/${docId}`;
}

class Store {
  constructor(accountId) {
    this.accountId = accountId;
    this.docs = [];
  }

  // Carga (o recarga) todos los documentos de la cuenta desde Supabase, y
  // genera de un jalón las URLs firmadas de todos los archivos adjuntos que
  // haya (ver SIGNED_URL_TTL_SECONDS en supabaseClient.js — duran una
  // semana). Se llama una vez al abrir la cuenta (ver openStoreForAccount) y
  // de ahí en adelante add()/update()/remove() mantienen la copia en
  // memoria al día sin volver a pedir todo.
  async _refresh() {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('user_id', this.accountId)
      .order('created_at', { ascending: true });
    if (error) {
      console.warn('Memoreo: no se pudieron cargar los documentos', error);
      this.docs = [];
      return;
    }
    const paths = data.filter((r) => r.attachment_path).map((r) => r.attachment_path);
    let signedByPath = {};
    if (paths.length) {
      const { data: signedList, error: signError } = await supabase
        .storage.from('attachments').createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
      if (signError) {
        console.warn('Memoreo: no se pudieron generar las URLs de los adjuntos', signError);
      } else {
        signedList.forEach((s, i) => { if (s.signedUrl) signedByPath[paths[i]] = s.signedUrl; });
      }
    }
    this.docs = data.map((row) => rowToDoc(row, signedByPath[row.attachment_path]));
  }

  // Igual que _refresh pero para un solo renglón recién insertado/editado —
  // evita tener que recargar todos los documentos después de cada guardado.
  async _hydrate(row) {
    if (!row.attachment_path) return rowToDoc(row, null);
    const { data, error } = await supabase.storage.from('attachments').createSignedUrl(row.attachment_path, SIGNED_URL_TTL_SECONDS);
    if (error) { console.warn('Memoreo: no se pudo generar la URL del adjunto', error); return rowToDoc(row, null); }
    return rowToDoc(row, data.signedUrl);
  }

  // Returns documents with expiresAt/performedAt as real Date objects for rendering.
  all() {
    return this.docs.map((d) => ({
      ...d,
      expiresAt: d.expiresAt ? new Date(d.expiresAt) : null,
      performedAt: d.performedAt ? new Date(d.performedAt) : null
    }));
  }

  get(id) {
    return this.docs.find((d) => d.id === id) || null;
  }

  // `file`, si se pasa, es el objeto File real elegido en el formulario (ver
  // renderUploadZone en src/app.js) — se sube a Supabase Storage antes de
  // guardar el renglón, a una ruta fija por documento ("<accountId>/<id>")
  // para que un archivo huérfano nunca quede sin dueño reconocible.
  async add(payload, file) {
    const id = crypto.randomUUID();
    let attachment = { attachment_path: null, attachment_type: null, attachment_name: null };
    if (file) {
      const path = attachmentPathFor(this.accountId, id);
      const { error: uploadError } = await supabase.storage.from('attachments').upload(path, file, { upsert: true, contentType: file.type || 'application/octet-stream' });
      if (uploadError) throw uploadError;
      attachment = { attachment_path: path, attachment_type: file.type.startsWith('image/') ? 'image' : 'pdf', attachment_name: file.name };
    }
    const row = { id, user_id: this.accountId, ...payloadToRow(payload), ...attachment };
    const { data, error } = await supabase.from('documents').insert(row).select().single();
    if (error) throw error;
    const doc = await this._hydrate(data);
    this.docs.push(doc);
    return doc;
  }

  // `file` sube (y reemplaza) el adjunto; `removeAttachment: true` lo quita
  // sin poner uno nuevo. Si no se pasa ninguno de los dos, el adjunto que ya
  // tenía el documento se queda intacto.
  async update(id, payload, file, removeAttachment) {
    const existing = this.get(id);
    const patch = payloadToRow(payload);
    if (file) {
      const path = attachmentPathFor(this.accountId, id);
      const { error: uploadError } = await supabase.storage.from('attachments').upload(path, file, { upsert: true, contentType: file.type || 'application/octet-stream' });
      if (uploadError) throw uploadError;
      patch.attachment_path = path;
      patch.attachment_type = file.type.startsWith('image/') ? 'image' : 'pdf';
      patch.attachment_name = file.name;
    } else if (removeAttachment && existing && existing.attachmentPath) {
      await supabase.storage.from('attachments').remove([existing.attachmentPath]).catch(() => {});
      patch.attachment_path = null;
      patch.attachment_type = null;
      patch.attachment_name = null;
    }
    const { data, error } = await supabase.from('documents').update(patch).eq('id', id).select().single();
    if (error) throw error;
    const doc = await this._hydrate(data);
    const idx = this.docs.findIndex((d) => d.id === id);
    if (idx >= 0) this.docs[idx] = doc; else this.docs.push(doc);
    return doc;
  }

  async remove(id) {
    const existing = this.get(id);
    const { error } = await supabase.from('documents').delete().eq('id', id);
    if (error) throw error;
    if (existing && existing.attachmentPath) {
      await supabase.storage.from('attachments').remove([existing.attachmentPath]).catch(() => {});
    }
    this.docs = this.docs.filter((d) => d.id !== id);
  }
}

// `store` is a live binding: it starts null (no one is logged in yet) and
// gets reassigned to a fresh Store scoped to whichever account is active.
// Everything that imports `{ store }` sees the updated object automatically
// because ES module bindings are live references, not one-time copies.
export let store = null;

export async function openStoreForAccount(accountId) {
  const s = new Store(accountId);
  await s._refresh();
  store = s;
  return store;
}

export function clearStore() {
  store = null;
}

// Siembra una cuenta con los 24 documentos de ejemplo (seedData()) cuando
// seeded=true. Ya no hay ningún llamador que pase seeded=true (la versión
// demo se eliminó — ver auth.js), así que hoy esta función siempre recibe
// seeded=false y no hace nada: en Postgres "no tener documentos todavía" ya
// es el estado natural de una cuenta recién creada. Se deja aquí (en vez de
// borrarla junto con seedData()) por si en el futuro se quiere ofrecer datos
// de ejemplo de otra forma.
export async function initAccountDocs(accountId, seeded) {
  if (!seeded) return;
  const rows = seedData().map((d) => ({
    id: crypto.randomUUID(),
    user_id: accountId,
    name: d.name,
    category: d.category,
    kind: d.kind || 'doc',
    expires_at: d.expiresAt || null,
    performed_at: d.performedAt || null,
    reminder_days: d.reminderDays ?? null,
    recurrence: d.recurrence || null,
    direction: d.direction || null,
    person: d.person || null,
    amount: d.amount ?? null,
    notes: d.notes || '',
    health_type: d.healthType || null,
    dose: d.dose || null,
    frequency: d.frequency || null,
    lab_test_type: d.labTestType || null,
    lab_values: d.labValues || {}
  }));
  const { error } = await supabase.from('documents').insert(rows);
  if (error) console.warn('Memoreo: no se pudo sembrar la cuenta demo', error);
}
