// Grid A* used by "take me there" navigation (AI, map waypoints, NPC errands).

export class NavGrid {
  constructor({ half, cell = 2, blockers = [], pad = 1 }) {
    this.half = half;
    this.cell = cell;
    this.n = Math.ceil((half * 2) / cell);
    this.blocked = new Uint8Array(this.n * this.n);
    for (const b of blockers) this.block(b.x0 - pad, b.x1 + pad, b.z0 - pad, b.z1 + pad);
  }

  block(x0, x1, z0, z1) {
    const [i0, j0] = this.toCell(x0, z0);
    const [i1, j1] = this.toCell(x1, z1);
    for (let i = Math.max(0, i0); i <= Math.min(this.n - 1, i1); i++)
      for (let j = Math.max(0, j0); j <= Math.min(this.n - 1, j1); j++) this.blocked[j * this.n + i] = 1;
  }

  toCell(x, z) {
    return [Math.floor((x + this.half) / this.cell), Math.floor((z + this.half) / this.cell)];
  }

  toWorld(i, j) {
    return { x: -this.half + (i + 0.5) * this.cell, z: -this.half + (j + 0.5) * this.cell };
  }

  isFree(i, j) {
    return i >= 0 && j >= 0 && i < this.n && j < this.n && !this.blocked[j * this.n + i];
  }

  nearestFree(i, j) {
    if (this.isFree(i, j)) return [i, j];
    for (let r = 1; r < 12; r++)
      for (let di = -r; di <= r; di++)
        for (let dj = -r; dj <= r; dj++) if (this.isFree(i + di, j + dj)) return [i + di, j + dj];
    return null;
  }

  lineFree(a, b) {
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (this.cell * 0.5));
    for (let s = 0; s <= steps; s++) {
      const t = steps ? s / steps : 0;
      const [i, j] = this.toCell(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t);
      if (!this.isFree(i, j)) return false;
    }
    return true;
  }

  // Returns a smoothed list of world points from start to goal, or null.
  find(start, goal) {
    const s = this.nearestFree(...this.toCell(start.x, start.z));
    const g = this.nearestFree(...this.toCell(goal.x, goal.z));
    if (!s || !g) return null;
    const n = this.n;
    const idx = (i, j) => j * n + i;
    const gScore = new Float32Array(n * n).fill(Infinity);
    const came = new Int32Array(n * n).fill(-1);
    const closed = new Uint8Array(n * n);
    const heap = new MinHeap();
    const h = (i, j) => Math.hypot(i - g[0], j - g[1]);
    gScore[idx(...s)] = 0;
    heap.push(idx(...s), h(...s));
    const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
    const goalIdx = idx(...g);
    while (heap.size) {
      const cur = heap.pop();
      if (cur === goalIdx) break;
      if (closed[cur]) continue;
      closed[cur] = 1;
      const ci = cur % n;
      const cj = (cur - ci) / n;
      for (const [di, dj, cost] of dirs) {
        const ni = ci + di;
        const nj = cj + dj;
        if (!this.isFree(ni, nj)) continue;
        if (di && dj && (!this.isFree(ci + di, cj) || !this.isFree(ci, cj + dj))) continue;
        const ni2 = idx(ni, nj);
        const t = gScore[cur] + cost;
        if (t < gScore[ni2]) {
          gScore[ni2] = t;
          came[ni2] = cur;
          heap.push(ni2, t + h(ni, nj));
        }
      }
    }
    if (came[goalIdx] === -1 && goalIdx !== idx(...s)) return null;
    const cells = [];
    for (let c = goalIdx; c !== -1; c = came[c]) cells.push(c);
    cells.reverse();
    const pts = cells.map((c) => this.toWorld(c % n, Math.floor(c / n)));
    pts[pts.length - 1] = { x: goal.x, z: goal.z };
    return this.smooth([{ x: start.x, z: start.z }, ...pts.slice(1)]);
  }

  smooth(pts) {
    if (pts.length < 3) return pts;
    const out = [pts[0]];
    let anchor = 0;
    for (let i = 2; i < pts.length; i++) {
      if (!this.lineFree(pts[anchor], pts[i])) {
        out.push(pts[i - 1]);
        anchor = i - 1;
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }
}

class MinHeap {
  constructor() {
    this.items = [];
    this.prios = [];
  }

  get size() {
    return this.items.length;
  }

  push(item, prio) {
    this.items.push(item);
    this.prios.push(prio);
    let i = this.items.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.prios[p] <= this.prios[i]) break;
      this.swap(i, p);
      i = p;
    }
  }

  pop() {
    const top = this.items[0];
    const lastItem = this.items.pop();
    const lastPrio = this.prios.pop();
    if (this.items.length) {
      this.items[0] = lastItem;
      this.prios[0] = lastPrio;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.items.length && this.prios[l] < this.prios[m]) m = l;
        if (r < this.items.length && this.prios[r] < this.prios[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }

  swap(a, b) {
    [this.items[a], this.items[b]] = [this.items[b], this.items[a]];
    [this.prios[a], this.prios[b]] = [this.prios[b], this.prios[a]];
  }
}
