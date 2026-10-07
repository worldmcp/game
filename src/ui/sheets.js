// Sheets: the contextual panels that open from the world (a business you
// walked into, a person you approached, a parcel, a billboard …). Each view
// renders from adapter data and every action goes back through the adapter.

import { html, raw, esc, money, timeAgo, PRESENCE_COLORS } from './dom.js';
import { PLACES, PARCELS, AGENTS, BILLBOARDS, entrancePoint, PLAZA } from '../config/nova-city.js';
import { ECONOMY } from '../config/economy.js';
import { RESIDENTS, SKILLS } from '../pludor/demo-data.js';
import { currentStep } from '../core/quests.js';
import { EV } from '../core/events.js';
import { KIND_ICON } from './hud.js';

const A = (act, arg) => raw(`data-act="${esc(act)}" data-arg="${esc(JSON.stringify(arg ?? null))}"`);
const btn = (label, act, arg, cls = '') => html`<button class="pw-btn ${cls}" ${A(act, arg)}>${label}</button>`;
const sym = () => ECONOMY.currency.symbol;
const $m = (n) => money(n, sym());
const placeById = (id) => PLACES.find((p) => p.id === id);
const goArg = (p) => ({ ...entrancePoint(p), label: p.name });
const stars = (r) => (r ? html`<span class="pw-stars">★ ${r.toFixed(1)}</span>` : '');
const empty = (t) => html`<div class="pw-empty">${t}</div>`;

export class Sheets {
  constructor(el, app) {
    this.el = el;
    this.app = app;
    this.stack = [];
    this.aiLog = [];
    this._renderId = 0;
    el.addEventListener('click', (e) => this._onClick(e));
    el.addEventListener('submit', (e) => this._onSubmit(e));
    el.addEventListener('change', (e) => this._onChange(e));
  }

  get top() {
    return this.stack[this.stack.length - 1];
  }

  open(view, props = {}) {
    if (!VIEWS[view]) return;
    if (view === 'notifications') this.app.hud.clearUnread();
    const t = this.top;
    if (t && t.view === view && JSON.stringify(t.props) === JSON.stringify(props)) return this.render();
    // Opening a top-level view from the dock resets the stack.
    if (VIEWS[view].root) this.stack = [];
    this.stack.push({ view, props: { ...props } });
    this.render();
  }

  back() {
    this.stack.pop();
    if (!this.stack.length) return this.close();
    this.render();
  }

  close() {
    this.stack = [];
    this.el.classList.remove('open');
    this.el.innerHTML = '';
    this.app.root.classList.remove('pw-sheet-open');
    if (this.app.emote === 'talk') this.app.emote = null;
  }

  refresh() {
    const t = this.top;
    if (!t) return;
    const active = document.activeElement;
    if (active && this.el.contains(active) && active.matches('input, textarea, select')) return;
    if (VIEWS[t.view].noAutoRefresh) return;
    this.render(true);
  }

  onMessage(evt) {
    const t = this.top;
    if (t?.view === 'chat' && t.props.userId === evt.from) this.render(true);
  }

  tick() {
    const t = this.top;
    if (t && VIEWS[t.view].tick) VIEWS[t.view].tick(this.app, t.props, this);
  }

  async render(keepScroll = false) {
    const t = this.top;
    if (!t) return;
    const id = ++this._renderId;
    const v = VIEWS[t.view];
    const body = this.el.querySelector('.pw-sheet-body');
    const scroll = keepScroll && body ? body.scrollTop : 0;
    let content;
    try {
      content = await v.render(this.app, t.props, this);
    } catch (err) {
      console.error(err);
      content = empty(err.message || 'Something went wrong.');
    }
    if (id !== this._renderId || this.top !== t) return;
    const title = typeof v.title === 'function' ? v.title(this.app, t.props) : v.title;
    this.el.innerHTML = html`<header class="pw-sheet-head">
        ${this.stack.length > 1 ? html`<button class="pw-icon-btn" ${A('back')} aria-label="Back">←</button>` : ''}
        <h2>${title}</h2><button class="pw-icon-btn" ${A('close')} aria-label="Close">✕</button></header>
      <div class="pw-sheet-body">${content}</div>`.s;
    this.el.classList.add('open');
    this.app.root.classList.add('pw-sheet-open');
    const nb = this.el.querySelector('.pw-sheet-body');
    if (keepScroll) nb.scrollTop = scroll;
    v.mounted?.(this.app, t.props, this, nb);
  }

  async _run(fn) {
    try {
      return await fn();
    } catch (err) {
      console.warn(err);
      this.app.hud.toast(err.message || 'That didn’t work.', '⚠️', 3400);
      return undefined;
    }
  }

  _onClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b || !this.el.contains(b)) return;
    e.preventDefault();
    const act = b.dataset.act;
    const arg = b.dataset.arg ? JSON.parse(b.dataset.arg) : null;
    const t = this.top;
    if (!t) return;
    const local = VIEWS[t.view].actions?.[act];
    if (b.disabled) return;
    if (local) return this._run(() => local(this.app, t.props, arg, this, b));
    return this._run(() => GLOBAL[act]?.(this.app, t.props, arg, this, b));
  }

  _onSubmit(e) {
    const f = e.target.closest('form[data-form]');
    if (!f) return;
    e.preventDefault();
    const data = Object.fromEntries(new FormData(f).entries());
    const t = this.top;
    const fn = VIEWS[t.view].forms?.[f.dataset.form];
    if (fn) this._run(() => fn(this.app, t.props, data, this, f));
  }

  _onChange(e) {
    const f = e.target.closest('[data-change]');
    if (!f) return;
    const t = this.top;
    const fn = VIEWS[t.view].changes?.[f.dataset.change];
    if (fn) this._run(() => fn(this.app, t.props, e.target.value, this, e.target));
  }

  // ───────── helpers used by the HUD prompt ─────────
  async activity(id, placeId) {
    return this._run(async () => {
      const r = await this.app.api.needs.performActivity(id, { placeId });
      const fx = Object.entries(r.effects).map(([k, v]) => `${v > 0 ? '+' : ''}${v} ${ECONOMY.needs[k].label}`).join(' · ');
      this.app.hud.toast(`${r.label}: ${fx}`, '✨');
      this.app.state.needs = r.values;
      this.app.hud.render();
    });
  }

  async wave(userId) {
    return this._run(async () => {
      this.app.emote = 'wave';
      setTimeout(() => this.app.emote === 'wave' && (this.app.emote = null), 2200);
      const bot = this.app.bots.get(userId);
      if (bot) {
        setTimeout(() => {
          bot.emote = 'wave';
          setTimeout(() => (bot.emote = null), 2000);
          this.app.hud.toast(`@${bot.handle} waved back`, '👋');
        }, 600);
      } else this.app.transport?.send({ type: 'wave', to: userId });
      const r = await this.app.api.gamification.track(EV.WAVED, { userId });
      this.app.hud.showProgress(r);
    });
  }

  async call(userId) {
    if (!this.app.flags.WORLD_VOICE_ENABLED) return;
    return this._run(() => this.app.api.voice.requestCall(userId));
  }
}

// ───────────────────────── global actions ─────────────────────────
const GLOBAL = {
  back: (app, p, a, s) => s.back(),
  close: (app, p, a, s) => s.close(),
  go: (app, p, arg, s) => {
    if (app.navigateTo(arg, arg.label)) {
      if (innerWidth < 900) s.close();
      app.hud.toast(`Walking to ${arg.label || 'destination'}`, '🧭');
    }
  },
  view: (app, p, arg, s) => s.open(arg.view, arg.props || {}),
  ref: (app, p, arg) => app.openRef(arg),
  place: (app, p, arg) => app.enterPlace(arg),
  link: (app, p, arg) => app.api.links.open(arg.key, arg.params || {}),
  chat: (app, p, arg, s) => s.open('chat', { userId: arg }),
  call: (app, p, arg, s) => s.call(arg),
  activity: (app, p, arg, s) => s.activity(arg.id, arg.placeId),
};

// ───────────────────────── shared fragments ─────────────────────────
function gigCard(app, g) {
  const status = g.application?.status;
  const tag = g.mine ? 'Your gig' : status ? { applied: 'Applied', assigned: 'Hired', submitted: 'In review', completed: 'Paid' }[status] : g.eligible ? 'You qualify' : `Needs ${g.missing.map((m) => `${m.label} L${m.level}`).join(', ')}`;
  const cls = g.mine ? 'mine' : status ? 'active' : g.eligible ? 'ok' : 'locked';
  const place = g.placeId ? placeById(g.placeId) : null;
  return html`<button class="pw-gig ${cls}" ${A('view', { view: 'gig', props: { id: g.id } })}>
    <div class="pw-gig-top"><span class="pw-cat">${catLabel(g.category)}</span><b class="pw-pay">${g.payLabel}</b></div>
    <div class="pw-gig-title">${g.title}</div>
    <div class="pw-gig-meta">${place ? `${KIND_ICON[place.kind] || '📍'} ${place.name}` : g.mode === 'remote' ? '🌐 Remote' : '📍 Nova City'} · <span class="pw-gig-tag">${tag}</span></div>
  </button>`;
}

function catLabel(c) {
  return { ugc: 'UGC', photography: 'Photography', design: 'Design', 'local-service': 'Local service', delivery: 'Delivery', 'business-services': 'Business services', 'virtual-construction': 'World building', marketing: 'Marketing' }[c] || c;
}

function personRow(p, extra = '') {
  return html`<div class="pw-person"><span class="pw-av sm" style="background:${p.color}">${(p.displayName || '?')[0]}</span><div><b>${p.displayName}</b> <small>@${p.handle || p.name}</small><br><small><span class="pw-dot" style="background:${PRESENCE_COLORS[p.presence] || '#6b7280'}"></span>${p.presence || 'Offline'}</small></div>${extra}</div>`;
}

function placeHeader(app, p, extra = '') {
  const v = app.placeView(p);
  return html`<div class="pw-place-hero" style="--accent:${p.accent}">
    <div class="pw-place-icon">${KIND_ICON[p.kind] || '📍'}</div>
    <div><div class="pw-place-kind">${v.kindLabel}</div>
    <div class="pw-place-meta">${p.hours ? html`<span class="pw-open ${v.open ? 'yes' : 'no'}">${v.open ? 'Open now' : 'Closed'}</span> · ${p.hours[0]}:00–${p.hours[1] % 24}:00` : html`<span class="pw-open yes">Always open</span>`} ${v.rating ? html`· ${stars(v.rating)}` : ''}</div></div>
    ${extra}</div>`;
}

function activityBtn(p) {
  if (!p.activity) return '';
  const a = ECONOMY.activities[p.activity];
  const fx = Object.entries(a.effects).map(([k, v]) => `${v > 0 ? '+' : ''}${v} ${ECONOMY.needs[k].label}`).join(', ');
  return html`<button class="pw-btn ghost sm" ${A('activity', { id: p.activity, placeId: p.id })} title="${fx}">✨ ${a.label}</button>`;
}

function tabs(props, list) {
  return html`<div class="pw-tabs">${list.map(([id, label]) => html`<button class="${props.tab === id ? 'on' : ''}" ${A('tab', id)}>${label}</button>`)}</div>`;
}

const tabAction = (app, props, arg, s) => {
  props.tab = arg;
  props.step = null;
  s.render();
};

function liveEventsAt(app, placeId) {
  return (app.state.events || []).filter((e) => e.placeId === placeId);
}

