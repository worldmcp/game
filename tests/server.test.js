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
  assert.equal((await rpc(B.token, 'wallet.getWallet')).body.data.balance, bBal + 20, 'worker paid from escrow');
  assert.equal((await rpc(A.token, 'work.approve', [gig.id])).status, 400, 'cannot release twice');
});

test('rate limiting kicks in', async () => {
  const results = await Promise.all(Array.from({ length: 80 }, () => rpc(B.token, 'wallet.getWallet')));
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
