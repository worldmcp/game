import test from 'node:test';
import assert from 'node:assert/strict';
import { SpatialGrid } from '../src/core/spatial-grid.js';
import { worldTimeAt, isOpen, formatClock } from '../src/core/world-time.js';
import { initialNeeds, needsAt, applyNeedEffects } from '../src/core/needs.js';
import { levelForXp, rankFor, awardXp, checkAchievements } from '../src/core/progression.js';
import { advanceQuests, initQuestProgress } from '../src/core/quests.js';
import { NavGrid } from '../src/core/pathfind.js';
import { classify, route } from '../src/core/ai-intents.js';
import { resolveFlags } from '../src/config/flags.js';
import { ECONOMY } from '../src/config/economy.js';
import { PLACES, PARCELS, AGENTS, TOKENS, BILLBOARDS, footprint, entrancePoint, DISTRICT } from '../src/config/nova-city.js';

test('spatial grid returns nearest-first within radius', () => {
  const g = new SpatialGrid(10);
  g.upsert('a', 0, 0);
  g.upsert('b', 5, 0);
  g.upsert('c', 50, 50);
  assert.deepEqual(g.query(4, 0, 6).map((x) => x.id), ['b', 'a']);
  g.upsert('b', 100, 100);
  assert.deepEqual(g.query(4, 0, 6).map((x) => x.id), ['a']);
  g.remove('a');
  assert.equal(g.query(0, 0, 6).length, 0);
});

test('world time is shared, wraps days and respects business hours', () => {
  const cfg = { realMinutesPerDay: 24, epochMs: 0, epochHour: 0 };
  assert.equal(worldTimeAt(0, cfg).hour, 0);
  assert.equal(worldTimeAt(12 * 60000, cfg).hour, 12);
  assert.equal(worldTimeAt(25 * 60000, cfg).day, 2);
  assert.equal(formatClock({ hour: 13, minute: 5 }), '1:05 PM');
  assert.ok(isOpen([9, 17], 12));
  assert.ok(!isOpen([9, 17], 18));
  assert.ok(isOpen([18, 2], 1), 'wraps past midnight');
  assert.ok(isOpen([7, 24], 23.5));
});

test('needs decay over world time and clamp', () => {
  const n = ECONOMY.needs;
  const t = ECONOMY.time;
  const s = initialNeeds(n, 0);
  const hour = (t.realMinutesPerDay * 60000) / 24;
  const later = needsAt(s, hour * 10, n, t);
  assert.ok(later.energy < s.values.energy);
  const fed = applyNeedEffects(s, { hunger: 500 }, 0, n, t);
  assert.equal(fed.values.hunger, 100);
});

test('levels, ranks, xp rules and achievements', () => {
  const c = ECONOMY.levelCurve;
  assert.equal(levelForXp(0, c).level, 1);
  assert.ok(levelForXp(1000, c).level > 3);
  assert.equal(rankFor([], ECONOMY.ranks).id, 'visitor');
  assert.equal(rankFor(['FIRST_STEPS', 'FIRST_BUSINESS'], ECONOMY.ranks).id, 'business-owner');
  const h = { onceKeys: new Set(), dailyCounts: {} };
  const rule = ECONOMY.xpRules.PLAYER_ENTERED_BUSINESS;
  assert.equal(awardXp('PLAYER_ENTERED_BUSINESS', { placeId: 'x' }, rule, h, 1), rule.xp);
  assert.equal(awardXp('PLAYER_ENTERED_BUSINESS', { placeId: 'x' }, rule, h, 1), 0, 'deduped same day');
  assert.equal(awardXp('PLAYER_ENTERED_BUSINESS', { placeId: 'x' }, rule, h, 2), rule.xp, 'next day pays again');
  const capped = ECONOMY.xpRules.PLAYER_SENT_MESSAGE;
  let total = 0;
  for (let i = 0; i < 50; i++) total += awardXp('PLAYER_SENT_MESSAGE', {}, capped, h, 1);
  assert.equal(total, capped.xp * capped.dailyCap);
  assert.deepEqual(checkAchievements('PLAYER_ENTERED_BUSINESS', ECONOMY.achievements, new Set(), { PLAYER_ENTERED_BUSINESS: 5 }), ['EXPLORER']);
});

test('quest engine advances matching steps and completes', () => {
  const defs = [{ id: 'q', autoStart: true, steps: [{ event: 'A', count: 2 }, { event: 'B', alt: 'C', match: { k: 1 }, count: 1 }] }];
  let p = initQuestProgress(defs);
  ({ progress: p } = advanceQuests(defs, p, 'A', {}));
  ({ progress: p } = advanceQuests(defs, p, 'C', { k: 2 }));
  assert.equal(p.q.steps[1], 0, 'match filter respected');
  ({ progress: p } = advanceQuests(defs, p, 'A', {}));
  const r = advanceQuests(defs, p, 'C', { k: 1 });
  assert.deepEqual(r.completed, ['q']);
});