function eventStrip(app, placeId) {
  const evs = liveEventsAt(app, placeId);
  if (!evs.length) return '';
  return html`<div class="pw-events-strip">${evs.map((e) => html`<button class="pw-ev ${e.live ? 'live' : ''}" ${A('view', { view: 'events', props: { highlight: e.id } })}>${e.live ? html`<span class="pw-live-dot"></span>LIVE` : `in ${Math.ceil(e.startsInHours)}h`} · ${e.title}</button>`)}</div>`;
}

// ───────────────────────── views ─────────────────────────
const VIEWS = {};

// PLACE ROUTER ──────────────────────────────────────────────
VIEWS.place = {
  title: (app, p) => placeById(p.id)?.name || 'Place',
  async render(app, props, s) {
    const p = placeById(props.id);
    const sub = PLACE_KINDS[p.kind] || PLACE_KINDS.business;
    return sub.render(app, props, s, p);
  },
  actions: new Proxy({}, {
    get(_, name) {
      return (app, props, arg, s, el) => {
        const p = placeById(props.id);
        const sub = PLACE_KINDS[p.kind] || PLACE_KINDS.business;
        const fn = sub.actions?.[name] || (name === 'tab' ? tabAction : null);
        if (fn) return fn(app, props, arg, s, el, p);
        return GLOBAL[name]?.(app, props, arg, s, el);
      };
    },
    has: () => true,
  }),
  forms: new Proxy({}, {
    get(_, name) {
      return (app, props, data, s, f) => {
        const p = placeById(props.id);
        const sub = PLACE_KINDS[p.kind] || PLACE_KINDS.business;
        return sub.forms?.[name]?.(app, props, data, s, f, p);
      };
    },
  }),
  changes: new Proxy({}, {
    get(_, name) {
      return (app, props, val, s, el) => {
        const p = placeById(props.id);
        const sub = PLACE_KINDS[p.kind] || PLACE_KINDS.business;
        return sub.changes?.[name]?.(app, props, val, s, el, p);
      };
    },
  }),
};

const PLACE_KINDS = {};

// Businesses: café, restaurant, store, service (+ unclaimed local data).
PLACE_KINDS.business = {
  async render(app, props, s, p) {
    const biz = await app.api.commerce.getBusiness(p.link.id);
    props._biz = biz;
    const hasCatalog = !!biz.catalog?.length;
    const hasServices = !!biz.services?.length;
    const gigs = app.state.gigs.filter((g) => g.placeId === p.id && g.application?.status !== 'completed');
    if (!props.tab) props.tab = !biz.claimed ? 'about' : hasCatalog ? 'shop' : hasServices ? 'book' : 'about';
    const tabList = [];
    if (hasCatalog && app.flags.WORLD_COMMERCE_ENABLED) tabList.push(['shop', biz.category === 'Restaurant' ? 'Menu' : 'Shop']);
    if (hasServices && app.flags.WORLD_COMMERCE_ENABLED) tabList.push(['book', biz.reservations ? 'Reserve' : 'Book']);
    if (app.flags.WORLD_GIGS_ENABLED) tabList.push(['gigs', `Gigs${gigs.length ? ` (${gigs.length})` : ''}`]);
    tabList.push(['about', 'About']);
    let body;
    if (props.tab === 'shop') body = renderShop(app, props, biz);
    else if (props.tab === 'book') body = renderBook(app, props, biz);
    else if (props.tab === 'gigs') body = gigs.length ? html`<div class="pw-list">${gigs.map((g) => gigCard(app, g))}</div>` : empty('No open gigs here right now.');
    else body = renderAbout(app, props, biz, p);
    return html`${placeHeader(app, p, html`<div class="pw-hero-acts">${activityBtn(p)}</div>`)}
      <p class="pw-blurb">${biz.blurb}</p>
      ${!biz.claimed ? html`<div class="pw-claim-banner"><b>Is this your business?</b><span>Claim it to take orders, post gigs and advertise.</span><button class="pw-btn sm" ${A('tab', 'about')}>Claim this business</button></div>` : ''}
      ${eventStrip(app, p.id)}
      ${tabs(props, tabList)}${body}`;
  },
  actions: {
    tab: tabAction,
    qty(app, props, { sku, d }, s) {
      props.cart ||= {};
      props.cart[sku] = Math.max(0, Math.min(10, (props.cart[sku] || 0) + d));
      if (!props.cart[sku]) delete props.cart[sku];
      s.render(true);
    },
    fulfil(app, props, f, s) {
      props.fulfillment = f;
      s.render(true);
    },
    coupon(app, props, id, s) {
      props.couponId = props.couponId === id ? null : id;
      s.render(true);
    },
    review(app, props, a, s) {
      props.step = 'confirm';
      s.render();
    },
    async pay(app, props, a, s, el) {
      el.disabled = true;
      const biz = props._biz;
      const items = Object.entries(props.cart || {}).map(([sku, qty]) => ({ sku, qty }));
      const { order, progress } = await app.api.commerce.checkout({ businessId: biz.id, items, fulfillment: props.fulfillment || biz.fulfillment[0], couponId: props.couponId, attribution: props.attribution });
      props.cart = {};
      props.couponId = null;
      props.step = 'done';
      props.order = order;
      app.hud.showProgress(progress);
      app.api.analytics.track('purchase', { businessId: biz.id, total: order.total });
      s.render();
    },
    slot(app, props, id, s) {
      props.slotId = id;
      s.render(true);
    },
    svc(app, props, id, s) {
      props.serviceId = id;
      s.render(true);
    },
    async book(app, props, a, s, el) {
      el.disabled = true;
      const { booking, progress } = await app.api.commerce.book({ businessId: props._biz.id, serviceId: props.serviceId, slotId: props.slotId });
      props.booking = booking;
      props.step = 'booked';
      app.hud.showProgress(progress);
      s.render();
    },
    async feedback(app, props, status, s) {
      const r = await app.api.business.feedback(props._biz.id, status);
      app.hud.showProgress(r.progress);
      app.hud.toast('Thanks — this keeps the city map accurate.', '🗺️');
      s.render(true);
    },
    affiliate(app, props) {
      app.api.links.open('creator.affiliate', { businessId: props._biz.id });
    },
  },
  forms: {
    async claim(app, props, data, s) {
      await app.api.business.claim(props._biz.id, { contact: data.contact });
      app.hud.toast('Claim submitted to Pludor business verification', '✅');
      s.render(true);
    },
  },
};
for (const k of ['cafe', 'restaurant', 'store', 'service']) PLACE_KINDS[k] = PLACE_KINDS.business;

function renderShop(app, props, biz) {
  if (props.step === 'done') {
    const o = props.order;
    return html`<div class="pw-success"><div class="pw-success-icon">✓</div><h3>Order placed</h3>
      <p>${o.businessName} · ${o.fulfillment} · ready in ~${o.etaMin} min</p>
      <div class="pw-receipt">${o.lines.map((l) => html`<div><span>${l.qty}× ${l.name}</span><span>${$m(l.total)}</span></div>`)}
      ${o.discount ? html`<div><span>Coupon</span><span>−${$m(o.discount)}</span></div>` : ''}${o.fee ? html`<div><span>Delivery</span><span>${$m(o.fee)}</span></div>` : ''}
      <div class="tot"><span>Paid from wallet</span><span>${$m(o.total)}</span></div></div>
      <small class="pw-muted">Order ${o.id} is now in Pludor Orders and with the merchant.</small>
      <div class="pw-row">${btn('Track order', 'view', { view: 'orders' })}${btn('Keep shopping', 'tab', 'shop', 'ghost')}</div></div>`;
  }
  const cart = props.cart || {};
  const lines = biz.catalog.filter((c) => cart[c.sku]).map((c) => ({ ...c, qty: cart[c.sku] }));
  const subtotal = lines.reduce((a, l) => a + l.price * l.qty, 0);
  const coupon = biz.coupons.find((c) => c.id === props.couponId);
  const discount = coupon ? Math.round(subtotal * coupon.percentOff) / 100 : 0;
  const fulfillment = props.fulfillment || biz.fulfillment[0];
  const fee = fulfillment === 'delivery' ? 2.99 : 0;
  const total = Math.max(0, subtotal - discount + fee);
  const bal = app.state.wallet?.balance ?? 0;
  if (props.step === 'confirm' && lines.length) {
    return html`<div class="pw-confirm"><h3>Confirm your order</h3>
      <div class="pw-receipt">${lines.map((l) => html`<div><span>${l.qty}× ${l.name}</span><span>${$m(l.price * l.qty)}</span></div>`)}
      ${discount ? html`<div><span>Coupon ${coupon.code}</span><span>−${$m(discount)}</span></div>` : ''}${fee ? html`<div><span>Delivery fee</span><span>${$m(fee)}</span></div>` : ''}
      <div class="tot"><span>Total</span><span>${$m(total)}</span></div></div>
      <p class="pw-muted">Pay with Pludor Wallet (balance ${$m(bal)}). ${fulfillment === 'delivery' ? 'Delivered to your saved address.' : fulfillment === 'dine-in' ? 'Served at your table.' : 'Pick up in store.'} This is a real order handled by Pludor checkout.</p>
      <div class="pw-row">${html`<button class="pw-btn" ${A('pay')} ${bal < total ? raw('disabled') : ''}>Pay ${$m(total)}</button>`}${btn('Back', 'tab', 'shop', 'ghost')}</div>
      ${bal < total ? html`<p class="pw-warn">Not enough balance — earn more from gigs in the Creator Hub.</p>` : ''}</div>`;
  }
  return html`<div class="pw-catalog">${biz.catalog.map((c) => html`<div class="pw-item"><div class="pw-item-icon">${c.icon}</div><div class="pw-item-body"><b>${c.name}</b><small>${c.desc}</small><span class="pw-price">${$m(c.price)}</span></div>
      <div class="pw-qty">${cart[c.sku] ? html`<button ${A('qty', { sku: c.sku, d: -1 })}>−</button><b>${cart[c.sku]}</b>` : ''}<button ${A('qty', { sku: c.sku, d: 1 })}>+</button></div></div>`)}</div>
    ${lines.length ? html`<div class="pw-cart"><div class="pw-seg">${biz.fulfillment.map((f) => html`<button class="${f === fulfillment ? 'on' : ''}" ${A('fulfil', f)}>${f === 'pickup' ? '🛍️ Pickup' : f === 'delivery' ? '🛵 Delivery' : '🍽️ Dine-in'}</button>`)}</div>
      ${biz.coupons.length ? html`<div class="pw-coupons">${biz.coupons.map((c) => html`<button class="pw-coupon ${props.couponId === c.id ? 'on' : ''}" ${A('coupon', c.id)}>🎟️ ${c.code} · ${c.percentOff}% off</button>`)}</div>` : ''}
      <div class="pw-cart-row"><span>${lines.reduce((a, l) => a + l.qty, 0)} items · <b>${$m(total)}</b></span>${btn('Checkout', 'review')}</div></div>` : ''}
    ${biz.affiliate ? html`<div class="pw-note">💸 Creators earn ${biz.affiliate.commissionPct}% promoting ${biz.name}. <button class="pw-link-btn" ${A('affiliate')}>Become an affiliate</button></div>` : ''}`;
}

