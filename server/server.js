// Pludor World sandbox server.
//
// Serves the client and implements the World adapter contract over HTTP
// (POST /api/rpc/<namespace>.<method>) plus realtime presence over WebSocket.
// All state is server-authoritative. This is the reference implementation
// the production Pludor backend replaces (see INTEGRATION.md): the client is
// identical whether it talks to this server or to Pludor.
//
// Env: PORT (8090) · DATA_DIR (.data) · ADMIN_USERS (comma list) · NODE_ENV

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { FileStore, AuditLog } from './store.js';
import { Auth, AuthError } from './auth.js';
import { Hub } from './hub.js';
import { DemoPludorAdapter } from '../src/pludor/demo-adapter.js';
import { CONTRACT, CLIENT_REPORTABLE_EVENTS } from '../src/pludor/contract.js';
import { PLACES, PARCELS, entrancePoint, DISTRICT } from '../src/config/nova-city.js';
import { EVENTS } from '../src/pludor/demo-data.js';
import * as DEMO_DATA from '../src/pludor/demo-data.js';
import { localizeWorld } from '../src/config/locale.js';
import { WORLD } from '../src/config/nova-city.js';

// One shared city per deployment, named for its country (WORLD_COUNTRY=NG → Neo Lagos).
localizeWorld({ country: process.env.WORLD_COUNTRY || null, copy: [DEMO_DATA.QUESTS, DEMO_DATA.BOT_REPLIES, DEMO_DATA.EVENTS, DEMO_DATA.GIGS, DEMO_DATA.COURSES, DEMO_DATA.TRIVIA, DEMO_DATA.BUSINESSES, DEMO_DATA.COMMUNITIES, DEMO_DATA.RESIDENTS] });

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

// Conversational characters: with ANTHROPIC_API_KEY set, residents and
// passers-by talk through Claude (production swaps in Pludor AI).
const AI_KEY = process.env.ANTHROPIC_API_KEY || '';
const AI_MODEL = process.env.WORLD_AI_MODEL || 'claude-haiku-4-5-20251001';
const aiLlm = AI_KEY
  ? async (turns) => {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': AI_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: AI_MODEL, max_tokens: 300, messages: turns }),
    });
    if (!r.ok) throw new Error(`AI ${r.status}`);
    const j = await r.json();
    return (j.content || []).map((c) => c.text || '').join('').trim();
  }
  : null;

function validTurns(turns) {
  if (!Array.isArray(turns) || !turns.length || turns.length > 24) return null;
  const out = turns.map((t) => ({ role: t?.role === 'assistant' ? 'assistant' : 'user', content: String(t?.content || '').slice(0, 4000) })).filter((t) => t.content);
  return out.length && out[0].role === 'user' && out[out.length - 1].role === 'user' ? out : null;
}
const STATIC_DIRS = ['src/', 'vendor/', 'assets/', 'styles/'];
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.glb': 'model/gltf-binary', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const RPC = new Set(Object.entries(CONTRACT).flatMap(([ns, ms]) => ms.map((m) => `${ns}.${m}`)));
// Economic / state-changing calls: idempotent + audited.
const MUTATING = new Set(['orders.accept', 'orders.reject', 'orders.ready', 'orders.cancel', 'orders.collect', 'delivery.accept', 'delivery.pickup', 'delivery.dropoff', 'business.addProduct', 'business.removeProduct', 'business.setBrand', 'commerce.createListing', 'commerce.checkout', 'commerce.book', 'commerce.buyListing', 'work.createGig', 'work.apply', 'work.submit', 'work.hire', 'work.approve', 'land.rent', 'land.openBusiness', 'shop.buyVirtual', 'radio.promote', 'ads.bookPlacement', 'events.buyTicket', 'events.attend', 'business.claim', 'business.feedback', 'games.submitGame', 'world.collectToken', 'learning.completeCourse', 'social.report', 'social.addFriend', 'social.block', 'messaging.send', 'voice.requestCall']);
const STATUS = { own_gig: 409, not_found: 404, forbidden: 403, insufficient_funds: 402, duplicate: 409, taken: 409, pending: 409, already_claimed: 409, sold: 409, closed: 409, cooldown: 429, too_far: 409, not_live: 409, ticket_required: 402, inactive: 409, limit: 409, not_wired: 501 };

