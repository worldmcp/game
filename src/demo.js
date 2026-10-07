// Bootstrap.
//  · Online (World server reachable at /api): sign in with one account,
//    server-authoritative adapter over HTTP, multiplayer over WebSocket.
//  · Offline demo (static hosting, e.g. GitHub Pages): in-browser demo
//    adapter, tab-to-tab presence, clearly labelled as local-only.
// Inside the Pludor app the host calls mountPludorWorld() directly with its
// own session token and adapter (see INTEGRATION.md).
//
// URL params: ?offline=1 force offline · ?hour=10 shift world clock (offline)
//             ?quality=low|medium|high · ?flags=-WORLD_ADS_ENABLED,...
//             ?as=<name> & ?reset=1 (offline demo only)

import { ECONOMY } from './config/economy.js';
import { worldTimeAt } from './core/world-time.js';
import { mountPludorWorld, DemoPludorAdapter, HttpPludorAdapter, browserStorage, LocalPresenceTransport, resolveGuestIdentity, resolveFlags } from './index.js';
import { WsPresenceTransport } from './net/ws-transport.js';
import { localizeWorld, detectCountry } from './config/locale.js';
import * as DEMO_DATA from './pludor/demo-data.js';

const params = new URLSearchParams(location.search);
const flags = resolveFlags(location.search);
const el = document.getElementById('world');
const TOKEN_KEY = 'pludor-world-token';
const store = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (t) => {
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* private mode */
    }
  },
};

if (params.has('hour')) {
  const want = Number(params.get('hour'));
  const now = worldTimeAt(Date.now(), ECONOMY.time).hoursF;
  ECONOMY.time.epochHour = (((ECONOMY.time.epochHour + want - now) % 24) + 24) % 24;
}

function webglOk() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

function fatal(msg) {
  el.innerHTML = `<div class="pw-root"><div class="pw-loading"><div class="pw-loading-box"><div class="pw-logo">P</div><h1>PLUDOR <span>WORLD</span></h1><small>${msg}</small></div></div></div>`;
}

// The city is named after the main city of the player's country (or of the
// deployment, when the server pins WORLD_COUNTRY so everyone shares one city).
let serverCountry = null;
function localize() {
  let saved = null;
  try {
    saved = localStorage.getItem('pw-country');
  } catch {
    /* storage blocked */
  }
  const country = serverCountry || detectCountry({ override: params.get('country') || saved });
  localizeWorld({ country, copy: [DEMO_DATA.QUESTS, DEMO_DATA.BOT_REPLIES, DEMO_DATA.EVENTS, DEMO_DATA.GIGS, DEMO_DATA.COURSES, DEMO_DATA.TRIVIA, DEMO_DATA.BUSINESSES, DEMO_DATA.COMMUNITIES, DEMO_DATA.RESIDENTS].filter(Boolean) });
}

async function serverMode() {
  if (params.has('offline')) return false;
  try {
    const r = await fetch('/api/health', { cache: 'no-store' });
    const j = r.ok ? await r.json() : null;
    if (j?.world?.country) serverCountry = j.world.country;
    return j?.ok === true;
  } catch {
    return false;
  }
}

function banner(text, tone = 'info') {
  let b = document.getElementById('pw-conn');
  if (!text) {
    b?.remove();
    return;
  }
  if (!b) {
    b = document.createElement('div');
    b.id = 'pw-conn';
    document.body.appendChild(b);
  }
  b.className = `pw-conn ${tone}`;
  b.textContent = text;
}