function renderBook(app, props, biz) {
  if (props.step === 'booked') {
    const b = props.booking;
    const slot = biz.slots.find((x) => x.id === b.slotId);
    return html`<div class="pw-success"><div class="pw-success-icon">✓</div><h3>${biz.reservations ? 'Table reserved' : 'Booked'}</h3><p>${b.serviceName} · ${slot?.label || ''} (world time)</p>
      ${b.price ? html`<p class="pw-muted">${$m(b.price)} paid from your wallet.</p>` : ''}<div class="pw-row">${btn('My bookings', 'view', { view: 'orders' })}</div></div>`;
  }
  const svc = biz.services.find((x) => x.id === props.serviceId);
  return html`<div class="pw-list">${biz.services.map((x) => html`<button class="pw-svc ${props.serviceId === x.id ? 'on' : ''}" ${A('svc', x.id)}><span>${x.icon}</span><div><b>${x.name}</b><small>${x.durationMin} min</small></div><b>${x.price ? $m(x.price) : 'Free'}</b></button>`)}</div>
    ${svc ? html`<h4>Pick a time</h4><div class="pw-slots">${biz.slots.map((sl) => html`<button class="${props.slotId === sl.id ? 'on' : ''}" ${A('slot', sl.id)}>${sl.label}</button>`)}</div>
      ${props.slotId ? html`<div class="pw-cart-row"><span>${svc.name} · <b>${svc.price ? $m(svc.price) : 'Free'}</b></span>${btn(svc.price ? `Book & pay ${$m(svc.price)}` : 'Reserve', 'book')}</div>` : ''}` : ''}`;
}

function renderAbout(app, props, biz, p) {
  const fb = biz.feedback || {};
  return html`${biz.owner ? html`<h4>Owner</h4>${personRow(biz.owner, html`<div class="pw-row tight">${btn('💬', 'chat', biz.owner.id, 'sm ghost')}${app.flags.WORLD_VOICE_ENABLED ? btn('🎙️', 'call', biz.owner.id, 'sm ghost') : ''}</div>`)}` : ''}
    <div class="pw-kv"><div><span>Category</span><b>${biz.category}</b></div><div><span>Reviews</span><b>${biz.rating ? `${biz.rating} ★ (${biz.reviewCount})` : '—'}</b></div><div><span>Status</span><b>${biz.claimed ? (biz.verified ? 'Verified on Pludor' : 'On Pludor') : 'Unclaimed · from local business data'}</b></div></div>
    ${!biz.claimed ? (biz.claim ? html`<div class="pw-note">⏳ Claim under review by Pludor business verification (${biz.claim.status.replace('_', ' ')}).</div>` : html`<form class="pw-form" data-form="claim"><h4>Claim this business</h4><p class="pw-muted">Owners verify through Pludor’s existing business verification. Once approved you control this storefront, products, bookings, gigs and ads.</p><input name="contact" required placeholder="Business email or phone" maxlength="80"><button class="pw-btn">Start verification</button></form>`) : ''}
    <h4>Help keep the map accurate</h4>
    ${biz.myFeedback ? html`<p class="pw-muted">Thanks for reporting. Community: ${Object.entries(fb).map(([k, v]) => `${k} ${v}`).join(' · ') || '—'}</p>` : html`<div class="pw-chips">${['active', 'closed', 'relocated', 'incorrect', 'verified'].map((st) => html`<button class="pw-chip-btn" ${A('feedback', st)}>${{ active: '✅ Still open', closed: '⛔ Closed', relocated: '🚚 Moved', incorrect: '❓ Info wrong', verified: '🏅 Verified visit' }[st]}</button>`)}</div>`}
    <div class="pw-row">${btn('Open business page', 'link', { key: 'business.view', params: { businessId: biz.id } }, 'ghost sm')}</div>`;
}

// Market District → existing Marketplace / Classifieds.
PLACE_KINDS.market = {
  async render(app, props, s, p) {
    const listings = await app.api.commerce.listListings();
    const bought = new Set((await app.api.commerce.getOrders()).orders.map((o) => o.listingId).filter(Boolean));
    return html`${placeHeader(app, p)}<p class="pw-blurb">Every stall is a live Pludor Marketplace listing. Haggle with sellers in messages, buy with checkout.</p>${eventStrip(app, p.id)}
      <div class="pw-list">${listings.map((l) => html`<div class="pw-item"><div class="pw-item-icon">${l.icon}</div><div class="pw-item-body"><b>${l.title}</b><small>${l.condition} · @${l.seller.handle}</small><span class="pw-price">${$m(l.price)}</span></div>
        <div class="pw-col">${bought.has(l.id) ? html`<span class="pw-tag ok">Bought</span>` : btn('Buy', 'buy', l.id, 'sm')}${btn('Message', 'chat', l.sellerId, 'sm ghost')}</div></div>`)}</div>
      <div class="pw-row">${btn('Sell something', 'link', { key: 'marketplace.listing', params: { listingId: 'new' } }, 'ghost')}</div>`;
  },
  actions: {
    async buy(app, props, id, s) {
      if (!confirm('Buy this item with your Pludor Wallet?')) return;
      const r = await app.api.commerce.buyListing(id);
      app.hud.showProgress(r.progress);
      app.hud.toast('Purchased — arrange pickup with the seller in messages', '🛍️');
      s.render(true);
    },
  },
};

// Creator Hub → generalised Work Engine (UGC is one category).
PLACE_KINDS.creator = {
  async render(app, props, s, p) {
    props.tab ||= 'board';
    const creators = RESIDENTS.filter((r) => r.roles.some((x) => /Creator|Photographer|Agency/.test(x)));
    let body;
    if (props.tab === 'board') body = workBoard(app, {});
    else if (props.tab === 'post') body = postGigForm(props);
    else if (props.tab === 'mine') body = await myWork(app);
    else body = html`<div class="pw-list">${creators.map((c) => personRow({ ...c, handle: c.handle }, html`<div class="pw-row tight">${btn('View', 'view', { view: 'player', props: { id: c.id } }, 'sm ghost')}${btn('Hire', 'tab', 'post', 'sm')}</div>`))}</div>
      <div class="pw-note">🎬 Creator Marketplace, rates and affiliate earnings live in Creator Hub. ${html`<button class="pw-link-btn" ${A('link', { key: 'creator.hub' })}>Open Creator Hub</button>`}</div>`;
    return html`${placeHeader(app, p)}${tabs(props, [['board', 'Gig board'], ['post', 'Post a gig'], ['mine', 'My work'], ['creators', 'Creators']])}${body}`;
  },
  actions: { tab: tabAction },
  forms: { post: postGigSubmit },
};

function workBoard(app, { placeId } = {}) {
  const gigs = app.state.gigs.filter((g) => !g.mine && (!placeId || g.placeId === placeId || g.parcelId === placeId) && (g.status === undefined || g.status === 'open' || g.application) && g.application?.status !== 'completed');
  const active = gigs.filter((g) => g.application);
  const ok = gigs.filter((g) => !g.application && g.eligible);
  const locked = gigs.filter((g) => !g.application && !g.eligible);
  return html`${active.length ? html`<h4>In progress</h4><div class="pw-list">${active.map((g) => gigCard(app, g))}</div>` : ''}
    <h4>You qualify (${ok.length})</h4>${ok.length ? html`<div class="pw-list">${ok.map((g) => gigCard(app, g))}</div>` : empty('Nothing yet — unlock more below.')}
    ${locked.length ? html`<h4>Unlock with a course (${locked.length})</h4><div class="pw-list">${locked.map((g) => gigCard(app, g))}</div>` : ''}`;
}

function postGigForm(props) {
  const pre = props.prefill || {};
  return html`<form class="pw-form" data-form="post"><p class="pw-muted">Pay is held in escrow from your wallet and released when you approve the work.</p>
    <label>Title<input name="title" required minlength="4" maxlength="60" value="${pre.title || ''}" placeholder="e.g. Product photos for my shop"></label>
    <label>Category<select name="category">${['photography', 'ugc', 'design', 'marketing', 'local-service', 'delivery', 'virtual-construction', 'business-services'].map((c) => html`<option value="${c}" ${pre.category === c ? raw('selected') : ''}>${catLabel(c)}</option>`)}</select></label>
    <label>Pay (${sym()})<input name="amount" type="number" min="5" max="500" step="1" required value="${pre.amount || 40}"></label>
    <label>Details<textarea name="description" maxlength="400" rows="3" placeholder="What do you need delivered?">${pre.description || ''}</textarea></label>
    <button class="pw-btn">Fund escrow & post</button></form>`;
}

async function postGigSubmit(app, props, data, s) {
  const { gig, progress } = await app.api.work.createGig({ ...data, amount: Number(data.amount), placeId: props.prefill?.placeId || null, parcelId: props.prefill?.parcelId || null });
  app.hud.showProgress(progress);
  app.hud.toast(`Posted “${gig.title}” · ${$m(gig.escrow)} in escrow`, '📌');
  await app.refresh();
  s.open('gig', { id: gig.id });
}

async function myWork(app) {
  const w = await app.api.work.myWork();
  const apps = w.applications.filter((a) => a.gig);
  return html`<h4>Applications</h4>${apps.length ? html`<div class="pw-list">${apps.map((a) => html`<button class="pw-gig active" ${A('view', { view: 'gig', props: { id: a.gig.id } })}><div class="pw-gig-title">${a.gig.title}</div><div class="pw-gig-meta">${{ applied: 'Applied — waiting for the requester', assigned: 'Hired — submit your work', submitted: 'Submitted — in review', completed: 'Completed — paid' }[a.status]}</div></button>`)}</div>` : empty('No applications yet.')}
    <h4>Gigs you posted</h4>${w.posted.length ? html`<div class="pw-list">${w.posted.map((g) => html`<button class="pw-gig mine" ${A('view', { view: 'gig', props: { id: g.id } })}><div class="pw-gig-top"><span class="pw-cat">${catLabel(g.category)}</span><b class="pw-pay">${$m(g.escrow)}</b></div><div class="pw-gig-title">${g.title}</div><div class="pw-gig-meta">${{ open: `${g.applicants.length} applicant(s)`, assigned: `@${g.worker?.handle} is working`, submitted: 'Delivered — approve to release escrow', completed: 'Completed' }[g.status]}</div></button>`)}</div>` : empty('You haven’t posted any gigs.')}`;
}

// Signals Hall → existing Signals communities.
PLACE_KINDS.community = {
  async render(app, props, s, p) {
    const comms = await app.api.world.listCommunities();
    const here = app.people().filter((x) => Math.hypot(x.x - p.x, x.z - (p.z - 20)) < 30);
    return html`${placeHeader(app, p, html`<div class="pw-hero-acts">${activityBtn(p)}</div>`)}<p class="pw-blurb">Every room here is a Signals community. Join to post, chat and get event invites.</p>
      <div class="pw-grid2">${comms.map((c) => html`<div class="pw-comm"><span>${c.icon}</span><b>${c.name}</b><small>${c.members.toLocaleString()} members</small>${c.joined ? btn('Open', 'link', { key: 'signals.community', params: { communityId: c.id } }, 'sm ghost') : btn('Join', 'join', c.id, 'sm')}</div>`)}</div>
      ${here.length ? html`<h4>People around</h4><div class="pw-list">${here.map((x) => personRow({ ...x, handle: x.name }, btn('Talk', 'chat', x.id, 'sm ghost')))}</div>` : ''}`;
  },
  actions: {
    async join(app, props, id, s) {
      const r = await app.api.world.joinCommunity(id);
      app.hud.showProgress(r);
      s.render(true);
    },
  },
};

// Academy → existing ACCA / courses / challenges.
PLACE_KINDS.education = {
  async render(app, props, s, p) {
    return html`${placeHeader(app, p, html`<div class="pw-hero-acts">${activityBtn(p)}</div>`)}${eventStrip(app, p.id)}<p class="pw-blurb">Learn → qualify → work → earn. Courses unlock skills that gigs require.</p>${coursesList(app)}${skillsList(app)}`;
  },
};

