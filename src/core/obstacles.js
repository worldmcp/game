// Round static obstacles (trees, lamp posts, palms, bench ends, café tables,
// billboard poles) in a uniform hash grid, plus the steering helpers people
// use to walk around them and around each other instead of through them.

export class Obstacles {
  constructor(cell = 4) {
    this.cell = cell;
    this.cells = new Map();
    this.list = [];
  }

  _key(i, j) {
    return i * 73856093 ^ j * 19349663;
  }

  add(x, z, r) {
    const o = { x, z, r };
    this.list.push(o);
    const c = this.cell;
    for (let i = Math.floor((x - r) / c); i <= Math.floor((x + r) / c); i++)
      for (let j = Math.floor((z - r) / c); j <= Math.floor((z + r) / c); j++) {
        const k = this._key(i, j);
        if (!this.cells.has(k)) this.cells.set(k, []);
        this.cells.get(k).push(o);
      }
    return o;
  }

  near(x, z, rad, out = []) {
    out.length = 0;
    const c = this.cell;
    const seen = new Set();
    for (let i = Math.floor((x - rad) / c); i <= Math.floor((x + rad) / c); i++)
      for (let j = Math.floor((z - rad) / c); j <= Math.floor((z + rad) / c); j++) {
        for (const o of this.cells.get(this._key(i, j)) || []) {
          if (seen.has(o)) continue;
          seen.add(o);
          if (Math.hypot(o.x - x, o.z - z) < rad + o.r) out.push(o);
        }
      }
    return out;
  }

  // Push a circle of radius r at (x, z) out of every obstacle it overlaps.
  resolve(x, z, r) {
    for (const o of this.near(x, z, r, this._tmp || (this._tmp = []))) {
      const dx = x - o.x;
      const dz = z - o.z;
      const d = Math.hypot(dx, dz);
      const min = o.r + r;
      if (d < min) {
        const k = d > 1e-4 ? min / d : 0;
        x = d > 1e-4 ? o.x + dx * k : o.x + min;
        z = d > 1e-4 ? o.z + dz * k : z;
      }
    }
    return { x, z };
  }
}

// Push (x, z) out of a set of moving people (array of {x, z}); `skip` is self.
export function separate(x, z, r, people, skip = null) {
  for (const p of people) {
    if (p === skip || p.ref === skip) continue;
    const dx = x - p.x;
    const dz = z - p.z;
    const d = Math.hypot(dx, dz);
    const min = r + (p.r ?? 0.32);
    if (d < min && d > 1e-4) {
      x = p.x + (dx / d) * min;
      z = p.z + (dz / d) * min;
    }
  }
  return { x, z };
}

// Lateral steering for someone walking along a fixed route. Looks ahead along
// the walking direction and returns the sideways offset (metres, +left) that
// clears obstacles and people, and a speed factor (0..1) when someone is
// right in front (people yield rather than walk through each other).
export function steer(x, z, dirX, dirZ, obstacles, people, self, look = 1.4) {
  let lateral = 0;
  let slow = 1;
  const ax = x + dirX * look;
  const az = z + dirZ * look;
  const consider = (cx, cz, R, person) => {
    const d = Math.hypot(ax - cx, az - cz);
    if (d >= R) return;
    // Which side is it on? cross(dir, c - pos): >0 means obstacle on the left.
    const cross = dirX * (cz - z) - dirZ * (cx - x);
    const side = Math.abs(cross) < 0.05 ? 1 : Math.sign(cross);
    lateral += -side * (R - d + 0.15);
    if (person) {
      const ahead = (cx - x) * dirX + (cz - z) * dirZ;
      if (ahead > 0 && ahead < 1.1) slow = Math.min(slow, Math.max(0, (ahead - 0.55) / 0.55));
    }
  };
  if (obstacles) for (const o of obstacles.near(ax, az, 1.2, steer._tmp || (steer._tmp = []))) consider(o.x, o.z, o.r + 0.5, false);
  for (const p of people) {
    if (p.ref === self) continue;
    if (Math.abs(p.x - ax) > 2 || Math.abs(p.z - az) > 2) continue;
    consider(p.x, p.z, 0.85, true);
  }
  return { lateral: Math.max(-2.2, Math.min(2.2, lateral)), slow };
}
