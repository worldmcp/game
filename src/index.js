// Public entry point for embedding Pludor World inside the Pludor app.
//
//   import { mountPludorWorld } from './src/index.js';
//   const world = await mountPludorWorld(el, { adapter, transport, me, flags });
//
// `adapter`   – object implementing src/pludor/contract.js (HttpPludorAdapter
//               in production, DemoPludorAdapter for the standalone demo).
// `transport` – realtime presence transport (see src/net/presence.js).
// `me`        – { id, handle, displayName, color, skin } from the host session.
// `flags`     – feature flags (see src/config/flags.js).

import { DEFAULT_FLAGS } from './config/flags.js';
import { assertAdapter } from './pludor/contract.js';
import { WorldApp } from './app/world-app.js';

export { DemoPludorAdapter, browserStorage, memoryStorage } from './pludor/demo-adapter.js';
export { HttpPludorAdapter, ENDPOINTS } from './pludor/http-adapter.js';
export { LocalPresenceTransport, resolveGuestIdentity } from './net/presence.js';
export { resolveFlags, DEFAULT_FLAGS } from './config/flags.js';
export { CONTRACT, CLIENT_REPORTABLE_EVENTS } from './pludor/contract.js';
export { EV as WORLD_EVENTS } from './core/events.js';

// `llm`       – optional (turns, {onText, signal}) => text for conversational
//               characters (Pludor AI in production). See core/llm.js.
export async function mountPludorWorld(el, { adapter, transport = null, me, flags = DEFAULT_FLAGS, spawn = null, mode = 'embedded', llm = null } = {}) {
  assertAdapter(adapter);
  if (!flags.WORLD_ENABLED) {
    el.innerHTML = '<div class="pw-root"><div class="pw-loading"><div class="pw-loading-box"><h1>PLUDOR <span>WORLD</span></h1><small>World is not available right now.</small></div></div></div>';
    return null;
  }
  el.innerHTML = `<div class="pw-root"><canvas class="pw-canvas" tabindex="0" aria-label="Pludor World — 3D city"></canvas>
    <div class="pw-loading"><div class="pw-loading-box"><div class="pw-logo">P</div><h1>PLUDOR <span>WORLD</span></h1><div class="pw-loading-bar"><i></i></div><small class="pw-loading-msg">Loading…</small></div></div></div>`;
  const root = el.querySelector('.pw-root');
  const bar = root.querySelector('.pw-loading-bar i');
  const msg = root.querySelector('.pw-loading-msg');
  const app = new WorldApp(root, { api: adapter, transport, flags, me, spawn, mode, llm });
  await app.start((p, text) => {
    bar.style.width = `${Math.round(p * 100)}%`;
    msg.textContent = text;
  });
  const loading = root.querySelector('.pw-loading');
  loading.classList.add('done');
  setTimeout(() => loading.remove(), 700);
  return app;
}
