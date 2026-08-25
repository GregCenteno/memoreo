import './style.css';
import './admin.css';
import { registerSW } from 'virtual:pwa-register';
import { initApp } from './app.js';

// Auto-update the service worker in the background; no user-facing prompt
// needed for this MVP, but this is where you'd surface an "update available"
// toast in a later version.
registerSW({ immediate: true });

initApp(document.getElementById('app'));
