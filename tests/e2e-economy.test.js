// Full gameplay economy, end to end, against the real World server with real
// accounts, real WebSocket presence and server-verified positions. Every way
// a player, a seller and the platform make money is exercised and the
// wallets/treasury are checked after each step.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { createWorldServer } from '../server/server.js';
import { PARCELS, PLACES, entrancePoint } from '../src/config/nova-city.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let app;
let base;

async function api(path, { token, body, method = 'POST' } = {}) {
  const res = await fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) };
}
const rpc = (token, name, args = []) => api(`/api/rpc/${name}`, { token, body: { args } });
const ok = async (token, name, args = []) => {
  const r = await rpc(token, name, args);
  assert.equal(r.status, 200, `${name} → ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.data;
};
const bal = async (u) => (await ok(u.token, 'wallet.getWallet')).balance;
const near = (a, b, d = 0.011) => assert.ok(Math.abs(a - b) < d, `${a} ≈ ${b}`);

function socket(token) {
  const ws = new WebSocket(`${base.replace('http', 'ws')}/ws?token=${token}`);
  ws.inbox = [];
  ws.on('message', (m) => ws.inbox.push(JSON.parse(m)));
  return new Promise((res, rej) => {
    ws.on('open', () => res(ws));
    ws.on('error', rej);
  });
}
const waitFor = async (ws, pred, ms = 4000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const hit = ws.inbox.find(pred);
    if (hit) return hit;
    await wait(30);
  }
  return null;
};
// Walk like a client (server enforces speed); returns the final position.
async function walkTo(ws, from, to, speed = 8.5) {
  let { x, z } = from;
  while (Math.hypot(to.x - x, to.z - z) > 0.5) {
    const d = Math.hypot(to.x - x, to.z - z);
    const s = Math.min(d, speed * 0.1);
    x += ((to.x - x) / d) * s;
    z += ((to.z - z) / d) * s;
    ws.send(JSON.stringify({ type: 'state', x, z, ry: 0, moving: true }));
    await wait(100);
  }
  await wait(150);
  return { x, z };
}
async function player(name) {
  const r = await api('/api/auth/signup', { body: { username: name, password: `${name} password` } });
  assert.equal(r.status, 200);
  const ws = await socket(r.body.token);
  const w = await waitFor(ws, (m) => m.type === 'welcome');
  return { ...r.body, ws, pos: { x: w.you.x, z: w.you.z } };
}
const grantPoints = (u, n) => app.store.set(`pludor-demo:user:${u.user.id}`, { ...app.store.get(`pludor-demo:user:${u.user.id}`), points: n });

let seller;
let buyer;
let driver;
let artist;
let admin;
const treasury = async () => (await api('/api/admin/overview', { token: admin.token, method: 'GET' })).body.treasury;

test.before(async () => {
  app = createWorldServer({ dataDir: mkdtempSync(join(tmpdir(), 'pw-e2e-')), admins: ['opsadmin'], quiet: true });
  base = `http://127.0.0.1:${await app.listen(0)}`;
  admin = (await api('/api/auth/signup', { body: { username: 'opsadmin', password: 'opsadmin password' } })).body;
  seller = await player('sam');
  buyer = await player('bea');
  driver = await player('dan');
  artist = await player('ari');
});
test.after(async () => {
  for (const u of [seller, buyer, driver, artist]) u?.ws.close();
  await app.close();
});

test('1 · seller rents a food-court stall, brands it, lists food; buyer orders and collects in person', async () => {
  await ok(seller.token, 'land.rent', ['u-fc-4', 'stall']);
  await ok(seller.token, 'land.openBusiness', ['u-fc-4', "Sam's Suya", 'restaurant']);
  const dish = await ok(seller.token, 'business.addProduct', ['u-fc-4', { name: 'Beef Suya', price: 10, icon: '🍢' }]);
  await ok(seller.token, 'business.setBrand', ['u-fc-4', { logo: '🔥', color: '#ff7a18', tagline: 'Grilled to order' }]);
  const unit = (await ok(buyer.token, 'land.listParcels')).find((p) => p.id === 'u-fc-4');
  assert.equal(unit.building.businessName, "Sam's Suya");
  assert.equal(unit.building.brand.logo, '🔥', 'everyone sees the brand on the stall');
  const t0 = await treasury();
  const sBal = await bal(seller);
  const order = (await ok(buyer.token, 'commerce.checkout', [{ businessId: 'pb_u-fc-4', items: [{ sku: dish.sku, qty: 2 }], fulfillment: 'pickup' }])).order;
  assert.ok(await waitFor(seller.ws, (m) => m.type === 'event' && m.evt.kind === 'merchant-order'), 'seller notified in realtime');
  await ok(seller.token, 'orders.accept', [order.id]);
  await ok(seller.token, 'orders.ready', [order.id]);
  assert.equal((await rpc(buyer.token, 'orders.collect', [order.id])).status, 409, 'must be at the stall to collect');
  const stall = PARCELS.find((p) => p.id === 'u-fc-4');
  buyer.pos = await walkTo(buyer.ws, buyer.pos, { x: stall.x, z: stall.z });
  await ok(buyer.token, 'orders.collect', [order.id]);
  near(await bal(seller), sBal + 19, 0.02);
  near((await treasury()).byType.commerce - (t0.byType.commerce || 0), 1, 0.02);
});

