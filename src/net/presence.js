// Multiplayer presence transport.
//
// LocalPresenceTransport uses BroadcastChannel, so every tab/window of this
// origin is a real, separate player in the same world (good for demos and
// tests). Production swaps in a WebSocket transport to Pludor's realtime
// service with the same interface:
//   publishState(state) · send(msg) · onMessage(fn) · onPeers(fn)
//   getPeer(id) · peers() · stop()
// Messaging/voice payloads only travel through this transport in the demo;
// in production they go through existing Pludor messaging/voice and this
// layer carries position/presence only.

const PEER_TIMEOUT_MS = 6000;

export class LocalPresenceTransport {
  constructor({ self, channelName = 'pludor-world-v1' }) {
    this.self = self;
    this.selfId = self.id;
    this.peerMap = new Map();
    this.msgHandlers = new Set();
    this.peerHandlers = new Set();
    this.channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(channelName) : null;
    this.channel?.addEventListener('message', (e) => this._receive(e.data));
    this.sweep = setInterval(() => this._expire(), 2000);
    addEventListener('pagehide', () => this.stop());
  }

  get available() {
    return !!this.channel;
  }

  _receive(msg) {
    if (!msg || typeof msg !== 'object' || msg.from === this.selfId || typeof msg.from !== 'string') return;
    if (msg.type === 'state') {
      const isNew = !this.peerMap.has(msg.from);
      const p = msg.profile || {};
      this.peerMap.set(msg.from, {
        id: msg.from,
        handle: String(p.handle || 'player').slice(0, 24),
        displayName: String(p.displayName || 'Player').slice(0, 24),
        color: /^#[0-9a-f]{6}$/i.test(p.color) ? p.color : '#888888',
        skin: /^#[0-9a-f]{6}$/i.test(p.skin) ? p.skin : '#c68642',
        presence: String(p.presence || 'Online').slice(0, 24),
        roles: Array.isArray(p.roles) ? p.roles.slice(0, 6).map((r) => String(r).slice(0, 24)) : [],
        bio: String(p.bio || '').slice(0, 140),
        avatar: /^[a-z0-9_]{3,40}$/.test(p.avatar) ? p.avatar : null,
        x: Number(msg.x) || 0,
        z: Number(msg.z) || 0,
        ry: Number(msg.ry) || 0,
        moving: !!msg.moving,
        emote: msg.emote ? String(msg.emote).slice(0, 12) : null,
        seen: Date.now(),
      });
      if (isNew) this._peersChanged();
      return;
    }
    if (msg.type === 'leave') {
      if (this.peerMap.delete(msg.from)) this._peersChanged();
      return;
    }
    if (msg.type === 'hello') {
      // A new tab joined: re-announce ourselves right away.
      this._lastState && this.channel?.postMessage(this._lastState);
      return;
    }
    for (const fn of this.msgHandlers) fn(msg);
  }

  _expire() {
    const now = Date.now();
    let changed = false;
    for (const [id, p] of this.peerMap) {
      if (now - p.seen > PEER_TIMEOUT_MS) {
        this.peerMap.delete(id);
        changed = true;
      }
    }
    if (changed) this._peersChanged();
  }

  _peersChanged() {
    for (const fn of this.peerHandlers) fn(this.peers());
  }

  hello() {
    this.channel?.postMessage({ type: 'hello', from: this.selfId });
  }

  publishState(state) {
    if (state.profile?.presence === 'Invisible') {
      if (this._lastState) this.channel?.postMessage({ type: 'leave', from: this.selfId });
      this._lastState = null;
      return;
    }
    this._lastState = { type: 'state', from: this.selfId, ...state };
    this.channel?.postMessage(this._lastState);
  }

  send(msg) {
    this.channel?.postMessage({ ...msg, from: this.selfId });
  }

  onMessage(fn) {
    this.msgHandlers.add(fn);
  }

  onPeers(fn) {
    this.peerHandlers.add(fn);
  }

  getPeer(id) {
    return this.peerMap.get(id) || null;
  }

  peers() {
    return [...this.peerMap.values()];
  }

  stop() {
    clearInterval(this.sweep);
    try {
      this.channel?.postMessage({ type: 'leave', from: this.selfId });
      this.channel?.close();
    } catch {
      /* already closed */
    }
    this.channel = null;
  }
}

const ADJ = ['Nova', 'Neon', 'Solar', 'Lucky', 'Swift', 'Cosmic', 'Bright', 'Urban', 'Pixel', 'Sunny'];
const NOUN = ['Fox', 'Otter', 'Falcon', 'Panda', 'Tiger', 'Koala', 'Lynx', 'Heron', 'Wolf', 'Gecko'];
const COLORS = ['#39a6df', '#f18a62', '#8f7ce0', '#65c990', '#ff5ce1', '#ffd166', '#5ce1e6', '#ff7a59'];
const SKINS = ['#8d5524', '#c68642', '#e0ac69', '#f1c27d', '#5c3a21', '#a0663b'];

// Demo identity. In production this is the authenticated Pludor session.
export function resolveGuestIdentity(search, session) {
  const params = new URLSearchParams(search);
  const as = (params.get('as') || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16);
  let id;
  let name;
  if (as) {
    id = `u_guest_${as.toLowerCase()}`;
    name = as;
  } else {
    try {
      const saved = JSON.parse(session?.getItem('pludor-world-guest') || 'null');
      if (saved?.id) ({ id, name } = saved);
    } catch {
      /* ignore */
    }
  }
  if (!id) {
    const r = (n) => Math.floor(Math.random() * n);
    name = `${ADJ[r(ADJ.length)]}${NOUN[r(NOUN.length)]}${r(90) + 10}`;
    id = `u_guest_${name.toLowerCase()}_${Math.random().toString(36).slice(2, 6)}`;
  }
  try {
    session?.setItem('pludor-world-guest', JSON.stringify({ id, name }));
  } catch {
    /* ignore */
  }
  let h = 0;
  for (const ch of id) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
  return { id, handle: name.toLowerCase(), displayName: name, color: COLORS[h % COLORS.length], skin: SKINS[(h >> 3) % SKINS.length] };
}