function coursesList(app) {
  return html`<div class="pw-list">${app.state.courses.map((c) => html`<button class="pw-course ${c.completed ? 'done' : ''}" ${A('view', { view: 'course', props: { id: c.id } })}><div><span class="pw-tag">${c.provider}</span> <b>${c.title}</b><small>${c.minutes} min · unlocks ${c.skillLabel} L${c.grantsLevel}${c.unlocksGigs.length ? ` · ${c.unlocksGigs.length} gig${c.unlocksGigs.length > 1 ? 's' : ''}` : ''}</small></div><span>${c.completed ? '✓' : '→'}</span></button>`)}</div>`;
}

function skillsList(app) {
  const skills = app.state.progress.skills;
  return html`<h4>Your skills</h4><div class="pw-skills">${Object.entries(SKILLS).map(([id, def]) => {
    const s = skills.find((x) => x.id === id);
    const lvl = s?.level || 0;
    return html`<div class="pw-skill ${lvl ? '' : 'zero'}"><span>${def.label}</span><i>${[1, 2, 3, 4, 5].map((n) => html`<b class="${n <= lvl ? 'on' : ''}"></b>`)}</i></div>`;
  })}</div>`;
}

// AI Studio → existing AI Studio.
PLACE_KINDS.ai = {
  async render(app, props, s, p) {
    const tools = [['image', '🖼️', 'Image'], ['video', '🎥', 'Video'], ['voice', '🎙️', 'Voice'], ['avatar', '🧑‍🎤', 'Avatar'], ['ad', '📣', 'Ad creative'], ['brand', '🎨', 'Brand kit']];
    return html`${placeHeader(app, p)}<p class="pw-blurb">Create images, video, voice, avatars, ads and brand assets with Pludor AI Studio.</p>
      <div class="pw-grid3">${tools.map(([id, ic, label]) => html`<button class="pw-tile" ${A('link', { key: 'aiStudio.tool', params: { tool: id } })}><span>${ic}</span>${label}</button>`)}</div>
      <div class="pw-row">${btn('Ask Pludor AI', 'view', { view: 'ai' })}${btn('Open AI Studio', 'link', { key: 'aiStudio.home' }, 'ghost')}</div>`;
  },
};

// Arcade → games as places.
PLACE_KINDS.games = {
  async render(app, props, s, p) {
    return html`${placeHeader(app, p, html`<div class="pw-hero-acts">${activityBtn(p)}</div>`)}${eventStrip(app, p.id)}${gamesBody(app)}`;
  },
};

function gamesBody(app) {
  const best = JSON.parse(sessionStorageSafe('pw-best') || '{}');
  return html`<div class="pw-games">
    <button class="pw-game" style="--g1:#4776e6;--g2:#8e54e9" ${A('view', { view: 'reaction' })}><span>⚡</span><b>Reaction Rush</b><small>5 rounds · up to +${ECONOMY.games['reaction-rush'].maxRewardXp} bonus XP${best.reaction ? ` · best ${best.reaction}ms` : ''}</small></button>
    <button class="pw-game" style="--g1:#ff7a18;--g2:#af002d" ${A('view', { view: 'trivia' })}><span>❓</span><b>Nova Trivia</b><small>3 questions · up to +${ECONOMY.games['nova-trivia'].maxRewardXp} bonus XP${best.trivia ? ` · best ${best.trivia}` : ''}</small></button>
    <div class="pw-game soon"><span>🏁</span><b>Street Race</b><small>Coming soon · sponsored races</small></div>
    <div class="pw-game soon"><span>🖼️</span><b>4 Pics 1 Word</b><small>Coming soon</small></div></div>
    <p class="pw-muted">Scores are validated by the server; XP is a game reward and never converts to money.</p>`;
}

function sessionStorageSafe(k, v) {
  try {
    if (v === undefined) return sessionStorage.getItem(k);
    sessionStorage.setItem(k, v);
  } catch {
    return null;
  }
  return null;
}

// Wayfare Hub → rides, courier, rentals.
PLACE_KINDS.transit = {
  async render(app, props, s, p) {
    const dests = [{ id: 'central-plaza', name: 'Central Plaza' }, ...PLACES.filter((x) => x.id !== p.id)];
    return html`${placeHeader(app, p)}
      <h4>Ride in Nova City</h4><p class="pw-muted">Free in-world transit. Arrive instantly.</p>
      <div class="pw-chips">${dests.map((d) => html`<button class="pw-chip-btn" ${A('ride', d.id)}>${KIND_ICON[d.kind] || '⛲'} ${d.name}</button>`)}</div>
      <h4>Real-world Wayfare</h4>
      <div class="pw-grid3">
        <button class="pw-tile" ${A('link', { key: 'wayfare.rides' })}><span>🚗</span>Book a ride</button>
        <button class="pw-tile" ${A('link', { key: 'wayfare.courier' })}><span>📦</span>Send a package</button>
        <button class="pw-tile" ${A('link', { key: 'wayfare.rentals' })}><span>🔑</span>Rentals</button></div>
      ${workBoard(app, { placeId: p.id })}`;
  },
  actions: {
    async ride(app, props, id, s) {
      const r = await app.api.world.worldRide(id);
      app.hud.showProgress(r.progress);
      s.close();
      if (id === 'central-plaza') {
        app.hud.fade(() => {
          app.player.position.set(PLAZA.x, 0.2, PLAZA.z + 9);
          app.cam.target.copy(app.player.position);
        });
      } else app.teleport(id);
    },
  },
};

// Flika Cinema → Flika media layer: view → like → follow → shop.
PLACE_KINDS.media = {
  async render(app, props, s, p) {
    const reels = await app.api.world.listReels();
    return html`${placeHeader(app, p)}${eventStrip(app, p.id)}<div class="pw-list">${reels.map((r) => html`<button class="pw-reel" ${A('view', { view: 'reel', props: { id: r.id } })}><div class="pw-reel-thumb">▶</div><div><b>${r.title}</b><small>@${r.creatorUser.handle} · ${r.views} views</small>${r.productSku ? html`<span class="pw-tag ok">Shoppable</span>` : ''}</div></button>`)}</div>
      <div class="pw-row">${btn('Open Flika', 'link', { key: 'flika.home' }, 'ghost')}</div>`;
  },
};

// Tool District → existing free tools as kiosks.
PLACE_KINDS.tools = {
  async render(app, props, s, p) {
    const tools = await app.api.world.listTools();
    return html`${placeHeader(app, p)}<p class="pw-blurb">Free Pludor business tools — each kiosk opens the real tool.</p>
      <div class="pw-grid3">${tools.map((t) => html`<button class="pw-tile" ${A('tool', t.id)}><span>${t.icon}</span>${t.name}</button>`)}</div>`;
  },
  actions: {
    async tool(app, props, id) {
      const r = await app.api.world.useTool(id);
      app.hud.showProgress(r.progress);
      app.hud.showLink(r.route);
    },
  },
};

// GIG ───────────────────────────────────────────────────────
VIEWS.gig = {
  title: 'Gig',
  async render(app, props) {
    const g = await app.api.work.getGig(props.id);
    props._g = g;
    const place = g.placeId ? placeById(g.placeId) : null;
    const st = g.posted ? g.status : g.application?.status;
    let action = '';
    if (g.mine) {
      if (g.status === 'open') action = g.applicants?.length ? html`<h4>Applicants</h4><div class="pw-list">${g.applicants.map((a) => personRow(a.user, html`<div class="pw-row tight">${btn('Message', 'chat', a.userId, 'sm ghost')}${btn('Hire', 'hire', a.userId, 'sm')}</div>`))}</div>` : html`<div class="pw-note">⏳ Waiting for applicants. Your gig is pinned on the map.</div>`;
      else if (g.status === 'assigned') action = html`<div class="pw-note">🔨 Work in progress.</div>`;
      else if (g.status === 'submitted') action = html`<div class="pw-note">📦 Delivered: “${g.deliverable}”</div>${btn(`Approve & release ${$m(g.escrow)}`, 'approve', null)}`;
      else action = html`<div class="pw-success"><div class="pw-success-icon">✓</div>Completed · escrow released</div>`;
    } else if (!st) {
      action = g.eligible
        ? html`<form class="pw-form" data-form="apply"><textarea name="note" rows="2" maxlength="300" placeholder="Short pitch to the requester (optional)"></textarea><button class="pw-btn">Apply</button></form>`
        : html`<div class="pw-gate"><b>🔒 You need ${g.missing.map((m) => `${m.label} Level ${m.level}`).join(', ')}</b><p>You have level ${g.missing.map((m) => m.have).join(', ')}.${g.course ? ` Pludor AI suggests: ${g.course.title}.` : ''}</p>${g.course ? btn(`Learn it: ${g.course.title}`, 'view', { view: 'course', props: { id: g.course.id, returnGig: g.id } }) : ''}</div>`;
    } else if (st === 'applied') action = html`<div class="pw-note">⏳ Applied. ${g.requester.displayName} will review shortly.</div>`;
    else if (st === 'assigned') action = html`<div class="pw-note good">🎉 You’re hired! Complete the work, then submit your deliverable.</div><form class="pw-form" data-form="submit"><input name="deliverable" required maxlength="300" placeholder="Link or note for your deliverable"><button class="pw-btn">Submit for approval</button></form>`;
    else if (st === 'submitted') action = html`<div class="pw-note">📦 Submitted — awaiting approval. Payment is secured in escrow.</div>`;
    else if (st === 'completed') action = html`<div class="pw-success"><div class="pw-success-icon">💸</div><h3>Paid ${g.payLabel}</h3><p>Escrow released to your wallet. Reputation increased.</p></div>`;
    return html`<div class="pw-gig-hero"><span class="pw-cat">${catLabel(g.category)}</span>${g.legacy ? html`<span class="pw-tag">UGC job ${g.legacy.jobId}</span>` : ''}${g.source === 'business-graph' ? html`<span class="pw-tag">From business data</span>` : ''}${g.source === 'ads-campaign' ? html`<span class="pw-tag">From ad campaign</span>` : ''}
      <h3>${g.title}</h3><div class="pw-pay big">${g.payLabel}</div><small class="pw-muted">${g.compensation.note || 'Fixed price'} · 🔒 Escrow funded</small></div>
      <p>${g.description}</p>
      <div class="pw-kv"><div><span>Requester</span><b>${g.requester.displayName}</b></div><div><span>Where</span><b>${place ? place.name : g.mode === 'remote' ? 'Remote' : 'Nova City'}</b></div><div><span>Skills</span><b>${g.skills.length ? g.skills.map((x) => `${SKILLS[x.skill]?.label} L${x.level}`).join(', ') : 'None required'}</b></div>${g.deliverables ? html`<div><span>Deliverables</span><b>${g.deliverables.join(', ')}</b></div>` : ''}</div>
      ${action}
      <div class="pw-row">${!g.mine && g.requester && !g.requester.isSystem ? btn('💬 Talk to requester', 'chat', g.requesterId, 'ghost sm') : ''}${place ? btn('📍 Go there', 'go', goArg(place), 'ghost sm') : ''}${g.legacy ? btn('Open in UGC', 'link', { key: 'work.ugcJob', params: { jobId: g.legacy.jobId } }, 'ghost sm') : ''}</div>`;
  },
  actions: {
    async hire(app, props, userId, s) {
      await app.api.work.hire(props.id, userId);
      app.hud.toast('Hired! They’ll deliver soon.', '🤝');
      await app.refresh();
      s.render();
    },
    async approve(app, props, a, s) {
      await app.api.work.approve(props.id);
      app.hud.toast('Escrow released — great collaboration', '💸');
      await app.refresh();
      s.render();
    },
  },
  forms: {
    async apply(app, props, data, s) {
      const r = await app.api.work.apply(props.id, data.note);
      app.hud.showProgress(r);
      app.hud.toast('Application sent', '📨');
      await app.refresh();
      s.render();
    },
    async submit(app, props, data, s) {
      await app.api.work.submit(props.id, data.deliverable);
      const gig = props._g;
      if (gig.activity) app.api.needs.performActivity(gig.activity).catch(() => {});
      app.hud.toast('Submitted for approval', '📦');
      await app.refresh();
      s.render();
    },
  },
};