test('2 · hotel booth accommodation business takes a paid booking (owner paid, platform fee)', async () => {
  await ok(seller.token, 'land.rent', ['u-hb-2', 'booth']);
  await ok(seller.token, 'land.openBusiness', ['u-hb-2', 'Lagoon Stays', 'accommodation']);
  await ok(seller.token, 'business.addProduct', ['u-hb-2', { name: 'Studio · 1 night', price: 40, icon: '🛏️' }]);
  const biz = await ok(buyer.token, 'commerce.getBusiness', ['pb_u-hb-2']);
  assert.ok(biz.services.length && biz.slots.length, 'stays are bookable time slots');
  const sBal = await bal(seller);
  const bBal = await bal(buyer);
  await ok(buyer.token, 'commerce.book', [{ businessId: 'pb_u-hb-2', serviceId: biz.services[0].id, slotId: biz.slots[0].id }]);
  near(await bal(buyer), bBal - 40);
  near(await bal(seller), sBal + 38);
  assert.ok((await treasury()).byType.bookings >= 2);
});

test('3 · driver buys a vehicle with points, takes a ride request, picks up and drops off; rider arrives', async () => {
  grantPoints(driver, 600);
  await ok(driver.token, 'shop.buyVirtual', ['car-scooter']);
  assert.equal((await ok(driver.token, 'rides.jobs')).canDrive, false, 'a scooter cannot carry a passenger');
  await ok(driver.token, 'shop.buyVirtual', ['car-city']);
  const before = (await ok(buyer.token, 'wallet.getWallet')).balance;
  const ride = await ok(buyer.token, 'rides.request', ['arcade', { x: 999, z: 999 }]);
  assert.ok(Math.hypot(ride.pickup.x - buyer.pos.x, ride.pickup.z - buyer.pos.z) < 1, 'pickup is where the server sees the rider, not what the client claims');
  near((await ok(buyer.token, 'wallet.getWallet')).balance, before - ride.fare);
  const jobs = await ok(driver.token, 'rides.jobs');
  assert.ok(jobs.canDrive && jobs.open.some((r) => r.id === ride.id));
  await ok(driver.token, 'rides.accept', [ride.id]);
  assert.ok(await waitFor(buyer.ws, (m) => m.type === 'event' && m.evt.kind === 'ride' && m.evt.status === 'accepted'), 'rider told the driver is coming');
  assert.equal((await rpc(driver.token, 'rides.pickup', [ride.id])).status, 409, 'must drive to the rider');
  driver.pos = await walkTo(driver.ws, driver.pos, ride.pickup, 14);
  await ok(driver.token, 'rides.pickup', [ride.id]);
  const dBal = await bal(driver);
  driver.pos = await walkTo(driver.ws, driver.pos, ride.dropoff, 14);
  await ok(driver.token, 'rides.dropoff', [ride.id]);
  near(await bal(driver), dBal + ride.fare * 0.85, 0.02);
  assert.ok(await waitFor(buyer.ws, (m) => m.type === 'event' && m.evt.kind === 'ride' && m.evt.status === 'completed'), 'rider notified of arrival');
  assert.equal((await ok(buyer.token, 'wallet.getWallet')).escrowHeld, 0);
  assert.ok((await treasury()).byType.rides > 0);
});

test('4 · anyone can walk up to a board and book it; others see the ad; platform earns', async () => {
  const info = await ok(seller.token, 'ads.placementInfo', ['world.central.street-3']);
  const ad = await ok(seller.token, 'ads.bookPlacement', [{ placementId: 'world.central.street-3', days: 2, creative: { headline: 'Sam’s Suya', sub: 'Food court · stall 4', target: { type: 'pbiz', id: 'u-fc-4' } } }]);
  const seen = await ok(buyer.token, 'ads.getCreative', ['world.central.street-3']);
  assert.equal(seen.id, ad.id, 'booked ad shows to other players');
  assert.equal((await rpc(buyer.token, 'ads.bookPlacement', [{ placementId: 'world.central.street-3', days: 1, creative: { headline: 'mine' } }])).status, 409, 'a booked board cannot be taken');
  const tap = await ok(buyer.token, 'ads.trackInteraction', ['world.central.street-3', ad.id, 'cta']);
  assert.deepEqual(tap.target, { type: 'pbiz', id: 'u-fc-4' }, 'tapping the ad opens the advertiser’s shop');
  assert.ok((await treasury()).byType.ads >= info.pricePerDay * 2);
});

test('5 · artist promotes a track on Pludor Radio; everyone’s playlist carries it', async () => {
  const b = await bal(artist);
  const promo = await ok(artist.token, 'radio.promote', [{ title: 'Lagos Nights', genre: 'amapiano', days: 3 }]);
  near(await bal(artist), b - 6);
  const pl = await ok(buyer.token, 'radio.playlist');
  assert.ok(pl.promoted.some((t) => t.id === promo.id));
  assert.ok((await treasury()).byType.radio >= 6);
});

