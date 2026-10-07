// Drivable street graph for city traffic. Nodes are intersections of the
// avenue grid; edges are street segments a car may drive (pedestrian
// promenades inside the ring road and the street under the river are left
// out). Cars keep to the right-hand lane, pick a turn at each junction and
// take it on a smooth curve.

export function buildRoadNet({ lines, limit = 175, core = 75, promenades = [-25, 25], river = { z0: 114, z1: 152 }, lane = 2.5, turnR = 7, edgeOk = null }) {
  const L = lines.filter((c) => Math.abs(c) <= limit);
  const nodes = new Map();
  const key = (x, z) => `${x},${z}`;
  for (const x of L) for (const z of L) nodes.set(key(x, z), { id: key(x, z), x, z, out: [], lock: null });
  const blocked = (a, b) => {
    if (a.x === b.x && promenades.includes(a.x) && Math.max(Math.abs(a.z), Math.abs(b.z)) <= core) return true;
    if (a.z === b.z && promenades.includes(a.z) && Math.max(Math.abs(a.x), Math.abs(b.x)) <= core) return true;
    if (a.z === b.z && a.z > river.z0 - 6 && a.z < river.z1 + 6) return true;
    return edgeOk ? !edgeOk(a, b) : false;
  };
  const link = (a, b) => {
    if (!a || !b || blocked(a, b)) return;
    a.out.push(b);
    b.out.push(a);
  };
  for (let i = 0; i < L.length; i++) {
    for (let j = 0; j + 1 < L.length; j++) {
      link(nodes.get(key(L[i], L[j])), nodes.get(key(L[i], L[j + 1])));
      link(nodes.get(key(L[j], L[i])), nodes.get(key(L[j + 1], L[i])));
    }
  }
  for (const [k, n] of nodes) if (!n.out.length) nodes.delete(k);
  return { nodes: [...nodes.values()], lane, turnR, river, avenues: L };
}

const dirOf = (a, b) => {
  const d = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  return { x: (b.x - a.x) / d, z: (b.z - a.z) / d };
};
// Right-hand side of a heading (cars face +z at rotation 0; right is -x).
const right = (d) => ({ x: -d.z, z: d.x });

// Where a car on edge a→b stops before junction b (its lane, before the turn).
export function entryPoint(net, a, b) {
  const d = dirOf(a, b);
  const r = right(d);
  return { x: b.x - d.x * net.turnR + r.x * net.lane, z: b.z - d.z * net.turnR + r.z * net.lane };
}

// Points from the junction entry (arriving a→b) through the turn onto b→c,
// then along b→c to the entry of junction c. Returns { points, curveEnd }.
export function legPoints(net, a, b, c) {
  const d1 = dirOf(a, b);
  const d2 = dirOf(b, c);
  const r1 = right(d1);
  const r2 = right(d2);
  const E = { x: b.x - d1.x * net.turnR + r1.x * net.lane, z: b.z - d1.z * net.turnR + r1.z * net.lane };
  const X = { x: b.x + d2.x * net.turnR + r2.x * net.lane, z: b.z + d2.z * net.turnR + r2.z * net.lane };
  const straight = Math.abs(d1.x * d2.x + d1.z * d2.z) > 0.9;
  const C = straight ? { x: (E.x + X.x) / 2, z: (E.z + X.z) / 2 } : { x: b.x + r1.x * net.lane + r2.x * net.lane, z: b.z + r1.z * net.lane + r2.z * net.lane };
  const points = [];
  const n = straight ? 2 : 7;
  for (let k = 1; k <= n; k++) {
    const t = k / n;
    points.push({ x: (1 - t) ** 2 * E.x + 2 * (1 - t) * t * C.x + t * t * X.x, z: (1 - t) ** 2 * E.z + 2 * (1 - t) * t * C.z + t * t * X.z });
  }
  const curveEnd = points.length;
  points.push(entryPoint(net, b, c));
  return { points, curveEnd };
}

// Next junction after arriving at b from a: never a U-turn unless it's a
// dead end; straight ahead is a little more likely than turning; far from
// the centre, streets heading back in are favoured (traffic stays where
// people are).
export function chooseNext(a, b, rnd = Math.random, home = 110) {
  const opts = b.out.filter((n) => n !== a);
  if (!opts.length) return a;
  const d1 = dirOf(a, b);
  const w = opts.map((n) => {
    const d2 = dirOf(b, n);
    let k = d1.x * d2.x + d1.z * d2.z > 0.9 ? 1.6 : 1;
    if (Math.max(Math.abs(b.x), Math.abs(b.z)) > home && Math.max(Math.abs(n.x), Math.abs(n.z)) < Math.max(Math.abs(b.x), Math.abs(b.z))) k *= 2.5;
    return k;
  });
  let x = rnd() * w.reduce((s, v) => s + v, 0);
  for (let i = 0; i < opts.length; i++) {
    x -= w[i];
    if (x <= 0) return opts[i];
  }
  return opts[0];
}

// Road surface height: bridge decks over the river ramp up gently.
export function roadY(net, x, z) {
  const { river } = net;
  if (z < river.z0 - 6 || z > river.z1 + 6) return 0.01;
  if (!net.avenues.some((c) => Math.abs(x - c) < 6)) return 0.01;
  const up = Math.min(1, Math.max(0, (z - (river.z0 - 6)) / 5));
  const down = Math.min(1, Math.max(0, (river.z1 + 6 - z) / 5));
  return 0.01 + 0.36 * Math.min(up, down);
}
