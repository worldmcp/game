// Runtime tests against the real sandbox server: HTTP + WebSocket, two or
// more real accounts, security and anti-cheat.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { createWorldServer } from '../server/server.js';

const dataDir = mkdtempSync(join(tmpdir(), 'pw-'));
let app;
let base;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, { token, body, method = 'POST', headers = {} } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null), headers: res.headers };
}
const rpc = (token, name, args = [], headers) => api(`/api/rpc/${name}`, { token, body: { args }, headers });

function socket(token) {
  const ws = new WebSocket(`${base.replace('http', 'ws')}/ws?token=${token}`);
  ws.inbox = [];
  ws.on('message', (m) => ws.inbox.push(JSON.parse(m)));
  return new Promise((ok, fail) => {
    ws.on('open', () => ok(ws));
    ws.on('error', fail);
    ws.on('close', (code) => ws.inbox.push({ type: 'closed', code }));
  });
}
const waitFor = async (ws, pred, ms = 3000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const hit = ws.inbox.find(pred);
    if (hit) return hit;
    await wait(30);
  }
  return null;
};

let A;
let B;

test.before(async () => {
  app = createWorldServer({ dataDir, admins: ['adminuser'], quiet: true });
  base = `http://127.0.0.1:${await app.listen(0)}`;
});
test.after(async () => app.close());

test('signup, login, me; bad credentials rejected; one identity', async () => {
  const s = await api('/api/auth/signup', { body: { username: 'alice', password: 'correct horse' } });
  assert.equal(s.status, 200);
  A = s.body;
  assert.equal((await api('/api/auth/signup', { body: { username: 'ALICE', password: 'whatever123' } })).status, 409, 'usernames unique case-insensitively');
  assert.equal((await api('/api/auth/login', { body: { username: 'alice', password: 'wrong password' } })).status, 401);
  assert.equal((await api('/api/auth/signup', { body: { username: 'x', password: 'short' } })).status, 400);
  const l = await api('/api/auth/login', { body: { username: 'alice', password: 'correct horse' } });
  assert.equal(l.body.user.id, A.user.id, 'same account on re-login');
  B = (await api('/api/auth/signup', { body: { username: 'bob', password: 'battery staple' } })).body;
  const me = await api('/api/auth/me', { token: A.token, method: 'GET' });
  assert.equal(me.body.user.id, A.user.id);
  const prof = await rpc(A.token, 'identity.getCurrentUser');
  assert.equal(prof.body.data.id, A.user.id, 'World profile is the account identity');
});

test('unauthorized and malformed requests are rejected', async () => {
  assert.equal((await rpc(null, 'wallet.getWallet')).status, 401);
  assert.equal((await rpc('f'.repeat(64), 'wallet.getWallet')).status, 401, 'forged token');
  assert.equal((await rpc(A.token, 'admin.everything')).status, 404, 'unknown action');
  assert.equal((await api('/api/rpc/wallet.getWallet', { token: A.token, body: '{nope' })).status, 400, 'malformed JSON');
  assert.equal((await api('/api/rpc/wallet.getWallet', { token: A.token, body: { args: ['x'.repeat(70000)] } })).status, 413, 'oversized body');
  assert.equal((await api('/api/admin/overview', { token: A.token, method: 'GET' })).status, 403, 'non-admin blocked from admin');
  assert.equal((await rpc(A.token, 'gamification.track', ['PLAYER_COMPLETED_GIG', {}])).status, 403, 'client cannot award itself');
  assert.equal((await rpc(A.token, 'commerce.getBusiness', ['nope'])).status, 404, 'invalid id');
  assert.equal((await api('/../package.json', { method: 'GET' })).status, 404, 'no path traversal');
  assert.equal((await api('/server/auth.js', { method: 'GET' })).status, 404, 'server code not served');
});

test('wallet is per-account and cannot be read or changed by others', async () => {
  const wa = (await rpc(A.token, 'wallet.getWallet')).body.data;
  await rpc(A.token, 'commerce.checkout', [{ businessId: 'biz_daily_grind', items: [{ sku: 'dg-latte', qty: 1 }], fulfillment: 'pickup' }]);
  const wb = (await rpc(B.token, 'wallet.getWallet')).body.data;
  assert.equal(wb.balance, wa.balance, 'bob unaffected by alice purchase');
  assert.equal((await rpc(A.token, 'wallet.getWallet')).body.data.balance, wa.balance - 4.5);
  assert.equal((await rpc(B.token, 'commerce.getOrders')).body.data.orders.length, 0, 'orders are private');
});