// COURSE ────────────────────────────────────────────────────
VIEWS.course = {
  title: 'Course',
  noAutoRefresh: true,
  async render(app, props) {
    const c = await app.api.learning.getCourse(props.id);
    props.answers ||= [];
    if (props.result?.passed) {
      return html`<div class="pw-success"><div class="pw-success-icon">🎓</div><h3>Skill unlocked: ${c.skillLabel} L${c.grants.level}</h3><p>Course complete. Your new skill is on your Pludor profile.</p>
        <div class="pw-row">${props.returnGig ? btn('Back to the gig → apply', 'view', { view: 'gig', props: { id: props.returnGig } }) : ''}${btn('Find gigs', 'view', { view: 'work' }, props.returnGig ? 'ghost' : '')}</div></div>`;
    }
    return html`<div class="pw-gig-hero"><span class="pw-tag">${c.provider}</span><h3>${c.title}</h3><small class="pw-muted">${c.minutes} min · unlocks ${c.skillLabel} L${c.grants.level}</small></div>
      <ol class="pw-lessons">${c.lessons.map((l) => html`<li>${l}</li>`)}</ol>
      <h4>Challenge</h4>
      ${c.challenge.map((q, i) => html`<div class="pw-quiz"><b>${i + 1}. ${q.q}</b>${q.options.map((o, j) => html`<button class="${props.answers[i] === j ? 'on' : ''}" ${A('answer', { i, j })}>${o}</button>`)}</div>`)}
      ${props.result && !props.result.passed ? html`<p class="pw-warn">${props.result.correct}/${props.result.total} correct — review the lessons and try again.</p>` : ''}
      <div class="pw-row">${btn('Submit answers', 'grade', null)}${btn('Full course in Academy', 'link', { key: 'academy.course', params: { courseId: c.id } }, 'ghost')}</div>`;
  },
  actions: {
    answer(app, props, { i, j }, s) {
      props.answers[i] = j;
      props.result = null;
      s.render(true);
    },
    async grade(app, props, a, s) {
      const r = await app.api.learning.completeCourse(props.id, props.answers);
      props.result = r;
      if (r.passed) {
        app.hud.showProgress(r.progress);
        await app.refresh();
      }
      s.render();
    },
  },
};

// PARCEL / LAND ─────────────────────────────────────────────
VIEWS.parcel = {
  title: (app, p) => PARCELS.find((x) => x.id === p.id)?.name || 'Parcel',
  async render(app, props) {
    const parcels = await app.api.land.listParcels();
    const p = parcels.find((x) => x.id === props.id);
    const tpls = ECONOMY.land.templates;
    const info = html`<div class="pw-kv"><div><span>Zoning</span><b>${p.zoning}</b></div><div><span>Size</span><b>${p.w} × ${p.d} m</b></div><div><span>Rent</span><b>${p.rentLabel}</b></div><div><span>Purchase</span><b>${$m(p.price)} · when available</b></div></div>`;
    if (p.status === 'available') {
      props.template ||= p.allowedTemplates[0];
      return html`<div class="pw-place-hero" style="--accent:#ffd166"><div class="pw-place-icon">🏗️</div><div><div class="pw-place-kind">Available parcel</div><div class="pw-place-meta">Riverside Lots · Central</div></div></div>${info}
        <h4>Choose a building</h4><div class="pw-grid3">${Object.entries(tpls).map(([id, t]) => {
          const ok = p.allowedTemplates.includes(id);
          return html`<button class="pw-tile ${props.template === id ? 'on' : ''} ${ok ? '' : 'off'}" ${ok ? A('tpl', id) : raw('disabled')}><span>${t.icon}</span>${t.label}${ok ? '' : html`<small>not zoned</small>`}</button>`;
        })}</div>
        ${btn(`Rent for ${p.rentLabel}`, 'rent', null)}<p class="pw-muted">Rent is paid from your wallet. Your building appears instantly and is visible to everyone.</p>
        ${btn('Ask Nia the realtor', 'view', { view: 'agent', props: { id: 'npc-nia' } }, 'ghost sm')}`;
    }
    if (!p.mine) {
      return html`${info}<div class="pw-note">Rented by ${p.tenant.displayName}${p.building.businessName ? ` · ${p.building.businessName}` : ''}.</div><div class="pw-row">${btn('💬 Message owner', 'chat', p.tenant.id, 'ghost')}</div>`;
    }
    const b = p.building;
    return html`<div class="pw-place-hero" style="--accent:#36d399"><div class="pw-place-icon">${tpls[b.template].icon}</div><div><div class="pw-place-kind">Your ${tpls[b.template].label}</div><div class="pw-place-meta">${b.businessName || 'Not open yet'}</div></div></div>${info}
      ${b.template === 'home'
        ? html`<div class="pw-row">${btn('😴 Sleep', 'activity', { id: 'sleep', placeId: 'home' })}${btn('🚿 Freshen up', 'activity', { id: 'shower', placeId: 'home' }, 'ghost')}</div>`
        : b.businessName
          ? html`<div class="pw-note good">🏪 ${b.businessName} is open in World.</div>`
          : html`<form class="pw-form" data-form="open"><h4>Open your business</h4><input name="name" required minlength="2" maxlength="22" placeholder="Business name"><button class="pw-btn">Open for business</button></form>`}
      <h4>Grow it</h4><div class="pw-grid3">
        <button class="pw-tile" ${A('view', { view: 'post-gig', props: { prefill: { parcelId: p.id, title: 'Build my storefront', category: 'virtual-construction', amount: 40 } } })}><span>🔨</span>Hire a builder</button>
        <button class="pw-tile" ${A('view', { view: 'post-gig', props: { prefill: { parcelId: p.id, title: 'Product photos for my shop', category: 'photography', amount: 45 } } })}><span>📸</span>Hire a photographer</button>
        <button class="pw-tile" ${A('link', { key: 'aiStudio.tool', params: { tool: 'brand' } })}><span>🎨</span>AI branding</button>
        <button class="pw-tile" ${A('link', { key: 'ads.newWorldCampaign' })}><span>📣</span>World billboard</button>
        <button class="pw-tile" ${A('view', { view: 'agent', props: { id: 'npc-remy' } })}><span>📈</span>Ask Remy</button>
        <button class="pw-tile" ${A('link', { key: 'live.event', params: { eventId: 'new' } })}><span>🎉</span>Host an event</button></div>`;
  },
  actions: {
    tpl(app, props, id, s) {
      props.template = id;
      s.render(true);
    },
    async rent(app, props, a, s) {
      const parcel = PARCELS.find((x) => x.id === props.id);
      if (!confirm(`Rent ${parcel.name} for ${sym()}${parcel.rentPerWeek}/week from your Pludor Wallet?`)) return;
      const r = await app.api.land.rent(props.id, props.template);
      app.hud.showProgress(r);
      app.hud.toast('Parcel rented — your building is going up!', '🏗️');
      await app.refresh();
      s.render();
    },
  },
  forms: {
    async open(app, props, data, s) {
      const r = await app.api.land.openBusiness(props.id, data.name);
      app.hud.showProgress(r);
      await app.refresh();
      s.render();
    },
  },
};

VIEWS['post-gig'] = {
  title: 'Post a gig',
  noAutoRefresh: true,
  render: (app, props) => postGigForm(props),
  forms: { post: postGigSubmit },
};

// BILLBOARD (World ad placement) ────────────────────────────
VIEWS.billboard = {
  title: 'Sponsored',
  async render(app, props) {
    const b = BILLBOARDS.find((x) => x.id === props.id);
    const c = await app.api.ads.getCreative(b.placementId);
    props._c = c;
    const stats = await app.api.ads.getStats(c.id);
    return html`<div class="pw-ad" style="--g1:${c.bg[0]};--g2:${c.bg[1]}"><small>Sponsored · ${c.advertiserName}</small><b>${c.headline}</b><span>${c.sub}</span></div>
      ${btn(`${c.cta} →`, 'cta', null)}
      <div class="pw-kv"><div><span>Placement</span><b>${b.placementId}</b></div><div><span>World reach</span><b>${stats.impressions} views · ${stats.interactions} taps</b></div></div>
      <div class="pw-note">📣 This screen is inventory in Pludor Ads Manager. ${html`<button class="pw-link-btn" ${A('link', { key: 'ads.newWorldCampaign' })}>Advertise here</button>`}</div>`;
  },
  actions: {
    async cta(app, props, a, s) {
      const c = props._c;
      const r = await app.api.ads.trackInteraction(c.placementId, c.id, 'cta');
      app.hud.showProgress(r.progress);
      const t = r.target;
      if (t.type === 'place') {
        app.enterPlace(t.id);
        const top = s.top;
        if (top) top.props.attribution = { source: 'world-ad', id: c.id };
      } else app.openRef(t);
    },
  },
};

VIEWS.reel = {
  title: 'Flika',
  async render(app, props) {
    const reels = await app.api.world.listReels();
    const r = reels.find((x) => x.id === props.id);
    return html`<div class="pw-player-vid"><div class="pw-vid-anim"></div><div class="pw-vid-cap"><b>${r.title}</b><small>@${r.creatorUser.handle} · ${r.views} views</small></div></div>
      <div class="pw-row">
        <button class="pw-btn ghost sm ${props.liked ? 'on' : ''}" ${A('like')}>${props.liked ? '❤️ Liked' : '🤍 Like'}</button>
        ${btn('➕ Follow', 'follow', r.creator, 'ghost sm')}
        ${btn('↗ Share', 'link', { key: 'flika.reel', params: { reelId: r.id } }, 'ghost sm')}</div>
      ${r.businessId ? html`<div class="pw-note">🛍️ Shoppable — products in this reel are available now. ${btn('Shop this', 'shop', r.businessId, 'sm')}</div>` : ''}`;
  },
  actions: {
    like(app, props, a, s) {
      props.liked = !props.liked;
      s.render(true);
    },
    async follow(app, props, id) {
      const r = await app.api.social.follow(id);
      app.hud.showProgress(r);
      app.hud.toast(r.following ? 'Following' : 'Unfollowed', '➕');
    },
    shop(app, props, bizId, s) {
      const p = PLACES.find((x) => x.link?.id === bizId);
      app.enterPlace(p.id);
      s.top.props.attribution = { source: 'flika', id: props.id };
    },
  },
};

