// HUD: always-on, contextual overlay on top of the world (top bar, minimap,
// player card, nearby/quest/context cards, interaction prompt, dock, AI
// button, toasts, notifications, nameplates, call overlay, joystick).

import * as THREE from 'three';
import { html, esc, money, raw, PRESENCE_COLORS } from './dom.js';
import { PLACES, PARCELS, AGENTS, DISTRICT, PLAZA, footprint, entrancePoint, zoneAt } from '../config/nova-city.js';
import { ECONOMY } from '../config/economy.js';
import { formatClock } from '../core/world-time.js';
import { currentStep } from '../core/quests.js';
import { EV } from '../core/events.js';

const KIND_COLORS = { cafe: '#ffcf8a', restaurant: '#ff7a59', market: '#ffd166', creator: '#b794ff', community: '#5ce1e6', education: '#7ee8a2', ai: '#8b7dff', games: '#ff5ce1', transit: '#36d399', media: '#ff4d6d', store: '#ffb703', service: '#ff9ecf', tools: '#4cc9f0' };
const KIND_ICON = { cafe: '☕', restaurant: '🍽️', market: '🛒', creator: '🎬', community: '📡', education: '🎓', ai: '🤖', games: '🎮', transit: '🚆', media: '🎞️', store: '👟', service: '✂️', tools: '🧰' };

export class Hud {
  constructor(root, app) {
    this.root = root;
    this.app = app;
    this.notifications = [];
    this.unread = 0;
    root.insertAdjacentHTML('beforeend', this._skeleton());
    this.q = (s) => root.querySelector(s);
    this.sheetEl = this.q('.pw-sheet');
    this.plates = new Map();
    this._bind();
    this._minimapBase();
    this._initStick();
  }

  _skeleton() {
    const f = this.app.flags;
    return `
    <div class="pw-plates" aria-hidden="true"></div>
    <header class="pw-top">
      <div class="pw-brand"><span class="pw-logo">P</span><span class="pw-brand-text"><b>PLUDOR</b><em>WORLD</em></span></div>
      <label class="pw-search"><span>🔍</span><input type="search" placeholder="Search places, people, shops, or anything…" aria-label="Search"></label>
      <div class="pw-chip pw-online" title="Players online now"><i></i><b class="pw-online-n">1</b> online</div>
      <div class="pw-chip pw-clock" title="World time"><span class="pw-clock-icon">☀️</span><b class="pw-clock-t">--</b></div>
      <button class="pw-chip pw-wallet" data-sheet="wallet" title="Pludor Wallet"><span class="pw-coin">P</span><b class="pw-bal">--</b></button>
      <button class="pw-icon-btn pw-bell" data-sheet="notifications" title="Notifications">🔔<span class="pw-badge" hidden>0</span></button>
      <button class="pw-me-btn" data-sheet="profile" title="Your profile"><span class="pw-av me"></span><span class="pw-me-txt"><b class="pw-me-name">--</b><small class="pw-me-lvl">Level 1</small></span><span class="pw-chev">⌄</span></button>
    </header>
    <aside class="pw-minimap"><canvas width="360" height="360" title="Open map (M)"></canvas><span class="pw-north">N</span>
      <div class="pw-map-btns"><button data-hud="recenter" title="Recenter">◎</button><button data-hud="zoom" data-arg="1" title="Zoom in">+</button><button data-hud="zoom" data-arg="-1" title="Zoom out">−</button></div>
      <div class="pw-zone"><b>Nova City</b><small class="pw-zone-name">Central Plaza</small></div></aside>
    <section class="pw-player">
      <div class="pw-player-head"><span class="pw-av lg me"></span><div class="pw-player-id"><div class="pw-name">--</div><div class="pw-rank">Visitor</div>
        <div class="pw-xprow"><i class="pw-xpfill"><b></b></i><small class="pw-xptext">0 XP</small></div></div></div>
      <div class="pw-needs"></div>
      <div class="pw-quick">
        <button data-hud="home"><span>🏠</span>Home</button>
        <button data-sheet="shops"><span>🏪</span>Businesses</button>
        <button data-sheet="land"><span>📍</span>Land</button>
        <button data-sheet="wallet"><span>👛</span>Wallet<em class="pw-quick-bal"></em></button>
        <button data-sheet="inventory"><span>🎒</span>Inventory</button>
        <button data-sheet="social"><span>👥</span>Friends</button>
        <button data-sheet="profile"><span>🏆</span>Achievements</button>
        <button data-sheet="settings"><span>⚙️</span>Settings</button>
      </div>
    </section>
    <aside class="pw-right">
      <section class="pw-card pw-nearby"><header><b>Nearby Players</b><span class="pw-count">0</span></header><ul></ul></section>
      <section class="pw-card pw-quest"></section>
      <section class="pw-card pw-live" hidden></section>
      <section class="pw-card pw-biz" hidden></section>
    </aside>
    <div class="pw-prompt" hidden></div>
    <div class="pw-navpill" hidden><span></span><button class="pw-link-btn" data-act="cancel-nav">Cancel</button></div>
    <nav class="pw-dock">
      <button data-sheet="map"><span>🧭</span>Explore</button>
      ${f.WORLD_COMMERCE_ENABLED ? '<button data-sheet="shops"><span>🛍️</span>Shops</button>' : ''}
      ${f.WORLD_GIGS_ENABLED ? '<button data-sheet="earn"><span>💰</span>Earn</button>' : ''}
      ${f.WORLD_LAND_ENABLED ? '<button data-sheet="land"><span>🏗️</span>Land</button>' : ''}
      ${f.WORLD_GAMES_ENABLED ? '<button data-sheet="games"><span>🎮</span>Games</button>' : ''}
      <button data-sheet="social"><span>💬</span>Social</button>
      ${f.WORLD_AI_ENABLED ? '<button data-sheet="ai"><span>🤖</span>AI</button>' : ''}
    </nav>
    ${f.WORLD_AI_ENABLED ? `<form class="pw-ai-box"><div class="pw-ai-head" data-sheet="ai"><span class="pw-ai-bot">🤖</span><b>Ask Pludor AI</b></div>
      <div class="pw-ai-row"><input name="q" autocomplete="off" placeholder='Try: "Find me a shop for rent"' aria-label="Ask Pludor AI"><button aria-label="Send">➤</button></div></form>` : ''}
    <div class="pw-sheet" role="dialog" aria-modal="false"></div>
    <div class="pw-toasts" aria-live="polite"></div>
    <div class="pw-call" hidden></div>
    <div class="pw-link-modal" hidden></div>
    <div class="pw-stick" hidden><i></i></div>
    <div class="pw-fade"></div>
    <div class="pw-banner" hidden></div>`;
  }