test('checkout is idempotent: retried request never double-charges', async () => {
  const before = (await rpc(A.token, 'wallet.getWallet')).body.data.balance;
  const args = [{ businessId: 'biz_kicks_co', items: [{ sku: 'kc-socks', qty: 1 }], fulfillment: 'pickup' }];
  const h = { 'idempotency-key': 'order-123' };
  const r1 = await rpc(A.token, 'commerce.checkout', args, h);
  const r2 = await rpc(A.token, 'commerce.checkout', args, h);
  assert.equal(r1.body.data.order.id, r2.body.data.order.id);
  assert.equal(r2.headers.get('idempotent-replay'), 'true');
  assert.equal((await rpc(A.token, 'wallet.getWallet')).body.data.balance, before - 14);
});

test('multiplayer: both see each other, movement syncs, names come from server', async () => {
  const wa = await socket(A.token);
  const wb = await socket(B.token);
  const welcome = await waitFor(wa, (m) => m.type === 'welcome');
  assert.ok(welcome);
  wa.send(JSON.stringify({ type: 'state', x: welcome.you.x + 1, z: welcome.you.z, ry: 0, moving: true, profile: { displayName: 'HACKER' } }));
  const seen = await waitFor(wb, (m) => m.type === 'states' && m.players.some((p) => p.id === A.user.id && Math.abs(p.x - (welcome.you.x + 1)) < 0.01));
  assert.ok(seen, 'B sees A move');
  const pa = seen.players.find((p) => p.id === A.user.id);
  assert.equal(pa.profile.displayName, 'alice', 'client cannot spoof display name');
  assert.ok((await waitFor(wa, (m) => m.type === 'states' && m.players.some((p) => p.id === B.user.id))), 'A sees B');
  wa.close();
  wb.close();
});

test('anti-cheat: speed/teleport hacks are corrected; travel via server allowed', async () => {
  const ws = await socket(A.token);
  const w = await waitFor(ws, (m) => m.type === 'welcome');
  ws.send(JSON.stringify({ type: 'state', x: w.you.x + 80, z: w.you.z, ry: 0 }));
  const c = await waitFor(ws, (m) => m.type === 'correction');
  assert.ok(c, 'teleport rejected');
  assert.ok(Math.abs(c.x - w.you.x) < 2);
  ws.send(JSON.stringify({ type: 'state', x: 9999, z: 0 }));
  assert.ok(await waitFor(ws, (m) => m.type === 'correction' && m !== c), 'out of bounds rejected');
  // Legit fast travel through Wayfare is authorised server-side.
  await rpc(A.token, 'world.worldRide', ['arcade']);
  ws.inbox.length = 0;
  ws.send(JSON.stringify({ type: 'state', x: 50, z: 33.9, ry: 0 }));
  await wait(250);
  assert.ok(!ws.inbox.some((m) => m.type === 'correction'), 'authorised teleport accepted');
  // Token collection uses the SERVER's position, not a claimed one.
  const r = await rpc(A.token, 'world.collectToken', ['tok-1', { x: -20.5, z: -40 }]);
  assert.notEqual(r.status, 200, 'cannot claim a token from across the map');
  ws.close();
});

test('messaging + presence events route through the server between real users', async () => {
  const wb = await socket(B.token);
  await waitFor(wb, (m) => m.type === 'welcome');
  const r = await rpc(A.token, 'messaging.send', [B.user.id, 'Hi Bob!']);
  assert.equal(r.status, 200);
  const evt = await waitFor(wb, (m) => m.type === 'event' && m.evt.kind === 'message');
  assert.ok(evt, 'recipient notified in realtime');
  const convB = (await rpc(B.token, 'messaging.getConversation', [A.user.id])).body.data;
  assert.equal(convB.at(-1).text, 'Hi Bob!', 'one conversation history on the server');
  await rpc(B.token, 'messaging.send', [A.user.id, 'Hey Alice']);
  const convA = (await rpc(A.token, 'messaging.getConversation', [B.user.id])).body.data;
  assert.deepEqual(convA.map((m) => m.text), ['Hi Bob!', 'Hey Alice']);
  wb.close();
});