test('nav grid routes around a wall', () => {
  const g = new NavGrid({ half: 20, cell: 1, blockers: [{ x0: -1, x1: 1, z0: -15, z1: 20 }], pad: 0 });
  const path = g.find({ x: -10, z: 0 }, { x: 10, z: 0 });
  assert.ok(path && path.length >= 3);
  for (let i = 1; i < path.length; i++) assert.ok(g.lineFree(path[i - 1], path[i]));
});

test('every place entrance, agent, token and parcel is reachable', () => {
  const blockers = PLACES.filter((p) => !p.walkable).map(footprint);
  const g = new NavGrid({ half: DISTRICT.half, cell: 2, blockers, pad: 0.8 });
  const start = DISTRICT.spawn;
  const targets = [
    ...PLACES.map((p) => ({ id: p.id, ...entrancePoint(p) })),
    ...AGENTS, ...TOKENS,
    ...PARCELS.map((p) => ({ id: p.id, x: p.x, z: p.z - p.d / 2 - 2 })),
  ];
  for (const t of targets) {
    const [i, j] = g.toCell(t.x, t.z);
    assert.ok(g.isFree(i, j), `${t.id} at (${t.x},${t.z}) is inside a building`);
    assert.ok(g.find(start, t), `${t.id} unreachable`);
  }
  for (const b of BILLBOARDS) assert.ok(Math.abs(b.x) <= DISTRICT.half && Math.abs(b.z) <= DISTRICT.half);
});

test('footprints stay inside their city block', () => {
  const e = DISTRICT.edges;
  const ranges = [];
  for (let i = 0; i < e.length; i += 2) ranges.push([e[i], e[i + 1]]);
  const inside = (a0, a1) => ranges.some(([r0, r1]) => a0 >= r0 - 0.01 && a1 <= r1 + 0.01);
  for (const p of [...PLACES, ...PARCELS]) {
    const f = footprint(p);
    assert.ok(inside(f.x0, f.x1) && inside(f.z0, f.z1), `${p.id} overlaps a road: ${JSON.stringify(f)}`);
  }
});

test('feature flags can be toggled from the query string', () => {
  const f = resolveFlags('?flags=-WORLD_ADS_ENABLED,+WORLD_AI_ENABLED,-NOPE');
  assert.equal(f.WORLD_ADS_ENABLED, false);
  assert.equal(f.WORLD_AI_ENABLED, true);
  assert.equal(f.NOPE, undefined);
});

test('AI intent routing understands spatial requests', () => {
  const places = PLACES.map((p) => ({ ...p, open: true, entrance: entrancePoint(p) }));
  const ctx = {
    player: { x: 0, z: 0 }, zoneName: 'Central Plaza', places,
    gigs: [{ id: 'g1', title: 'Video', eligible: false, missing: ['Video Editing L2'], courseId: 'c1', payLabel: '$75', x: 10, z: 10 }, { id: 'g2', title: 'Shift', eligible: true, missing: [], payLabel: '$54', x: 5, z: 5 }],
    parcels: [{ id: 'p1', name: 'Lot 1', status: 'available', rentPerWeek: 30, rentLabel: '$30/week', zoning: 'commercial', x: 0, z: 90 }, { id: 'p2', name: 'Lot 2', status: 'available', rentPerWeek: 15, rentLabel: '$15/week', zoning: 'residential', x: 10, z: 90 }],
    players: [{ id: 'u1', name: 'maya', x: 3, z: 3, presence: 'Online' }],
    courses: [{ id: 'c1', title: 'Video Editing', skillLabel: 'Video Editing', grantsLevel: 2 }],
  };
  assert.equal(classify('Find me a coffee shop'), 'navigate');
  assert.equal(classify('Who is hiring nearby?'), 'earn');
  assert.equal(classify('What can I do to earn money?'), 'earn');
  assert.equal(classify('Find a cheap storefront'), 'land');
  assert.equal(classify('Take me to the arcade'), 'go');
  const coffee = route('Find me a coffee shop', ctx);
  assert.equal(coffee.autorun.type, 'navigate');
  assert.match(coffee.reply, /Daily Grind/);
  assert.equal(route('Take me to the arcade', ctx).autorun.label, 'Neon Arcade');
  assert.equal(route('Find a cheap storefront', ctx).results[0].label, 'Lot 2');
  assert.equal(route('Who is hiring nearby?', ctx).results[0].label, 'Shift', 'eligible gigs first');
  assert.match(route('Find a course that qualifies me', ctx).reply, /Video Editing/);
  const order = route('Order this', { ...ctx, places: places.map((p) => ({ ...p, commerce: p.kind === 'cafe' })) });
  assert.equal(order.autorun.type, 'open', 'AI opens checkout UI, never pays');
});