export function createWorldServer({ dataDir = join(ROOT, '.data'), admins = [], quiet = false } = {}) {
  const store = new FileStore(dataDir);
  const audit = new AuditLog(dataDir);
  const auth = new Auth(store, { admins });
  const log = (o) => quiet || console.log(JSON.stringify({ ts: new Date().toISOString(), ...o }));
  const adapters = new Map();
  const idem = new Map(); // `${user}|${key}` -> { at, status, body }
  const buckets = new Map();
  let hub;

  const isUser = (id) => typeof id === 'string' && !!store.get(`auth:id:${id}`);
  const getAdapter = (userId) => {
    if (adapters.has(userId)) return adapters.get(userId);
    const uname = store.get(`auth:id:${userId}`);
    const u = auth.publicUser(store.get(`auth:user:${uname}`));
    const transport = hub.transportFor(userId);
    const a = new DemoPludorAdapter({ user: { id: u.id, handle: u.handle, displayName: u.displayName, color: u.color }, storage: store, transport, llm: aiLlm });
    a.transport = transport;
    a.subscribe((evt) => hub.pushEvent(userId, evt));
    adapters.set(userId, a);
    return a;
  };

  const rate = (key, cap, perSec) => {
    const now = Date.now();
    const b = buckets.get(key) || { tokens: cap, at: now };
    b.tokens = Math.min(cap, b.tokens + ((now - b.at) / 1000) * perSec);
    b.at = now;
    buckets.set(key, b);
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  };

  const send = (res, status, body, headers = {}) => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers });
    res.end(JSON.stringify(body));
  };

  const readJson = (req) => new Promise((ok, fail) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size <= 64 * 1024) chunks.push(c);
    });
    req.on('end', () => {
      if (size > 64 * 1024) return fail(Object.assign(new Error('Request too large.'), { status: 413 }));
      if (!chunks.length) return ok({});
      try {
        ok(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        fail(Object.assign(new Error('Malformed JSON.'), { status: 400 }));
      }
    });
    req.on('error', fail);
  });

  const bearer = (req) => (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || null;

  // Pre/post hooks: replace client-claimed facts with server-known ones.
  async function callRpc(user, name, args) {
    const [ns, m] = name.split('.');
    const a = getAdapter(user.id);
    if (name === 'gamification.track' && !CLIENT_REPORTABLE_EVENTS.has(args[0])) {
      throw Object.assign(new Error(`${args[0]} is server-emitted only.`), { code: 'forbidden' });
    }
    if (name === 'world.collectToken') args[1] = hub.position(user.id);
    // Physical steps of the supply chain use the server's position.
    if (['delivery.pickup', 'delivery.dropoff', 'orders.collect'].includes(name)) args[1] = hub.position(user.id);
    if (name === 'work.submit') args[2] = hub.position(user.id);
    if (name === 'commerce.checkout' && args[0] && typeof args[0] === 'object') {
      const home = Object.entries(store.get('pludor-demo:world')?.parcels || {}).find(([, p]) => p.tenantId === user.id && p.template === 'home');
      const hp = home && PARCELS.find((p) => p.id === home[0]);
      args[0].deliverTo = hp ? { x: hp.x, z: hp.z - hp.d / 2 - 2 } : hub.position(user.id);
    }
    if (name === 'work.createGig' && args[0] && typeof args[0] === 'object' && args[0].onSite) args[0].location = hub.position(user.id);
    if (name === 'events.attend') {
      const ev = EVENTS.find((e) => e.id === args[0]);
      const place = ev && PLACES.find((p) => p.id === ev.placeId);
      const venue = place ? entrancePoint(place) : { x: 0, z: 12 };
      const pos = hub.position(user.id);
      if (!pos || Math.hypot(pos.x - venue.x, pos.z - venue.z) > 30) throw Object.assign(new Error('Head to the venue to check in.'), { code: 'too_far' });
    }
    if (name === 'ai.ask' || name === 'ai.askAgent') {
      const ctx = args[1] && typeof args[1] === 'object' ? args[1] : {};
      const pos = hub.position(user.id) || DISTRICT.spawn;
      ctx.player = pos;
      ctx.players = hub.visibleTo(user.id, pos.x, pos.z).map((p) => ({ id: p.id, name: p.profile.handle, x: p.x, z: p.z, presence: p.profile.presence }));
      args[1] = ctx;
    }
    const out = await a[ns][m](...args);
    if (name === 'world.worldRide') {
      const place = PLACES.find((p) => p.id === args[0]);
      hub.allowTeleport(user.id, place ? entrancePoint(place, 3.5) : { x: 0, z: 9 });
    }
    if (name === 'identity.updateProfile' || name === 'shop.buyVirtual') hub.refreshProfile(user.id);
    return out;
  }

  // One authorised, validated, audited, idempotent contract call.
  async function execute(user, name, rawArgs, key) {
    const idk = MUTATING.has(name) && typeof key === 'string' && key.length <= 80 ? `${user.id}|${name}|${key}` : null;
    if (idk && idem.has(idk)) return { ...idem.get(idk), replay: true };
    const args = Array.isArray(rawArgs) ? rawArgs.slice(0, 4) : [];
    let status = 200;
    let out;
    try {
      out = { ok: true, data: await callRpc(user, name, args) };
    } catch (err) {
      if (err.code) {
        status = STATUS[err.code] || 400;
        out = { ok: false, code: err.code, message: err.message };
      } else {
        const id = randomUUID();
        log({ evt: 'rpc_error', id, name, user: user.id, error: err.message, stack: err.stack?.split('\n').slice(0, 3).join(' | ') });
        status = 500;
        out = { ok: false, code: 'internal', message: `Something went wrong (ref ${id.slice(0, 8)}).` };
      }
    }
    if (MUTATING.has(name)) audit.write({ evt: 'rpc', name, user: user.id, status, args: name === 'messaging.send' ? [args[0]] : args });
    if (idk) {
      idem.set(idk, { at: Date.now(), status, out });
      if (idem.size > 5000) for (const [k, v] of idem) if (Date.now() - v.at > 600000) idem.delete(k);
    }
    return { status, out };
  }

  async function handleApi(req, res, url) {
    const ip = req.socket.remoteAddress;
    const path = url.pathname;
    if (path === '/api/health') return send(res, 200, { ok: true, mode: 'sandbox', ts: Date.now(), world: { name: WORLD.name, country: WORLD.country || null } });
    if (path === '/api/stats') return send(res, 200, { online: hub.onlineCount() });
    if (path === '/api/auth/signup' || path === '/api/auth/login') {
      if (req.method !== 'POST') return send(res, 405, { code: 'method', message: 'POST only.' });
      if (!rate(`auth:${ip}`, 10, 0.2)) return send(res, 429, { code: 'rate_limited', message: 'Too many attempts. Try again shortly.' });
      const body = await readJson(req);
      const r = path.endsWith('signup') ? auth.signup(body.username, body.password) : auth.login(body.username, body.password);
      audit.write({ evt: path.endsWith('signup') ? 'signup' : 'login', user: r.user.id, ip });
      return send(res, 200, r);
    }
    const user = auth.userFromToken(bearer(req));
    if (!user) return send(res, 401, { code: 'unauthorized', message: 'Sign in to continue.' });
    if (path === '/api/auth/logout') {
      auth.logout(bearer(req));
      audit.write({ evt: 'logout', user: user.id });
      return send(res, 200, { ok: true });
    }
    if (path === '/api/auth/me') return send(res, 200, { user });
    if (path === '/api/ai/chat') {
      if (!aiLlm) return send(res, 503, { code: 'ai_unavailable', message: 'AI characters are not configured on this server.' });
      if (!rate(`ai:${user.id}`, 20, 0.5)) return send(res, 429, { code: 'rate_limited', message: 'Give them a second to think.' });
      const turns = validTurns((await readJson(req)).turns);
      if (!turns) return send(res, 400, { code: 'invalid', message: 'Bad conversation.' });
      try {
        return send(res, 200, { text: (await aiLlm(turns)).slice(0, 1200) });
      } catch {
        return send(res, 502, { code: 'ai_error', message: 'They seem distracted — try again.' });
      }
    }
    if (path === '/api/admin/overview') {
      if (!user.roles.includes('admin')) return send(res, 403, { code: 'forbidden', message: 'Admins only.' });
      const world = store.get('pludor-demo:world') || {};
      return send(res, 200, { users: store.keys('auth:user:').length, online: hub.onlineCount(), treasury: world.treasury || { total: 0, byType: {} }, orders: Object.keys(world.chainOrders || {}).length, reports: world.reports || [], audit: audit.recent.slice(-100) });
    }
    const m = path.match(/^\/api\/rpc\/([a-z]+\.[a-zA-Z]+)$/);
    if (m) {
      if (req.method !== 'POST') return send(res, 405, { code: 'method', message: 'POST only.' });
      if (!RPC.has(m[1])) return send(res, 404, { code: 'not_found', message: 'Unknown action.' });
      if (!rate(`rpc:${user.id}`, 120, 40)) return send(res, 429, { code: 'rate_limited', message: 'Slow down a little.' });
      const body = await readJson(req);
      const r = await execute(user, m[1], body.args, req.headers['idempotency-key']);
      return send(res, r.status, r.out, r.replay ? { 'idempotent-replay': 'true' } : {});
    }
    // Batch: the client coalesces calls made in the same tick into one request.
    if (path === '/api/rpc-batch') {
      if (req.method !== 'POST') return send(res, 405, { code: 'method', message: 'POST only.' });
      const body = await readJson(req);
      const calls = Array.isArray(body.calls) ? body.calls : [];
      if (!calls.length || calls.length > 25) return send(res, 400, { code: 'bad_request', message: 'Send 1–25 calls.' });
      const results = [];
      for (const c of calls) {
        if (!c || typeof c.name !== 'string' || !RPC.has(c.name)) {
          results.push({ status: 404, out: { ok: false, code: 'not_found', message: 'Unknown action.' } });
          continue;
        }
        if (!rate(`rpc:${user.id}`, 120, 40)) {
          results.push({ status: 429, out: { ok: false, code: 'rate_limited', message: 'Slow down a little.' } });
          continue;
        }
        results.push(await execute(user, c.name, c.args, c.key));
      }
      return send(res, 200, { results: results.map((r) => ({ status: r.status, ...r.out })) });
    }
    return send(res, 404, { code: 'not_found', message: 'Not found.' });
  }

  async function serveStatic(req, res, url) {
    let p = decodeURIComponent(url.pathname);
    if (p === '/') p = '/index.html';
    const rel = normalize(p).replace(/^[/\\]+/, '');
    if (rel !== 'index.html' && !STATIC_DIRS.some((d) => rel.startsWith(d))) return send(res, 404, { code: 'not_found', message: 'Not found.' });
    const file = join(ROOT, rel);
    if (!file.startsWith(ROOT)) return send(res, 403, { code: 'forbidden', message: 'Forbidden.' });
    try {
      const st = await stat(file);
      if (!st.isFile()) throw new Error('nf');
      const data = await readFile(file);
      res.writeHead(200, {
        'content-type': MIME[extname(file)] || 'application/octet-stream',
        'cache-control': rel.startsWith('assets/') || rel.startsWith('vendor/') ? 'public, max-age=86400' : 'no-cache',
        'x-content-type-options': 'nosniff',
      });
      res.end(data);
    } catch {
      send(res, 404, { code: 'not_found', message: 'Not found.' });
    }
  }

  const server = createServer(async (req, res) => {
    const t0 = Date.now();
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
      else await serveStatic(req, res, url);
    } catch (err) {
      if (err instanceof AuthError || err.status) send(res, err.status || 400, { code: 'bad_request', message: err.message });
      else {
        log({ evt: 'http_error', path: url.pathname, error: err.message });
        send(res, 500, { code: 'internal', message: 'Something went wrong.' });
      }
    }
    if (url.pathname.startsWith('/api/')) log({ evt: 'http', method: req.method, path: url.pathname, status: res.statusCode, ms: Date.now() - t0 });
  });
  hub = new Hub({ server, auth, store, getAdapter, isUser, log });

  return {
    server,
    hub,
    store,
    listen(port) {
      return new Promise((r) => server.listen(port, () => r(server.address().port)));
    },
    async close() {
      hub.close();
      store.flush();
      await new Promise((r) => server.close(r));
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = createWorldServer({ dataDir: process.env.DATA_DIR || join(ROOT, '.data'), admins: (process.env.ADMIN_USERS || '').split(',').filter(Boolean) });
  const port = await app.listen(Number(process.env.PORT || 8090));
  console.log(JSON.stringify({ evt: 'listening', port, mode: 'sandbox' }));
  const stop = async () => {
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