test('voice requires consent; block stops messages and calls', async () => {
  const wa = await socket(A.token);
  const wb = await socket(B.token);
  const call = (await rpc(A.token, 'voice.requestCall', [B.user.id])).body.data;
  const ring = await waitFor(wb, (m) => m.type === 'event' && m.evt.kind === 'call' && m.evt.call.status === 'ringing');
  assert.ok(ring, 'callee rings');
  await rpc(B.token, 'voice.respondCall', [ring.evt.call.id, true]);
  assert.ok(await waitFor(wa, (m) => m.type === 'event' && m.evt.kind === 'call' && m.evt.call.id === call.id && m.evt.call.status === 'active'), 'caller connected after accept');
  await rpc(B.token, 'social.block', [A.user.id]);
  await rpc(A.token, 'messaging.send', [B.user.id, 'spam']);
  const convB = (await rpc(B.token, 'messaging.getConversation', [A.user.id])).body.data;
  assert.ok(!convB.some((m) => m.text === 'spam'), 'blocked user cannot message');
  await wait(250);
  const st = wb.inbox.filter((m) => m.type === 'states').at(-1);
  assert.ok(!st || !st.players.some((p) => p.id === A.user.id), 'blocked user hidden from presence');
  await rpc(B.token, 'social.block', [A.user.id]); // unblock
  wa.close();
  wb.close();
});

test('gig loop across two real users with escrow', async () => {
  const before = (await rpc(A.token, 'wallet.getWallet')).body.data;
  const { gig } = (await rpc(A.token, 'work.createGig', [{ title: 'Help me move boxes', amount: 20, category: 'local-service' }])).body.data;
  assert.equal((await rpc(A.token, 'wallet.getWallet')).body.data.escrowHeld, before.escrowHeld + 20);
  assert.equal((await rpc(A.token, 'work.apply', [gig.id])).status, 409, 'cannot apply to own gig');
  assert.equal((await rpc(B.token, 'work.apply', [gig.id, 'I can help'])).status, 200);
  assert.equal((await rpc(B.token, 'work.approve', [gig.id])).status, 403, 'worker cannot approve');
  assert.equal((await rpc(A.token, 'work.hire', [gig.id, B.user.id])).status, 200);
  assert.equal((await rpc(B.token, 'work.submit', [gig.id, 'Done — photos attached'])).status, 200);
  const bBal = (await rpc(B.token, 'wallet.getWallet')).body.data.balance;
  assert.equal((await rpc(A.token, 'work.approve', [gig.id])).status, 200);
  assert.equal((await rpc(B.token, 'wallet.getWallet')).body.data.balance, bBal + 18.4, 'worker paid from escrow minus 8% platform fee');
  assert.equal((await rpc(A.token, 'work.approve', [gig.id])).status, 400, 'cannot release twice');
});

test('rate limiting kicks in', async () => {
  const results = await Promise.all(Array.from({ length: 200 }, () => rpc(B.token, 'wallet.getWallet')));
  assert.ok(results.some((r) => r.status === 429));
});

test('logout invalidates the session; state persists across server restart', async () => {
  const wallet = (await rpc(A.token, 'wallet.getWallet')).body.data.balance;
  await api('/api/auth/logout', { token: A.token });
  assert.equal((await rpc(A.token, 'wallet.getWallet')).status, 401);
  await app.close();
  app = createWorldServer({ dataDir, admins: ['adminuser'], quiet: true });
  base = `http://127.0.0.1:${await app.listen(0)}`;
  const l = await api('/api/auth/login', { body: { username: 'alice', password: 'correct horse' } });
  A = l.body;
  assert.equal((await rpc(A.token, 'wallet.getWallet')).body.data.balance, wallet, 'balance persisted');
  assert.ok((await rpc(A.token, 'commerce.getOrders')).body.data.orders.length >= 2, 'orders persisted');
});

test('admin endpoint works for admins only and exposes the audit trail', async () => {
  const s = (await api('/api/auth/signup', { body: { username: 'adminuser', password: 'admin password' } })).body;
  const o = await api('/api/admin/overview', { token: s.token, method: 'GET' });
  assert.equal(o.status, 200);
  assert.ok(o.body.audit.some((e) => e.name === 'commerce.checkout'));
});

// Walk a socket's player to a point at a legal pace (server checks speed).
async function walkTo(ws, from, to, speed = 8) {
  let { x, z } = from;
  while (Math.hypot(to.x - x, to.z - z) > 0.5) {
    const d = Math.hypot(to.x - x, to.z - z);
    const step = Math.min(d, speed * 0.1);
    x += ((to.x - x) / d) * step;
    z += ((to.z - z) / d) * step;
    ws.send(JSON.stringify({ type: 'state', x, z, ry: 0, moving: true }));
    await wait(100);
  }
  await wait(150);
  return { x, z };
}