test('6 · virtual goods: points (+money) buy a premium look that other players then see', async () => {
  grantPoints(artist, 400);
  const b = await bal(artist);
  await ok(artist.token, 'shop.buyVirtual', ['outfit-neon']);
  near(await bal(artist), b - 2, 0.001);
  await ok(artist.token, 'identity.updateProfile', [{ look: { top: '#ff70a6', hat: 'cap', hatColor: '#e63946' } }]);
  const me = await ok(artist.token, 'identity.getCurrentUser');
  assert.equal(me.look.top, '#ff70a6', 'owned premium colour kept');
  assert.equal(me.look.hat, null, 'unowned cap stripped server-side');
  artist.ws.send(JSON.stringify({ type: 'state', x: artist.pos.x + 0.3, z: artist.pos.z, ry: 0 }));
  const seen = await waitFor(buyer.ws, (m) => m.type === 'states' && m.players.some((p) => p.id === artist.user.id && p.profile.look?.top === '#ff70a6'), 4000);
  assert.ok(seen, 'other players see the new look');
  assert.ok((await treasury()).byType.virtual >= 2);
});

test('7 · housing: no bed without a home; a hotel stay or a rented apartment gives one', async () => {
  assert.equal((await rpc(artist.token, 'needs.performActivity', ['sleep', { placeId: 'home' }])).status, 409, 'claiming "home" is not enough');
  await ok(buyer.token, 'needs.performActivity', ['sleep', { placeId: 'grand-hotel' }]); // booked a stay in test 2
  await ok(artist.token, 'land.rent', ['u-apt-2', 'apartment']);
  const flat = (await ok(artist.token, 'land.listParcels')).find((p) => p.id === 'u-apt-2');
  assert.ok(flat.mine && flat.building?.template === 'apartment');
  await ok(artist.token, 'needs.performActivity', ['sleep', { placeId: 'home' }]);
  assert.notEqual((await rpc(artist.token, 'land.openBusiness', ['u-apt-2', 'Nope', 'shop'])).status, 200, 'apartments are homes, not shops');
});

test('8 · market stall: a player sells their own goods from a branded stall', async () => {
  await ok(artist.token, 'land.rent', ['u-mk-2', 'mstall']);
  await ok(artist.token, 'land.openBusiness', ['u-mk-2', 'Ari Merch', 'shop']);
  const item = await ok(artist.token, 'business.addProduct', ['u-mk-2', { name: 'Tour Tee', price: 20, icon: '👕' }]);
  const aBal = await bal(artist);
  const o = (await ok(buyer.token, 'commerce.checkout', [{ businessId: 'pb_u-mk-2', items: [{ sku: item.sku, qty: 1 }], fulfillment: 'pickup' }])).order;
  await ok(artist.token, 'orders.accept', [o.id]);
  await ok(artist.token, 'orders.ready', [o.id]);
  const stall = PARCELS.find((p) => p.id === 'u-mk-2');
  buyer.pos = await walkTo(buyer.ws, buyer.pos, { x: stall.x, z: stall.z });
  await ok(buyer.token, 'orders.collect', [o.id]);
  near(await bal(artist), aBal + 19);
});

test('9 · nightlife is 18+: minors are refused, adults can book; dating needs adulthood', async () => {
  const club = await ok(buyer.token, 'commerce.getBusiness', ['biz_pulse']);
  const slot = club.slots[0]?.id;
  assert.equal((await rpc(buyer.token, 'commerce.book', [{ businessId: 'biz_pulse', serviceId: 'svc-entry', slotId: slot }])).status, 403);
  await ok(buyer.token, 'identity.updateProfile', [{ dating: true }]);
  assert.equal((await ok(buyer.token, 'identity.getCurrentUser')).dating, false, 'dating stays off without an adult age');
  await ok(buyer.token, 'identity.updateProfile', [{ birthYear: 1995, dating: true }]);
  const me = await ok(buyer.token, 'identity.getCurrentUser');
  assert.ok(me.adult && me.dating);
  if (slot) await ok(buyer.token, 'commerce.book', [{ businessId: 'biz_pulse', serviceId: 'svc-entry', slotId: slot }]);
  const ads = new Set();
  for (let i = 0; i < 12; i++) ads.add((await ok(buyer.token, 'ads.getCreative', [`world.central.plaza-test-${i}`]))?.id);
  assert.ok(ads.has('ad_pulse'), '18+ promotions reach adults');
});

test('10 · platform revenue ledger covers every stream', async () => {
  const t = await treasury();
  for (const k of ['commerce', 'bookings', 'rides', 'ads', 'radio', 'virtual']) assert.ok(t.byType[k] > 0, `platform earned from ${k}`);
  assert.ok(t.total >= Object.values(t.byType).reduce((a, b) => a + b, 0) - 0.05);
  void PLACES;
  void entrancePoint;
});
