// Small hand-drawn line icon set (24x24 viewBox, stroke = currentColor).
const PATHS = {
  doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 12h6M9 16h6"/>',
  tag: '<path d="M12 3l8 8-9 9-8-8V4h9z"/><circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none"/>',
  shield: '<path d="M12 3l7 3v6c0 5-3.5 8-7 9-3.5-1-7-4-7-9V6z"/>',
  car: '<path d="M4 16l1.4-4.8A2 2 0 0 1 7.3 9.7h9.4a2 2 0 0 1 1.9 1.5L20 16"/><rect x="3" y="16" width="18" height="4" rx="1.6"/><circle cx="7.5" cy="20.3" r="1.1" fill="currentColor" stroke="none"/><circle cx="16.5" cy="20.3" r="1.1" fill="currentColor" stroke="none"/>',
  home: '<path d="M4 11l8-7 8 7"/><path d="M6 10v9h12v-9"/>',
  health: '<path d="M12 20s-7-4.4-9.5-9C.9 7.8 2.4 4 6 4c2 0 3.4 1.2 4 2.4C10.6 5.2 12 4 14 4c3.6 0 5.1 3.8 3.5 7-2.5 4.6-9.5 9-9.5 9z"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-4.8-4.8"/>',
  bell: '<path d="M6 10a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  user: '<circle cx="12" cy="8" r="3.4"/><path d="M4.5 20c1.2-4 4-6 7.5-6s6.3 2 7.5 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  camera: '<path d="M4 8h3l1.6-2.4h6.8L17 8h3v11H4z"/><circle cx="12" cy="13.5" r="3.4"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  check: '<path d="M5 12l5 5 9-9"/>',
  trash: '<path d="M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13"/>',
  edit: '<path d="M4 20l1-4L15 6l3 3L8 19l-4 1z"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  chev: '<path d="M9 5l7 7-7 7"/>',
  share: '<circle cx="18" cy="5" r="2"/><circle cx="6" cy="12" r="2"/><circle cx="18" cy="19" r="2"/><path d="M8 11l8-4.5M8 13l8 4.5"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  bolt: '<path d="M13 3L5 13h6l-1 8 8-11h-6z"/>',
  grad: '<path d="M12 4L21 9l-9 5-9-5z"/><path d="M7 10.5v4a5 2 0 0 0 10 0v-4"/><path d="M21 9v5.5"/><circle cx="21" cy="16" r="1" fill="currentColor" stroke="none"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.3-3.3a6 6 0 0 1-7.4 7.4L7 20l-3-3 6.6-6.6a6 6 0 0 1 7.4-7.4z"/>',
  repeat: '<path d="M4 12a8 8 0 0 1 14-5.3M20 4v5h-5"/><path d="M20 12a8 8 0 0 1-14 5.3M4 20v-5h5"/>',
  cash: '<circle cx="12" cy="12" r="9"/><path d="M12 7.3v9.4M9.4 9.6c0-1.1 1.1-1.9 2.6-1.9s2.6.7 2.6 1.7c0 2.3-5.2 1.4-5.2 3.6c0 1 1.1 1.7 2.6 1.7s2.6-.6 2.6-1.8"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6.5L12 13l8.5-6.5"/>',
  pill: '<rect x="3.5" y="9" width="17" height="7.5" rx="3.75" transform="rotate(-35 12 12.75)"/><path d="M9.8 8.4l4.8 8.7" />',
  phone: '<path d="M6.5 3.5c1 0 1.8.7 2 1.6l.7 3a2 2 0 0 1-.6 1.9l-1.3 1.2a13 13 0 0 0 5.3 5.3l1.2-1.3a2 2 0 0 1 1.9-.6l3 .7c.9.2 1.6 1 1.6 2v2a2 2 0 0 1-2.2 2C10.6 20.9 3.1 13.4 2.8 5.7A2 2 0 0 1 4.8 3.5z"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-.9-.5-1.3-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8H16a4 4 0 0 0 4-4c0-4.4-3.6-7.7-8-7.7z"/><circle cx="7.3" cy="10.8" r="1.15" fill="currentColor" stroke="none"/><circle cx="10.3" cy="7.3" r="1.15" fill="currentColor" stroke="none"/><circle cx="14.7" cy="7.7" r="1.15" fill="currentColor" stroke="none"/><circle cx="17" cy="11.3" r="1.15" fill="currentColor" stroke="none"/>',
  flask: '<path d="M9.5 3h5M10.2 3v5.7L4.9 17.8a1.8 1.8 0 0 0 1.55 2.7h11.1a1.8 1.8 0 0 0 1.55-2.7L13.8 8.7V3"/><path d="M7.8 14.5h8.4"/>',
  receipt: '<path d="M6 3h12v17l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3z"/><path d="M9 8h6M9 11.5h6M9 15h3"/>'
};

export function icon(name, cls) {
  return `<svg class="icon ${cls || ''}" viewBox="0 0 24 24">${PATHS[name] || ''}</svg>`;
}

// ---------------------------------------------------------------------------
// Logo de Memoreo: un documento con la esquina doblada (rosa magenta) y un
// punto de recordatorio (mismo rosa) — no una letra suelta metida en un
// cuadrado. Es el mismo dibujo, a escala exacta, que scripts/make_icons.py
// usa para generar los íconos PNG de la app (favicon, apple-touch-icon,
// íconos de instalación), así que la marca se ve idéntica ahí, en el
// favicon SVG (public/icons/favicon.svg) y en cualquier lugar de la propia
// interfaz que use logoMark() — un solo dibujo, un solo lugar para
// cambiarlo. El color de fondo (turquesa, en degradado) lo pone la clase
// .brand-mark en style.css, no este SVG, para poder reutilizar el mismo
// glifo sobre cualquier tamaño de mancha de color.
const LOGO_GLYPH = `<svg viewBox="0 0 100 100" width="62%" height="62%" aria-hidden="true">
  <polygon points="23.3,16.5 58.5,16.5 76.7,34.6 76.7,83.5 23.3,83.5" fill="#fff"/>
  <polygon points="58.5,16.5 76.7,34.6 58.5,34.6" fill="#C71368"/>
  <line x1="31.9" y1="51.3" x2="68.1" y2="51.3" stroke="#0EA5A6" stroke-width="4.2" stroke-linecap="round"/>
  <line x1="31.9" y1="62.1" x2="58.5" y2="62.1" stroke="#0EA5A6" stroke-width="4.2" stroke-linecap="round"/>
  <line x1="31.9" y1="72.8" x2="52.1" y2="72.8" stroke="#0EA5A6" stroke-width="4.2" stroke-linecap="round"/>
  <circle cx="28.7" cy="15.6" r="5.2" fill="#C71368"/>
</svg>`;

export function logoMark(size) {
  const s = size || 40;
  const r = Math.round(s * 0.28);
  return `<span class="brand-mark" style="width:${s}px;height:${s}px;border-radius:${r}px;">${LOGO_GLYPH}</span>`;
}
