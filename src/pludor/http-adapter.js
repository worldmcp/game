// HttpPludorAdapter — production adapter skeleton for dropping World into
// Pludor's working layer. Every contract method maps to ONE entry in
// ENDPOINTS below. Wiring World to the real platform = filling in this map
// from Pludor's API docs (https://pludor.com/ops/docs); no UI changes.
//
// Entries are `[METHOD, '/path/:param', argsToRequest?]`. Until an entry is
// confirmed it stays `null`, and calling it throws a clear "not wired" error
// instead of guessing at an API.
//
// Realtime (presence/position) is separate: pass a transport implementing
// the LocalPresenceTransport interface (WebSocket in production).

import { CONTRACT, PludorError } from './contract.js';

export const ENDPOINTS = {
  'identity.getCurrentUser': null,
  'identity.getUser': null,
  'identity.updateProfile': null,
  'gamification.getProgress': null,
  'gamification.track': null,
  'needs.getNeeds': null,
  'needs.performActivity': null,
  'wallet.getWallet': null,
  'social.getRelationship': null,
  'social.addFriend': null,
  'social.follow': null,
  'social.block': null,
  'social.mute': null,
  'social.report': null,
  'messaging.getConversation': null,
  'messaging.listConversations': null,
  'messaging.send': null,
  'voice.requestCall': null,
  'voice.respondCall': null,
  'voice.endCall': null,
  'commerce.getBusiness': null,
  'commerce.checkout': null,
  'commerce.book': null,
  'commerce.getOrders': null,
  'commerce.listListings': null,
  'commerce.buyListing': null,
  'business.claim': null,
  'business.feedback': null,
  'work.listGigs': null,
  'work.getGig': null,
  'work.apply': null,
  'work.submit': null,
  'work.createGig': null,
  'work.hire': null,
  'work.approve': null,
  'work.myWork': null,
  'learning.listCourses': null,
  'learning.getCourse': null,
  'learning.completeCourse': null,
  'learning.getSkills': null,
  'land.listParcels': null,
  'land.rent': null,
  'land.openBusiness': null,
  'games.startGame': null,
  'games.submitGame': null,
  'ads.getCreative': null,
  'ads.trackImpression': null,
  'ads.trackInteraction': null,
  'ads.getStats': null,
  'events.listEvents': null,
  'events.buyTicket': null,
  'events.attend': null,
  'world.listTokens': null,
  'world.collectToken': null,
  'world.worldRide': null,
  'world.listCommunities': null,
  'world.joinCommunity': null,
  'world.listReels': null,
  'world.listTools': null,
  'world.useTool': null,
  'ai.ask': null,
  'ai.askAgent': null,
  'links.open': null,
  'analytics.track': null,
};

export class HttpPludorAdapter {
  // apiBase: e.g. 'https://pludor.com/api'; getToken: () => bearer token from
  // the host app's existing session (World never handles credentials itself).
  constructor({ apiBase, getToken, endpoints = ENDPOINTS, fetchImpl = (...a) => fetch(...a), onLink }) {
    this.apiBase = apiBase.replace(/\/$/, '');
    this.getToken = getToken;
    this.endpoints = endpoints;
    this.fetch = fetchImpl;
    this.onLink = onLink;
    this.listeners = new Set();
    for (const [ns, methods] of Object.entries(CONTRACT)) {
      this[ns] = {};
      for (const m of methods) this[ns][m] = (...args) => this._call(`${ns}.${m}`, args);
    }
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // Host app forwards its realtime notifications (messages, calls, order
  // updates …) here so World reacts to them.
  emit(evt) {
    for (const fn of this.listeners) fn(evt);
  }

  async _call(name, args) {
    const ep = this.endpoints[name];
    if (!ep) throw new PludorError('not_wired', `${name} is not wired to a Pludor endpoint yet (see src/pludor/http-adapter.js).`);
    const [method, pathTpl, toRequest] = ep;
    const req = toRequest ? toRequest(...args) : { params: {}, body: args[0] };
    const path = pathTpl.replace(/:([a-zA-Z]+)/g, (_, k) => encodeURIComponent(req.params?.[k] ?? ''));
    const token = await this.getToken?.();
    const res = await this.fetch(`${this.apiBase}${path}${req.query ? `?${new URLSearchParams(req.query)}` : ''}`, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: method === 'GET' || req.body === undefined ? undefined : JSON.stringify(req.body),
      credentials: 'include',
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new PludorError(data?.code || `http_${res.status}`, data?.message || `Request failed (${res.status}).`);
    if (name === 'links.open') this.onLink?.(data);
    if (/^(commerce\.(checkout|book|buyListing)|work\.|land\.|learning\.completeCourse|games\.submitGame|events\.|world\.(collectToken|joinCommunity))/.test(name)) {
      if (data?.progress) this.emit({ kind: 'progress', ...data.progress });
      this.emit({ kind: 'state' });
    }
    return data;
  }
}
