// Sandbox identity. ONE account drives everything in World (profile, wallet,
// orders, messages, progress). In production this module is replaced by the
// existing Pludor session: the server only needs `userFromToken()`.

import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;
const COLORS = ['#39a6df', '#f18a62', '#8f7ce0', '#65c990', '#ff5ce1', '#ffd166', '#5ce1e6', '#ff7a59'];

const sha = (s) => createHash('sha256').update(s).digest('hex');

export class Auth {
  constructor(store, { admins = [] } = {}) {
    this.store = store;
    this.admins = new Set(admins.map((a) => a.toLowerCase()));
  }

  _userKey(username) {
    return `auth:user:${username.toLowerCase()}`;
  }

  validateCredentials(username, password) {
    if (typeof username !== 'string' || !/^[a-zA-Z0-9_]{3,20}$/.test(username)) throw new AuthError(400, 'Username must be 3–20 letters, numbers or _.');
    if (typeof password !== 'string' || password.length < 8 || password.length > 200) throw new AuthError(400, 'Password must be at least 8 characters.');
  }

  signup(username, password) {
    this.validateCredentials(username, password);
    if (this.store.get(this._userKey(username))) throw new AuthError(409, 'That username is taken.');
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync(password, salt, 64).toString('hex');
    const id = `u_${randomBytes(8).toString('hex')}`;
    let h = 0;
    for (const ch of id) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
    const user = { id, username, salt, hash, createdAt: Date.now(), color: COLORS[h % COLORS.length], roles: this.admins.has(username.toLowerCase()) ? ['admin'] : [] };
    this.store.set(this._userKey(username), user);
    this.store.set(`auth:id:${id}`, username.toLowerCase());
    return this._session(user);
  }

  login(username, password) {
    this.validateCredentials(username, password);
    const user = this.store.get(this._userKey(username));
    const hash = scryptSync(password, user?.salt || 'x'.repeat(32), 64);
    if (!user || !timingSafeEqual(hash, Buffer.from(user.hash, 'hex'))) throw new AuthError(401, 'Wrong username or password.');
    return this._session(user);
  }

  _session(user) {
    const token = randomBytes(32).toString('hex');
    this.store.set(`auth:session:${sha(token)}`, { userId: user.id, exp: Date.now() + SESSION_TTL_MS });
    return { token, user: this.publicUser(user) };
  }

  logout(token) {
    if (token) this.store.delete(`auth:session:${sha(token)}`);
  }

  userFromToken(token) {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
    const s = this.store.get(`auth:session:${sha(token)}`);
    if (!s || s.exp < Date.now()) return null;
    const uname = this.store.get(`auth:id:${s.userId}`);
    const user = uname && this.store.get(this._userKey(uname));
    return user ? this.publicUser(user) : null;
  }

  publicUser(u) {
    return { id: u.id, handle: u.username.toLowerCase(), displayName: u.username, color: u.color, roles: u.roles || [] };
  }
}

export class AuthError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