// PEOPLE ────────────────────────────────────────────────────
VIEWS.player = {
  title: 'Profile',
  async render(app, props) {
    const u = await app.api.identity.getUser(props.id);
    const rel = await app.api.social.getRelationship(props.id);
    const res = RESIDENTS.find((r) => r.id === props.id);
    const place = res?.owns ? PLACES.find((p) => p.link.id === res.owns) : null;
    const theirGigs = app.state.gigs.filter((g) => g.requesterId === props.id && g.application?.status !== 'completed');
    return html`<div class="pw-profile-hero" style="--c:${u.color}"><span class="pw-av xl" style="background:${u.color}">${u.displayName[0]}</span><div><h3>${u.displayName}</h3><small>@${u.handle} · <span class="pw-dot" style="background:${PRESENCE_COLORS[u.presence] || '#6b7280'}"></span>${u.presence}</small>
      <div class="pw-chips">${(u.roles || []).map((r) => html`<span class="pw-tag">${r}</span>`)}${rel.friend ? html`<span class="pw-tag ok">Friend</span>` : ''}</div></div></div>
      ${u.bio ? html`<p class="pw-blurb">${u.bio}</p>` : ''}
      <div class="pw-grid3">
        <button class="pw-tile" ${A('chat', props.id)}><span>💬</span>Message</button>
        ${app.flags.WORLD_VOICE_ENABLED ? html`<button class="pw-tile" ${A('call', props.id)}><span>🎙️</span>Voice</button>` : ''}
        <button class="pw-tile" ${A('wave', props.id)}><span>👋</span>Wave</button>
        <button class="pw-tile ${rel.friend ? 'on' : ''}" ${A('friend', props.id)}><span>🤝</span>${rel.friend ? 'Friends' : 'Add friend'}</button>
        <button class="pw-tile ${rel.following ? 'on' : ''}" ${A('follow', props.id)}><span>➕</span>${rel.following ? 'Following' : 'Follow'}</button>
        <button class="pw-tile" ${A('view', { view: 'post-gig', props: { prefill: { title: `Gig for @${u.handle}` } } })}><span>💼</span>Hire</button>
        <button class="pw-tile" ${A('view', { view: 'games' })}><span>🎮</span>Challenge</button>
        ${place ? html`<button class="pw-tile" ${A('place', place.id)}><span>🏪</span>Business</button>` : ''}
        <button class="pw-tile" ${A('link', { key: 'profile.view', params: { handle: u.handle } })}><span>👤</span>Full profile</button></div>
      ${res?.skills && Object.keys(res.skills).length ? html`<h4>Skills</h4><div class="pw-chips">${Object.entries(res.skills).map(([k, v]) => html`<span class="pw-tag">${SKILLS[k]?.label} L${v}</span>`)}</div>` : ''}
      ${theirGigs.length ? html`<h4>Their open gigs</h4><div class="pw-list">${theirGigs.map((g) => gigCard(app, g))}</div>` : ''}
      <h4>Safety</h4><div class="pw-row">${btn(rel.muted ? 'Unmute' : 'Mute', 'mute', props.id, 'ghost sm')}${btn(rel.blocked ? 'Unblock' : 'Block', 'block', props.id, 'ghost sm')}${btn('Report', 'report', props.id, 'ghost sm danger')}</div>`;
  },
  actions: {
    wave: (app, p, id, s) => s.wave(id),
    async friend(app, props, id, s) {
      const r = await app.api.social.addFriend(id);
      app.hud.showProgress(r);
      app.hud.toast('Friend added', '🤝');
      s.render(true);
    },
    async follow(app, props, id, s) {
      const r = await app.api.social.follow(id);
      app.hud.showProgress(r);
      s.render(true);
    },
    async mute(app, props, id, s) {
      const r = await app.api.social.mute(id);
      app.hud.toast(r.muted ? 'Muted' : 'Unmuted', '🔇');
      s.render(true);
    },
    async block(app, props, id, s) {
      const r = await app.api.social.block(id);
      app.hud.toast(r.blocked ? 'Blocked — they can’t message or call you' : 'Unblocked', '⛔');
      s.render(true);
    },
    async report(app, props, id) {
      const reason = prompt('What happened? (harassment, spam, scam, other)');
      if (!reason) return;
      const t = await app.api.social.report(id, reason);
      app.hud.toast(`Report ${t.id} sent to Pludor moderation`, '🛡️');
    },
  },
};

VIEWS.chat = {
  title: (app, p) => `@${app.personHandle(p.userId)}`,
  async render(app, props) {
    if (!props.tracked) {
      props.tracked = true;
      app.api.gamification.track(EV.TALKED_TO_PLAYER, { userId: props.userId, mode: 'text' }).then((r) => app.hud.showProgress(r)).catch(() => {});
      app.emote = 'talk';
    }
    const msgs = await app.api.messaging.getConversation(props.userId);
    const me = app.state.profile.id;
    return html`<div class="pw-chat-head">${btn('👤 Profile', 'view', { view: 'player', props: { id: props.userId } }, 'ghost sm')}${app.flags.WORLD_VOICE_ENABLED ? btn('🎙️ Voice', 'call', props.userId, 'ghost sm') : ''}<small class="pw-muted">via Pludor Messages</small></div>
      <div class="pw-chat">${msgs.length ? msgs.map((m) => html`<div class="pw-msg ${m.from === me ? 'me' : ''}"><span>${m.text}</span><small>${timeAgo(m.ts)}</small></div>`) : empty('Say hi 👋')}</div>
      <form class="pw-chat-form" data-form="send"><input name="text" autocomplete="off" maxlength="500" placeholder="Message @${app.personHandle(props.userId)}" required><button class="pw-btn">Send</button></form>`;
  },
  mounted(app, props, s, body) {
    const c = body.querySelector('.pw-chat');
    c.scrollTop = c.scrollHeight;
    if (matchMedia('(pointer: fine)').matches) body.querySelector('input')?.focus();
  },
  forms: {
    async send(app, props, data, s, f) {
      await app.api.messaging.send(props.userId, data.text);
      f.reset();
      await s.render(true);
      s.el.querySelector('.pw-chat-form input')?.focus();
    },
  },
};

// AI AGENTS / PLUDOR AI ────────────────────────────────────
VIEWS.agent = {
  title: (app, p) => {
    const a = AGENTS.find((x) => x.id === p.id);
    return `${a.icon} ${a.name} · ${a.role}`;
  },
  noAutoRefresh: true,
  async render(app, props) {
    const a = AGENTS.find((x) => x.id === props.id);
    props._r ||= await app.api.ai.askAgent(a.agent, app.aiContext());
    const r = props._r;
    let extra = '';
    if (r.parcels) {
      const ps = app.state.parcels.filter((p) => r.parcels.includes(p.id));
      extra = html`<div class="pw-list">${ps.map((p) => html`<div class="pw-result"><div><b>${p.name}</b><small>${p.zoning} · ${p.rentLabel}</small></div><div class="pw-row tight">${btn('View', 'view', { view: 'parcel', props: { id: p.id } }, 'sm ghost')}${btn('Go', 'go', { x: p.x, z: p.z - p.d / 2 - 2, label: p.name }, 'sm')}</div></div>`)}</div>`;
    }
    if (r.gigs) extra = html`<div class="pw-list">${app.state.gigs.filter((g) => r.gigs.includes(g.id)).map((g) => gigCard(app, g))}</div>${btn('See all gigs', 'view', { view: 'work' }, 'ghost')}`;
    if (r.courses) extra = html`<div class="pw-list">${app.state.courses.filter((c) => r.courses.includes(c.id)).map((c) => html`<button class="pw-course" ${A('view', { view: 'course', props: { id: c.id } })}><div><b>${c.title}</b><small>${c.minutes} min · unlocks ${c.skillLabel} L${c.grantsLevel}</small></div><span>→</span></button>`)}</div>`;
    if (r.recs) extra = html`<ol class="pw-recs">${r.recs.map((x) => html`<li>${x.action === 'create-gig' ? html`<button class="pw-link-btn" ${A('view', { view: 'post-gig', props: { prefill: { category: x.category, title: x.label.replace('Post a ', '').replace(' gig', '') } } })}>${x.label}</button>` : html`<button class="pw-link-btn" ${A('link', { key: x.route, params: x.params })}>${x.label}</button>`}</li>`)}</ol>`;
    if (r.quests) extra = html`${btn('View quests', 'view', { view: 'quests' })}`;
    return html`<div class="pw-agent-msg"><span class="pw-ai-orb sm"></span><p>${r.reply}</p></div>${extra}
      <p class="pw-muted">AI agents use real Pludor actions. Anything that costs money asks you first.</p>`;
  },
};

VIEWS.ai = {
  title: 'Pludor AI',
  root: true,
  noAutoRefresh: true,
  async render(app, props, s) {
    if (props.ask && !props._asked) {
      props._asked = true;
      queueMicrotask(() => VIEWS.ai.forms.ask(app, props, { text: props.ask }, s));
    }
    const log = s.aiLog;
    return html`<div class="pw-ai-log">${log.length ? log.map((m) => (m.role === 'user' ? html`<div class="pw-msg me"><span>${m.text}</span></div>` : html`<div class="pw-agent-msg"><span class="pw-ai-orb sm"></span><div><p>${m.text}</p>${(m.results || []).map((r) => html`<div class="pw-result"><div><b>${r.label}</b><small>${r.sub}</small></div><div class="pw-row tight">${r.actions.map((a) => (a.type === 'navigate' ? btn(a.label === 'Go' || a.label === 'Take me there' || a.label === 'Walk over' ? a.label : 'Go', 'go', { x: a.x, z: a.z, label: r.label }, 'sm') : btn('Open', 'ref', a.ref, 'sm ghost')))}</div></div>`)}</div></div>`)) : html`<div class="pw-agent-msg"><span class="pw-ai-orb sm"></span><p>Hi ${app.state.profile.displayName}! I know where everything in Nova City is and I can act for you — find places, people, gigs, land and events, walk you there, and open checkout or bookings for you to confirm.</p></div>`}</div>
      <div class="pw-chips">${['What can I do here?', 'Who is hiring nearby?', 'Find me a coffee shop', 'Find a cheap storefront', 'What’s that building?', 'Find something fun'].map((q) => html`<button class="pw-chip-btn" ${A('suggest', q)}>${q}</button>`)}</div>
      <form class="pw-chat-form" data-form="ask"><input name="text" autocomplete="off" maxlength="300" placeholder="Ask anything — “take me to the arcade”" required><button class="pw-btn">Ask</button></form>`;
  },
  mounted(app, props, s, body) {
    const c = body.querySelector('.pw-ai-log');
    c.scrollTop = c.scrollHeight;
    if (matchMedia('(pointer: fine)').matches) body.querySelector('input')?.focus();
  },
  actions: {
    suggest(app, props, q, s) {
      return VIEWS.ai.forms.ask(app, props, { text: q }, s);
    },
  },
  forms: {
    async ask(app, props, data, s) {
      const text = String(data.text || '').trim();
      if (!text) return;
      s.aiLog.push({ role: 'user', text });
      s.render(true);
      const r = await app.api.ai.ask(text, app.aiContext());
      s.aiLog.push({ role: 'ai', text: r.reply, results: r.results });
      if (s.aiLog.length > 40) s.aiLog.splice(0, s.aiLog.length - 40);
      await s.render(true);
      const run = r.autorun;
      if (!run) return;
      if (run.type === 'navigate') {
        app.navigateTo({ x: run.x, z: run.z }, run.label);
        if (innerWidth < 900) setTimeout(() => s.close(), 900);
      } else if (run.type === 'open') setTimeout(() => app.openRef(run.ref), 700);
      else if (run.type === 'message') setTimeout(() => s.open('chat', { userId: run.userId }), 700);
      else if (run.type === 'call') s.call(run.userId);
    },
  },
};

