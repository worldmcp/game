// Networked presence transport (same interface as LocalPresenceTransport).
// Connects to the World realtime hub over WebSocket, reconnects with
// backoff, applies server corrections and forwards server-pushed events
// (messages, calls, orders, progress …) to the adapter.

export class WsPresenceTransport {
  constructor({ url, getToken, onEvent, onStatus }) {
    this.url = url;
    this.getToken = getToken;
    this.onEvent = onEvent;
    this.onStatus = onStatus || (() => {});
    this.peerMap = new Map();
    this.msgHandlers = new Set();
    this.peerHandlers = new Set();
    this.correctionHandlers = new Set();
    this.welcome = null;
    this.online = 0;
    this.retry = 0;
    this.closed = false;
    this.ready = new Promise((r) => (this._resolveReady = r));
    this._connect();
    addEventListener('pagehide', () => this.stop());
  }

  get available() {
    return true;
  }

  _connect() {
    if (this.closed) return;
    const ws = new WebSocket(`${this.url}?token=${encodeURIComponent(this.getToken())}`);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.onStatus('online');
    };
    ws.onmessage = (e) => {
      let m;
      try {
        m = JSON.parse(e.data);
      } catch {
        return;
      }
      this._receive(m);
    };
    ws.onclose = (e) => {
      if (this.closed) return;
      if (e.code === 4401) {
        this.onStatus('unauthorized');
        return;
      }
      this.onStatus('reconnecting');
      const delay = Math.min(15000, 500 * 2 ** this.retry++);
      setTimeout(() => this._connect(), delay);
    };
    ws.onerror = () => {};
  }

  _receive(m) {
    switch (m.type) {
      case 'welcome':
        this.welcome = m.you;
        this.online = m.online;
        this._resolveReady(m.you);
        break;
      case 'states': {
        this.online = m.online;
        const live = new Set();
        let changed = false;
        for (const p of m.players) {
          live.add(p.id);
          if (!this.peerMap.has(p.id)) changed = true;
          const pr = p.profile || {};
          this.peerMap.set(p.id, {
            id: p.id, handle: pr.handle || 'player', displayName: pr.displayName || 'Player', color: pr.color || '#888888',
            skin: '#c68642', presence: pr.presence || 'Online', roles: pr.roles || [], bio: pr.bio || '', avatar: pr.avatar || null,
            x: p.x, z: p.z, ry: p.ry, moving: p.moving, emote: p.emote, seen: Date.now(),
          });
        }
        for (const id of [...this.peerMap.keys()]) {
          if (!live.has(id)) {
            this.peerMap.delete(id);
            changed = true;
          }
        }
        if (changed) for (const fn of this.peerHandlers) fn(this.peers());
        break;
      }
      case 'correction':
        for (const fn of this.correctionHandlers) fn({ x: m.x, z: m.z });
        break;
      case 'event':
        this.onEvent?.(m.evt);
        break;
      case 'online':
        this.online = m.online;
        break;
      default:
    }
  }

  hello() {
    this._send({ type: 'hello' });
  }

  publishState(state) {
    this._send({ type: 'state', x: state.x, z: state.z, ry: state.ry, moving: state.moving, emote: state.emote });
  }

  send(msg) {
    // Only gestures go player→player directly; everything else is an
    // adapter RPC so the server can authorise it.
    if (msg.type === 'wave') this._send({ type: 'wave', to: msg.to });
  }

  _send(o) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(o));
  }

  onMessage(fn) {
    this.msgHandlers.add(fn);
  }

  onPeers(fn) {
    this.peerHandlers.add(fn);
  }

  onCorrection(fn) {
    this.correctionHandlers.add(fn);
  }

  getPeer(id) {
    return this.peerMap.get(id) || null;
  }

  peers() {
    return [...this.peerMap.values()];
  }

  stop() {
    this.closed = true;
    this.ws?.close();
  }
}
