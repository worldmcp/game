// Uniform-grid spatial index for proximity queries (players, NPCs, objects).
// O(k) queries instead of scanning every entity each frame.

export class SpatialGrid {
  constructor(cellSize = 16) {
    this.cellSize = cellSize;
    this.cells = new Map();
    this.items = new Map();
  }

  key(cx, cz) {
    return `${cx},${cz}`;
  }

  cellOf(x, z) {
    return [Math.floor(x / this.cellSize), Math.floor(z / this.cellSize)];
  }

  upsert(id, x, z, data) {
    const [cx, cz] = this.cellOf(x, z);
    const k = this.key(cx, cz);
    const prev = this.items.get(id);
    if (prev && prev.k !== k) this.cells.get(prev.k)?.delete(id);
    if (!this.cells.has(k)) this.cells.set(k, new Set());
    this.cells.get(k).add(id);
    this.items.set(id, { id, x, z, data, k });
  }

  remove(id) {
    const prev = this.items.get(id);
    if (!prev) return;
    this.cells.get(prev.k)?.delete(id);
    this.items.delete(id);
  }

  get(id) {
    return this.items.get(id) || null;
  }

  // Items within radius r of (x, z), nearest first.
  query(x, z, r, filter) {
    const out = [];
    const [c0x, c0z] = this.cellOf(x - r, z - r);
    const [c1x, c1z] = this.cellOf(x + r, z + r);
    for (let cx = c0x; cx <= c1x; cx++) {
      for (let cz = c0z; cz <= c1z; cz++) {
        const cell = this.cells.get(this.key(cx, cz));
        if (!cell) continue;
        for (const id of cell) {
          const it = this.items.get(id);
          const dist = Math.hypot(it.x - x, it.z - z);
          if (dist <= r && (!filter || filter(it))) out.push({ ...it, dist });
        }
      }
    }
    return out.sort((a, b) => a.dist - b.dist);
  }
}
