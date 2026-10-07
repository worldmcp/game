// DemoPludorAdapter — an in-browser stand-in for the existing Pludor backend.
// It plays the SERVER role: it owns balances, XP, ownership and rewards and
// validates every action. The World client can only ask; it never sets.
//
// Persistence: localStorage (per user + shared "world" key) so multiple tabs
// share parcels, posted gigs and claims. Real deployments replace this whole
// file with a client for the existing Pludor APIs (see contract.js).

import { ECONOMY } from '../config/economy.js';
import { PARCELS, PLACES, TOKENS } from '../config/nova-city.js';
import * as D from './demo-data.js';
import { CLIENT_REPORTABLE_EVENTS, PludorError } from './contract.js';
import { awardXp, checkAchievements, levelForXp, nextRank, rankFor } from '../core/progression.js';
import { advanceQuests, initQuestProgress } from '../core/quests.js';
import { applyNeedEffects, initialNeeds, needsAt } from '../core/needs.js';
import { isOpen, worldTimeAt } from '../core/world-time.js';
import { route as aiRoute } from '../core/ai-intents.js';
import { resolveRoute } from './routes.js';

const money = (n) => Math.round(n * 100) / 100;
const rid = (p) => `${p}_${Math.random().toString(36).slice(2, 10)}`;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const BOT_IDS = new Set(D.RESIDENTS.map((r) => r.id));
const ZONING_TEMPLATES = {
  residential: ['home'],
  commercial: ['storefront', 'studio'],
  'mixed-use': ['storefront', 'studio', 'home'],
  premium: ['storefront', 'studio', 'home'],
};

export function memoryStorage() {
  const m = new Map();
  return {
    get: (k) => (m.has(k) ? structuredClone(m.get(k)) : null),
    set: (k, v) => m.set(k, structuredClone(v)),
    onExternalChange: () => {},
  };
}

export function browserStorage(ls, win) {
  return {
    get(k) {
      try {
        const v = ls.getItem(k);
        return v ? JSON.parse(v) : null;
      } catch {
        return null;
      }
    },
    set(k, v) {
      try {
        ls.setItem(k, JSON.stringify(v));
      } catch {
        /* storage full or blocked: demo state stays in memory only */
      }
    },
    onExternalChange(fn) {
      win?.addEventListener('storage', (e) => {
        if (e.key?.startsWith('pludor-demo:')) fn(e.key);
      });
    },
  };
}

export class DemoPludorAdapter {
  constructor({ user, economy = ECONOMY, storage = memoryStorage(), transport = null, now = () => Date.now(), schedule = (ms, fn) => setTimeout(fn, ms) }) {
    this.me = user;
    this.eco = economy;
    this.store = storage;
    this.transport = transport;
    this.now = now;
    this.schedule = schedule;
    this.listeners = new Set();
    this.calls = new Map();
    this.analyticsLog = [];
    this.memo = { st: null };
    this._ensureUser(user);
    storage.onExternalChange?.(() => this._notify({ kind: 'sync' }));
    transport?.onMessage((msg) => this._onTransport(msg));
    this._bindNamespaces();
  }

  // ───────────────────────── persistence ─────────────────────────
  _userKey(id) {
    return `pludor-demo:user:${id}`;
  }

  _blankUser(user) {
    const t = this.now();
    return {
      v: 1,
      profile: { ...user, presence: 'Online', bio: '', allowMessages: 'everyone', allowCalls: 'everyone', roles: ['Player'] },
      xp: 0,
      achievements: [],
      eventCounts: {},
      history: { onceKeys: [], dailyCounts: {} },
      quests: initQuestProgress(D.QUESTS),
      skills: { ...D.STARTING_SKILLS },
      skillXp: {},
      needs: initialNeeds(this.eco.needs, t),
      wallet: { balance: this.eco.currency.demoStartingBalance, escrowHeld: 0, tx: [] },
      orders: [],
      bookings: [],
      applications: {},
      coupons: [],
      tickets: [],
      attended: [],
      tokens: [],
      communities: [],
      feedbackGiven: [],
      reputation: { gigsCompleted: 0, ordersCompleted: 0, courses: 0, reportsAgainst: 0, hires: 0 },
      relationships: { friends: [], following: [], blocked: [], muted: [] },
      conversations: {},
      cooldowns: {},
      gameSessions: {},
      adSeen: {},
    };
  }

  _ensureUser(user) {
    const st = this.store.get(this._userKey(user.id));
    if (!st) this.store.set(this._userKey(user.id), this._blankUser(user));
    else if (user.displayName && st.profile.displayName !== user.displayName && user.forceName) {
      st.profile.displayName = user.displayName;
      this.store.set(this._userKey(user.id), st);
    }
  }

  _load(id = this.me.id) {
    return this.store.get(this._userKey(id)) || this._blankUser({ id, handle: id, displayName: id });
  }

  _save(st, id = this.me.id) {
    if (st.wallet.tx.length > 40) st.wallet.tx.length = 40;
    this.store.set(this._userKey(id), st);
  }

  _mutate(fn, id = this.me.id) {
    const st = this._load(id);
    const out = fn(st);
    this._save(st, id);
    return out;
  }

  _world() {
    return this.store.get('pludor-demo:world') || { parcels: {}, postedGigs: [], claims: {}, feedback: {}, adStats: {}, reports: [] };
  }

