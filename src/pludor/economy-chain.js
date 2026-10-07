// Player-run economy (server-side; runs inside the adapter):
//
//   customer orders (escrow) → merchant accepts → ready
//     → courier job → courier picks up at the shop → delivers to customer
//     → escrow settles: merchant + courier paid, platform fee to treasury
//
// plus player storefronts (catalog management), player marketplace listings
// and fee-bearing service requests. Positions used for pickup/drop-off are
// supplied by the server (never trusted from the client in online mode).
//
// In production every step maps to existing Pludor systems: orders/escrow
// (commerce), courier jobs (Wayfare courier / Work Engine), payouts (wallet).

import { PARCELS, PLACES, entrancePoint } from '../config/nova-city.js';
import * as D from './demo-data.js';
import { PludorError } from './contract.js';

const money = (n) => Math.round(n * 100) / 100;
const rid = (p) => `${p}_${Math.random().toString(36).slice(2, 10)}`;
const BOT_IDS = new Set(D.RESIDENTS.map((r) => r.id));
const PICKUP_RADIUS = 14;
const DROPOFF_RADIUS = 14;
const SITE_RADIUS = 20;

export const PLAYER_BIZ_CATEGORIES = { restaurant: 'Restaurant', shop: 'Shop', service: 'Services', accommodation: 'Accommodation' };
export const SERVICE_CATEGORIES = {
  'home-services': { label: 'Home services', skill: 'communication', examples: ['Mow my lawn', 'Clean my house', 'Fix a leaking tap'] },
  writing: { label: 'Writing', skill: 'marketing', examples: ['Write ad copy for my shop', 'Write product descriptions'] },
  delivery: { label: 'Delivery / errands', skill: 'driving', examples: ['Pick up my groceries', 'Deliver a package'] },
  photography: { label: 'Photography', skill: 'photography', examples: ['Photograph my products'] },
  design: { label: 'Design', skill: 'design', examples: ['Design my logo', 'Make a flyer'] },
  ugc: { label: 'UGC / video', skill: 'video', examples: ['30s video for my business'] },
  marketing: { label: 'Marketing', skill: 'marketing', examples: ['Run my social media for a week'] },
  'local-service': { label: 'Local help', skill: 'communication', examples: ['Weekend shop assistant'] },
  'virtual-construction': { label: 'World building', skill: 'construction', examples: ['Build my storefront'] },
  'business-services': { label: 'Business services', skill: 'communication', examples: ['Bookkeeping help'] },
};

function parcelFront(parcelId) {
  const p = PARCELS.find((x) => x.id === parcelId);
  if (p?.venue) return { x: p.x, z: p.z }; // stall/booth inside a venue
  return p ? { x: p.x, z: p.z - p.d / 2 - 2 } : null;
}