// ───────── sign in / sign up ─────────
function authScreen() {
  return new Promise((resolve) => {
    el.innerHTML = `<div class="pw-root"><div class="pw-auth"><form class="pw-auth-box">
      <div class="pw-logo">P</div><h1>PLUDOR <span>WORLD</span></h1>
      <p class="pw-muted">One Pludor account — your profile, wallet, messages and progress, everywhere.</p>
      <div class="pw-seg"><button type="button" class="on" data-mode="login">Sign in</button><button type="button" data-mode="signup">Create account</button></div>
      <label>Username<input name="username" autocomplete="username" required minlength="3" maxlength="20" pattern="[A-Za-z0-9_]+"></label>
      <label>Password<input name="password" type="password" autocomplete="current-password" required minlength="8"></label>
      <p class="pw-auth-err" role="alert"></p>
      <button class="pw-btn" type="submit">Enter the world</button>
    </form></div></div>`;
    const form = el.querySelector('form');
    let mode = 'login';
    form.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => {
      mode = b.dataset.mode;
      form.querySelectorAll('[data-mode]').forEach((x) => x.classList.toggle('on', x === b));
      form.password.autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
    }));
    form.onsubmit = async (e) => {
      e.preventDefault();
      const err = form.querySelector('.pw-auth-err');
      err.textContent = '';
      const btn = form.querySelector('button[type=submit]');
      btn.disabled = true;
      try {
        const r = await fetch(`/api/auth/${mode}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: form.username.value.trim(), password: form.password.value }) });
        const body = await r.json();
        if (!r.ok) throw new Error(body.message || 'Could not sign in.');
        store.set(body.token);
        resolve(body.user);
      } catch (ex) {
        err.textContent = ex.message;
        btn.disabled = false;
      }
    };
  });
}

async function currentUser() {
  const token = store.get();
  if (!token) return null;
  try {
    const r = await fetch('/api/auth/me', { headers: { authorization: `Bearer ${token}` } });
    if (r.status === 401) {
      store.set(null);
      return null;
    }
    return r.ok ? (await r.json()).user : null;
  } catch {
    return null;
  }
}

async function logout() {
  const token = store.get();
  try {
    await fetch('/api/auth/logout', { method: 'POST', headers: { authorization: `Bearer ${token}` } });
  } catch {
    /* offline: still clear locally */
  }
  store.set(null);
  location.reload();
}

async function bootOnline() {
  const user = (await currentUser()) || (await authScreen());
  const adapter = new HttpPludorAdapter({ apiBase: '/api', rpc: true, getToken: () => store.get(), onUnauthorized: () => logout() });
  const wsUrl = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  const transport = new WsPresenceTransport({
    url: wsUrl,
    getToken: () => store.get(),
    onEvent: (evt) => adapter.emit(evt),
    onStatus: (s) => {
      if (s === 'online') banner(null);
      else if (s === 'reconnecting') banner('Connection lost — reconnecting…', 'warn');
      else if (s === 'unauthorized') logout();
    },
  });
  const spawn = await Promise.race([transport.ready, new Promise((r) => setTimeout(() => r(null), 8000))]);
  const me = { id: user.id, handle: user.handle, displayName: user.displayName, color: user.color, skin: '#c68642' };
  const app = await mountPludorWorld(el, { adapter, transport, me, flags, spawn, mode: 'online' });
  if (app) app.logout = logout;
  window.pludorWorld = app;
}

async function bootOffline() {
  if (params.get('reset')) {
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith('pludor-demo:')) localStorage.removeItem(k);
      sessionStorage.clear();
    } catch {
      /* ignore */
    }
  }
  const me = resolveGuestIdentity(location.search, window.sessionStorage);
  const transport = flags.WORLD_MULTIPLAYER_ENABLED ? new LocalPresenceTransport({ self: me }) : null;
  const adapter = new DemoPludorAdapter({ user: me, storage: browserStorage(window.localStorage, window), transport });
  const app = await mountPludorWorld(el, { adapter, transport, me, flags, mode: 'offline' });
  window.pludorWorld = app;
  banner('Offline demo · progress is saved in this browser only', 'info');
  setTimeout(() => banner(null), 6000);
}

if (!webglOk()) fatal('Your browser needs WebGL to enter the world.');
else {
  (async () => {
    try {
      const online = await serverMode();
      localize();
      if (online) await bootOnline();
      else await bootOffline();
    } catch (err) {
      console.error(err);
      banner(`World failed to load: ${err.message}`, 'error');
    }
  })();
}