// GAMES ────────────────────────────────────────────────────
VIEWS.games = {
  title: 'Games',
  root: true,
  render(app) {
    const arcade = placeById('arcade');
    return html`${gamesBody(app)}<div class="pw-row">${btn('📍 Go to Neon Arcade', 'go', goArg(arcade), 'ghost')}${btn('Events & tournaments', 'view', { view: 'events' }, 'ghost')}</div>`;
  },
};

VIEWS.reaction = {
  title: 'Reaction Rush',
  noAutoRefresh: true,
  async render(app, props) {
    if (!props.session) props.session = await app.api.games.startGame('reaction-rush');
    props.times ||= [];
    const rounds = props.session.rounds;
    if (props.result) {
      return html`<div class="pw-success"><div class="pw-success-icon">⚡</div><h3>Average ${props.result.score.avgMs} ms</h3><p>+${props.result.progress.xp} XP${props.result.progress.xp === 0 ? ' (daily game cap reached)' : ''}</p>
        <div class="pw-row">${btn('Play again', 'again')}${btn('Back to games', 'view', { view: 'games' }, 'ghost')}</div></div>`;
    }
    return html`<p class="pw-muted">Tap the pad the instant it turns green. Round ${Math.min(props.times.length + 1, rounds)}/${rounds}.</p>
      <button class="pw-pad ${props.phase || 'idle'}" ${A('pad')}>${{ idle: 'Tap to start', wait: 'Wait for green…', go: 'TAP!', early: 'Too soon! Tap to retry' }[props.phase || 'idle']}</button>
      <div class="pw-times">${props.times.map((t) => html`<span>${t} ms</span>`)}</div>`;
  },
  actions: {
    async pad(app, props, a, s) {
      const ph = props.phase || 'idle';
      if (ph === 'idle' || ph === 'early') {
        props.phase = 'wait';
        s.render(true);
        clearTimeout(props._t);
        props._t = setTimeout(() => {
          props.phase = 'go';
          props._go = performance.now();
          s.render(true);
        }, 900 + Math.random() * 1800);
      } else if (ph === 'wait') {
        clearTimeout(props._t);
        props.phase = 'early';
        s.render(true);
      } else if (ph === 'go') {
        props.times.push(Math.round(performance.now() - props._go));
        props.phase = 'idle';
        if (props.times.length >= props.session.rounds) {
          props.result = await app.api.games.submitGame(props.session.id, { times: props.times });
          app.hud.showProgress(props.result.progress);
          const best = JSON.parse(sessionStorageSafe('pw-best') || '{}');
          if (!best.reaction || props.result.score.avgMs < best.reaction) best.reaction = props.result.score.avgMs;
          sessionStorageSafe('pw-best', JSON.stringify(best));
        }
        s.render(true);
      }
    },
    again(app, props, a, s) {
      for (const k of Object.keys(props)) delete props[k];
      s.render();
    },
  },
};

VIEWS.trivia = {
  title: 'Nova Trivia',
  noAutoRefresh: true,
  async render(app, props) {
    if (!props.session) props.session = await app.api.games.startGame('nova-trivia');
    props.answers ||= [];
    if (props.result) {
      const { correct, total } = props.result.score;
      return html`<div class="pw-success"><div class="pw-success-icon">${correct === total ? '🏆' : '🧠'}</div><h3>${correct}/${total} correct</h3><p>+${props.result.progress.xp} XP</p><div class="pw-row">${btn('Play again', 'again')}${btn('Back to games', 'view', { view: 'games' }, 'ghost')}</div></div>`;
    }
    return html`${props.session.questions.map((q, i) => html`<div class="pw-quiz"><b>${i + 1}. ${q.q}</b>${q.options.map((o, j) => html`<button class="${props.answers[i] === j ? 'on' : ''}" ${A('answer', { i, j })}>${o}</button>`)}</div>`)}
      ${btn('Submit', 'submit', null)}`;
  },
  actions: {
    answer(app, props, { i, j }, s) {
      props.answers[i] = j;
      s.render(true);
    },
    async submit(app, props, a, s) {
      props.result = await app.api.games.submitGame(props.session.id, { answers: props.answers });
      app.hud.showProgress(props.result.progress);
      const best = JSON.parse(sessionStorageSafe('pw-best') || '{}');
      const sc = `${props.result.score.correct}/${props.result.score.total}`;
      if (!best.trivia || props.result.score.correct > Number(best.trivia[0])) best.trivia = sc;
      sessionStorageSafe('pw-best', JSON.stringify(best));
      s.render();
    },
    again(app, props, a, s) {
      for (const k of Object.keys(props)) delete props[k];
      s.render();
    },
  },
};

// PLAZA ────────────────────────────────────────────────────
VIEWS.plaza = {
  title: 'Central Plaza',
  render(app) {
    return html`<p class="pw-blurb">The heart of Nova City. Meet people, catch live events and get your bearings.</p>
      <div class="pw-row">${btn('🪙 Toss a coin', 'activity', { id: 'fountain', placeId: 'central-plaza' })}${btn('🪑 Rest', 'activity', { id: 'rest', placeId: 'central-plaza' }, 'ghost')}</div>
      ${eventStrip(app, 'central-plaza')}<h4>Talk to Pip</h4>${btn('🧭 Ask the City Guide', 'view', { view: 'agent', props: { id: 'npc-pip' } }, 'ghost')}`;
  },
};

// LISTS FROM THE DOCK ───────────────────────────────────────
VIEWS.map = {
  title: 'Nova City · Central',
  root: true,
  render(app) {
    const groups = {};
    for (const p of PLACES) (groups[app.placeView(p).kindLabel] ||= []).push(p);
    return html`<div class="pw-bigmap"><canvas width="900" height="900"></canvas><small class="pw-muted">Tap the map to walk there.</small></div>
      <div class="pw-legend"><span><i style="background:#36d399"></i>Gig you qualify for</span><span><i style="background:#ffd166"></i>Gig (course needed)</span><span><i style="background:#fff"></i>You</span></div>
      <div class="pw-list">${PLACES.map((p) => html`<div class="pw-result"><div><b>${KIND_ICON[p.kind]} ${p.name}</b><small>${app.placeView(p).kindLabel}</small></div><div class="pw-row tight">${btn('Go', 'go', goArg(p), 'sm')}${btn('Open', 'place', p.id, 'sm ghost')}</div></div>`)}</div>`;
  },
  mounted(app, props, s, body) {
    const c = body.querySelector('canvas');
    const draw = () => {
      if (!c.isConnected) return;
      app.hud.drawMap(c.getContext('2d'), c.width, { labels: true });
      requestAnimationFrame(draw);
    };
    draw();
    c.onclick = (e) => {
      const r = c.getBoundingClientRect();
      const { half } = app.hud.mapBase;
      const x = ((e.clientX - r.left) / r.width) * half * 2 - half;
      const z = ((e.clientY - r.top) / r.height) * half * 2 - half;
      const near = PLACES.map((p) => ({ p, d: Math.hypot(p.x - x, p.z - z) })).sort((a, b) => a.d - b.d)[0];
      if (near.d < 16) GLOBAL.go(app, props, goArg(near.p), s);
      else GLOBAL.go(app, props, { x, z, label: 'waypoint' }, s);
    };
  },
};

VIEWS.shops = {
  title: 'Shops & services',
  root: true,
  render(app) {
    const list = PLACES.filter((p) => ['cafe', 'restaurant', 'store', 'service', 'market'].includes(p.kind));
    return html`<p class="pw-muted">Real businesses. Orders and bookings go through Pludor checkout.</p><div class="pw-list">${list.map((p) => {
      const v = app.placeView(p);
      return html`<div class="pw-result"><div><b>${KIND_ICON[p.kind]} ${p.name}</b><small>${v.kindLabel}${p.hours ? (v.open ? ' · open' : ' · closed') : ''}${v.rating ? ` · ★ ${v.rating}` : ''}</small></div><div class="pw-row tight">${btn('Go', 'go', goArg(p), 'sm')}${btn('Open', 'place', p.id, 'sm ghost')}</div></div>`;
    })}</div>${btn('My orders', 'view', { view: 'orders' }, 'ghost')}`;
  },
};

VIEWS.work = {
  title: 'Work',
  root: true,
  async render(app, props) {
    props.tab ||= 'board';
    let body;
    if (props.tab === 'board') body = workBoard(app, { placeId: props.placeId });
    else if (props.tab === 'mine') body = await myWork(app);
    else body = postGigForm(props);
    return html`${tabs(props, [['board', 'Board'], ['mine', 'My work'], ['post', 'Post a gig']])}${body}`;
  },
  actions: { tab: tabAction },
  forms: { post: postGigSubmit },
};

VIEWS.land = {
  title: 'Land',
  root: true,
  render(app) {
    return html`<p class="pw-muted">Riverside Lots · rent a parcel, build from a template, open for business.</p><div class="pw-list">${app.state.parcels.map((p) => html`<div class="pw-result"><div><b>${p.name}</b><small>${p.zoning} · ${p.status === 'available' ? p.rentLabel : p.mine ? 'Yours' : `Rented · ${p.tenant?.displayName}`}</small></div><div class="pw-row tight">${btn('Go', 'go', { x: p.x, z: p.z - p.d / 2 - 2, label: p.name }, 'sm')}${btn('View', 'view', { view: 'parcel', props: { id: p.id } }, 'sm ghost')}</div></div>`)}</div>
      ${btn('🔑 Ask Nia the realtor', 'view', { view: 'agent', props: { id: 'npc-nia' } }, 'ghost')}`;
  },
};

VIEWS.social = {
  title: 'Social',
  root: true,
  async render(app, props) {
    props.tab ||= 'nearby';
    let body;
    if (props.tab === 'nearby') {
      const pp = app.player.position;
      const ppl = app.people().map((p) => ({ ...p, dist: Math.hypot(p.x - pp.x, p.z - pp.z) })).sort((a, b) => a.dist - b.dist);
      body = ppl.length ? html`<div class="pw-list">${ppl.map((p) => personRow({ ...p, handle: p.name }, html`<div class="pw-row tight"><small>${Math.round(p.dist)}m</small>${btn('💬', 'chat', p.id, 'sm ghost')}${btn('Go', 'go', { x: p.x, z: p.z, label: `@${p.name}` }, 'sm')}</div>`))}</div>` : empty('No one else is here right now. Open another tab to bring a friend in!');
    } else if (props.tab === 'messages') {
      const convos = await app.api.messaging.listConversations();
      body = convos.length ? html`<div class="pw-list">${convos.map((c) => html`<button class="pw-result" ${A('chat', c.user.id)}><div><b>${c.user.displayName}</b><small>${c.last?.text || ''}</small></div><small>${c.last ? timeAgo(c.last.ts) : ''}</small></button>`)}</div>` : empty('No conversations yet. Walk up to someone and press Talk.');
    } else {
      const comms = await app.api.world.listCommunities();
      body = html`<div class="pw-grid2">${comms.map((c) => html`<div class="pw-comm"><span>${c.icon}</span><b>${c.name}</b><small>${c.members.toLocaleString()} members${c.joined ? ' · joined' : ''}</small>${btn('Open', 'link', { key: 'signals.community', params: { communityId: c.id } }, 'sm ghost')}</div>`)}</div>${btn('📍 Go to Signals Hall', 'go', goArg(placeById('signals-hall')), 'ghost')}`;
    }
    return html`${tabs(props, [['nearby', 'Nearby'], ['messages', 'Messages'], ['communities', 'Communities']])}${body}`;
  },
  actions: { tab: tabAction },
};

