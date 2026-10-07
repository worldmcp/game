import test from 'node:test';
import assert from 'node:assert/strict';
import { DemoPludorAdapter, memoryStorage } from '../src/pludor/demo-adapter.js';
import { assertAdapter } from '../src/pludor/contract.js';

// Deterministic harness: manual clock and a scheduler we drain explicitly.
function harness(storage = memoryStorage(), id = 'u_test') {
  let t = Date.UTC(2026, 5, 1, 12);
  const queue = [];
  const adapter = new DemoPludorAdapter({
    user: { id, handle: id, displayName: 'Tester', color: '#123456' },
    storage,
    now: () => t,
    schedule: (ms, fn) => queue.push({ at: t + ms, fn }),
  });
  const advance = async (ms) => {
    t += ms;
    queue.sort((a, b) => a.at - b.at);
    while (queue.length && queue[0].at <= t) {
      queue.shift().fn();
      await Promise.resolve();
    }
  };
  return { adapter, advance, storage };
}

test('adapter implements the full Pludor contract', () => {
  const { adapter } = harness();
  assert.ok(assertAdapter(adapter));
});

test('client cannot report server-only economic events', async () => {
  const { adapter } = harness();
  await assert.rejects(adapter.gamification.track('PLAYER_COMPLETED_GIG', {}), /server-emitted/);
  await assert.rejects(adapter.gamification.track('PLAYER_PURCHASED', {}), /server-emitted/);
  const ok = await adapter.gamification.track('PLAYER_ENTERED_WORLD', {});
  assert.ok(ok.xp > 0);
  const again = await adapter.gamification.track('PLAYER_ENTERED_WORLD', {});
  assert.equal(again.xp, 0, 'once per day');
});

test('checkout prices from the server catalog, debits wallet, creates order, awards XP', async () => {
  const { adapter } = harness();
  const before = (await adapter.wallet.getWallet()).balance;
  const { order, progress } = await adapter.commerce.checkout({
    businessId: 'biz_daily_grind', fulfillment: 'pickup',
    items: [{ sku: 'dg-latte', qty: 2, price: 0.01 }],
  });
  assert.equal(order.total, 9, 'client-supplied price ignored');
  assert.equal((await adapter.wallet.getWallet()).balance, before - 9);
  assert.ok(progress.xp > 0);
  assert.equal((await adapter.commerce.getOrders()).orders[0].id, order.id);
  await assert.rejects(adapter.commerce.checkout({ businessId: 'biz_daily_grind', fulfillment: 'pickup', items: [{ sku: 'dg-latte', qty: 999 }] }), /Invalid cart item/);
  await assert.rejects(adapter.commerce.checkout({ businessId: 'biz_kicks_co', fulfillment: 'pickup', items: [{ sku: 'kc-runner2', qty: 3 }] }), /Not enough balance/);
});

test('gig gating → course → apply → submit → escrow payout → reputation', async () => {
  const { adapter, advance } = harness();
  await assert.rejects(adapter.work.apply('g_ember_video'), /Requires Video Editing L2/);
  const course = await adapter.learning.getCourse('c_video_editing');
  assert.equal(course.challenge[0].answer, undefined, 'answers are not sent to client');
  const fail = await adapter.learning.completeCourse('c_video_editing', [1, 1]);
  assert.equal(fail.passed, false);
  const pass = await adapter.learning.completeCourse('c_video_editing', [0, 1]);
  assert.equal(pass.passed, true);
  await adapter.work.apply('g_ember_video', 'Hi Marcus');
  await assert.rejects(adapter.work.submit('g_ember_video', 'link'), /not assigned/);
  await advance(3000);
  assert.equal((await adapter.work.getGig('g_ember_video')).application.status, 'assigned');
  const bal = (await adapter.wallet.getWallet()).balance;
  const repBefore = (await adapter.gamification.getProgress()).reputation.score;
  await adapter.work.submit('g_ember_video', 'https://example.com/cut.mp4');
  await advance(3000);
  assert.equal((await adapter.wallet.getWallet()).balance, bal + 75);
  const prog = await adapter.gamification.getProgress();
  assert.ok(prog.reputation.score > repBefore);
  assert.ok(prog.achievements.some((a) => a.id === 'FIRST_GIG'));
});

test('posting a gig holds escrow; hiring and approving releases it', async () => {
  const { adapter, advance } = harness();
  const w0 = await adapter.wallet.getWallet();
  const { gig } = await adapter.work.createGig({ title: 'Shoot my storefront', amount: 40, category: 'photography' });
  const w1 = await adapter.wallet.getWallet();
  assert.equal(w1.balance, w0.balance - 40);
  assert.equal(w1.escrowHeld, 40);
  await assert.rejects(adapter.work.approve(gig.id), /Nothing to approve/);
  await advance(4000);
  const g = await adapter.work.getGig(gig.id);
  assert.equal(g.applicants.length, 1);
  await adapter.work.hire(gig.id, g.applicants[0].userId);
  await advance(3500);
  await adapter.work.approve(gig.id);
  const w2 = await adapter.wallet.getWallet();
  assert.equal(w2.escrowHeld, 0);
  assert.equal(w2.balance, w0.balance - 40, 'escrow paid out, not refunded');
});

