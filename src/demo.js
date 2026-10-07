// Standalone demo bootstrap: guest identity + DemoPludorAdapter + tab-to-tab
// multiplayer. Inside the Pludor app, the host calls mountPludorWorld() with
// its real session, HttpPludorAdapter and realtime transport instead.
//
// URL params:  ?as=<name>      play as a named guest (resumes their state)
//              ?flags=-WORLD_ADS_ENABLED,...   toggle feature flags
//              ?reset=1        wipe local demo data

import { ECONOMY } from './config/economy.js';
import { worldTimeAt } from './core/world-time.js';
import { mountPludorWorld, DemoPludorAdapter, browserStorage, LocalPresenceTransport, resolveGuestIdentity, resolveFlags } from './index.js';

const params = new URLSearchParams(location.search);
if (params.get('reset')) {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('pludor-demo:')) localStorage.removeItem(k);
    sessionStorage.clear();
  } catch {
    /* ignore */
  }
}

// ?hour=10 shifts the shared world clock (handy for demos and testing).
if (params.has('hour')) {
  const want = Number(params.get('hour'));
  const now = worldTimeAt(Date.now(), ECONOMY.time).hoursF;
  ECONOMY.time.epochHour = (((ECONOMY.time.epochHour + want - now) % 24) + 24) % 24;
}

const me = resolveGuestIdentity(location.search, window.sessionStorage);
const flags = resolveFlags(location.search);
const transport = flags.WORLD_MULTIPLAYER_ENABLED ? new LocalPresenceTransport({ self: me }) : null;
const adapter = new DemoPludorAdapter({ user: me, storage: browserStorage(window.localStorage, window), transport });

function webglOk() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

const el = document.getElementById('world');
if (!webglOk()) {
  el.innerHTML = '<div class="pw-root"><div class="pw-loading"><div class="pw-loading-box"><div class="pw-logo">P</div><h1>PLUDOR <span>WORLD</span></h1><small>Your browser needs WebGL to enter the world.</small></div></div></div>';
} else {
  mountPludorWorld(el, { adapter, transport, me, flags }).then((app) => {
    window.pludorWorld = app; // handy for debugging / automated tests
  }).catch((err) => {
    console.error(err);
    el.insertAdjacentHTML('beforeend', `<div style="position:fixed;left:12px;bottom:12px;color:#fff;background:#b00;padding:8px 12px;border-radius:8px;font:13px system-ui;z-index:99">World failed to load: ${String(err.message).replace(/</g, '&lt;')}</div>`);
  });
}