  _bind() {
    this.root.addEventListener('click', (e) => {
      const s = e.target.closest('[data-sheet]');
      if (s && !s.closest('.pw-sheet')) {
        this.app.sheets.open(s.dataset.sheet);
        return;
      }
      const a = e.target.closest('[data-hud]');
      if (a) this._hudAction(a.dataset.hud, a.dataset.arg ? JSON.parse(a.dataset.arg) : null);
      if (e.target.closest('[data-act="cancel-nav"]')) this.app.cancelNav();
    });
    this.q('.pw-ai-box')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const inp = e.target.q;
      const v = inp.value.trim();
      this.app.sheets.open('ai', v ? { ask: v } : {});
      inp.value = '';
      inp.blur();
    });
    this.q('.pw-minimap canvas').addEventListener('click', () => this.app.sheets.open('map'));
    const search = this.q('.pw-search input');
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && search.value.trim()) {
        this.app.sheets.open('ai', { ask: search.value.trim() });
        search.value = '';
        search.blur();
      }
    });
  }

  _hudAction(kind, arg) {
    const app = this.app;
    switch (kind) {
      case 'open':
        return app.openRef(arg);
      case 'go':
        return app.navigateTo(arg, arg.label);
      case 'visit':
        return app.visitPlace(arg);
      case 'quest':
        return app.sheets.open('quests');
      case 'notif': {
        const n = this.notifications.find((x) => x.id === arg);
        n?.action?.();
        return;
      }
      case 'focus':
        return this.primaryAction(arg);
      case 'zoom':
        this.mapZoom = Math.max(1, Math.min(4, (this.mapZoom || 2) * (arg > 0 ? 1.5 : 1 / 1.5)));
        return;
      case 'ask':
        return app.sheets.open('ai', { ask: `Tell me about ${arg}` });
      case 'recenter':
        this.mapZoom = 2;
        return;
      case 'follow':
        return app.api.social.follow(arg).then((r) => {
          this.showProgress(r);
          this.toast(r.following ? 'Following' : 'Unfollowed', '➕');
          this._followed = this._followed || new Set();
          if (r.following) this._followed.add(arg);
          else this._followed.delete(arg);
          this._nearSig = null;
        }).catch((e) => this.toast(e.message, '⚠️'));
      case 'home': {
        const home = app.state.parcels.find((p) => p.mine);
        if (home) return app.navigateTo({ x: home.x, z: home.z - home.d / 2 - 2 }, home.building?.businessName || 'Home');
        this.toast('You don’t have a home yet — rent a parcel in Riverside Lots', '🏠');
        return app.sheets.open('land');
      }
      default:
    }
  }

  // ───────── state rendering ─────────
  render() {
    const s = this.app.state;
    if (!s.profile) return;
    const sym = s.wallet?.symbol || '$';
    const bal = money(s.wallet?.balance ?? 0, sym);
    this.q('.pw-bal').textContent = bal;
    const qb = this.q('.pw-quick-bal');
    if (qb) qb.textContent = bal;
    const lvl = s.progress.level;
    this.q('.pw-me-name').textContent = s.profile.displayName;
    this.q('.pw-me-lvl').textContent = `Level ${lvl.level}`;
    this.q('.pw-xpfill b').style.width = `${Math.round(lvl.progress * 100)}%`;
    this.q('.pw-xptext').textContent = `${s.progress.xp.toLocaleString()} XP`;
    const portrait = this.app.portrait?.(this.app.player.userData.person);
    for (const av of this.root.querySelectorAll('.pw-av.me')) {
      av.style.background = s.profile.color;
      if (portrait) {
        av.style.backgroundImage = `url(${portrait})`;
        av.classList.add('pic');
        av.textContent = '';
      } else av.textContent = s.profile.displayName[0]?.toUpperCase() || 'P';
    }
    this.q('.pw-name').textContent = s.profile.displayName;
    this.q('.pw-rank').innerHTML = html`<span class="pw-rank-pill">Level ${lvl.level}</span> <span>${s.progress.rank.title}</span> <span class="pw-dot" style="background:${PRESENCE_COLORS[s.profile.presence] || '#36d399'}"></span>`.s;
    if (this.app.flags.WORLD_NEEDS_ENABLED) {
      const icons = { energy: '⚡', hunger: '🍔', social: '💬', fun: '🎉', hygiene: '🚿' };
      this.q('.pw-needs').innerHTML = Object.entries(ECONOMY.needs)
        .map(([k, def]) => {
          const v = Math.round(s.needs[k] ?? def.start);
          return html`<div class="pw-need ${v < 30 ? 'low' : ''}" title="${def.label} ${v}/100"><span>${icons[k] || '•'}</span><i><b style="width:${v}%;background:${def.color}"></b></i></div>`.s;
        })
        .join('');
    }
    this._renderQuest();
    this._renderLive();
  }

  _renderQuest() {
    const s = this.app.state;
    const quests = s.progress.quests.filter((q) => q.state?.active && !q.state?.done);
    const el = this.q('.pw-quest');
    if (!quests.length) {
      el.innerHTML = html`<header><b>Active Quest</b></header><p class="pw-muted">All quests complete. Host an event or open a business to keep growing.</p>`.s;
      return;
    }
    const q = quests[0];
    const step = currentStep(q, q.state);
    const done = q.steps.filter((st, i) => q.state.steps[i] >= st.count).length;
    el.innerHTML = html`<header><b><span class="pw-qicon">P</span>${q.sponsor ? 'Sponsored Quest' : 'Active Quest'}</b><button class="pw-link-btn" data-hud="quest">All (${quests.length})</button></header>
      <div class="pw-quest-title">${q.title}</div>
      <p class="pw-quest-desc">${step ? step.step.label : q.desc}${step && step.step.count > 1 ? ` (${Math.min(step.have, step.step.count)}/${step.step.count})` : ''}</p>
      <div class="pw-qbar"><i style="width:${Math.round((done / q.steps.length) * 100)}%"></i></div>
      <div class="pw-qfoot"><span>${done}/${q.steps.length}</span><b class="pw-qreward">⭐ +${q.rewardXp} XP${q.rewardCoupon ? ` · ${q.rewardCoupon.percentOff}% off` : ''}</b></div>`.s;
  }

  _renderLive() {
    const live = (this.app.state.events || []).filter((e) => e.live);
    const el = this.q('.pw-live');
    el.hidden = !live.length;
    if (!live.length) return;
    const e = live[0];
    const place = PLACES.find((p) => p.id === e.placeId);
    const target = place ? entrancePoint(place) : { x: 0, z: 12 };
    el.innerHTML = html`<header><b><span class="pw-live-dot"></span>Live now</b>${live.length > 1 ? html`<button class="pw-link-btn" data-sheet="events">+${live.length - 1} more</button>` : ''}</header>
      <div class="pw-quest-title">${e.title}</div><p class="pw-muted">${e.placeName}${e.ticket ? ` · ticket ${money(e.ticket.price)}` : ' · free'}</p>
      <div class="pw-row"><button class="pw-btn sm" data-hud="go" data-arg='${esc(JSON.stringify({ ...target, label: e.placeName }))}'>Go</button><button class="pw-btn sm ghost" data-sheet="events">Details</button></div>`.s;
  }

  setNearby(list) {
    this.q('.pw-count').textContent = list.length;
    const ul = this.q('.pw-nearby ul');
    const sig = list.map((p) => `${p.id}:${Math.round(p.dist / 3)}:${p.presence}:${this._followed?.has(p.id)}`).join('|');
    if (sig === this._nearSig) return;
    this._nearSig = sig;
    ul.innerHTML = list.length
      ? list.slice(0, 4).map((p) => {
        const pic = this.app.portrait?.(this.app.personOf?.(p.id));
        const following = this._followed?.has(p.id);
        return html`<li><button class="pw-near-who" data-hud="open" data-arg='${esc(JSON.stringify({ type: 'player', id: p.id }))}'><span class="pw-av sm ${pic ? 'pic' : ''}" style="background-color:${p.color};${pic ? `background-image:url(${pic})` : ''}">${pic ? '' : (p.displayName || '?')[0]}</span><span class="pw-near-txt"><b>${p.displayName || p.name}</b><small>${Math.round(p.dist)}m · ${p.presence}</small></span></button>
          <button class="pw-follow ${following ? 'on' : ''}" data-hud="follow" data-arg='${esc(JSON.stringify(p.id))}'>${following ? 'Following' : 'Follow'}</button></li>`.s;
      }).join('')
      : '<li class="pw-muted">No one nearby. Head to the plaza to meet people.</li>';
  }

  setZone(name) {
    this.q('.pw-zone-name').textContent = name;
    this.toast(name, '📍', 1400);
  }

  setNav(label) {
    const pill = this.q('.pw-navpill');
    pill.hidden = !label && !this.app.nav;
    pill.querySelector('span').textContent = label ? `Walking to ${label}` : 'Walking…';
    if (!this.app.nav) pill.hidden = true;
  }

  // ───────── contextual interaction prompt ─────────
  setFocus(focus) {
    const el = this.q('.pw-prompt');
    if (!focus) {
      el.hidden = true;
      return;
    }
    const acts = this._actionsFor(focus);
    el.hidden = false;
    el.innerHTML = html`<div class="pw-prompt-head"><kbd>E</kbd><div><b>${this._focusTitle(focus)}</b><small>${this._focusSub(focus)}</small></div></div>
      <div class="pw-prompt-acts">${acts.map((a, i) => html`<button class="pw-btn ${i ? 'ghost' : ''} sm" data-hud="focus" data-arg='${esc(JSON.stringify(a.id))}'>${a.icon} ${a.label}</button>`)}</div>`.s;
    this._acts = acts;
  }

  _focusTitle(f) {
    if (f.ref.type === 'player') return `${f.person.displayName}  @${f.person.name}`;
    return f.label;
  }

  _focusSub(f) {
    const app = this.app;
    switch (f.ref.type) {
      case 'player':
        return `${f.person.presence}${f.person.bot ? ' · demo resident' : ''}`;
      case 'place': {
        const p = app.placeView(PLACES.find((x) => x.id === f.ref.id));
        const gigs = app.state.gigs.filter((g) => g.placeId === p.id && !g.mine && g.application?.status !== 'completed').length;
        return `${p.kindLabel}${p.hours ? (p.open ? ' · Open' : ' · Closed') : ''}${p.rating ? ` · ★ ${p.rating}` : ''}${gigs ? ` · ${gigs} gig${gigs > 1 ? 's' : ''}` : ''}`;
      }
      case 'parcel': {
        const p = app.state.parcels.find((x) => x.id === f.ref.id);
        return p ? (p.status === 'available' ? `For rent · ${p.rentLabel} · ${p.zoning}` : p.mine ? 'Your parcel' : `Rented by ${p.tenant?.displayName}`) : '';
      }
      case 'agent':
        return 'AI agent · uses real Pludor actions';
      case 'billboard':
        return 'Sponsored · World ad placement';
      case 'plaza':
        return 'Central Plaza';
      case 'spot':
        return f.sub || '';
      default:
        return '';
    }
  }

  _actionsFor(f) {
    const app = this.app;
    const id = f.ref.id;
    const sheets = app.sheets;
    const flags = app.flags;
    switch (f.ref.type) {
      case 'player':
        return [
          { id: 'talk', icon: '💬', label: 'Talk', run: () => sheets.open('chat', { userId: id }) },
          ...(flags.WORLD_VOICE_ENABLED ? [{ id: 'voice', icon: '🎙️', label: 'Voice', run: () => sheets.call(id) }] : []),
          { id: 'wave', icon: '👋', label: 'Wave', run: () => sheets.wave(id) },
          { id: 'profile', icon: '👤', label: 'Profile', run: () => sheets.open('player', { id }) },
        ];
      case 'place': {
        const p = PLACES.find((x) => x.id === id);
        const walkIn = !!app.interiorSpec('place', id);
        const acts = [{ id: 'enter', icon: '🚪', label: walkIn ? 'Go inside' : { market: 'Browse', tools: 'Use tools' }[p.kind] || 'Visit', run: () => (walkIn ? app.enterBuilding('place', id) : app.enterPlace(id)) }];
        if (['cafe', 'restaurant', 'store'].includes(p.kind) && flags.WORLD_COMMERCE_ENABLED) acts.push({ id: 'order', icon: '🛍️', label: 'Order', run: () => { app.enterPlace(id); } });
        if (p.activity && flags.WORLD_NEEDS_ENABLED) acts.push({ id: 'act', icon: '✨', label: ECONOMY.activities[p.activity].label, run: () => sheets.activity(p.activity, id) });
        return acts;
      }
      case 'parcel': {
        const walkIn = !!app.interiorSpec('parcel', id);
        return [...(walkIn ? [{ id: 'enter', icon: '🚪', label: 'Go inside', run: () => app.enterBuilding('parcel', id) }] : []), { id: 'view', icon: '🏗️', label: 'View parcel', run: () => sheets.open('parcel', { id }) }];
      }
      case 'spot':
        return f.acts || [];
      case 'agent':
        return [{ id: 'talk', icon: '🤖', label: `Talk to ${AGENTS.find((a) => a.id === id).name}`, run: () => sheets.open('agent', { id }) }];
      case 'billboard':
        return [{ id: 'view', icon: '📣', label: 'View ad', run: () => sheets.open('billboard', { id }) }];
      case 'plaza':
        return [
          { id: 'coin', icon: '🪙', label: 'Toss a coin', run: () => sheets.activity('fountain', 'central-plaza') },
          { id: 'rest', icon: '🪑', label: 'Rest', run: () => sheets.activity('rest', 'central-plaza') },
          { id: 'events', icon: '🎟️', label: 'Events', run: () => sheets.open('events') },
        ];
      default:
        return [];
    }
  }

  primaryAction(actId) {
    if (!this._acts?.length || this.q('.pw-prompt').hidden) return;
    const a = actId ? this._acts.find((x) => x.id === actId) : this._acts[0];
    a?.run();
  }

  // ───────── feedback ─────────
  toast(text, icon = '✨', ms = 2600) {
    const box = this.q('.pw-toasts');
    const el = document.createElement('div');
    el.className = 'pw-toast';
    el.innerHTML = html`<span>${icon}</span><span>${text}</span>`.s;
    box.appendChild(el);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => el.classList.add('out'), ms);
    setTimeout(() => el.remove(), ms + 400);
  }

  notify({ icon, title, body, action }) {
    const n = { id: `n${Date.now()}${Math.random()}`, icon, title, body, action, ts: Date.now() };
    this.notifications.unshift(n);
    this.notifications.length = Math.min(this.notifications.length, 40);
    this.unread += 1;
    const badge = this.q('.pw-badge');
    badge.hidden = false;
    badge.textContent = this.unread;
    const box = this.q('.pw-toasts');
    const el = document.createElement('button');
    el.className = 'pw-toast pw-notif';
    el.dataset.hud = 'notif';
    el.dataset.arg = JSON.stringify(n.id);
    el.innerHTML = html`<span>${icon}</span><span><b>${title}</b><br>${body}</span>`.s;
    box.appendChild(el);
    setTimeout(() => el.classList.add('out'), 4200);
    setTimeout(() => el.remove(), 4600);
  }

  clearUnread() {
    this.unread = 0;
    this.q('.pw-badge').hidden = true;
  }

  // Server-confirmed progress → celebratory feedback.
  showProgress(r) {
    if (!r) return;
    // The same award can arrive as an RPC result and as a pushed event.
    const sig = JSON.stringify([r.event, r.xp, (r.achievements || []).map((a) => a.id), (r.questsCompleted || []).map((q) => q.id), r.levelUp]);
    const now = Date.now();
    this._seen = (this._seen || []).filter((s) => now - s.at < 2500);
    if (this._seen.some((s) => s.sig === sig)) return;
    this._seen.push({ sig, at: now });
    if (r.xp > 0) this._floatXp(r.xp);
    for (const a of r.achievements || []) this.banner(`${a.icon} Achievement unlocked`, a.title);
    for (const q of r.questsCompleted || []) this.banner('⭐ Quest complete', `${q.title} · +${q.rewardXp} XP`);
    for (const c of r.coupons || []) this.notify({ icon: '🎟️', title: 'Coupon earned', body: `${c.percentOff}% off at Kicks & Co — applied at checkout`, action: () => this.app.enterPlace('kicks-co') });
    if (r.levelUp) this.banner('🎉 Level up!', `You reached level ${r.levelUp}`);
  }

  _floatXp(xp) {
    const el = document.createElement('div');
    el.className = 'pw-xpfloat';
    el.textContent = `+${xp} XP`;
    this.root.appendChild(el);
    setTimeout(() => el.remove(), 1400);
  }

  banner(title, sub) {
    (this._bannerQ ||= []).push([title, sub]);
    if (this._bannerBusy) return;
    const next = () => {
      const item = this._bannerQ.shift();
      if (!item) {
        this._bannerBusy = false;
        return;
      }
      this._bannerBusy = true;
      const b = this.q('.pw-banner');
      b.innerHTML = html`<b>${item[0]}</b><span>${item[1]}</span>`.s;
      b.hidden = false;
      b.classList.remove('show');
      void b.offsetWidth;
      b.classList.add('show');
      setTimeout(() => {
        b.hidden = true;
        next();
      }, 2600);
    };
    next();
  }

  // In-world confirmation (native confirm()/prompt() are blocked in some
  // embeds and break immersion). Resolves true/false, or the chosen option.
  confirm(title, body, okLabel = 'Confirm') {
    return this._dialog(title, body, [[okLabel, true], ['Cancel', false]]);
  }

  choose(title, body, options) {
    return this._dialog(title, body, [...options.map((o) => [o, o]), ['Cancel', null]]);
  }

  _dialog(title, body, buttons) {
    return new Promise((resolve) => {
      const m = this.q('.pw-link-modal');
      m.hidden = false;
      m.innerHTML = html`<div class="pw-link-box" role="dialog" aria-modal="true"><b>${title}</b><p class="pw-muted">${body}</p>
        <div class="pw-dialog-btns">${buttons.map(([label], i) => html`<button class="pw-btn ${i === buttons.length - 1 ? 'ghost' : ''}" data-i="${i}">${label}</button>`)}</div></div>`.s;
      const done = (v) => {
        m.hidden = true;
        m.onclick = null;
        resolve(v);
      };
      m.onclick = (e) => {
        const b = e.target.closest('[data-i]');
        if (b) done(buttons[Number(b.dataset.i)][1]);
        else if (e.target === m) done(buttons[buttons.length - 1][1]);
      };
      m.querySelector('[data-i]')?.focus();
    });
  }

  showLink(route) {
    const m = this.q('.pw-link-modal');
    m.hidden = false;
    m.innerHTML = html`<div class="pw-link-box"><div class="pw-link-icon">↗</div><b>Opens in Pludor · ${route.label}</b>
      <code>${route.path}</code>
      <p class="pw-muted">${route.confirmed ? 'This continues in the main Pludor app.' : 'Embedded build: the host Pludor app handles this route. Path is a placeholder until mapped from Pludor’s route table (see INTEGRATION.md).'}</p>
      <button class="pw-btn" data-close-link>Back to the world</button></div>`.s;
    m.querySelector('[data-close-link]').onclick = () => (m.hidden = true);
    m.onclick = (e) => {
      if (e.target === m) m.hidden = true;
    };
  }

  fade(fn) {
    const f = this.q('.pw-fade');
    f.classList.add('on');
    setTimeout(async () => {
      await fn();
      setTimeout(() => f.classList.remove('on'), 150);
    }, 380);
  }

  // ───────── voice call overlay (consent-based) ─────────
  onCall(call) {
    const el = this.q('.pw-call');
    const name = this.app.personName(call.with);
    clearInterval(this._callTimer);
    if (call.status === 'ended' || call.status === 'declined') {
      el.innerHTML = html`<div class="pw-call-box"><div class="pw-call-av">📞</div><b>${call.status === 'declined' ? `${name} is unavailable` : 'Call ended'}</b></div>`.s;
      setTimeout(() => (el.hidden = true), 1600);
      this.app.emote = null;
      return;
    }
    el.hidden = false;
    if (call.status === 'ringing' && call.direction === 'in') {
      el.innerHTML = html`<div class="pw-call-box ring"><div class="pw-call-av">🎙️</div><b>${name} wants to voice chat</b><small>Pludor Voice · only connects if you accept</small>
        <div class="pw-row"><button class="pw-btn" data-call="accept">Accept</button><button class="pw-btn danger" data-call="decline">Decline</button></div></div>`.s;
    } else if (call.status === 'ringing') {
      el.innerHTML = html`<div class="pw-call-box ring"><div class="pw-call-av">🎙️</div><b>Calling ${name}…</b><small>Waiting for them to accept</small><div class="pw-row"><button class="pw-btn danger" data-call="end">Cancel</button></div></div>`.s;
    } else if (call.status === 'active') {
      const render = () => {
        const s = Math.floor((Date.now() - call.startedAt) / 1000);
        el.innerHTML = html`<div class="pw-call-box live"><div class="pw-call-av">🔊</div><b>${name}</b><small>Pludor Voice · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}</small>
          <div class="pw-wave">${[1, 2, 3, 4, 5].map(() => raw('<i></i>'))}</div>
          <div class="pw-row"><button class="pw-btn ghost" data-call="mute">${this._muted ? 'Unmute' : 'Mute'}</button><button class="pw-btn danger" data-call="end">End</button></div>
          <small class="pw-muted">Demo transport — audio flows through existing Pludor voice in production.</small></div>`.s;
      };
      render();
      this._callTimer = setInterval(render, 1000);
      this.app.api.gamification.track(EV.TALKED_TO_PLAYER, { userId: call.with, mode: 'voice' }).then((r) => this.showProgress(r)).catch(() => {});
    }
    el.onclick = (e) => {
      const b = e.target.closest('[data-call]');
      if (!b) return;
      const api = this.app.api.voice;
      if (b.dataset.call === 'accept') api.respondCall(call.id, true);
      if (b.dataset.call === 'decline') api.respondCall(call.id, false);
      if (b.dataset.call === 'end') api.endCall(call.id);
      if (b.dataset.call === 'mute') {
        this._muted = !this._muted;
        b.textContent = this._muted ? 'Unmute' : 'Mute';
      }
    };
  }

  // ───────── minimap + nameplates ─────────
  _minimapBase() {
    const S = 360;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const half = DISTRICT.half + 8;
    const k = S / (half * 2);
    const X = (x) => (x + half) * k;
    const Z = (z) => (z + half) * k;
    g.fillStyle = '#1b2a22';
    g.fillRect(0, 0, S, S);
    g.fillStyle = '#2f3c47';
    for (const r of DISTRICT.roads) {
      g.fillRect(X(r - 5), 0, 10 * k, S);
      g.fillRect(0, Z(r - 5), S, 10 * k);
    }
    g.fillStyle = '#1e5a7a';
    g.fillRect(0, Z(117), S, S);
    g.fillStyle = '#3a4652';
    g.fillRect(X(-PLAZA.size / 2), Z(-PLAZA.size / 2), PLAZA.size * k, PLAZA.size * k);
    for (const c2 of this.app.city.colliders) {
      if (c2.round || c2.x1 - c2.x0 > 300) continue;
      g.fillStyle = '#56606b';
      g.fillRect(X(c2.x0), Z(c2.z0), (c2.x1 - c2.x0) * k, (c2.z1 - c2.z0) * k);
    }
    for (const p of PLACES) {
      const f = footprint(p);
      g.fillStyle = KIND_COLORS[p.kind] || '#999';
      g.globalAlpha = 0.85;
      g.fillRect(X(f.x0), Z(f.z0), (f.x1 - f.x0) * k, (f.z1 - f.z0) * k);
      g.globalAlpha = 1;
    }
    for (const p of PARCELS) {
      g.strokeStyle = '#ffd166';
      g.setLineDash([4, 3]);
      g.strokeRect(X(p.x - p.w / 2), Z(p.z - p.d / 2), p.w * k, p.d * k);
      g.setLineDash([]);
    }
    g.fillStyle = '#5ce1e6';
    g.beginPath();
    g.arc(X(0), Z(0), 5 * k, 0, Math.PI * 2);
    g.fill();
    this.mapBase = { canvas: c, k, half, X, Z };
  }

  drawMap(ctx, size, { labels = false } = {}) {
    const { canvas, half } = this.mapBase;
    const k = size / (half * 2);
    const X = (x) => (x + half) * k;
    const Z = (z) => (z + half) * k;
    ctx.drawImage(canvas, 0, 0, size, size);
    if (labels) {
      ctx.font = `700 ${Math.max(10, size / 48)}px Inter, system-ui`;
      ctx.textAlign = 'center';
      for (const p of PLACES) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        const w = ctx.measureText(p.name).width + 10;
        ctx.fillRect(X(p.x) - w / 2, Z(p.z) - 9, w, 18);
        ctx.fillStyle = '#fff';
        ctx.fillText(p.name, X(p.x), Z(p.z) + 4);
      }
    }
    // gigs
    for (const gg of this.app.state.gigs.filter((x) => !x.mine && (x.status === undefined || x.status === 'open') && x.application?.status !== 'completed')) {
      const pos = this.app.gigPosition(gg);
      ctx.fillStyle = gg.eligible ? '#36d399' : '#ffd166';
      ctx.beginPath();
      ctx.arc(X(pos.x), Z(pos.z), size / 110, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const p of this.app.people()) {
      ctx.fillStyle = p.color;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(X(p.x), Z(p.z), size / 90, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    if (this.app.nav) {
      const t = this.app.nav.target;
      ctx.strokeStyle = '#b794ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const pts = this.app.nav.path.slice(this.app.nav.i - 1);
      ctx.moveTo(X(this.app.player.position.x), Z(this.app.player.position.z));
      for (const p of pts) ctx.lineTo(X(p.x), Z(p.z));
      ctx.stroke();
      ctx.fillStyle = '#b794ff';
      ctx.beginPath();
      ctx.arc(X(t.x), Z(t.z), size / 70, 0, Math.PI * 2);
      ctx.fill();
    }
    const pp = this.app.player.position;
    ctx.save();
    ctx.translate(X(pp.x), Z(pp.z));
    ctx.rotate(-this.app.player.rotation.y + Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    const s = size / 45;
    ctx.moveTo(0, -s * 1.3);
    ctx.lineTo(s, s);
    ctx.lineTo(0, s * 0.4);
    ctx.lineTo(-s, s);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    return { X, Z, k, half };
  }

  frame(t) {
    const now = performance.now();
    if (!this._mmT || now - this._mmT > 120) {
      this._mmT = now;
      const c = this.q('.pw-minimap canvas');
      const g = c.getContext('2d');
      const z = this.mapZoom || 2;
      const pp = this.app.player.position;
      const { half } = this.mapBase;
      const k = c.width / (half * 2);
      g.save();
      g.fillStyle = '#1b2a22';
      g.fillRect(0, 0, c.width, c.height);
      g.translate(c.width / 2, c.height / 2);
      g.scale(z, z);
      g.translate(-(pp.x + half) * k, -(pp.z + half) * k);
      this.drawMap(g, c.width);
      g.restore();
      const wt = this.app.worldTime();
      this.q('.pw-clock-t').textContent = `${formatClock(wt)} · Day ${wt.day}`;
      this.q('.pw-clock-icon').textContent = { dawn: '🌅', day: '☀️', dusk: '🌇', night: '🌙' }[wt.phase];
      this.app.sheets.tick?.();
      this._renderBiz();
      const tr = this.app.transport;
      const n = tr?.online || (tr ? tr.peers().length + 1 : 1);
      this.q('.pw-online-n').textContent = n.toLocaleString();
    }
    this._plates();
  }

  // Contextual card for the closest business (like walking past a storefront).
  _renderBiz() {
    const now = performance.now();
    if (this._bizT && now - this._bizT < 900) return;
    this._bizT = now;
    const pp = this.app.player.position;
    const el = this.q('.pw-biz');
    let best = null;
    for (const p of PLACES) {
      if (!['cafe', 'restaurant', 'store', 'service', 'market'].includes(p.kind)) continue;
      const e = entrancePoint(p);
      const d = Math.hypot(e.x - pp.x, e.z - pp.z);
      if (d < 55 && (!best || d < best.d)) best = { p, d };
    }
    if (!best || this.app.sheets.top || this.app.inside) {
      el.hidden = true;
      return;
    }
    const v = this.app.placeView(best.p);
    if (this._bizId === best.p.id && !el.hidden) {
      el.querySelector('.pw-biz-dist').textContent = `${Math.round(best.d)} m`;
      return;
    }
    this._bizId = best.p.id;
    el.hidden = false;
    el.innerHTML = html`<div class="pw-biz-row"><div class="pw-biz-icon" style="--accent:${best.p.accent}">${KIND_ICON[best.p.kind]}</div><div class="pw-biz-txt"><b>${best.p.name}</b><small>${v.kindLabel} · <span class="pw-biz-dist">${Math.round(best.d)} m</span></small>${v.rating ? html`<small class="pw-stars">★ ${v.rating.toFixed(1)}</small>` : ''}</div></div>
      <div class="pw-biz-acts"><button class="pw-btn sm" data-hud="visit" data-arg='${esc(JSON.stringify(best.p.id))}'>Visit</button><button class="pw-btn sm ghost" data-hud="open" data-arg='${esc(JSON.stringify({ type: 'place', id: best.p.id }))}'>${v.commerce ? 'Order' : 'Open'}</button><button class="pw-btn sm ghost" data-hud="ask" data-arg='${esc(JSON.stringify(best.p.name))}'>More</button></div>`.s;
  }

  _plate(id, cls, htmlStr) {
    let el = this.plates.get(id);
    if (!el) {
      el = document.createElement('div');
      el.className = `pw-plate ${cls}`;
      this.q('.pw-plates').appendChild(el);
      this.plates.set(id, el);
    }
    if (el._h !== htmlStr) {
      el.innerHTML = htmlStr;
      el._h = htmlStr;
    }
    el._seen = true;
    return el;
  }

  _plates() {
    const app = this.app;
    const cam = app.camera;
    const W = this.root.clientWidth;
    const H = this.root.clientHeight;
    const pp = app.player.position;
    const v = new THREE.Vector3();
    for (const el of this.plates.values()) el._seen = false;
    const place = (el, x, y, z, maxD) => {
      const d = Math.hypot(x - pp.x, z - pp.z);
      v.set(x, y, z).project(cam);
      const vis = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 && d < maxD;
      el.style.display = vis ? '' : 'none';
      if (vis) {
        el.style.transform = `translate(${((v.x + 1) / 2) * W}px, ${((1 - v.y) / 2) * H}px) translate(-50%, -100%)`;
        el.style.opacity = d > maxD * 0.7 ? String(1 - (d - maxD * 0.7) / (maxD * 0.3)) : '1';
      }
    };
    const focusId = app.focus?.ref.type === 'player' ? app.focus.ref.id : null;
    for (const p of app.people()) {
      const el = this._plate(`p:${p.id}`, `person ${focusId === p.id ? 'focus' : ''}`, html`<span class="pw-dot" style="background:${PRESENCE_COLORS[p.presence] || '#36d399'}"></span>@${p.name}${focusId === p.id ? html`<b class="pw-talk">TALK · E</b>` : ''}`.s);
      el.className = `pw-plate person ${focusId === p.id ? 'focus' : ''}`;
      place(el, p.x, (app.inside ? app.floorY : 0) + 2.7, p.z, 45);
    }
    if (app.inside) {
      for (const [id, el] of this.plates) {
        if (!el._seen) {
          el.remove();
          this.plates.delete(id);
        }
      }
      return;
    }
    for (const a of AGENTS) place(this._plate(`a:${a.id}`, 'agent', html`<span>${a.icon}</span><b>${a.name}</b><small>${a.role}</small>`.s), a.x, 3, a.z, 40);
    // Gig pins over places (work exists physically in the world).
    if (app.flags.WORLD_GIGS_ENABLED) {
      const byPlace = new Map();
      for (const g of app.state.gigs) {
        if (g.mine || (g.status && g.status !== 'open') || g.application?.status === 'completed') continue;
        const key = g.placeId || g.parcelId || 'hub';
        if (!byPlace.has(key)) byPlace.set(key, []);
        byPlace.get(key).push(g);
      }
      for (const [key, gs] of byPlace) {
        const pos = app.gigPosition(gs[0]);
        const best = gs.reduce((a, b) => (b.compensation.amount > a.compensation.amount ? b : a));
        const el = this._plate(`g:${key}`, 'gig', html`<span>💼</span><b>${gs.length > 1 ? `${gs.length} gigs` : best.category === 'local-service' ? 'Help wanted' : 'Gig'}</b><em>${best.payLabel}</em>`.s);
        el.onclick = () => app.sheets.open(gs.length > 1 ? 'work' : 'gig', gs.length > 1 ? { placeId: key } : { id: best.id });
        place(el, pos.x, 6.5, pos.z, 70);
      }
    }
    // Live event pins.
    for (const e of app.state.events.filter((x) => x.live)) {
      const p = PLACES.find((x) => x.id === e.placeId);
      const pos = p ? entrancePoint(p) : { x: 0, z: 0 };
      const el = this._plate(`e:${e.id}`, 'live', html`<span class="pw-live-dot"></span><b>LIVE</b> ${e.title}`.s);
      el.onclick = () => app.sheets.open('events', { highlight: e.id });
      place(el, pos.x, p ? 9 : 9.5, pos.z, 90);
    }
    // For-rent markers.
    for (const p of app.state.parcels) {
      if (p.status !== 'available') continue;
      const el = this._plate(`l:${p.id}`, 'land', html`<span>🏷️</span>${p.rentLabel}`.s);
      el.onclick = () => app.sheets.open('parcel', { id: p.id });
      place(el, p.x, 4.6, p.z + p.d / 2 - 1.5, 55);
    }
    for (const [id, el] of this.plates) {
      if (!el._seen) {
        el.remove();
        this.plates.delete(id);
      }
    }
  }

  // ───────── mobile joystick ─────────
  _initStick() {
    const el = this.q('.pw-stick');
    if (!matchMedia('(pointer: coarse)').matches) return;
    el.hidden = false;
    const knob = el.querySelector('i');
    let id = null;
    let c = null;
    el.addEventListener('pointerdown', (e) => {
      id = e.pointerId;
      const r = el.getBoundingClientRect();
      c = { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 };
      el.setPointerCapture(id);
      move(e);
    });
    const move = (e) => {
      if (e.pointerId !== id) return;
      let dx = (e.clientX - c.x) / c.r;
      let dy = (e.clientY - c.y) / c.r;
      const l = Math.hypot(dx, dy);
      if (l > 1) {
        dx /= l;
        dy /= l;
      }
      this.stick = { x: dx, y: dy };
      knob.style.transform = `translate(${dx * c.r * 0.6}px, ${dy * c.r * 0.6}px)`;
    };
    el.addEventListener('pointermove', move);
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      this.stick = null;
      knob.style.transform = '';
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }
}

export { KIND_COLORS, KIND_ICON, zoneAt };