  _mutateWorld(fn) {
    const w = this._world();
    const out = fn(w);
    this.store.set('pludor-demo:world', w);
    return out;
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _notify(evt) {
    for (const fn of this.listeners) {
      try {
        fn(evt);
      } catch (e) {
        console.error(e);
      }
    }
  }

  _time() {
    return worldTimeAt(this.now(), this.eco.time);
  }

  _tx(st, type, amount, memo) {
    st.wallet.tx.unshift({ id: rid('tx'), ts: this.now(), type, amount: money(amount), memo });
  }

  _debit(st, amount, type, memo) {
    if (!(amount >= 0)) throw new PludorError('invalid_amount', 'Invalid amount.');
    if (st.wallet.balance + 1e-9 < amount) throw new PludorError('insufficient_funds', 'Not enough balance in your Pludor wallet.');
    st.wallet.balance = money(st.wallet.balance - amount);
    this._tx(st, type, -amount, memo);
  }

  _credit(st, amount, type, memo) {
    st.wallet.balance = money(st.wallet.balance + amount);
    this._tx(st, type, amount, memo);
  }

  // ───────────────────────── gamification core ─────────────────────────
  // Authoritative award: called only from inside the adapter (or for the
  // small allowlist of client-observable events).
  _award(st, eventName, payload = {}) {
    const history = { onceKeys: new Set(st.history.onceKeys), dailyCounts: st.history.dailyCounts };
    const day = this._time().day;
    const rule = this.eco.xpRules[eventName];
    let xp = awardXp(eventName, payload, rule, history, day);
    if (xp > 0 && payload.bonusXp) xp += clamp(Math.round(payload.bonusXp), 0, 100);
    st.history.onceKeys = [...history.onceKeys];
    st.eventCounts[eventName] = (st.eventCounts[eventName] || 0) + 1;

    const held = new Set(st.achievements);
    const unlocked = checkAchievements(eventName, this.eco.achievements, held, st.eventCounts);
    st.achievements.push(...unlocked);

    const { progress, completed } = advanceQuests(D.QUESTS, st.quests, eventName, payload);
    st.quests = progress;
    const coupons = [];
    for (const qid of completed) {
      const def = D.QUESTS.find((q) => q.id === qid);
      xp += def.rewardXp || 0;
      if (def.rewardCoupon) {
        const c = { ...def.rewardCoupon, id: rid('cpn'), used: false };
        st.coupons.push(c);
        coupons.push(c);
      }
      for (const u of def.unlocks || []) if (st.quests[u]) st.quests[u].active = true;
      st.eventCounts.PLAYER_COMPLETED_QUEST = (st.eventCounts.PLAYER_COMPLETED_QUEST || 0) + 1;
      const more = checkAchievements('PLAYER_COMPLETED_QUEST', this.eco.achievements, new Set(st.achievements), st.eventCounts);
      st.achievements.push(...more);
      unlocked.push(...more);
    }

    const before = levelForXp(st.xp, this.eco.levelCurve).level;
    st.xp += xp;
    const after = levelForXp(st.xp, this.eco.levelCurve).level;
    const result = {
      event: eventName,
      xp,
      levelUp: after > before ? after : null,
      achievements: unlocked.map((id) => ({ id, ...this.eco.achievements[id] })),
      questsCompleted: completed.map((id) => D.QUESTS.find((q) => q.id === id)),
      coupons,
    };
    this._analytics(eventName, payload);
    return result;
  }

  // Award and queue the result for the next _flush(); several awards inside
  // one action merge into a single progress notification.
  _awardAndNotify(eventName, payload, st) {
    const res = this._award(st, eventName, payload);
    const p = this._pendingProgress;
    this._pendingProgress = p
      ? {
          ...res,
          xp: p.xp + res.xp,
          levelUp: res.levelUp || p.levelUp,
          achievements: [...p.achievements, ...res.achievements],
          questsCompleted: [...p.questsCompleted, ...res.questsCompleted],
          coupons: [...p.coupons, ...res.coupons],
        }
      : res;
    return res;
  }

  _flush() {
    if (this._pendingProgress) {
      const r = this._pendingProgress;
      this._pendingProgress = null;
      this._notify({ kind: 'progress', ...r });
    }
    this._notify({ kind: 'state' });
  }

  _analytics(name, props) {
    this.analyticsLog.push({ name, props, ts: this.now() });
    if (this.analyticsLog.length > 300) this.analyticsLog.shift();
  }

  _reputation(st) {
    const r = st.reputation;
    const score = clamp(40 + r.gigsCompleted * 8 + r.ordersCompleted * 1 + r.courses * 3 + r.hires * 2 + st.relationships.friends.length - r.reportsAgainst * 15, 0, 100);
    return { score, ...r };
  }

  _eligibility(st, gig) {
    const missing = (gig.skills || [])
      .filter((s) => (st.skills[s.skill] || 0) < s.level)
      .map((s) => ({ ...s, have: st.skills[s.skill] || 0, label: D.SKILLS[s.skill]?.label || s.skill }));
    return { eligible: missing.length === 0, missing };
  }

  _userSummary(id) {
    if (!id) return null;
    if (id === this.me.id) {
      const st = this._load();
      return { id, handle: st.profile.handle, displayName: st.profile.displayName, color: st.profile.color, presence: st.profile.presence, isMe: true };
    }
    const bot = D.RESIDENTS.find((r) => r.id === id);
    if (bot) return { id, handle: bot.handle, displayName: bot.displayName, color: bot.color, presence: bot.presence, roles: bot.roles, bio: bot.bio, isBot: true };
    if (id === 'pludor_growth') return { id, handle: 'pludor', displayName: 'Pludor Growth', color: '#7c5cff', presence: 'Online', isSystem: true };
    const peer = this.transport?.getPeer(id);
    if (peer) return { id, handle: peer.handle, displayName: peer.displayName, color: peer.color, presence: peer.presence, roles: peer.roles || [], bio: peer.bio || '' };
    const st = this.store.get(this._userKey(id));
    if (st) return { id, handle: st.profile.handle, displayName: st.profile.displayName, color: st.profile.color, presence: 'Offline' };
    return { id, handle: id, displayName: id, color: '#888', presence: 'Offline' };
  }

  // ───────────────────────── transport (multiplayer) ─────────────────────────
  _onTransport(msg) {
    if (msg.to && msg.to !== this.me.id) return;
    const st = this._load();
    const blocked = st.relationships.blocked.includes(msg.from);
    switch (msg.type) {
      case 'dm': {
        if (blocked) return;
        if (st.profile.allowMessages === 'nobody') return;
        if (st.profile.allowMessages === 'friends' && !st.relationships.friends.includes(msg.from)) return;
        const text = String(msg.text || '').slice(0, 500);
        this._mutate((s) => {
          (s.conversations[msg.from] ||= []).push({ id: rid('m'), from: msg.from, text, ts: this.now() });
        });
        this._notify({ kind: 'message', from: msg.from, text });
        break;
      }
      case 'friend':
        if (blocked) return;
        this._mutate((s) => {
          if (!s.relationships.friends.includes(msg.from)) s.relationships.friends.push(msg.from);
        });
        this._notify({ kind: 'friend', from: msg.from });
        break;
      case 'wave':
        if (blocked || st.relationships.muted.includes(msg.from)) return;
        this._notify({ kind: 'wave', from: msg.from });
        break;
      case 'call-request': {
        const reject = blocked || st.profile.allowCalls === 'nobody' || (st.profile.allowCalls === 'friends' && !st.relationships.friends.includes(msg.from));
        if (reject) {
          this.transport.send({ type: 'call-response', to: msg.from, callId: msg.callId, accept: false, reason: 'unavailable' });
          return;
        }
        const call = { id: msg.callId, with: msg.from, status: 'ringing', direction: 'in', startedAt: null };
        this.calls.set(call.id, call);
        this._notify({ kind: 'call', call });
        break;
      }
      case 'call-response': {
        const call = this.calls.get(msg.callId);
        if (!call) return;
        call.status = msg.accept ? 'active' : 'declined';
        call.startedAt = msg.accept ? this.now() : null;
        this._notify({ kind: 'call', call });
        break;
      }
      case 'call-end': {
        const call = this.calls.get(msg.callId);
        if (!call) return;
        call.status = 'ended';
        this._notify({ kind: 'call', call });
        break;
      }
      default:
    }
  }

  // ───────────────────────── namespaces ─────────────────────────
  _bindNamespaces() {
    const A = this;
    // Every public call is async (like a network call) and starts with a clean
    // progress queue so a failed action can never leak a reward notification.
    const T = (fn) => (...args) => Promise.resolve().then(() => {
      A._pendingProgress = null;
      return fn(...args);
    });

    this.identity = {
      getCurrentUser: T(() => {
        const st = A._load();
        return { ...st.profile, reputation: A._reputation(st) };
      }),
      getUser: T((id) => A._userSummary(id)),
      updateProfile: T((patch) => {
        const allowed = ['displayName', 'color', 'presence', 'bio', 'allowMessages', 'allowCalls', 'avatar'];
        const PRESENCE = ['Online', 'Away', 'Busy', 'Working', 'Shopping', 'Playing', 'Learning', 'Available for Work', 'Hiring', 'In Conversation', 'At Event', 'Invisible'];
        A._mutate((st) => {
          for (const k of allowed) {
            if (!(k in patch)) continue;
            let v = String(patch[k]);
            if (k === 'displayName') v = v.replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 20) || st.profile.displayName;
            if (k === 'color' && !/^#[0-9a-f]{6}$/i.test(v)) continue;
            if (k === 'presence' && !PRESENCE.includes(v)) continue;
            if ((k === 'allowMessages' || k === 'allowCalls') && !['everyone', 'friends', 'nobody'].includes(v)) continue;
            if (k === 'bio') v = v.slice(0, 140);
            if (k === 'avatar' && !/^[a-z0-9_]{3,40}$/.test(v)) continue;
            st.profile[k] = v;
          }
        });
        A._notify({ kind: 'state' });
        return A._load().profile;
      }),
    };

    this.gamification = {
      getProgress: T(() => {
        const st = A._load();
        const lvl = levelForXp(st.xp, A.eco.levelCurve);
        const rank = rankFor(st.achievements, A.eco.ranks);
        const nr = nextRank(st.achievements, A.eco.ranks);
        return {
          xp: st.xp,
          level: lvl,
          rank,
          nextRank: nr && { title: nr.rank.title, missing: nr.missing.map((m) => A.eco.achievements[m]?.title || m) },
          achievements: st.achievements.map((id) => ({ id, ...A.eco.achievements[id] })),
          quests: D.QUESTS.map((q) => ({ ...q, state: st.quests[q.id] })),
          reputation: A._reputation(st),
          skills: Object.entries(st.skills).map(([id, level]) => ({ id, level, label: D.SKILLS[id]?.label || id, xp: st.skillXp[id] || 0 })),
          coupons: st.coupons.filter((c) => !c.used),
        };
      }),
      // Only allowlisted, client-observable events are accepted.
      track: T((eventName, payload = {}) => {
        if (!CLIENT_REPORTABLE_EVENTS.has(eventName)) throw new PludorError('forbidden', `${eventName} is server-emitted only.`);
        const res = A._mutate((st) => A._awardAndNotify(eventName, payload, st));
        A._flush();
        return res;
      }),
    };

    this.needs = {
      getNeeds: T(() => needsAt(A._load().needs, A.now(), A.eco.needs, A.eco.time)),
      performActivity: T((activityId, ctx = {}) => {
        const act = A.eco.activities[activityId];
        if (!act) throw new PludorError('unknown_activity', 'Unknown activity.');
        const out = A._mutate((st) => {
          const last = st.cooldowns[activityId] || 0;
          if (A.now() - last < 20000) throw new PludorError('cooldown', 'You just did that — try again in a moment.');
          if (activityId === 'sleep') {
            const home = Object.values(A._world().parcels).find((p) => p.tenantId === A.me.id && p.template === 'home');
            if (!home && ctx.placeId !== 'home') throw new PludorError('no_home', 'Rent a home parcel to sleep there.');
          }
          st.cooldowns[activityId] = A.now();
          st.needs = applyNeedEffects(st.needs, act.effects, A.now(), A.eco.needs, A.eco.time);
          return { values: needsAt(st.needs, A.now(), A.eco.needs, A.eco.time), effects: act.effects, label: act.label };
        });
        A._notify({ kind: 'state' });
        return out;
      }),
    };

    this.wallet = {
      getWallet: T(() => {
        const st = A._load();
        return { ...st.wallet, currency: A.eco.currency.code, symbol: A.eco.currency.symbol, demo: true };
      }),
    };

    this.social = {
      getRelationship: T((userId) => {
        const r = A._load().relationships;
        return { friend: r.friends.includes(userId), following: r.following.includes(userId), blocked: r.blocked.includes(userId), muted: r.muted.includes(userId) };
      }),
      addFriend: T((userId) => {
        if (userId === A.me.id) throw new PludorError('invalid', "You can't friend yourself.");
        const res = A._mutate((st) => {
          if (st.relationships.blocked.includes(userId)) throw new PludorError('blocked', 'Unblock this person first.');
          if (!st.relationships.friends.includes(userId)) st.relationships.friends.push(userId);
          return A._awardAndNotify('PLAYER_ADDED_FRIEND', { userId }, st);
        });
        A.transport?.send({ type: 'friend', to: userId });
        A._flush();
        return res;
      }),
      follow: T((userId) => {
        const res = A._mutate((st) => {
          const f = st.relationships.following;
          if (f.includes(userId)) {
            f.splice(f.indexOf(userId), 1);
            return { following: false };
          }
          f.push(userId);
          return { following: true, ...A._awardAndNotify('PLAYER_FOLLOWED', { userId }, st) };
        });
        A._flush();
        return res;
      }),
      block: T((userId) => {
        const r = A._mutate((st) => {
          const rel = st.relationships;
          if (rel.blocked.includes(userId)) {
            rel.blocked.splice(rel.blocked.indexOf(userId), 1);
            return { blocked: false };
          }
          rel.blocked.push(userId);
          rel.friends = rel.friends.filter((f) => f !== userId);
          return { blocked: true };
        });
        A._notify({ kind: 'state' });
        return r;
      }),
      mute: T((userId) => {
        const r = A._mutate((st) => {
          const m = st.relationships.muted;
          if (m.includes(userId)) {
            m.splice(m.indexOf(userId), 1);
            return { muted: false };
          }
          m.push(userId);
          return { muted: true };
        });
        A._notify({ kind: 'state' });
        return r;
      }),
      report: T((userId, reason) => {
        const ticket = { id: rid('rpt'), userId, reporter: A.me.id, reason: String(reason || 'other').slice(0, 200), ts: A.now(), status: 'received' };
        A._mutateWorld((w) => w.reports.push(ticket));
        return ticket;
      }),
    };

    this.messaging = {
      getConversation: T((userId) => (A._load().conversations[userId] || []).slice(-60)),
      listConversations: T(() => {
        const c = A._load().conversations;
        return Object.entries(c)
          .map(([userId, msgs]) => ({ user: A._userSummary(userId), last: msgs[msgs.length - 1] }))
          .sort((a, b) => (b.last?.ts || 0) - (a.last?.ts || 0));
      }),
      send: T((userId, text) => {
        const clean = String(text || '').trim().slice(0, 500);
        if (!clean) throw new PludorError('empty', 'Message is empty.');
        const msg = A._mutate((st) => {
          if (st.relationships.blocked.includes(userId)) throw new PludorError('blocked', 'You blocked this person.');
          const m = { id: rid('m'), from: A.me.id, text: clean, ts: A.now() };
          (st.conversations[userId] ||= []).push(m);
          A._awardAndNotify('PLAYER_SENT_MESSAGE', { userId }, st);
          return m;
        });
        if (BOT_IDS.has(userId)) {
          const pool = D.BOT_REPLIES[userId] || ['👋'];
          const n = (A._load().conversations[userId] || []).filter((m) => m.from === userId).length;
          A.schedule(900 + Math.random() * 900, () => {
            const reply = pool[n % pool.length];
            A._mutate((st) => (st.conversations[userId] ||= []).push({ id: rid('m'), from: userId, text: reply, ts: A.now() }));
            A._notify({ kind: 'message', from: userId, text: reply });
          });
        } else {
          A.transport?.send({ type: 'dm', to: userId, text: clean });
        }
        A._flush();
        return msg;
      }),
    };

    this.voice = {
      requestCall: T((userId) => {
        if (A._load().relationships.blocked.includes(userId)) throw new PludorError('blocked', 'You blocked this person.');
        const call = { id: rid('call'), with: userId, status: 'ringing', direction: 'out', startedAt: null };
        A.calls.set(call.id, call);
        if (BOT_IDS.has(userId)) {
          A.schedule(1600, () => {
            if (call.status !== 'ringing') return;
            const busy = D.RESIDENTS.find((r) => r.id === userId)?.presence === 'Busy';
            call.status = busy ? 'declined' : 'active';
            call.startedAt = busy ? null : A.now();
            A._notify({ kind: 'call', call });
          });
        } else {
          A.transport?.send({ type: 'call-request', to: userId, callId: call.id });
        }
        A._notify({ kind: 'call', call });
        return call;
      }),
      respondCall: T((callId, accept) => {
        const call = A.calls.get(callId);
        if (!call || call.direction !== 'in' || call.status !== 'ringing') throw new PludorError('invalid', 'No such incoming call.');
        call.status = accept ? 'active' : 'declined';
        call.startedAt = accept ? A.now() : null;
        A.transport?.send({ type: 'call-response', to: call.with, callId, accept: !!accept });
        A._notify({ kind: 'call', call });
        return call;
      }),
      endCall: T((callId) => {
        const call = A.calls.get(callId);
        if (!call) return null;
        call.status = 'ended';
        if (!BOT_IDS.has(call.with)) A.transport?.send({ type: 'call-end', to: call.with, callId });
        A._notify({ kind: 'call', call });
        return call;
      }),
    };

    this.commerce = {
      getBusiness: T((businessId) => {
        const biz = D.BUSINESSES[businessId];
        if (!biz) throw new PludorError('not_found', 'Business not found.');
        const place = PLACES.find((p) => p.link?.id === businessId);
        const t = A._time();
        const w = A._world();
        const st = A._load();
        const open = place ? isOpen(place.hours, t.hoursF) : true;
        const slots = [];
        if (biz.services) {
          for (let i = 1; slots.length < 4 && i < 30; i++) {
            const h = Math.floor(t.hoursF) + i;
            if (!place?.hours || isOpen(place.hours, h % 24)) slots.push({ id: `d${t.day + Math.floor(h / 24)}h${h % 24}`, label: `${h >= 24 ? 'Tomorrow ' : ''}${((h % 24) + 11) % 12 + 1}:00 ${h % 24 < 12 ? 'AM' : 'PM'}` });
          }
        }
        return {
          ...structuredClone(biz),
          owner: A._userSummary(biz.ownerId),
          open,
          hours: place?.hours || null,
          slots,
          claim: w.claims[businessId] || null,
          feedback: w.feedback[businessId] || {},
          myFeedback: st.feedbackGiven.includes(businessId),
          coupons: st.coupons.filter((c) => !c.used && c.businessId === businessId),
        };
      }),
      checkout: T(({ businessId, items, fulfillment, couponId, attribution }) => {
        const biz = D.BUSINESSES[businessId];
        if (!biz?.catalog) throw new PludorError('not_found', 'This business has no catalog.');
        if (!Array.isArray(items) || !items.length) throw new PludorError('empty_cart', 'Your cart is empty.');
        if (!biz.fulfillment.includes(fulfillment)) throw new PludorError('invalid_fulfillment', 'Choose a fulfillment option.');
        const lines = items.map(({ sku, qty }) => {
          const p = biz.catalog.find((c) => c.sku === sku);
          const q = Math.floor(Number(qty));
          if (!p || !(q >= 1 && q <= 10)) throw new PludorError('invalid_item', 'Invalid cart item.');
          return { sku, name: p.name, icon: p.icon, qty: q, unit: p.price, total: money(p.price * q) };
        });
        const res = A._mutate((st) => {
          const subtotal = money(lines.reduce((s, l) => s + l.total, 0));
          let discount = 0;
          let coupon = null;
          if (couponId) {
            coupon = st.coupons.find((c) => c.id === couponId && !c.used && c.businessId === businessId);
            if (!coupon) throw new PludorError('invalid_coupon', 'Coupon not valid here.');
            discount = money(subtotal * (coupon.percentOff / 100));
          }
          const fee = fulfillment === 'delivery' ? 2.99 : 0;
          const total = money(subtotal - discount + fee);
          A._debit(st, total, 'order', `${biz.name} order`);
          if (coupon) coupon.used = true;
          const order = {
            id: rid('ord'), businessId, businessName: biz.name, lines, subtotal, discount, fee, total, fulfillment,
            status: 'confirmed', placedAt: A.now(), etaMin: (biz.prepMinutes || 15) + (fulfillment === 'delivery' ? 20 : 0),
            attribution: attribution ? { source: String(attribution.source), id: String(attribution.id) } : null,
          };
          st.orders.unshift(order);
          st.reputation.ordersCompleted += 1;
          if (['Café', 'Restaurant'].includes(biz.category)) st.needs = applyNeedEffects(st.needs, { hunger: 30, fun: 4 }, A.now(), A.eco.needs, A.eco.time);
          const progress = A._awardAndNotify('PLAYER_PURCHASED', { businessId, total }, st);
          return { order, progress };
        });
        A._flush();
        const steps = fulfillment === 'delivery' ? ['preparing', 'out for delivery', 'delivered'] : ['preparing', 'ready for pickup'];
        steps.forEach((s, i) => A.schedule(5000 * (i + 1), () => {
          A._mutate((st) => {
            const o = st.orders.find((x) => x.id === res.order.id);
            if (o) o.status = s;
          });
          A._notify({ kind: 'order', orderId: res.order.id, status: s, businessName: biz.name });
        }));
        return res;
      }),
      book: T(({ businessId, serviceId, slotId }) => {
        const biz = D.BUSINESSES[businessId];
        const svc = biz?.services?.find((s) => s.id === serviceId);
        if (!svc) throw new PludorError('not_found', 'Service not found.');
        if (!/^d\d+h\d+$/.test(String(slotId))) throw new PludorError('invalid_slot', 'Pick a time slot.');
        const res = A._mutate((st) => {
          if (st.bookings.some((b) => b.slotId === slotId && b.businessId === businessId && b.serviceId === serviceId)) throw new PludorError('duplicate', 'You already booked that slot.');
          if (svc.price > 0) A._debit(st, svc.price, 'booking', `${biz.name} · ${svc.name}`);
          const booking = { id: rid('bk'), businessId, businessName: biz.name, serviceId, serviceName: svc.name, price: svc.price, slotId, status: 'confirmed', ts: A.now() };
          st.bookings.unshift(booking);
          st.reputation.ordersCompleted += 1;
          const progress = A._awardAndNotify('PLAYER_BOOKED', { businessId, serviceId }, st);
          return { booking, progress };
        });
        A._flush();
        return res;
      }),
      getOrders: T(() => {
        const st = A._load();
        return { orders: st.orders, bookings: st.bookings, tickets: st.tickets };
      }),
      listListings: T(() => D.MARKET_LISTINGS.map((l) => ({ ...l, seller: A._userSummary(l.sellerId) }))),
      buyListing: T((listingId) => {
        const l = D.MARKET_LISTINGS.find((x) => x.id === listingId);
        if (!l) throw new PludorError('not_found', 'Listing not found.');
        const res = A._mutate((st) => {
          if (st.orders.some((o) => o.listingId === listingId)) throw new PludorError('sold', 'You already bought this.');
          A._debit(st, l.price, 'order', `Marketplace · ${l.title}`);
          const order = { id: rid('ord'), listingId, businessName: `Marketplace · @${A._userSummary(l.sellerId).handle}`, lines: [{ name: l.title, icon: l.icon, qty: 1, unit: l.price, total: l.price }], total: l.price, status: 'confirmed', placedAt: A.now(), fulfillment: 'meetup' };
          st.orders.unshift(order);
          st.reputation.ordersCompleted += 1;
          return { order, progress: A._awardAndNotify('PLAYER_PURCHASED', { listingId, total: l.price }, st) };
        });
        A._flush();
        return res;
      }),
    };

    this.business = {
      claim: T((businessId, { contact } = {}) => {
        const biz = D.BUSINESSES[businessId];
        if (!biz) throw new PludorError('not_found', 'Business not found.');
        if (biz.claimed) throw new PludorError('already_claimed', 'This business is already managed on Pludor.');
        return A._mutateWorld((w) => {
          if (w.claims[businessId]) throw new PludorError('pending', 'A claim is already under review.');
          w.claims[businessId] = { userId: A.me.id, status: 'pending_verification', contact: String(contact || '').slice(0, 80), ts: A.now() };
          return w.claims[businessId];
        });
      }),
      feedback: T((businessId, status) => {
        const allowed = ['active', 'closed', 'relocated', 'incorrect', 'verified'];
        if (!allowed.includes(status)) throw new PludorError('invalid', 'Unknown status.');
        if (!D.BUSINESSES[businessId]) throw new PludorError('not_found', 'Business not found.');
        const res = A._mutate((st) => {
          if (st.feedbackGiven.includes(businessId)) throw new PludorError('duplicate', 'Thanks — you already reported on this place.');
          st.feedbackGiven.push(businessId);
          return A._awardAndNotify('PLAYER_GAVE_FEEDBACK', { businessId, status }, st);
        });
        const agg = A._mutateWorld((w) => {
          const f = (w.feedback[businessId] ||= {});
          f[status] = (f[status] || 0) + 1;
          return f;
        });
        A._flush();
        return { progress: res, aggregate: agg };
      }),
    };

    const gigView = (st, w, g, posted) => {
      const elig = A._eligibility(st, g);
      const app = st.applications[g.id] || null;
      const course = g.courseId ? D.COURSES.find((c) => c.id === g.courseId) : null;
      return {
        ...g,
        posted,
        requester: A._userSummary(g.requesterId),
        payLabel: `${A.eco.currency.symbol}${g.compensation.amount}${g.compensation.type === 'hourly' ? '/hr' : ''}`,
        ...elig,
        course: course && { id: course.id, title: course.title },
        application: posted ? (g.workerId === A.me.id ? { status: g.status } : g.applicants?.some((a) => a.userId === A.me.id) ? { status: 'applied' } : null) : app,
        mine: g.requesterId === A.me.id,
        escrowFunded: true,
      };
    };

    const findGig = (gigId) => {
      const seeded = D.GIGS.find((g) => g.id === gigId);
      if (seeded) return { gig: seeded, posted: false };
      const p = A._world().postedGigs.find((g) => g.id === gigId);
      if (p) return { gig: p, posted: true };
      throw new PludorError('not_found', 'Gig not found.');
    };

    const approveSeeded = (gigId) => {
      const gig = D.GIGS.find((g) => g.id === gigId);
      const res = A._mutate((st) => {
        const app = st.applications[gigId];
        if (!app || app.status !== 'submitted') return null;
        app.status = 'completed';
        A._credit(st, gig.compensation.amount, 'payout', `Escrow released · ${gig.title}`);
        st.reputation.gigsCompleted += 1;
        for (const s of gig.skills) {
          st.skillXp[s.skill] = (st.skillXp[s.skill] || 0) + 1;
          if (st.skillXp[s.skill] >= ((st.skills[s.skill] || 0) + 1) * 2) {
            st.skills[s.skill] = (st.skills[s.skill] || 0) + 1;
            st.skillXp[s.skill] = 0;
          }
        }
        if (gig.activity) st.needs = applyNeedEffects(st.needs, A.eco.activities[gig.activity].effects, A.now(), A.eco.needs, A.eco.time);
        if (gig.category === 'ugc' || gig.category === 'photography' || gig.category === 'design') A._awardAndNotify('PLAYER_CREATED_CONTENT', { gigId }, st);
        return A._awardAndNotify('PLAYER_COMPLETED_GIG', { gigId, category: gig.category }, st);
      });
      if (res) {
        A._notify({ kind: 'work', gigId, status: 'completed', amount: gig.compensation.amount, title: gig.title });
        A._flush();
      }
    };

    this.work = {
      listGigs: T(() => {
        const st = A._load();
        const w = A._world();
        const seeded = D.GIGS.map((g) => gigView(st, w, g, false));
        const posted = w.postedGigs.filter((g) => g.status !== 'completed' || g.requesterId === A.me.id || g.workerId === A.me.id).map((g) => gigView(st, w, g, true));
        return [...seeded, ...posted];
      }),
      getGig: T((gigId) => {
        const { gig, posted } = findGig(gigId);
        const v = gigView(A._load(), A._world(), gig, posted);
        if (posted && gig.requesterId === A.me.id) v.applicants = (gig.applicants || []).map((a) => ({ ...a, user: A._userSummary(a.userId) }));
        return v;
      }),
      apply: T((gigId, note = '') => {
        const { gig, posted } = findGig(gigId);
        if (gig.requesterId === A.me.id) throw new PludorError('own_gig', "You can't apply to your own gig.");
        const elig = A._eligibility(A._load(), gig);
        if (!elig.eligible) throw new PludorError('not_qualified', `Requires ${elig.missing.map((m) => `${m.label} L${m.level}`).join(', ')}.`);
        if (posted) {
          A._mutateWorld((w) => {
            const g = w.postedGigs.find((x) => x.id === gigId);
            if (g.status !== 'open') throw new PludorError('closed', 'This gig is no longer open.');
            if (g.applicants.some((a) => a.userId === A.me.id)) throw new PludorError('duplicate', 'Already applied.');
            g.applicants.push({ userId: A.me.id, note: String(note).slice(0, 300), ts: A.now() });
          });
        }
        const res = A._mutate((st) => {
          if (!posted) {
            if (st.applications[gigId]) throw new PludorError('duplicate', 'Already applied.');
            st.applications[gigId] = { status: 'applied', note: String(note).slice(0, 300), ts: A.now() };
          }
          return A._awardAndNotify('PLAYER_APPLIED_GIG', { gigId }, st);
        });
        if (!posted) {
          A.schedule(2200, () => {
            A._mutate((st) => {
              if (st.applications[gigId]?.status === 'applied') st.applications[gigId].status = 'assigned';
            });
            A._notify({ kind: 'work', gigId, status: 'assigned', title: gig.title, requester: A._userSummary(gig.requesterId)?.displayName });
          });
        }
        A._flush();
        return res;
      }),
      submit: T((gigId, deliverable = '') => {
        const { gig, posted } = findGig(gigId);
        const text = String(deliverable).trim().slice(0, 300);
        if (!text) throw new PludorError('empty', 'Describe or link your deliverable.');
        if (posted) {
          A._mutateWorld((w) => {
            const g = w.postedGigs.find((x) => x.id === gigId);
            if (g.workerId !== A.me.id || g.status !== 'assigned') throw new PludorError('invalid', 'You are not assigned to this gig.');
            g.status = 'submitted';
            g.deliverable = text;
          });
        } else {
          A._mutate((st) => {
            const app = st.applications[gigId];
            if (!app || app.status !== 'assigned') throw new PludorError('invalid', 'You are not assigned to this gig yet.');
            app.status = 'submitted';
            app.deliverable = text;
          });
          A.schedule(2600, () => approveSeeded(gigId));
        }
        A._notify({ kind: 'state' });
        return { status: 'submitted' };
      }),
      createGig: T((spec) => {
        const title = String(spec.title || '').trim().slice(0, 60);
        const amount = money(Number(spec.amount));
        if (title.length < 4) throw new PludorError('invalid', 'Give your gig a title.');
        if (!(amount >= 5 && amount <= 500)) throw new PludorError('invalid_amount', 'Pay must be between 5 and 500.');
        const category = ['ugc', 'photography', 'design', 'local-service', 'delivery', 'virtual-construction', 'marketing', 'business-services'].includes(spec.category) ? spec.category : 'business-services';
        const skillMap = { ugc: 'video', photography: 'photography', design: 'design', 'local-service': 'communication', delivery: 'driving', 'virtual-construction': 'construction', marketing: 'marketing', 'business-services': 'communication' };
        const gig = {
          id: rid('gig'), title, description: String(spec.description || '').slice(0, 400), category,
          requesterId: A.me.id, placeId: spec.placeId || null, parcelId: spec.parcelId || null,
          skills: [], suggestedSkill: skillMap[category], mode: 'physical',
          compensation: { amount, type: 'fixed' }, deliverables: ['As described'], status: 'open', applicants: [], createdAt: A.now(), escrow: amount,
        };
        const res = A._mutate((st) => {
          A._debit(st, amount, 'escrow_hold', `Escrow · ${title}`);
          st.wallet.escrowHeld = money(st.wallet.escrowHeld + amount);
          return A._awardAndNotify('PLAYER_CREATED_GIG', { gigId: gig.id, category }, st);
        });
        A._mutateWorld((w) => w.postedGigs.push(gig));
        // Demo residents respond to new gigs so the hiring loop is testable solo.
        const bot = D.RESIDENTS.find((r) => r.skills[gig.suggestedSkill]) || D.RESIDENTS[0];
        A.schedule(3500, () => {
          A._mutateWorld((w) => {
            const g = w.postedGigs.find((x) => x.id === gig.id);
            if (g && g.status === 'open' && !g.applicants.some((a) => a.userId === bot.id)) g.applicants.push({ userId: bot.id, note: `Hi! I can do this — ${bot.bio}`, ts: A.now() });
          });
          A._notify({ kind: 'work', gigId: gig.id, status: 'applicant', title: gig.title, requester: bot.displayName });
        });
        A._flush();
        return { gig, progress: res };
      }),
      hire: T((gigId, userId) => {
        const g = A._mutateWorld((w) => {
          const x = w.postedGigs.find((y) => y.id === gigId);
          if (!x || x.requesterId !== A.me.id) throw new PludorError('forbidden', 'Not your gig.');
          if (x.status !== 'open') throw new PludorError('invalid', 'Gig is not open.');
          if (!x.applicants.some((a) => a.userId === userId)) throw new PludorError('invalid', 'That person did not apply.');
          x.status = 'assigned';
          x.workerId = userId;
          return x;
        });
        A._mutate((st) => {
          st.reputation.hires += 1;
        });
        if (BOT_IDS.has(userId)) {
          A.schedule(3000, () => {
            A._mutateWorld((w) => {
              const x = w.postedGigs.find((y) => y.id === gigId);
              if (x?.status === 'assigned') {
                x.status = 'submitted';
                x.deliverable = 'Delivered — files shared via Pludor messages.';
              }
            });
            A._notify({ kind: 'work', gigId, status: 'submitted', title: g.title, requester: A._userSummary(userId).displayName });
          });
        }
        A._notify({ kind: 'state' });
        return g;
      }),
      approve: T((gigId) => {
        const g = A._mutateWorld((w) => {
          const x = w.postedGigs.find((y) => y.id === gigId);
          if (!x || x.requesterId !== A.me.id) throw new PludorError('forbidden', 'Not your gig.');
          if (x.status !== 'submitted') throw new PludorError('invalid', 'Nothing to approve yet.');
          x.status = 'completed';
          return x;
        });
        A._mutate((st) => {
          st.wallet.escrowHeld = money(st.wallet.escrowHeld - g.escrow);
          A._tx(st, 'escrow_release', 0, `Released ${A.eco.currency.symbol}${g.escrow} to @${A._userSummary(g.workerId).handle}`);
        });
        if (!BOT_IDS.has(g.workerId)) {
          // Worker is another real account: credit them server-side.
          A._mutate((st) => {
            A._credit(st, g.escrow, 'payout', `Escrow released · ${g.title}`);
            st.reputation.gigsCompleted += 1;
            A._award(st, 'PLAYER_COMPLETED_GIG', { gigId, category: g.category });
          }, g.workerId);
        }
        A._notify({ kind: 'state' });
        return g;
      }),
      myWork: T(() => {
        const st = A._load();
        const w = A._world();
        return {
          applications: Object.entries(st.applications).map(([id, a]) => ({ ...a, gig: D.GIGS.find((g) => g.id === id) })),
          assigned: w.postedGigs.filter((g) => g.workerId === A.me.id),
          posted: w.postedGigs.filter((g) => g.requesterId === A.me.id).map((g) => ({ ...g, applicants: g.applicants.map((a) => ({ ...a, user: A._userSummary(a.userId) })), worker: A._userSummary(g.workerId) })),
        };
      }),
    };

    this.learning = {
      listCourses: T(() => {
        const st = A._load();
        return D.COURSES.map((c) => ({
          id: c.id, title: c.title, provider: c.provider, minutes: c.minutes, grants: c.grants,
          skillLabel: D.SKILLS[c.grants.skill]?.label, grantsLevel: c.grants.level,
          completed: (st.skills[c.grants.skill] || 0) >= c.grants.level,
          unlocksGigs: D.GIGS.filter((g) => g.courseId === c.id).map((g) => g.title),
        }));
      }),
      getCourse: T((courseId) => {
        const c = D.COURSES.find((x) => x.id === courseId);
        if (!c) throw new PludorError('not_found', 'Course not found.');
        // Answers never leave the server.
        return { ...c, challenge: c.challenge.map(({ q, options }) => ({ q, options })), skillLabel: D.SKILLS[c.grants.skill]?.label };
      }),
      completeCourse: T((courseId, answers = []) => {
        const c = D.COURSES.find((x) => x.id === courseId);
        if (!c) throw new PludorError('not_found', 'Course not found.');
        const correct = c.challenge.reduce((n, q, i) => n + (Number(answers[i]) === q.answer ? 1 : 0), 0);
        const passed = correct === c.challenge.length;
        let progress = null;
        if (passed) {
          progress = A._mutate((st) => {
            const before = st.skills[c.grants.skill] || 0;
            st.skills[c.grants.skill] = Math.max(before, c.grants.level);
            if (before < c.grants.level) st.reputation.courses += 1;
            st.needs = applyNeedEffects(st.needs, A.eco.activities.study.effects, A.now(), A.eco.needs, A.eco.time);
            return A._awardAndNotify('PLAYER_COMPLETED_COURSE', { courseId }, st);
          });
          A._flush();
        }
        return { passed, correct, total: c.challenge.length, grants: c.grants, skillLabel: D.SKILLS[c.grants.skill]?.label, progress };
      }),
      getSkills: T(() => {
        const st = A._load();
        return Object.entries(D.SKILLS).map(([id, s]) => ({ id, ...s, level: st.skills[id] || 0 }));
      }),
    };

    this.land = {
      listParcels: T(() => {
        const w = A._world();
        return PARCELS.map((p) => {
          const occ = w.parcels[p.id];
          return {
            ...p,
            status: occ ? 'rented' : 'available',
            tenant: occ ? A._userSummary(occ.tenantId) : null,
            mine: occ?.tenantId === A.me.id,
            building: occ ? { template: occ.template, businessName: occ.businessName, tenantName: occ.tenantName } : null,
            allowedTemplates: ZONING_TEMPLATES[p.zoning],
            rentLabel: `${A.eco.currency.symbol}${p.rentPerWeek}/${A.eco.land.rentPeriodLabel}`,
          };
        });
      }),
      rent: T((parcelId, templateId) => {
        const parcel = PARCELS.find((p) => p.id === parcelId);
        if (!parcel) throw new PludorError('not_found', 'Parcel not found.');
        if (!A.eco.land.templates[templateId]) throw new PludorError('invalid_template', 'Pick a building template.');
        if (!ZONING_TEMPLATES[parcel.zoning].includes(templateId)) throw new PludorError('zoning', `${parcel.zoning} zoning doesn't allow a ${A.eco.land.templates[templateId].label}.`);
        const w = A._world();
        if (Object.values(w.parcels).filter((x) => x.tenantId === A.me.id).length >= 2) throw new PludorError('limit', 'You can rent up to 2 parcels in this district.');
        const tenantName = A._load().profile.displayName;
        // Reserve first, then charge; roll the reservation back if payment fails.
        A._mutateWorld((ww) => {
          if (ww.parcels[parcelId]) throw new PludorError('taken', 'Someone already rents this parcel.');
          ww.parcels[parcelId] = { tenantId: A.me.id, tenantName, template: templateId, businessName: null, rentedAt: A.now() };
        });
        let res;
        try {
          res = A._mutate((st) => {
            A._debit(st, parcel.rentPerWeek, 'rent', `Rent · ${parcel.name} (1 ${A.eco.land.rentPeriodLabel})`);
            A._awardAndNotify('PLAYER_RENTED_LAND', { parcelId }, st);
            A._awardAndNotify('PLAYER_BUILT', { parcelId, templateId }, st);
            if (!st.profile.roles.includes('Renter')) st.profile.roles.push('Renter');
            return A._pendingProgress;
          });
        } catch (e) {
          A._pendingProgress = null;
          A._mutateWorld((ww) => {
            if (ww.parcels[parcelId]?.tenantId === A.me.id) delete ww.parcels[parcelId];
          });
          throw e;
        }
        A._flush();
        return res;
      }),
      openBusiness: T((parcelId, name) => {
        const clean = String(name || '').replace(/[^\p{L}\p{N} &'.-]/gu, '').trim().slice(0, 22);
        if (clean.length < 2) throw new PludorError('invalid', 'Give your business a name.');
        A._mutateWorld((w) => {
          const p = w.parcels[parcelId];
          if (!p || p.tenantId !== A.me.id) throw new PludorError('forbidden', "You don't rent this parcel.");
          if (p.template === 'home') throw new PludorError('zoning', 'Homes cannot host a storefront.');
          p.businessName = clean;
        });
        const res = A._mutate((st) => {
          if (!st.profile.roles.includes('Business Owner')) st.profile.roles.push('Business Owner');
          return A._awardAndNotify('PLAYER_OPENED_BUSINESS', { parcelId }, st);
        });
        A._flush();
        return res;
      }),
    };

    this.games = {
      startGame: T((gameId) => {
        const cfg = A.eco.games[gameId];
        if (!cfg) throw new PludorError('not_found', 'Unknown game.');
        const session = { id: rid('gs'), gameId, startedAt: A.now() };
        let publicSession = { ...session };
        if (gameId === 'nova-trivia') {
          const idx = [...D.TRIVIA.keys()].sort(() => Math.random() - 0.5).slice(0, 3);
          session.questions = idx;
          publicSession.questions = idx.map((i) => ({ q: D.TRIVIA[i].q, options: D.TRIVIA[i].options }));
        } else {
          session.rounds = cfg.rounds;
          publicSession.rounds = cfg.rounds;
        }
        A._mutate((st) => {
          for (const [k, s] of Object.entries(st.gameSessions)) if (A.now() - s.startedAt > 600000) delete st.gameSessions[k];
          st.gameSessions[session.id] = session;
        });
        return publicSession;
      }),
      submitGame: T((sessionId, result = {}) => {
        const out = A._mutate((st) => {
          const s = st.gameSessions[sessionId];
          if (!s) throw new PludorError('invalid_session', 'Game session expired.');
          delete st.gameSessions[sessionId];
          const cfg = A.eco.games[s.gameId];
          let score;
          let bonus;
          if (s.gameId === 'nova-trivia') {
            const ans = Array.isArray(result.answers) ? result.answers : [];
            const correct = s.questions.reduce((n, qi, i) => n + (Number(ans[i]) === D.TRIVIA[qi].answer ? 1 : 0), 0);
            score = { correct, total: s.questions.length };
            bonus = Math.round((cfg.maxRewardXp * correct) / s.questions.length);
          } else {
            const times = Array.isArray(result.times) ? result.times.map(Number) : [];
            if (times.length !== s.rounds) throw new PludorError('invalid_result', 'Incomplete game.');
            if (times.some((t) => !(t >= 100))) throw new PludorError('invalid_result', 'Result rejected: implausible reaction time.');
            const elapsed = A.now() - s.startedAt;
            if (elapsed < times.reduce((a, b) => a + Math.min(b, 3000), 0)) throw new PludorError('invalid_result', 'Result rejected.');
            const avg = Math.round(times.reduce((a, b) => a + Math.min(b, 3000), 0) / times.length);
            score = { avgMs: avg };
            bonus = Math.round(cfg.maxRewardXp * clamp((650 - avg) / 400, 0.15, 1));
          }
          st.needs = applyNeedEffects(st.needs, A.eco.activities.play.effects, A.now(), A.eco.needs, A.eco.time);
          const progress = A._awardAndNotify('PLAYER_COMPLETED_GAME', { gameId: s.gameId, bonusXp: bonus }, st);
          return { score, progress, title: cfg.title };
        });
        A._flush();
        return out;
      }),
    };

    this.ads = {
      getCreative: T((placementId) => {
        const eligible = D.CAMPAIGNS.filter((c) => c.placements.includes('*') || c.placements.includes(placementId));
        if (!eligible.length) return null;
        let h = 0;
        for (const ch of placementId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
        const slot = Math.floor(A.now() / 15000);
        const c = eligible[(slot + h) % eligible.length];
        const adv = D.BUSINESSES[c.advertiserId];
        return { ...c, placementId, advertiserName: adv?.name || 'Pludor', sponsored: true, rotatesInMs: 15000 - (A.now() % 15000) };
      }),
      trackImpression: T((placementId, campaignId) => {
        const key = `${placementId}|${campaignId}`;
        const fresh = A._mutate((st) => {
          if (A.now() - (st.adSeen[key] || 0) < 30000) return false;
          st.adSeen[key] = A.now();
          return true;
        });
        if (!fresh) return { counted: false };
        A._mutateWorld((w) => {
          const s = (w.adStats[campaignId] ||= { impressions: 0, interactions: 0, uniques: [], visits: 0 });
          s.impressions += 1;
          if (!s.uniques.includes(A.me.id) && s.uniques.length < 500) s.uniques.push(A.me.id);
        });
        A._analytics('ad_impression', { placementId, campaignId });
        return { counted: true };
      }),
      trackInteraction: T((placementId, campaignId, kind = 'click') => {
        const c = D.CAMPAIGNS.find((x) => x.id === campaignId);
        if (!c) throw new PludorError('not_found', 'Unknown campaign.');
        A._mutateWorld((w) => {
          const s = (w.adStats[campaignId] ||= { impressions: 0, interactions: 0, uniques: [], visits: 0 });
          s.interactions += 1;
        });
        const progress = A._mutate((st) => A._awardAndNotify('PLAYER_INTERACTED_AD', { placementId, campaignId, kind }, st));
        A._flush();
        return { target: c.target, progress };
      }),
      getStats: T((campaignId) => {
        const s = A._world().adStats[campaignId] || { impressions: 0, interactions: 0, uniques: [] };
        return { impressions: s.impressions, interactions: s.interactions, uniqueViewers: s.uniques.length, ctr: s.impressions ? s.interactions / s.impressions : 0 };
      }),
    };

    const eventView = (st, e, t) => {
      const [s, en] = e.hours;
      const live = t.hoursF >= s && t.hoursF < en;
      let startsIn = s - t.hoursF;
      if (startsIn < 0) startsIn += 24;
      const place = PLACES.find((p) => p.id === e.placeId);
      return {
        ...e,
        live,
        startsInHours: live ? 0 : startsIn,
        placeName: place?.name || 'Central Plaza',
        hasTicket: st.tickets.some((x) => x.eventId === e.id),
        attended: st.attended.includes(e.id),
      };
    };

    this.events = {
      listEvents: T(() => {
        const st = A._load();
        const t = A._time();
        return D.EVENTS.map((e) => eventView(st, e, t)).sort((a, b) => a.startsInHours - b.startsInHours);
      }),
      buyTicket: T((eventId) => {
        const e = D.EVENTS.find((x) => x.id === eventId);
        if (!e?.ticket) throw new PludorError('invalid', 'This event is free.');
        const res = A._mutate((st) => {
          if (st.tickets.some((x) => x.eventId === eventId)) throw new PludorError('duplicate', 'You already have a ticket.');
          A._debit(st, e.ticket.price, 'ticket', `Ticket · ${e.title}`);
          const ticket = { id: rid('tkt'), eventId, title: e.title, price: e.ticket.price, ts: A.now() };
          st.tickets.push(ticket);
          return ticket;
        });
        A._notify({ kind: 'state' });
        return res;
      }),
      attend: T((eventId) => {
        const e = D.EVENTS.find((x) => x.id === eventId);
        if (!e) throw new PludorError('not_found', 'Event not found.');
        const t = A._time();
        const res = A._mutate((st) => {
          const v = eventView(st, e, t);
          if (!v.live) throw new PludorError('not_live', `${e.title} starts in ${Math.ceil(v.startsInHours)}h (world time).`);
          if (e.ticket && !v.hasTicket) throw new PludorError('ticket_required', 'You need a ticket first.');
          if (!st.attended.includes(eventId)) st.attended.push(eventId);
          st.needs = applyNeedEffects(st.needs, { fun: 25, social: 15 }, A.now(), A.eco.needs, A.eco.time);
          return A._awardAndNotify('PLAYER_ATTENDED_EVENT', { eventId }, st);
        });
        A._flush();
        return res;
      }),
    };

    this.world = {
      listTokens: T(() => {
        const st = A._load();
        const active = st.quests['q-kicks-hunt']?.active && !st.quests['q-kicks-hunt']?.done;
        return TOKENS.map((t) => ({ ...t, collected: st.tokens.includes(t.id), active }));
      }),
      collectToken: T((tokenId, position) => {
        const tok = TOKENS.find((t) => t.id === tokenId);
        if (!tok) throw new PludorError('not_found', 'No such token.');
        if (!position || Math.hypot(position.x - tok.x, position.z - tok.z) > 6) throw new PludorError('too_far', 'Get closer to collect it.');
        const res = A._mutate((st) => {
          const q = st.quests[tok.questId];
          if (!q?.active || q.done) throw new PludorError('inactive', 'Start the Kicks Token Hunt quest first.');
          if (st.tokens.includes(tokenId)) throw new PludorError('duplicate', 'Already collected.');
          st.tokens.push(tokenId);
          return A._awardAndNotify('PLAYER_COLLECTED_TOKEN', { tokenId }, st);
        });
        A._flush();
        return res;
      }),
      worldRide: T((placeId) => {
        const place = PLACES.find((p) => p.id === placeId) || (placeId === 'central-plaza' ? { id: placeId, name: 'Central Plaza' } : null);
        if (!place) throw new PludorError('not_found', 'Unknown destination.');
        const res = A._mutate((st) => A._awardAndNotify('PLAYER_RODE_TRANSIT', { placeId }, st));
        A._flush();
        return { placeId, progress: res };
      }),
      listCommunities: T(() => {
        const st = A._load();
        return D.COMMUNITIES.map((c) => ({ ...c, joined: st.communities.includes(c.id) }));
      }),
      joinCommunity: T((communityId) => {
        if (!D.COMMUNITIES.some((c) => c.id === communityId)) throw new PludorError('not_found', 'Unknown community.');
        const res = A._mutate((st) => {
          if (!st.communities.includes(communityId)) st.communities.push(communityId);
          return A._awardAndNotify('PLAYER_JOINED_COMMUNITY', { communityId }, st);
        });
        A._flush();
        return res;
      }),
      listReels: T(() => D.FLIKA_REELS.map((r) => ({ ...r, creatorUser: A._userSummary(r.creator) }))),
      listTools: T(() => D.TOOLS),
      useTool: T((toolId) => {
        const tool = D.TOOLS.find((t) => t.id === toolId);
        if (!tool) throw new PludorError('not_found', 'Unknown tool.');
        const res = A._mutate((st) => A._awardAndNotify('PLAYER_USED_TOOL', { toolId }, st));
        A._flush();
        return { route: resolveRoute(tool.route), progress: res };
      }),
    };

    this.ai = {
      ask: T((text, ctx) => {
        const clean = String(text || '').slice(0, 300);
        const out = aiRoute(clean, ctx);
        A._mutate((st) => A._awardAndNotify('PLAYER_USED_AI', { agent: 'assistant', intent: out.intent }, st));
        A._flush();
        return out;
      }),
      askAgent: T(async (agent, ctx) => {
        A._mutate((st) => A._awardAndNotify('PLAYER_USED_AI', { agent }, st));
        A._flush();
        const st = A._load();
        switch (agent) {
          case 'guide': {
            const qs = D.QUESTS.filter((q) => st.quests[q.id]?.active && !st.quests[q.id]?.done);
            return { reply: qs.length ? `Welcome to Nova City! Your active quests: ${qs.map((q) => q.title).join(', ')}. Everything here is connected to real Pludor — shops take real orders, gigs pay real money.` : "You've finished every quest I have. Try hosting something!", quests: qs.map((q) => q.id) };
          }
          case 'realtor': {
            const parcels = (await A.land.listParcels()).filter((p) => p.status === 'available').sort((a, b) => a.rentPerWeek - b.rentPerWeek);
            return { reply: parcels.length ? `I found ${parcels.length} available parcel${parcels.length > 1 ? 's' : ''} in Riverside Lots. The best value is ${parcels[0].name} at ${parcels[0].rentLabel}.` : 'Everything is rented right now — check back soon.', parcels: parcels.map((p) => p.id) };
          }
          case 'recruiter': {
            const gigs = (await A.work.listGigs()).filter((g) => g.status === undefined || g.status === 'open');
            const ok = gigs.filter((g) => g.eligible && !g.application && !g.mine);
            return { reply: ok.length ? `You qualify for ${ok.length} gig${ok.length > 1 ? 's' : ''} right now. ${gigs.length - ok.length} more unlock with a quick course.` : 'Nothing you qualify for yet — Ada at the Academy can fix that fast.', gigs: ok.map((g) => g.id) };
          }
          case 'coach': {
            const gigs = (await A.work.listGigs()).filter((g) => !g.eligible && g.course);
            const courses = [...new Map(gigs.map((g) => [g.course.id, g])).values()];
            return { reply: courses.length ? `Learn → qualify → earn. ${courses.map((g) => `${g.course.title} unlocks “${g.title}” (${g.payLabel})`).join('. ')}.` : "You're qualified for everything on the board. Nice.", courses: courses.map((g) => g.course.id) };
          }
          case 'advisor': {
            const mine = Object.entries(A._world().parcels).find(([, p]) => p.tenantId === A.me.id && p.businessName);
            const recs = [
              { label: 'Post a product-photography gig', action: 'create-gig', category: 'photography' },
              { label: 'Post a UGC video gig', action: 'create-gig', category: 'ugc' },
              { label: 'Launch a World billboard in Ads Manager', action: 'link', route: 'ads.newWorldCampaign' },
              { label: 'Run a Flika campaign', action: 'link', route: 'flika.home' },
              { label: 'Post in Signals · Nova Locals', action: 'link', route: 'signals.community', params: { communityId: 'sig_local' } },
              { label: 'Host an event at your venue', action: 'link', route: 'live.event', params: { eventId: 'new' } },
            ];
            return { reply: mine ? `${mine[1].businessName} needs foot traffic. My plan: get great photos and a short video made by local creators, then put them on a World billboard and Flika.` : 'Rent a storefront in Riverside Lots and I’ll build you a growth plan: content gigs, World ads, Flika and Signals.', recs };
          }
          default:
            return { reply: 'Hi!' };
        }
      }),
    };

    this.links = {
      open: T((key, params) => {
        const r = resolveRoute(key, params);
        if (!r) throw new PludorError('not_found', 'Unknown destination.');
        A._analytics('deep_link', { key });
        A._notify({ kind: 'link', route: r });
        return r;
      }),
    };

    this.analytics = {
      track: T((name, props = {}) => {
        A._analytics(String(name).slice(0, 60), props);
        return true;
      }),
    };
  }
}
