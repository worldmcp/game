// Realtime hub: authenticated WebSocket presence + routing between users.
// Server-authoritative movement: clients send intended positions, the hub
// rejects impossible moves (speed/teleport hacks) and sends corrections.
// Interest management: each player only receives players within range.

import { WebSocketServer } from 'ws';
import { SpatialGrid } from '../src/core/spatial-grid.js';
import { DISTRICT } from '../src/config/nova-city.js';

const TICK_MS = 100;
const INTEREST_RADIUS = 160;
const MAX_SPEED = 9; // m/s (run is 6.5; generous for latency)
const BOUNDS = { x0: -DISTRICT.half - 6, x1: DISTRICT.half + 6, z0: -DISTRICT.half - 6, z1: 116 };
const PRESENCES = new Set(['Online', 'Away', 'Busy', 'Working', 'Shopping', 'Playing', 'Learning', 'Available for Work', 'Hiring', 'In Conversation', 'At Event', 'Invisible']);
const EMOTES = new Set(['wave', 'talk']);
const CLIENT_TYPES = new Set(['state', 'wave', 'hello']);

export class Hub {
  constructor({ server, auth, store, getAdapter, isUser, log }) {
    this.auth = auth;
    this.store = store;
    this.getAdapter = getAdapter;
    this.isUser = isUser;
    this.log = log;
    this.conns = new Map(); // userId -> Set<ws>
    this.players = new Map(); // userId -> state
    this.grid = new SpatialGrid(32);
    this.wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });
    this.wss.on('connection', (ws, req) => this._connect(ws, req));
    this.timer = setInterval(() => this._tick(), TICK_MS);
  }

  close() {
    clearInterval(this.timer);
    for (const id of this.players.keys()) this._savePos(id);
    this.wss.close();
  }

  _connect(ws, req) {
    const url = new URL(req.url, 'http://x');
    const user = this.auth.userFromToken(url.searchParams.get('token'));
    if (!user) {
      ws.close(4401, 'unauthorized');
      return;
    }
    ws.userId = user.id;
    this.getAdapter(user.id); // make sure the account's world state exists before others see us
    ws.bucket = { tokens: 60, at: Date.now() };
    ws.sent = new Map();
    if (!this.conns.has(user.id)) this.conns.set(user.id, new Set());
    this.conns.get(user.id).add(ws);
    let p = this.players.get(user.id);
    if (!p) {
      const saved = this.store.get(`world:pos:${user.id}`) || { x: DISTRICT.spawn.x, z: DISTRICT.spawn.z, ry: Math.PI };
      p = { id: user.id, x: saved.x, z: saved.z, ry: saved.ry, moving: false, emote: null, last: Date.now(), allow: 3, violations: 0, teleport: null, profile: this._profile(user.id) };
      this.players.set(user.id, p);
      this.grid.upsert(user.id, p.x, p.z);
    }
    clearTimeout(p.leaveTimer);
    this._send(ws, { type: 'welcome', you: { id: user.id, x: p.x, z: p.z, ry: p.ry }, online: this.onlineCount() });
    ws.on('message', (raw) => this._onMessage(ws, raw));
    ws.on('close', () => this._disconnect(ws));
    ws.on('error', () => {});
    this.log({ evt: 'ws_connect', user: user.id });
  }

  _disconnect(ws) {
    const set = this.conns.get(ws.userId);
    set?.delete(ws);
    if (set && set.size) return;
    this.conns.delete(ws.userId);
    const p = this.players.get(ws.userId);
    if (!p) return;
    this._savePos(ws.userId);
    // Grace period so a quick reload doesn't flash the player out of the world.
    p.leaveTimer = setTimeout(() => {
      if (this.conns.has(ws.userId)) return;
      this.players.delete(ws.userId);
      this.grid.remove(ws.userId);
    }, 4000);
    this.log({ evt: 'ws_disconnect', user: ws.userId });
  }

  _savePos(id) {
    const p = this.players.get(id);
    if (p) this.store.set(`world:pos:${id}`, { x: +p.x.toFixed(2), z: +p.z.toFixed(2), ry: +p.ry.toFixed(2) });
  }

  _profile(id) {
    const st = this.store.get(`pludor-demo:user:${id}`);
    const pr = st?.profile || {};
    return {
      handle: pr.handle, displayName: pr.displayName, color: pr.color, presence: PRESENCES.has(pr.presence) ? pr.presence : 'Online',
      roles: pr.roles || [], bio: pr.bio || '', avatar: pr.avatar || null, look: pr.look || null,
    };
  }

  refreshProfile(id) {
    const p = this.players.get(id);
    if (p) p.profile = this._profile(id);
  }

  _rate(ws) {
    const now = Date.now();
    const b = ws.bucket;
    b.tokens = Math.min(60, b.tokens + ((now - b.at) / 1000) * 30);
    b.at = now;
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  }

  _onMessage(ws, raw) {
    if (!this._rate(ws)) return;
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object' || !CLIENT_TYPES.has(msg.type)) return;
    const id = ws.userId;
    if (msg.type === 'state') return this._move(ws, id, msg);
    if (msg.type === 'hello') return this._send(ws, { type: 'online', online: this.onlineCount() });
    if (msg.type === 'wave' && typeof msg.to === 'string' && this.isUser(msg.to)) {
      this.route(id, { type: 'wave', to: msg.to });
    }
  }

  _move(ws, id, msg) {
    const p = this.players.get(id);
    const x = Number(msg.x);
    const z = Number(msg.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    const now = Date.now();
    const dt = Math.max(0, (now - p.last) / 1000);
    const d = Math.hypot(x - p.x, z - p.z);
    // Distance budget refills at MAX_SPEED in real time (capped), so sending
    // messages faster never buys extra movement.
    p.allow = Math.min(3, p.allow + MAX_SPEED * dt);
    const tp = p.teleport && p.teleport.until > now && Math.hypot(x - p.teleport.x, z - p.teleport.z) < 6;
    const out = x < BOUNDS.x0 || x > BOUNDS.x1 || z < BOUNDS.z0 || z > BOUNDS.z1;
    if (out || (!tp && d > p.allow)) {
      p.violations += 1;
      if (p.violations % 10 === 1) this.log({ evt: 'move_rejected', user: id, d: +d.toFixed(1), dt: +dt.toFixed(2) });
      this._send(ws, { type: 'correction', x: p.x, z: p.z });
      p.last = now;
      return;
    }
    if (tp) p.teleport = null;
    else p.allow -= d;
    p.x = x;
    p.z = z;
    p.ry = Number.isFinite(Number(msg.ry)) ? Number(msg.ry) : p.ry;
    p.moving = !!msg.moving;
    p.emote = EMOTES.has(msg.emote) ? msg.emote : null;
    // Which building interior the player is in (interiors share the world's x/z).
    p.inside = typeof msg.inside === 'string' && /^[a-z0-9:_-]{1,48}$/.test(msg.inside) ? msg.inside : null;
    p.last = now;
    this.grid.upsert(id, x, z);
  }

  allowTeleport(id, dest) {
    const p = this.players.get(id);
    if (p) p.teleport = { x: dest.x, z: dest.z, until: Date.now() + 8000 };
  }

  position(id) {
    const p = this.players.get(id);
    return p ? { x: p.x, z: p.z } : null;
  }

  // Players this viewer may see (respects Invisible and blocks).
  visibleTo(viewerId, x, z, r = INTEREST_RADIUS) {
    const viewer = this.store.get(`pludor-demo:user:${viewerId}`);
    const blocked = new Set(viewer?.relationships?.blocked || []);
    return this.grid.query(x, z, r).filter((it) => {
      if (it.id === viewerId || blocked.has(it.id)) return false;
      const p = this.players.get(it.id);
      if (!p || p.profile.presence === 'Invisible') return false;
      const theirs = this.store.get(`pludor-demo:user:${it.id}`);
      return !(theirs?.relationships?.blocked || []).includes(viewerId);
    }).map((it) => this.players.get(it.id));
  }

  _tick() {
    for (const [id, sockets] of this.conns) {
      const me = this.players.get(id);
      if (!me) continue;
      const vis = this.visibleTo(id, me.x, me.z);
      const states = vis.map((p) => ({ id: p.id, x: +p.x.toFixed(2), z: +p.z.toFixed(2), ry: +p.ry.toFixed(2), moving: p.moving, emote: p.emote, inside: p.inside || null, profile: p.profile }));
      for (const ws of sockets) this._send(ws, { type: 'states', players: states, online: this.onlineCount() });
    }
  }

  // Server-side transport used by each user's adapter.
  transportFor(userId) {
    const hub = this;
    return {
      handlers: new Set(),
      send(msg) {
        if (msg && typeof msg.to === 'string') hub.route(userId, msg);
      },
      onMessage(fn) {
        this.handlers.add(fn);
      },
      getPeer(id) {
        const p = hub.players.get(id);
        if (!p) return null;
        return { id, ...p.profile, x: p.x, z: p.z };
      },
    };
  }

  route(fromId, msg) {
    if (!this.isUser(msg.to)) return;
    const target = this.getAdapter(msg.to);
    for (const fn of target.transport.handlers) fn({ ...msg, from: fromId });
  }

  pushEvent(userId, evt) {
    for (const ws of this.conns.get(userId) || []) this._send(ws, { type: 'event', evt });
  }

  onlineCount() {
    return this.conns.size;
  }

  _send(ws, obj) {
    if (ws.readyState === 1) ws.send(JSON.stringify(obj));
  }
}
