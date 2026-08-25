import './style.css';
import './admin.css';
import { registerSW } from 'virtual:pwa-register';
import { initApp } from './app.js';

// El service worker deja la app instalable y funcionando sin conexión, pero
// eso mismo hace que un deploy nuevo en Netlify no se note solo: el
// navegador puede seguir sirviendo el paquete viejo desde su caché hasta
// que alguien cierre y reabra la pestaña de verdad. onNeedRefresh() se
// dispara en cuanto detecta un service worker nuevo (lo que ya pasa solo,
// sin que la persona haga nada) — updateSW(true) lo activa y recarga la
// página una sola vez para que el cambio se vea de inmediato, en vez de
// quedarse esperando a la siguiente vez que alguien cierre el navegador.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    updateSW(true);
  }
});

initApp(document.getElementById('app'));
