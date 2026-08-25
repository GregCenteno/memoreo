export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export function addDays(date, n) {
  const r = new Date(date);
  r.setDate(r.getDate() + n);
  return r;
}

export function daysBetween(a, b) {
  const MS = 86400000;
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((db - da) / MS);
}

export function fmtDate(d) {
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function toInputDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromInputDate(s) {
  const [y, m, d] = s.split('-');
  return new Date(+y, +m - 1, +d);
}

export function addMonths(d, n) {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  return r;
}

export function formatMoney(n) {
  const num = Number(n) || 0;
  return '$' + num.toLocaleString('es-MX', { maximumFractionDigits: 2 });
}

// Given a document ({expiresAt: Date|null}), compute days remaining, a
// human label in Spanish, and an urgency bucket used for badge styling.
export function daysInfo(doc, today = new Date()) {
  if (!doc.expiresAt) return { days: null, label: 'No vence', urgency: 'none' };
  const d = daysBetween(today, doc.expiresAt);
  let label;
  if (d === 0) label = 'Vence hoy';
  else if (d === 1) label = 'Vence mañana';
  else if (d > 1) label = `Vence en ${d} días`;
  else if (d === -1) label = 'Venció ayer';
  else label = `Venció hace ${Math.abs(d)} días`;
  const urgency = d < 5 ? 'crit' : d < 15 ? 'warn' : 'ok';
  return { days: d, label, urgency };
}

// Same idea as daysInfo(), but worded for a maintenance/activity log entry:
// "vence" doesn't make sense for something you already did, so a scheduled
// next-service date reads as "próximo" and an overdue one as "pendiente".
// Falls back to "Hecho el <fecha>" when there's no next reminder scheduled.
export function activityInfo(doc, today = new Date()) {
  if (doc.expiresAt) {
    const base = daysInfo(doc, today);
    let label = base.label
      .replace(/^Vence hoy$/, 'Próximo hoy')
      .replace(/^Vence mañana$/, 'Próximo mañana')
      .replace(/^Vence en/, 'Próximo en')
      .replace(/^Venció ayer$/, 'Pendiente desde ayer')
      .replace(/^Venció hace/, 'Pendiente hace');
    return { ...base, label };
  }
  if (doc.performedAt) {
    return { days: null, urgency: 'none', label: `Hecho el ${fmtDate(doc.performedAt)}` };
  }
  return { days: null, urgency: 'none', label: 'Sin registrar' };
}

const RECURRENCE_MONTHS = { mensual: 1, bimestral: 2, anual: 12 };

// A "Pagos" entry stores a known payment date (doc.expiresAt) plus how often
// it repeats. Rather than requiring the user to re-register the payment
// every cycle, this rolls the stored date forward by the recurrence
// interval until it lands on or after today, so it's always showing the
// next real due date.
export function recurrenceInfo(doc, today = new Date()) {
  if (!doc.expiresAt || !doc.recurrence) return { days: null, label: 'Sin fecha', urgency: 'none', nextDate: null };
  const months = RECURRENCE_MONTHS[doc.recurrence] || 1;
  let next = new Date(doc.expiresAt);
  let guard = 0;
  while (daysBetween(today, next) < 0 && guard < 1200) {
    next = addMonths(next, months);
    guard++;
  }
  const d = daysBetween(today, next);
  let label;
  if (d === 0) label = 'Se paga hoy';
  else if (d === 1) label = 'Se paga mañana';
  else label = `Se paga en ${d} días`;
  const urgency = d < 5 ? 'crit' : d < 15 ? 'warn' : 'ok';
  return { days: d, label, urgency, nextDate: next };
}

// A "Salud" entry is one of three subtypes, each worded around what its date
// actually means instead of a generic "vence": a vacuna's date is its next
// dose, a medicamento's is when it runs out (so you know when to buy more —
// not an expiration in the document sense), and a laboratorio's is its next
// follow-up appointment. All three fall back to "cuándo se registró" when
// there's no forward-looking date yet.
export function healthInfo(doc, today = new Date()) {
  if (doc.healthType === 'medicamento') {
    if (doc.expiresAt) {
      const base = daysInfo(doc, today);
      const label = base.label
        .replace(/^Vence hoy$/, 'Se agota hoy')
        .replace(/^Vence mañana$/, 'Se agota mañana')
        .replace(/^Vence en/, 'Se agotará en')
        .replace(/^Venció ayer$/, 'Se agotó ayer')
        .replace(/^Venció hace/, 'Se agotó hace');
      return { ...base, label };
    }
    return { days: null, urgency: 'none', label: 'Sin fecha de reabasto' };
  }
  if (doc.healthType === 'laboratorio') {
    if (doc.expiresAt) {
      const base = daysInfo(doc, today);
      const label = base.label
        .replace(/^Vence hoy$/, 'Cita hoy')
        .replace(/^Vence mañana$/, 'Cita mañana')
        .replace(/^Vence en/, 'Próxima cita en')
        .replace(/^Venció ayer$/, 'Cita pendiente desde ayer')
        .replace(/^Venció hace/, 'Cita pendiente hace');
      return { ...base, label };
    }
    if (doc.performedAt) return { days: null, urgency: 'none', label: `Registrada el ${fmtDate(doc.performedAt)}` };
    return { days: null, urgency: 'none', label: 'Sin fecha' };
  }
  // vacuna (and any future default): expiresAt is the next dose.
  if (doc.expiresAt) {
    const base = daysInfo(doc, today);
    const label = base.label
      .replace(/^Vence hoy$/, 'Dosis hoy')
      .replace(/^Vence mañana$/, 'Dosis mañana')
      .replace(/^Vence en/, 'Próxima dosis en')
      .replace(/^Venció ayer$/, 'Dosis atrasada desde ayer')
      .replace(/^Venció hace/, 'Dosis atrasada hace');
    return { ...base, label };
  }
  if (doc.performedAt) return { days: null, urgency: 'none', label: `Aplicada el ${fmtDate(doc.performedAt)}` };
  return { days: null, urgency: 'none', label: 'Sin fecha' };
}

// Estado de la prueba gratis de 7 días de Plan Premium (simulada — ver
// startPremiumTrial en auth.js). No hay backend que "cobre" al terminar la
// prueba, así que esto simplemente deja de reportarse como activa una vez
// que pasa la fecha: la cuenta sigue en Premium con normalidad, como si el
// cobro automático ya hubiera ocurrido con éxito.
export function trialInfo(account, today = new Date()) {
  if (!account || !account.trialEndsAt) return { active: false, daysLeft: 0, endsAt: null };
  const endsAt = new Date(account.trialEndsAt);
  const d = daysBetween(today, endsAt);
  return { active: d >= 0, daysLeft: Math.max(d, 0), endsAt };
}

// A "Préstamos" entry is worded around who owes whom instead of "vence".
export function loanInfo(doc, today = new Date()) {
  if (!doc.expiresAt) return { days: null, label: 'Sin fecha de pago', urgency: 'none' };
  const base = daysInfo(doc, today);
  const futureVerb = doc.direction === 'me_deben' ? 'Te pagan' : 'Debes pagar';
  const pastVerb = doc.direction === 'me_deben' ? 'Te debían pagar' : 'Debías pagar';
  let label;
  if (base.days === 0) label = `${futureVerb} hoy`;
  else if (base.days === 1) label = `${futureVerb} mañana`;
  else if (base.days > 1) label = `${futureVerb} en ${base.days} días`;
  else if (base.days === -1) label = `${pastVerb} ayer`;
  else label = `${pastVerb} hace ${Math.abs(base.days)} días`;
  return { days: base.days, label, urgency: base.urgency };
}