test('anti-cheat: spamming small moves cannot exceed the speed limit', async () => {
  const ws = await socket(B.token);
  const w = await waitFor(ws, (m) => m.type === 'welcome');
  for (let i = 1; i <= 40; i++) ws.send(JSON.stringify({ type: 'state', x: w.you.x + i * 1.4, z: w.you.z }));
  await wait(300);
  assert.ok(ws.inbox.some((m) => m.type === 'correction'), 'burst of moves is rejected');
  ws.close();
  await wait(4500); // let presence settle before the next test
});

test('supply chain: player restaurant → customer orders delivery → player courier delivers → everyone paid', async () => {
  const carol = (await api('/api/auth/signup', { body: { username: 'carol', password: 'carol password' } })).body;
  const dave = (await api('/api/auth/signup', { body: { username: 'dave', password: 'dave password' } })).body;
  // Carol opens a restaurant on a commercial parcel and lists a dish.
  assert.equal((await rpc(carol.token, 'land.rent', ['p-riverside-5', 'storefront'])).status, 200);
  assert.equal((await rpc(carol.token, 'land.openBusiness', ['p-riverside-5', "Carol's Kitchen", 'restaurant'])).status, 200);
  const dish = (await rpc(carol.token, 'business.addProduct', ['p-riverside-5', { name: 'Jollof Bowl', price: 12, icon: '🍛' }])).body.data;
  assert.equal((await rpc(dave.token, 'business.addProduct', ['p-riverside-5', { name: 'Hack', price: 1 }])).status, 403, 'only the owner manages the menu');
  const cws = await socket(carol.token);
  const dws = await socket(dave.token);
  const dWelcome = await waitFor(dws, (m) => m.type === 'welcome');
  // Dave orders delivery; money goes to escrow.
  const dBal = (await rpc(dave.token, 'wallet.getWallet')).body.data.balance;
  const ord = await rpc(dave.token, 'commerce.checkout', [{ businessId: 'pb_p-riverside-5', items: [{ sku: dish.sku, qty: 1 }], fulfillment: 'delivery' }]);
  assert.equal(ord.status, 200);
  const order = ord.body.data.order;
  assert.deepEqual(order.dropoff, { x: dWelcome.you.x, z: dWelcome.you.z }, 'drop-off is where the server says the customer is');
  const wDave = (await rpc(dave.token, 'wallet.getWallet')).body.data;
  assert.equal(wDave.balance, dBal - 16);
  assert.equal(wDave.escrowHeld, 16);
  assert.ok(await waitFor(cws, (m) => m.type === 'event' && m.evt.kind === 'merchant-order'), 'merchant notified in realtime');
  // Merchant accepts and marks ready → courier job opens.
  assert.equal((await rpc(A.token, 'orders.accept', [order.id])).status, 403, 'only the merchant can accept');
  await rpc(carol.token, 'orders.accept', [order.id]);
  await rpc(carol.token, 'orders.ready', [order.id]);
  const jobs = (await rpc(A.token, 'delivery.jobs')).body.data;
  const job = jobs.open.find((j) => j.id === order.id);
  assert.ok(job, 'job visible to other players');
  assert.equal(job.payout, 3.4, 'courier sees payout after platform fee');
  // Alice is the courier.
  const aws = await socket(A.token);
  const aW = await waitFor(aws, (m) => m.type === 'welcome');
  assert.equal((await rpc(A.token, 'delivery.accept', [order.id])).status, 200);
  assert.equal((await rpc(B.token, 'delivery.accept', [order.id])).status, 409, 'job cannot be double-assigned');
  assert.equal((await rpc(A.token, 'delivery.pickup', [order.id, order.pickup])).status, 409, 'claimed position ignored: must really be at the shop');
  let pos = await walkTo(aws, aW.you, order.pickup);
  assert.equal((await rpc(A.token, 'delivery.pickup', [order.id])).status, 200, 'pickup at the shop');
  assert.equal((await rpc(A.token, 'delivery.dropoff', [order.id])).status, 409, 'cannot drop off from the shop');
  const aBal = (await rpc(A.token, 'wallet.getWallet')).body.data.balance;
  const cBal = (await rpc(carol.token, 'wallet.getWallet')).body.data.balance;
  pos = await walkTo(aws, pos, order.dropoff);
  assert.equal((await rpc(A.token, 'delivery.dropoff', [order.id])).status, 200, 'delivered');
  assert.equal((await rpc(A.token, 'wallet.getWallet')).body.data.balance, aBal + 3.4, 'courier paid');
  assert.equal((await rpc(carol.token, 'wallet.getWallet')).body.data.balance, cBal + 11.4, 'merchant paid minus 5%');
  assert.equal((await rpc(dave.token, 'wallet.getWallet')).body.data.escrowHeld, 0, 'customer escrow released');
  const daveOrder = (await rpc(dave.token, 'commerce.getOrders')).body.data.orders.find((o) => o.id === order.id);
  assert.equal(daveOrder.status, 'delivered', 'customer order history updated');
  const admin = (await api('/api/auth/login', { body: { username: 'adminuser', password: 'admin password' } })).body;
  const ov = (await api('/api/admin/overview', { token: admin.token, method: 'GET' })).body;
  assert.ok(ov.treasury.byType.commerce >= 0.6 && ov.treasury.byType.delivery >= 0.6, 'platform fees recorded');
  for (const s of [aws, cws, dws]) s.close();
});