VIEWS.learn = {
  title: 'Learn',
  root: true,
  render(app) {
    return html`<p class="pw-muted">Courses from ACCA, Creator Academy and Pludor Academy unlock skills for gigs.</p>${coursesList(app)}${skillsList(app)}${btn('📍 Go to Pludor Academy', 'go', goArg(placeById('academy')), 'ghost')}`;
  },
};

VIEWS.events = {
  title: 'Events',
  root: true,
  render(app, props) {
    const evs = app.state.events;
    return html`<p class="pw-muted">Times are Nova City world time.</p><div class="pw-list">${evs.map((e) => {
      const p = placeById(e.placeId);
      const target = p ? goArg(p) : { x: 0, z: 12, label: 'Central Plaza' };
      return html`<div class="pw-event ${e.live ? 'live' : ''} ${props.highlight === e.id ? 'hl' : ''}"><div><b>${e.live ? html`<span class="pw-live-dot"></span>` : ''}${e.title}</b><small>${e.placeName} · ${e.live ? 'Live now' : `starts in ${Math.max(1, Math.round(e.startsInHours))}h`} · ${e.ticket ? `ticket ${$m(e.ticket.price)}` : 'free'}</small></div>
        <div class="pw-row tight">${e.attended ? html`<span class="pw-tag ok">Attended</span>` : ''}${e.ticket && !e.hasTicket ? btn(`Ticket ${$m(e.ticket.price)}`, 'ticket', e.id, 'sm ghost') : ''}${e.live && !e.attended ? btn('Check in', 'attend', { id: e.id, x: target.x, z: target.z }, 'sm') : ''}${btn('Go', 'go', target, 'sm ghost')}</div></div>`;
    })}</div>`;
  },
  actions: {
    async ticket(app, props, id, s) {
      if (!confirm('Buy this ticket with your Pludor Wallet?')) return;
      await app.api.events.buyTicket(id);
      app.hud.toast('Ticket purchased', '🎟️');
      await app.refresh();
      s.render(true);
    },
    async attend(app, props, { id, x, z }, s) {
      const pp = app.player.position;
      if (Math.hypot(pp.x - x, pp.z - z) > 26) {
        app.hud.toast('Head to the venue to check in', '📍');
        return GLOBAL.go(app, props, { x, z, label: 'the venue' }, s);
      }
      const r = await app.api.events.attend(id);
      app.hud.showProgress(r);
      await app.refresh();
      s.render(true);
    },
  },
};

VIEWS.quests = {
  title: 'Quests',
  root: true,
  render(app) {
    const qs = app.state.progress.quests;
    return html`<div class="pw-list">${qs.map((q) => {
      const st = q.state;
      const status = st.done ? 'done' : st.active ? 'active' : 'locked';
      const cur = st.active && !st.done ? currentStep(q, st) : null;
      return html`<div class="pw-questcard ${status}"><div class="pw-gig-top"><span class="pw-cat">${q.sponsor ? `Sponsored · ${q.sponsor}` : q.type}</span><b>${status === 'done' ? '✓ Done' : status === 'locked' ? '🔒 Locked' : `+${q.rewardXp} XP`}</b></div>
        <b>${q.title}</b><small>${q.desc}</small>
        <ul class="pw-steps">${q.steps.map((sp, i) => html`<li class="${st.steps[i] >= sp.count ? 'done' : cur?.index === i ? 'cur' : ''}"><span></span>${sp.label}${sp.count > 1 ? ` ${Math.min(st.steps[i], sp.count)}/${sp.count}` : ''}</li>`)}</ul></div>`;
    })}</div>`;
  },
};

VIEWS.notifications = {
  title: 'Notifications',
  root: true,
  render(app) {
    const ns = app.hud.notifications;
    return ns.length ? html`<div class="pw-list">${ns.map((n) => html`<button class="pw-result" data-notif="${n.id}"><div><b>${n.icon} ${n.title}</b><small>${n.body}</small></div><small>${timeAgo(n.ts)}</small></button>`)}</div>` : empty('You’re all caught up.');
  },
  mounted(app, props, s, body) {
    body.querySelectorAll('[data-notif]').forEach((b) => {
      b.onclick = () => app.hud.notifications.find((n) => n.id === b.dataset.notif)?.action?.();
    });
  },
};

VIEWS.wallet = {
  title: 'Pludor Wallet',
  root: true,
  async render(app) {
    const w = await app.api.wallet.getWallet();
    return html`<div class="pw-wallet-hero"><small>Available</small><b>${money(w.balance, w.symbol)}</b><span>${w.escrowHeld ? `${money(w.escrowHeld, w.symbol)} held in escrow` : 'Nothing in escrow'}</span>${w.demo ? html`<em>Demo balance</em>` : ''}</div>
      <p class="pw-muted">Real money lives in your Pludor Wallet. XP and badges are game rewards and never convert to cash.</p>
      <h4>Recent activity</h4>${w.tx.length ? html`<div class="pw-list">${w.tx.map((t) => html`<div class="pw-tx"><div><b>${t.memo}</b><small>${t.type.replace('_', ' ')} · ${timeAgo(t.ts)} ago</small></div><b class="${t.amount >= 0 ? 'pos' : 'neg'}">${t.amount ? money(t.amount, w.symbol) : '—'}</b></div>`)}</div>` : empty('No transactions yet.')}
      <div class="pw-row">${btn('Orders & bookings', 'view', { view: 'orders' })}${btn('Open Wallet', 'link', { key: 'wallet.view' }, 'ghost')}</div>`;
  },
};

VIEWS.orders = {
  title: 'Orders & bookings',
  async render(app) {
    const o = await app.api.commerce.getOrders();
    return html`<h4>Orders</h4>${o.orders.length ? html`<div class="pw-list">${o.orders.map((x) => html`<div class="pw-tx"><div><b>${x.businessName}</b><small>${x.lines.map((l) => `${l.qty}× ${l.name}`).join(', ')}</small><span class="pw-status">${x.status}</span></div><b>${$m(x.total)}</b></div>`)}</div>` : empty('No orders yet.')}
      <h4>Bookings</h4>${o.bookings.length ? html`<div class="pw-list">${o.bookings.map((b) => html`<div class="pw-tx"><div><b>${b.businessName}</b><small>${b.serviceName}</small><span class="pw-status">${b.status}</span></div><b>${b.price ? $m(b.price) : 'Free'}</b></div>`)}</div>` : empty('No bookings yet.')}
      ${o.tickets.length ? html`<h4>Tickets</h4><div class="pw-list">${o.tickets.map((t) => html`<div class="pw-tx"><div><b>${t.title}</b></div><b>${$m(t.price)}</b></div>`)}</div>` : ''}
      ${btn('Open Pludor Orders', 'link', { key: 'commerce.orders' }, 'ghost')}`;
  },
};

VIEWS.profile = {
  title: 'You',
  root: true,
  async render(app) {
    const s = app.state;
    const u = s.profile;
    const pr = s.progress;
    const PRESENCE = ['Online', 'Away', 'Busy', 'Working', 'Shopping', 'Playing', 'Learning', 'Available for Work', 'Hiring', 'Invisible'];
    const colors = ['#39a6df', '#f18a62', '#8f7ce0', '#65c990', '#ff5ce1', '#ffd166', '#5ce1e6', '#ff7a59'];
    return html`<div class="pw-profile-hero" style="--c:${u.color}"><span class="pw-av xl" style="background:${u.color}">${u.displayName[0]}</span><div><h3>${u.displayName}</h3><small>@${u.handle}</small>
      <div class="pw-chips"><span class="pw-tag">${pr.rank.title}</span>${u.roles.map((r) => html`<span class="pw-tag">${r}</span>`)}</div></div></div>
      <div class="pw-levelbox"><b>Level ${pr.level.level}</b><i><span style="width:${Math.round(pr.level.progress * 100)}%"></span></i><small>${pr.xp} XP · ${pr.level.next - pr.xp} to level ${pr.level.level + 1}</small></div>
      ${pr.nextRank ? html`<p class="pw-muted">Next rank: <b>${pr.nextRank.title}</b> — earn ${pr.nextRank.missing.join(', ')}.</p>` : ''}
      <div class="pw-kv"><div><span>Reputation</span><b>${pr.reputation.score}/100</b></div><div><span>Gigs done</span><b>${pr.reputation.gigsCompleted}</b></div><div><span>Orders</span><b>${pr.reputation.ordersCompleted}</b></div><div><span>Courses</span><b>${pr.reputation.courses}</b></div></div>
      <h4>Status</h4><select class="pw-select" data-change="presence">${PRESENCE.map((p) => html`<option ${u.presence === p ? raw('selected') : ''}>${p}</option>`)}</select>
      <h4>Privacy</h4><div class="pw-grid2"><label class="pw-mini">Who can message me<select class="pw-select" data-change="allowMessages">${['everyone', 'friends', 'nobody'].map((o) => html`<option ${u.allowMessages === o ? raw('selected') : ''}>${o}</option>`)}</select></label><label class="pw-mini">Who can voice call me<select class="pw-select" data-change="allowCalls">${['everyone', 'friends', 'nobody'].map((o) => html`<option ${u.allowCalls === o ? raw('selected') : ''}>${o}</option>`)}</select></label></div>
      <h4>Look</h4><div class="pw-swatches">${colors.map((c) => html`<button style="background:${c}" class="${u.color === c ? 'on' : ''}" ${A('color', c)} aria-label="${c}"></button>`)}</div>
      <form class="pw-form inline" data-form="name"><input name="displayName" maxlength="20" value="${u.displayName}"><button class="pw-btn ghost sm">Rename</button></form>
      <h4>Achievements (${pr.achievements.length}/${Object.keys(ECONOMY.achievements).length})</h4>
      <div class="pw-badges">${Object.entries(ECONOMY.achievements).map(([id, a]) => html`<div class="pw-badge-tile ${pr.achievements.some((x) => x.id === id) ? 'on' : ''}" title="${a.title}"><span>${a.icon}</span><small>${a.title}</small></div>`)}</div>
      ${skillsList(app)}
      <h4>Rank ladder</h4><ol class="pw-ladder">${ECONOMY.ranks.map((r) => html`<li class="${r.id === pr.rank.id ? 'cur' : ''}">${r.title}</li>`)}</ol>
      ${pr.coupons.length ? html`<h4>Coupons</h4><div class="pw-chips">${pr.coupons.map((c) => html`<span class="pw-tag ok">🎟️ ${c.code} · ${c.percentOff}% off</span>`)}</div>` : ''}`;
  },
  actions: {
    async color(app, props, c, s) {
      await app.api.identity.updateProfile({ color: c });
      app.recolorPlayer?.(c);
      await app.refresh();
      s.render(true);
    },
  },
  changes: {
    async presence(app, props, v) {
      await app.api.identity.updateProfile({ presence: v });
      await app.refresh();
      app.hud.toast(`Status: ${v}`, '🟢');
    },
    async allowMessages(app, props, v) {
      await app.api.identity.updateProfile({ allowMessages: v });
      app.hud.toast(`Messages: ${v}`, '🔒');
    },
    async allowCalls(app, props, v) {
      await app.api.identity.updateProfile({ allowCalls: v });
      app.hud.toast(`Voice calls: ${v}`, '🔒');
    },
  },
  forms: {
    async name(app, props, data, s) {
      await app.api.identity.updateProfile({ displayName: data.displayName });
      await app.refresh();
      s.render(true);
    },
  },
};