export function bindEconomyChain(A) {
  const eco = A.eco;
  const fees = eco.fees;
  const sym = eco.currency.symbol;
  const near = (a, b, r) => a && b && Math.hypot(a.x - b.x, a.z - b.z) <= r;

  const takeFee = (w, type, amount) => {
    const t = (w.treasury ||= { total: 0, byType: {} });
    t.total = money(t.total + amount);
    t.byType[type] = money((t.byType[type] || 0) + amount);
  };

  // Notify another account (server routes this to their adapter → socket).
  const notifyUser = (userId, evt) => {
    if (!userId || BOT_IDS.has(userId)) return;
    if (userId === A.me.id) A._notify(evt);
    else A.transport?.send({ type: 'notify', to: userId, evt });
  };

  // ───── storefronts ─────
  const playerBiz = (bizId, w = A._world()) => {
    const parcelId = bizId.replace(/^pb_/, '');
    const p = w.parcels[parcelId];
    if (!p?.businessName) return null;
    return { parcelId, parcel: p, id: bizId, name: p.businessName, ownerId: p.tenantId, category: PLAYER_BIZ_CATEGORIES[p.category] || 'Shop', catalog: p.catalog || [], prepMinutes: 10 };
  };

  const storefrontOf = (businessId) => {
    if (businessId.startsWith('pb_')) {
      const b = playerBiz(businessId);
      if (!b) throw new PludorError('not_found', 'Business not found.');
      return { ...b, pickupPoint: parcelFront(b.parcelId), fulfillment: ['pickup', 'delivery'] };
    }
    const biz = D.BUSINESSES[businessId];
    if (!biz?.catalog) throw new PludorError('not_found', 'This business has no catalog.');
    const place = PLACES.find((p) => p.link?.id === businessId);
    return { ...biz, pickupPoint: place ? entrancePoint(place) : null };
  };

  // Brand shown on the business's signs (storefront, stall, booth, desk).
  // logo: an emoji, or a small uploaded image as a data URL (production: the
  // business's logo from its Pludor profile).
  A._notifyUser = (userId, evt) => notifyUser(userId, evt);

  A.business.setBrand = A._wrap((parcelId, spec = {}) => {
    const color = /^#[0-9a-f]{6}$/i.test(String(spec.color || '')) ? String(spec.color) : '#7c5cff';
    let logo = String(spec.logo || '').trim();
    if (logo.startsWith('data:')) {
      if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(logo) || logo.length > 48000) throw new PludorError('invalid', 'Logo must be a PNG, JPEG or WebP under ~35 KB.');
    } else logo = [...logo].slice(0, 2).join('');
    const tagline = String(spec.tagline || '').replace(/[<>]/g, '').trim().slice(0, 48);
    return A._mutateWorld((w) => {
      const p = w.parcels[parcelId];
      if (!p || p.tenantId !== A.me.id) throw new PludorError('forbidden', "You don't own this business.");
      if (!p.businessName) throw new PludorError('invalid', 'Open your business first.');
      p.brand = { logo, color, tagline };
      return p.brand;
    });
  });

  A.business.addProduct = A._wrap((parcelId, spec = {}) => {
    const name = String(spec.name || '').replace(/[<>]/g, '').trim().slice(0, 40);
    const price = money(Number(spec.price));
    if (name.length < 2) throw new PludorError('invalid', 'Give the product a name.');
    if (!(price >= 1 && price <= 1000)) throw new PludorError('invalid_amount', 'Price must be between 1 and 1000.');
    const icon = [...String(spec.icon || '📦')].slice(0, 2).join('');
    return A._mutateWorld((w) => {
      const p = w.parcels[parcelId];
      if (!p || p.tenantId !== A.me.id) throw new PludorError('forbidden', "You don't own this business.");
      if (!p.businessName) throw new PludorError('invalid', 'Open your business first.');
      p.catalog ||= [];
      if (p.catalog.length >= 24) throw new PludorError('limit', 'Up to 24 products per storefront.');
      const item = { sku: rid('sku'), name, price, icon, desc: String(spec.desc || '').slice(0, 120) };
      p.catalog.push(item);
      return item;
    });
  });

  A.business.removeProduct = A._wrap((parcelId, sku) => A._mutateWorld((w) => {
    const p = w.parcels[parcelId];
    if (!p || p.tenantId !== A.me.id) throw new PludorError('forbidden', "You don't own this business.");
    p.catalog = (p.catalog || []).filter((c) => c.sku !== sku);
    return { ok: true };
  }));

  A.business.mine = A._wrap(() => {
    const w = A._world();
    return Object.entries(w.parcels)
      .filter(([, p]) => p.tenantId === A.me.id && p.businessName)
      .map(([parcelId, p]) => {
        const orders = Object.values(w.chainOrders || {}).filter((o) => o.parcelId === parcelId);
        return {
          id: `pb_${parcelId}`, parcelId, name: p.businessName, category: p.category || 'shop', catalog: p.catalog || [],
          orders: orders.sort((a, b) => b.placedAt - a.placedAt).slice(0, 30),
          revenue: money(orders.filter((o) => o.status === 'delivered' || o.status === 'collected').reduce((s, o) => s + o.merchantNet, 0)),
        };
      });
  });

  // ───── checkout into the chain ─────
  const updateOrder = (orderId, patch) => {
    const o = A._mutateWorld((w) => {
      const x = w.chainOrders?.[orderId];
      if (!x) throw new PludorError('not_found', 'Order not found.');
      Object.assign(x, typeof patch === 'function' ? patch(x) : patch);
      return x;
    });
    A._mutate((st) => {
      const mine = st.orders.find((y) => y.id === orderId);
      if (mine) Object.assign(mine, { status: o.status, courierId: o.courierId || null, pickedUpAt: o.pickedUpAt || null, deliveredAt: o.deliveredAt || null });
    }, o.customerId);
    notifyUser(o.customerId, { kind: 'order', orderId, status: o.status, businessName: o.businessName });
    notifyUser(o.merchantId, { kind: 'merchant-order', orderId, status: o.status, businessName: o.businessName });
    if (o.courierId) notifyUser(o.courierId, { kind: 'delivery', orderId, status: o.status, businessName: o.businessName });
    return o;
  };

  const openCourierJob = (orderId) => {
    const o = updateOrder(orderId, { status: 'awaiting_courier', readyAt: A.now() });
    // Demo resident steps in if no player takes the job (keeps solo play moving).
    if (eco.demo?.botCouriers) {
      A.schedule(eco.demo.botCourierDelayMs, () => {
        const cur = A._world().chainOrders?.[orderId];
        if (!cur || cur.status !== 'awaiting_courier') return;
        updateOrder(orderId, { status: 'out_for_delivery', courierId: 'u_ayo', courierName: 'Ayo', pickedUpAt: A.now() });
        A.schedule(eco.demo.botTravelMs, () => {
          const c2 = A._world().chainOrders?.[orderId];
          if (c2?.status === 'out_for_delivery' && c2.courierId === 'u_ayo') settle(orderId);
        });
      });
    }
    return o;
  };

  const settle = (orderId, final = 'delivered') => {
    const o = updateOrder(orderId, (x) => {
      if (['delivered', 'collected', 'refunded', 'rejected', 'cancelled'].includes(x.status)) throw new PludorError('invalid', 'Order already settled.');
      return { status: final, deliveredAt: A.now() };
    });
    const commerceFee = money(o.subtotal * fees.commerce);
    const courierFee = o.deliveryFee ? money(o.deliveryFee * fees.delivery) : 0;
    const merchantNet = money(o.subtotal - o.discount - commerceFee);
    const courierNet = money(o.deliveryFee - courierFee);
    A._mutateWorld((w) => {
      w.chainOrders[orderId].merchantNet = merchantNet;
      w.chainOrders[orderId].courierNet = courierNet;
      takeFee(w, 'commerce', commerceFee);
      if (courierFee) takeFee(w, 'delivery', courierFee);
    });
    A._mutate((st) => {
      st.wallet.escrowHeld = money(st.wallet.escrowHeld - o.total);
      A._tx(st, 'escrow_release', 0, `${o.businessName} order ${final}`);
    }, o.customerId);
    if (!BOT_IDS.has(o.merchantId)) {
      A._mutate((st) => {
        A._credit(st, merchantNet, 'sale', `Sale · ${o.businessName} (after ${Math.round(fees.commerce * 100)}% fee)`);
        A._award(st, 'PLAYER_SOLD', { orderId });
      }, o.merchantId);
    }
    if (o.courierId && !BOT_IDS.has(o.courierId)) {
      A._mutate((st) => {
        A._credit(st, courierNet, 'payout', `Delivery · ${o.businessName}`);
        st.reputation.gigsCompleted += 1;
        A._award(st, 'PLAYER_COMPLETED_GIG', { gigId: orderId, category: 'delivery' });
      }, o.courierId);
    }
    return { ...o, merchantNet, courierNet };
  };

  A.chainCheckout = ({ businessId, items, fulfillment, couponId, attribution, deliverTo }) => {
    const sf = storefrontOf(businessId);
    if (!sf.fulfillment.includes(fulfillment)) throw new PludorError('invalid_fulfillment', 'Choose a fulfillment option.');
    if (!Array.isArray(items) || !items.length) throw new PludorError('empty_cart', 'Your cart is empty.');
    if (sf.ownerId === A.me.id) throw new PludorError('invalid', "You can't order from your own business.");
    const lines = items.map(({ sku, qty }) => {
      const p = sf.catalog.find((c) => c.sku === sku);
      const q = Math.floor(Number(qty));
      if (!p || !(q >= 1 && q <= 10)) throw new PludorError('invalid_item', 'Invalid cart item.');
      return { sku, name: p.name, icon: p.icon, qty: q, unit: p.price, total: money(p.price * q) };
    });
    if (fulfillment === 'delivery' && !(deliverTo && Number.isFinite(deliverTo.x) && Number.isFinite(deliverTo.z))) throw new PludorError('invalid', 'Where should we deliver?');
    const res = A._mutate((st) => {
      const subtotal = money(lines.reduce((s, l) => s + l.total, 0));
      let discount = 0;
      const coupon = couponId ? st.coupons.find((c) => c.id === couponId && !c.used && c.businessId === businessId) : null;
      if (couponId && !coupon) throw new PludorError('invalid_coupon', 'Coupon not valid here.');
      if (coupon) discount = money(subtotal * (coupon.percentOff / 100));
      const deliveryFee = fulfillment === 'delivery' ? eco.deliveryFee : 0;
      const total = money(subtotal - discount + deliveryFee);
      A._debit(st, total, 'order', `${sf.name} order (held in escrow)`);
      st.wallet.escrowHeld = money(st.wallet.escrowHeld + total);
      if (coupon) coupon.used = true;
      const order = {
        id: rid('ord'), chain: true, businessId, businessName: sf.name, parcelId: sf.parcelId || null, lines, subtotal, discount, fee: deliveryFee, deliveryFee, total,
        fulfillment, status: 'placed', placedAt: A.now(), etaMin: (sf.prepMinutes || 15) + (fulfillment === 'delivery' ? 20 : 0),
        merchantId: sf.ownerId, customerId: A.me.id, customerName: st.profile.displayName,
        pickup: sf.pickupPoint, dropoff: fulfillment === 'delivery' ? { x: deliverTo.x, z: deliverTo.z } : null,
        attribution: attribution ? { source: String(attribution.source), id: String(attribution.id) } : null,
      };
      st.orders.unshift({ ...order });
      st.reputation.ordersCompleted += 1;
      if (['Café', 'Restaurant'].includes(sf.category)) st.needs = A._feed(st);
      return { order, progress: A._awardAndNotify('PLAYER_PURCHASED', { businessId, total }, st) };
    });
    A._mutateWorld((w) => {
      (w.chainOrders ||= {})[res.order.id] = res.order;
    });
    notifyUser(sf.ownerId, { kind: 'merchant-order', orderId: res.order.id, status: 'placed', businessName: sf.name });
    // Demo-resident merchants run their kitchens automatically.
    if (BOT_IDS.has(sf.ownerId)) {
      A.schedule(2500, () => updateOrder(res.order.id, { status: 'preparing', acceptedAt: A.now() }));
      A.schedule(eco.demo?.botPrepMs ?? 8000, () => {
        if (fulfillment === 'delivery') openCourierJob(res.order.id);
        else updateOrder(res.order.id, { status: 'ready_for_pickup', readyAt: A.now() });
      });
    }
    return res;
  };

  // ───── merchant side ─────
  const merchantOrder = (orderId) => {
    const o = A._world().chainOrders?.[orderId];
    if (!o) throw new PludorError('not_found', 'Order not found.');
    if (o.merchantId !== A.me.id) throw new PludorError('forbidden', 'Not your order.');
    return o;
  };
  const refund = (o, why) => {
    A._mutate((st) => {
      st.wallet.escrowHeld = money(st.wallet.escrowHeld - o.total);
      A._credit(st, o.total, 'refund', `Refund · ${o.businessName} (${why})`);
    }, o.customerId);
  };
  A.orders = {
    incoming: A._wrap(() => Object.values(A._world().chainOrders || {}).filter((o) => o.merchantId === A.me.id).sort((a, b) => b.placedAt - a.placedAt).slice(0, 40)),
    accept: A._wrap((orderId) => {
      const o = merchantOrder(orderId);
      if (o.status !== 'placed') throw new PludorError('invalid', 'Order already handled.');
      return updateOrder(orderId, { status: 'preparing', acceptedAt: A.now() });
    }),
    reject: A._wrap((orderId) => {
      const o = merchantOrder(orderId);
      if (o.status !== 'placed') throw new PludorError('invalid', 'Too late to reject.');
      updateOrder(orderId, { status: 'rejected' });
      refund(o, 'declined by merchant');
      return { ok: true };
    }),
    ready: A._wrap((orderId) => {
      const o = merchantOrder(orderId);
      if (o.status !== 'preparing') throw new PludorError('invalid', 'Accept the order first.');
      return o.fulfillment === 'delivery' ? openCourierJob(orderId) : updateOrder(orderId, { status: 'ready_for_pickup', readyAt: A.now() });
    }),
    cancel: A._wrap((orderId) => {
      const o = A._world().chainOrders?.[orderId];
      if (!o || o.customerId !== A.me.id) throw new PludorError('not_found', 'Order not found.');
      if (o.status !== 'placed') throw new PludorError('invalid', 'The merchant already started this order.');
      updateOrder(orderId, { status: 'cancelled' });
      refund(o, 'cancelled');
      return { ok: true };
    }),
    // Customer collects a pickup order in person at the shop.
    collect: A._wrap((orderId, position) => {
      const o = A._world().chainOrders?.[orderId];
      if (!o || o.customerId !== A.me.id) throw new PludorError('not_found', 'Order not found.');
      if (o.status !== 'ready_for_pickup') throw new PludorError('invalid', 'Not ready yet.');
      if (o.pickup && !near(position, o.pickup, PICKUP_RADIUS)) throw new PludorError('too_far', 'Go to the shop to collect your order.');
      return settle(orderId, 'collected');
    }),
    track: A._wrap((orderId) => {
      const o = A._world().chainOrders?.[orderId];
      if (!o || ![o.customerId, o.merchantId, o.courierId].includes(A.me.id)) throw new PludorError('not_found', 'Order not found.');
      const courier = o.courierId ? A._userSummary(o.courierId) : null;
      const peer = o.courierId ? A.transport?.getPeer(o.courierId) : null;
      return { ...o, courier, courierPos: peer ? { x: peer.x, z: peer.z } : null };
    }),
  };

  // ───── courier side ─────
  A.delivery = {
    jobs: A._wrap(() => {
      const all = Object.values(A._world().chainOrders || {}).filter((o) => o.fulfillment === 'delivery');
      return {
        open: all.filter((o) => o.status === 'awaiting_courier' && o.customerId !== A.me.id && o.merchantId !== A.me.id).map((o) => ({ ...o, payout: money(o.deliveryFee * (1 - fees.delivery)) })),
        mine: all.filter((o) => o.courierId === A.me.id && ['courier_assigned', 'out_for_delivery'].includes(o.status)),
        done: all.filter((o) => o.courierId === A.me.id && o.status === 'delivered').slice(-10),
      };
    }),
    accept: A._wrap((orderId) => {
      const st = A._load();
      if ((st.skills.driving || 0) < 1) throw new PludorError('not_qualified', 'Courier jobs need Driving L1.');
      const w = A._world();
      if (Object.values(w.chainOrders || {}).some((o) => o.courierId === A.me.id && ['courier_assigned', 'out_for_delivery'].includes(o.status))) throw new PludorError('limit', 'Finish your current delivery first.');
      return updateOrder(orderId, (o) => {
        if (o.status !== 'awaiting_courier') throw new PludorError('taken', 'Another courier took this job.');
        if (o.customerId === A.me.id || o.merchantId === A.me.id) throw new PludorError('invalid', "You can't deliver your own order.");
        return { status: 'courier_assigned', courierId: A.me.id, courierName: st.profile.displayName, assignedAt: A.now() };
      });
    }),
    pickup: A._wrap((orderId, position) => {
      const o = A._world().chainOrders?.[orderId];
      if (!o || o.courierId !== A.me.id) throw new PludorError('forbidden', 'Not your delivery.');
      if (o.status !== 'courier_assigned') throw new PludorError('invalid', 'Already picked up.');
      if (o.pickup && !near(position, o.pickup, PICKUP_RADIUS)) throw new PludorError('too_far', `Go to ${o.businessName} to pick up the order.`);
      return updateOrder(orderId, { status: 'out_for_delivery', pickedUpAt: A.now() });
    }),
    dropoff: A._wrap((orderId, position) => {
      const o = A._world().chainOrders?.[orderId];
      if (!o || o.courierId !== A.me.id) throw new PludorError('forbidden', 'Not your delivery.');
      if (o.status !== 'out_for_delivery') throw new PludorError('invalid', 'Pick the order up first.');
      if (!near(position, o.dropoff, DROPOFF_RADIUS)) throw new PludorError('too_far', 'Get to the drop-off point to complete the delivery.');
      return settle(orderId, 'delivered');
    }),
  };

  // ───── rides: request a ride, or drive for pay (Wayfare in production) ─────
  // Fare is escrowed from the rider; a driver who owns a vehicle accepts,
  // picks up (position-verified) and drops off at the destination, then the
  // fare settles minus the platform fee. Demo drivers cover quiet times and
  // demo riders post requests so drivers can always earn.
  const RIDE_FEE = fees.rides ?? 0.15;
  const fareFor = (from, to) => money(3 + Math.hypot(to.x - from.x, to.z - from.z) * 0.04);
  const ownsVehicle = (st) => (eco.virtualItems || []).some((i) => i.kind === 'car' && (st.owned || []).includes(i.id));
  const rideById = (id) => (A._world().rides || {})[id];
  const updateRide = (id, patch) => A._mutateWorld((w) => {
    const r = (w.rides || {})[id];
    if (!r) throw new PludorError('not_found', 'Ride not found.');
    Object.assign(r, typeof patch === 'function' ? patch(r) : patch);
    return { ...r };
  });
  const settleRide = (id) => {
    const r = updateRide(id, (x) => {
      if (x.status === 'completed') throw new PludorError('invalid', 'Ride already completed.');
      return { status: 'completed', completedAt: A.now() };
    });
    const fee = money(r.fare * RIDE_FEE);
    const net = money(r.fare - fee);
    if (r.driverId && !BOT_IDS.has(r.driverId)) A._mutate((st) => A._credit(st, net, 'ride', `Ride · ${r.riderName} → ${r.destName}`), r.driverId);
    A._mutateWorld((w) => takeFee(w, 'rides', fee));
    if (r.riderId && !r.demoRider) notifyUser(r.riderId, { kind: 'ride', rideId: id, status: 'completed', destId: r.destId, destName: r.destName });
    return { ...r, driverNet: net };
  };
  const DEMO_RIDERS = (D.NPC_PERSONAS || []).slice(0, 8);
  const ensureDemoRiders = () => {
    if (!eco.demo?.botCouriers) return;
    const open = Object.values(A._world().rides || {}).filter((r) => r.status === 'requested' && r.demoRider);
    if (open.length >= 2) return;
    const places = PLACES.filter((p) => !p.walkable);
    for (let k = open.length; k < 2; k++) {
      const p = DEMO_RIDERS[Math.floor(Math.random() * DEMO_RIDERS.length)];
      const a = places[Math.floor(Math.random() * places.length)];
      let b = places[Math.floor(Math.random() * places.length)];
      if (b === a) b = places[(places.indexOf(a) + 3) % places.length];
      const from = entrancePoint(a, 3);
      const to = entrancePoint(b, 3);
      const ride = { id: rid('ride'), riderId: p.id, riderName: p.name, demoRider: true, pickup: from, pickupName: a.name, dropoff: to, destId: b.id, destName: b.name, fare: fareFor(from, to), status: 'requested', requestedAt: A.now() };
      A._mutateWorld((w) => ((w.rides ||= {})[ride.id] = ride));
    }
  };

  A.rides = {
    quote: A._wrap((destId, position) => {
      const p = PLACES.find((x) => x.id === destId);
      if (!p) throw new PludorError('not_found', 'Unknown destination.');
      return { destId, destName: p.name, fare: fareFor(position || { x: 0, z: 0 }, entrancePoint(p, 3)) };
    }),
    request: A._wrap((destId, position) => {
      const p = PLACES.find((x) => x.id === destId);
      if (!p) throw new PludorError('not_found', 'Unknown destination.');
      if (!position) throw new PludorError('invalid', 'Location unavailable.');
      if (Object.values(A._world().rides || {}).some((r) => r.riderId === A.me.id && ['requested', 'accepted', 'on_trip'].includes(r.status))) throw new PludorError('limit', 'You already have a ride on the way.');
      const to = entrancePoint(p, 3);
      const fare = fareFor(position, to);
      const name = A._load().profile.displayName;
      A._mutate((st) => {
        A._debit(st, fare, 'ride', `Ride to ${p.name} (held until arrival)`);
        st.wallet.escrowHeld = money((st.wallet.escrowHeld || 0) + fare);
      });
      const ride = { id: rid('ride'), riderId: A.me.id, riderName: name, pickup: { x: position.x, z: position.z }, pickupName: 'your location', dropoff: to, destId, destName: p.name, fare, status: 'requested', requestedAt: A.now() };
      A._mutateWorld((w) => ((w.rides ||= {})[ride.id] = ride));
      // No player driver in time? A Wayfare demo driver takes it.
      if (eco.demo?.botCouriers) {
        A.schedule(eco.demo.botRideDelayMs ?? 20000, () => {
          const r = rideById(ride.id);
          if (r?.status !== 'requested') return;
          const bot = D.RESIDENTS[Math.floor(Math.random() * D.RESIDENTS.length)];
          updateRide(ride.id, { status: 'accepted', driverId: bot.id, driverName: `${bot.displayName} (Wayfare)` });
          notifyUser(ride.riderId, { kind: 'ride', rideId: ride.id, status: 'accepted', driverName: bot.displayName });
          A.schedule(eco.demo.botTravelMs ?? 15000, () => {
            if (rideById(ride.id)?.status !== 'accepted') return;
            A._mutate((st) => (st.wallet.escrowHeld = money(Math.max(0, (st.wallet.escrowHeld || 0) - fare))), ride.riderId);
            settleRide(ride.id);
          });
        });
      }
      return ride;
    }),
    cancel: A._wrap((rideId) => {
      const r = rideById(rideId);
      if (!r || r.riderId !== A.me.id) throw new PludorError('not_found', 'Ride not found.');
      if (r.status !== 'requested') throw new PludorError('invalid', 'Your driver is already on the way.');
      updateRide(rideId, { status: 'cancelled' });
      A._mutate((st) => {
        st.wallet.escrowHeld = money(Math.max(0, (st.wallet.escrowHeld || 0) - r.fare));
        A._credit(st, r.fare, 'refund', `Ride cancelled · ${r.destName}`);
      });
      return { ok: true };
    }),
    mine: A._wrap(() => Object.values(A._world().rides || {}).filter((r) => r.riderId === A.me.id).sort((a, b) => b.requestedAt - a.requestedAt).slice(0, 5)),
    // Driver side.
    jobs: A._wrap(() => {
      ensureDemoRiders();
      const all = Object.values(A._world().rides || {});
      return {
        canDrive: ownsVehicle(A._load()),
        open: all.filter((r) => r.status === 'requested' && r.riderId !== A.me.id).map((r) => ({ ...r, payout: money(r.fare * (1 - RIDE_FEE)) })),
        mine: all.filter((r) => r.driverId === A.me.id && ['accepted', 'on_trip'].includes(r.status)),
        done: all.filter((r) => r.driverId === A.me.id && r.status === 'completed').slice(-10).map((r) => ({ ...r, payout: money(r.fare * (1 - RIDE_FEE)) })),
      };
    }),
    accept: A._wrap((rideId) => {
      const st = A._load();
      if (!ownsVehicle(st)) throw new PludorError('no_vehicle', 'You need a vehicle to drive for Wayfare — get one at Nova Motors or the Pludor Store.');
      if (Object.values(A._world().rides || {}).some((r) => r.driverId === A.me.id && ['accepted', 'on_trip'].includes(r.status))) throw new PludorError('limit', 'Finish your current ride first.');
      const r = updateRide(rideId, (x) => {
        if (x.status !== 'requested') throw new PludorError('taken', 'Another driver took this ride.');
        if (x.riderId === A.me.id) throw new PludorError('invalid', "You can't drive yourself.");
        return { status: 'accepted', driverId: A.me.id, driverName: st.profile.displayName, acceptedAt: A.now() };
      });
      if (!r.demoRider) notifyUser(r.riderId, { kind: 'ride', rideId, status: 'accepted', driverName: st.profile.displayName });
      return r;
    }),
    pickup: A._wrap((rideId, position) => {
      const r = rideById(rideId);
      if (!r || r.driverId !== A.me.id) throw new PludorError('forbidden', 'Not your ride.');
      if (r.status !== 'accepted') throw new PludorError('invalid', 'Already picked up.');
      if (!near(position, r.pickup, PICKUP_RADIUS + 4)) throw new PludorError('too_far', `Drive to ${r.pickupName} to pick up ${r.riderName}.`);
      if (!r.demoRider) notifyUser(r.riderId, { kind: 'ride', rideId, status: 'on_trip', driverName: r.driverName });
      return updateRide(rideId, { status: 'on_trip', pickedUpAt: A.now() });
    }),
    dropoff: A._wrap((rideId, position) => {
      const r = rideById(rideId);
      if (!r || r.driverId !== A.me.id) throw new PludorError('forbidden', 'Not your ride.');
      if (r.status !== 'on_trip') throw new PludorError('invalid', 'Pick the rider up first.');
      if (!near(position, r.dropoff, DROPOFF_RADIUS + 4)) throw new PludorError('too_far', `Drive to ${r.destName} to drop off.`);
      if (!r.demoRider) A._mutate((st) => (st.wallet.escrowHeld = money(Math.max(0, (st.wallet.escrowHeld || 0) - r.fare))), r.riderId);
      return settleRide(rideId);
    }),
  };

  // ───── player marketplace listings ─────
  A.commerce.createListing = A._wrap((spec = {}) => {
    const title = String(spec.title || '').replace(/[<>]/g, '').trim().slice(0, 50);
    const price = money(Number(spec.price));
    if (title.length < 3) throw new PludorError('invalid', 'Give your listing a title.');
    if (!(price >= 1 && price <= 5000)) throw new PludorError('invalid_amount', 'Price must be between 1 and 5000.');
    const listing = { id: rid('pl'), title, price, icon: [...String(spec.icon || '📦')].slice(0, 2).join(''), condition: String(spec.condition || 'Used').slice(0, 30), sellerId: A.me.id, createdAt: A.now(), status: 'active' };
    A._mutateWorld((w) => (w.listings ||= []).push(listing));
    return listing;
  });

  const seededListings = A.commerce.listListings;
  A.commerce.listListings = A._wrap(async () => {
    const seeded = await seededListings();
    const mine = (A._world().listings || []).filter((l) => l.status === 'active').map((l) => ({ ...l, seller: A._userSummary(l.sellerId), player: true }));
    return [...mine, ...seeded];
  });

  const seededBuy = A.commerce.buyListing;
  A.commerce.buyListing = A._wrap((listingId) => {
    if (!String(listingId).startsWith('pl_')) return seededBuy(listingId);
    const l = A._mutateWorld((w) => {
      const x = (w.listings || []).find((y) => y.id === listingId);
      if (!x || x.status !== 'active') throw new PludorError('sold', 'This item is no longer available.');
      if (x.sellerId === A.me.id) throw new PludorError('invalid', "That's your own listing.");
      x.status = 'reserved';
      return x;
    });
    try {
      const res = A._mutate((st) => {
        A._debit(st, l.price, 'order', `Marketplace · ${l.title}`);
        const order = { id: rid('ord'), listingId, businessName: `Marketplace · @${A._userSummary(l.sellerId).handle}`, lines: [{ name: l.title, icon: l.icon, qty: 1, unit: l.price, total: l.price }], total: l.price, status: 'confirmed', placedAt: A.now(), fulfillment: 'meetup' };
        st.orders.unshift(order);
        return { order, progress: A._awardAndNotify('PLAYER_PURCHASED', { listingId, total: l.price }, st) };
      });
      const fee = money(l.price * fees.marketplace);
      A._mutateWorld((w) => {
        const x = w.listings.find((y) => y.id === listingId);
        x.status = 'sold';
        x.buyerId = A.me.id;
        takeFee(w, 'marketplace', fee);
      });
      A._mutate((st) => {
        A._credit(st, money(l.price - fee), 'sale', `Sold · ${l.title}`);
        A._award(st, 'PLAYER_SOLD', { listingId });
      }, l.sellerId);
      notifyUser(l.sellerId, { kind: 'merchant-order', orderId: res.order.id, status: 'sold', businessName: l.title });
      return res;
    } catch (e) {
      A._mutateWorld((w) => {
        const x = w.listings.find((y) => y.id === listingId);
        if (x?.status === 'reserved') x.status = 'active';
      });
      throw e;
    }
  });

  A.economy = {
    treasury: A._wrap(() => A._world().treasury || { total: 0, byType: {} }),
    fees: A._wrap(() => ({ ...fees, deliveryFee: eco.deliveryFee })),
    serviceCategories: A._wrap(() => SERVICE_CATEGORIES),
  };
}