test('service request on-site: worker must be at the location to complete', async () => {
  const ws = await socket(B.token);
  const w = await waitFor(ws, (m) => m.type === 'welcome');
  const { gig } = (await rpc(B.token, 'work.createGig', [{ title: 'Mow my lawn', amount: 30, category: 'home-services', onSite: true }])).body.data;
  assert.deepEqual(gig.location, { x: w.you.x, z: w.you.z });
  const eve = (await api('/api/auth/signup', { body: { username: 'eve', password: 'eve password' } })).body;
  await rpc(eve.token, 'work.apply', [gig.id, 'I have a mower']);
  await rpc(B.token, 'work.hire', [gig.id, eve.user.id]);
  const ews = await socket(eve.token);
  const eW = await waitFor(ews, (m) => m.type === 'welcome');
  // Eve spawns at the same spot as Bob here, so move her away first.
  const away = await walkTo(ews, eW.you, { x: eW.you.x + 30, z: eW.you.z });
  assert.equal((await rpc(eve.token, 'work.submit', [gig.id, 'done'])).status, 409, 'not on site');
  await walkTo(ews, away, gig.location);
  assert.equal((await rpc(eve.token, 'work.submit', [gig.id, 'Lawn mowed'])).status, 200, 'on site');
  ws.close();
  ews.close();
});

test('player marketplace listing: seller paid minus fee, cannot buy own', async () => {
  const l = (await rpc(B.token, 'commerce.createListing', [{ title: 'Used guitar', price: 50, icon: '🎸' }])).body.data;
  assert.equal((await rpc(B.token, 'commerce.buyListing', [l.id])).status, 400);
  const sBal = (await rpc(B.token, 'wallet.getWallet')).body.data.balance;
  assert.equal((await rpc(A.token, 'commerce.buyListing', [l.id])).status, 200);
  assert.equal((await rpc(B.token, 'wallet.getWallet')).body.data.balance, sBal + 47.5);
  assert.equal((await rpc(A.token, 'commerce.buyListing', [l.id])).status, 409, 'cannot be sold twice');
});

test('batched calls: one request, per-call results, idempotent writes', async () => {
  const res = await api('/api/rpc-batch', { token: A.token, body: { calls: [
    { name: 'wallet.getWallet', args: [] },
    { name: 'nope.nope', args: [] },
    { name: 'commerce.getBusiness', args: ['missing'] },
  ] } });
  assert.equal(res.status, 200);
  assert.equal(res.body.results[0].ok, true);
  assert.equal(res.body.results[1].status, 404);
  assert.equal(res.body.results[2].status, 404);
  assert.equal((await api('/api/rpc-batch', { token: A.token, body: { calls: [] } })).status, 400);
  assert.equal((await api('/api/rpc-batch', { body: { calls: [{ name: 'wallet.getWallet' }] } })).status, 401);
  const before = (await rpc(A.token, 'wallet.getWallet')).body.data.balance;
  const call = { name: 'commerce.checkout', args: [{ businessId: 'biz_kicks_co', items: [{ sku: 'kc-socks', qty: 1 }], fulfillment: 'pickup' }], key: 'batch-order-1' };
  await api('/api/rpc-batch', { token: A.token, body: { calls: [call] } });
  await api('/api/rpc-batch', { token: A.token, body: { calls: [call] } });
  assert.equal((await rpc(A.token, 'wallet.getWallet')).body.data.balance, before - 14, 'replayed batch call did not double-charge');
});