test('land: zoning, rent once, open business, quest + rank', async () => {
  const storage = memoryStorage();
  const a = harness(storage, 'u_a').adapter;
  const b = harness(storage, 'u_b').adapter;
  await assert.rejects(a.land.rent('p-riverside-3', 'storefront'), /zoning/);
  await a.land.rent('p-riverside-1', 'storefront');
  await assert.rejects(b.land.rent('p-riverside-1', 'storefront'), /already rents/);
  await assert.rejects(b.land.openBusiness('p-riverside-1', 'Hijack'), /don't rent/);
  await a.land.openBusiness('p-riverside-1', 'Tester Tees');
  const parcels = await b.land.listParcels();
  assert.equal(parcels.find((p) => p.id === 'p-riverside-1').building.businessName, 'Tester Tees');
  const prog = await a.gamification.getProgress();
  assert.ok(prog.achievements.some((x) => x.id === 'FIRST_BUSINESS'));
});

test('rent rolls back the reservation when payment fails', async () => {
  const { adapter } = harness();
  // Drain the wallet first.
  for (let i = 0; i < 2; i++) await adapter.commerce.checkout({ businessId: 'biz_kicks_co', fulfillment: 'pickup', items: [{ sku: 'kc-runner2', qty: 1 }] });
  await assert.rejects(adapter.land.rent('p-riverside-6', 'storefront'), /Not enough balance/);
  const p = (await adapter.land.listParcels()).find((x) => x.id === 'p-riverside-6');
  assert.equal(p.status, 'available');
});

test('games validate results server-side and cap rewards', async () => {
  const { adapter, advance } = harness();
  const s = await adapter.games.startGame('reaction-rush');
  await advance(10000);
  await assert.rejects(adapter.games.submitGame(s.id, { times: [10, 10, 10, 10, 10] }), /implausible/);
  const s2 = await adapter.games.startGame('reaction-rush');
  await advance(10000);
  const r = await adapter.games.submitGame(s2.id, { times: [250, 260, 270, 240, 255] });
  assert.ok(r.progress.xp > 0 && r.progress.xp <= 20 + 40);
  await assert.rejects(adapter.games.submitGame(s2.id, { times: [250, 260, 270, 240, 255] }), /expired/, 'session single-use');
  const t = await adapter.games.startGame('nova-trivia');
  assert.equal(t.questions[0].answer, undefined);
});

test('sponsored token hunt requires active quest, proximity and grants a merchant coupon', async () => {
  const { adapter } = harness();
  await assert.rejects(adapter.world.collectToken('tok-1', { x: -20.5, z: -40 }), /Start the Kicks/);
  // Finish the welcome quest to unlock it.
  await adapter.ai.askAgent('guide', {});
  for (const p of ['a', 'b', 'c']) await adapter.gamification.track('PLAYER_ENTERED_BUSINESS', { placeId: p });
  await adapter.gamification.track('PLAYER_WAVED', {});
  await assert.rejects(adapter.world.collectToken('tok-1', { x: 50, z: 50 }), /closer/);
  await adapter.world.collectToken('tok-1', { x: -20.5, z: -40 });
  await adapter.world.collectToken('tok-2', { x: 72, z: 27.5 });
  const r = await adapter.world.collectToken('tok-3', { x: -78, z: 62 });
  assert.equal(r.coupons?.length ?? (await adapter.gamification.getProgress()).coupons.length, 1);
  const prog = await adapter.gamification.getProgress();
  const coupon = prog.coupons[0];
  const { order } = await adapter.commerce.checkout({ businessId: 'biz_kicks_co', fulfillment: 'pickup', items: [{ sku: 'kc-cap', qty: 1 }], couponId: coupon.id });
  assert.equal(order.discount, 2.8);
  await assert.rejects(adapter.commerce.checkout({ businessId: 'biz_kicks_co', fulfillment: 'pickup', items: [{ sku: 'kc-cap', qty: 1 }], couponId: coupon.id }), /Coupon/);
});

test('blocking stops messages and calls; privacy settings respected', async () => {
  const sent = [];
  const transport = { send: (m) => sent.push(m), onMessage: (fn) => (transport.fn = fn), getPeer: () => ({ id: 'u_peer', handle: 'peer', displayName: 'Peer' }) };
  const adapter = new DemoPludorAdapter({ user: { id: 'u_me', handle: 'me', displayName: 'Me' }, transport, schedule: () => {} });
  transport.fn({ type: 'dm', from: 'u_peer', to: 'u_me', text: 'hi' });
  assert.equal((await adapter.messaging.getConversation('u_peer')).length, 1);
  await adapter.social.block('u_peer');
  transport.fn({ type: 'dm', from: 'u_peer', to: 'u_me', text: 'spam' });
  assert.equal((await adapter.messaging.getConversation('u_peer')).length, 1);
  await assert.rejects(adapter.messaging.send('u_peer', 'x'), /blocked/);
  transport.fn({ type: 'call-request', from: 'u_peer', to: 'u_me', callId: 'c1' });
  assert.equal(sent.at(-1).type, 'call-response');
  assert.equal(sent.at(-1).accept, false);
  await adapter.social.block('u_peer');
  await adapter.identity.updateProfile({ allowMessages: 'friends', color: 'javascript:alert(1)' });
  transport.fn({ type: 'dm', from: 'u_peer', to: 'u_me', text: 'still not friends' });
  assert.equal((await adapter.messaging.getConversation('u_peer')).length, 1);
  assert.notEqual((await adapter.identity.getCurrentUser()).color, 'javascript:alert(1)');
});

test('ads: rotation, impression dedupe, interaction leads to target', async () => {
  const { adapter, advance } = harness();
  const c = await adapter.ads.getCreative('world.central.plaza-ne');
  assert.ok(c.sponsored && c.target);
  assert.equal((await adapter.ads.trackImpression(c.placementId, c.id)).counted, true);
  assert.equal((await adapter.ads.trackImpression(c.placementId, c.id)).counted, false);
  await advance(31000);
  assert.equal((await adapter.ads.trackImpression(c.placementId, c.id)).counted, true);
  const r = await adapter.ads.trackInteraction(c.placementId, c.id);
  assert.deepEqual(r.target, c.target);
  const stats = await adapter.ads.getStats(c.id);
  assert.equal(stats.impressions, 2);
  assert.equal(stats.interactions, 1);
});

test('unclaimed local business: claim goes to verification, feedback once per user', async () => {
  const { adapter } = harness();
  const biz = await adapter.commerce.getBusiness('lb_fixit_repair');
  assert.equal(biz.claimed, false);
  const claim = await adapter.business.claim('lb_fixit_repair', { contact: 'owner@example.com' });
  assert.equal(claim.status, 'pending_verification');
  await assert.rejects(adapter.business.claim('biz_daily_grind'), /already managed/);
  await adapter.business.feedback('lb_fixit_repair', 'active');
  await assert.rejects(adapter.business.feedback('lb_fixit_repair', 'closed'), /already/);
});

test('venue units: seeded food-court stall takes orders; apartments let you sleep', async () => {
  const { adapter, advance } = harness();
  const parcels = await adapter.land.listParcels();
  const suya = parcels.find((p) => p.id === 'u-fc-1');
  assert.equal(suya.building.businessName, 'Suya Spot');
  const biz = await adapter.commerce.getBusiness('pb_u-fc-1');
  const r = await adapter.commerce.checkout({ businessId: 'pb_u-fc-1', items: [{ sku: biz.catalog[0].sku, qty: 1 }], fulfillment: 'pickup' });
  assert.ok(r.order.id);
  await advance(10000);
  const o = await adapter.orders.track(r.order.id);
  assert.equal(o.status, 'ready_for_pickup', 'bot merchant runs the stall');
  await assert.rejects(adapter.needs.performActivity('sleep', { placeId: 'grand-hotel' }), /apartment/);
  await adapter.land.rent('u-apt-1', 'apartment');
  const mine = (await adapter.land.listParcels()).find((p) => p.id === 'u-apt-1');
  assert.ok(mine.mine && mine.building.template === 'apartment');
  await assert.rejects(adapter.land.openBusiness('u-apt-1', 'Nope', 'shop'), /Homes cannot/);
  await adapter.needs.performActivity('sleep', { placeId: 'grand-hotel' });
});

test('points buy virtual goods (never money) and gate premium looks', async () => {
  const { adapter } = harness();
  const w0 = await adapter.wallet.getWallet();
  assert.equal(w0.points, 100);
  await adapter.gamification.track('PLAYER_ENTERED_WORLD', {});
  const w1 = await adapter.wallet.getWallet();
  assert.ok(w1.points > 100, 'points ride along with XP');
  assert.equal(w1.balance, w0.balance, 'points never touch money');
  await adapter.identity.updateProfile({ look: { cap: '#e63946', glasses: true } });
  let me = await adapter.identity.getCurrentUser();
  assert.equal(me.look.cap, null, 'locked cap stripped until owned');
  assert.equal(me.look.glasses, true);
  await adapter.shop.buyVirtual('acc-cap');
  await assert.rejects(adapter.shop.buyVirtual('acc-cap'), /already own/);
  await assert.rejects(adapter.shop.buyVirtual('car-gt'), /more points/);
  await adapter.identity.updateProfile({ look: { cap: '#e63946' } });
  me = await adapter.identity.getCurrentUser();
  assert.equal(me.look.cap, '#e63946');
  assert.ok((await adapter.wallet.getWallet()).owned.includes('acc-cap'));
});
