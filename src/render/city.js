// Builds Nova City · Central from config using reusable building templates.
// Nothing is hand-modelled per building: a place's template + size + colours
// produce its geometry, so new districts are data, not code.

import * as THREE from 'three';
import { DISTRICT, cellBounds, footprint, facingVector } from '../config/nova-city.js';
import { brandSignTexture, facadeTextures, facadePBR, asphaltPBR, paversPBR, grassPBR, leafCardTexture, signTexture, tileTexture, screenTexture, drawCinemaFrame, adTexture, shade } from './textures.js';
import { productInstance } from './assets.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addPalms, addTerrace, FountainSpray, createAirship, createLandmarkTower, createSkyline, LedScreen } from './props.js';
import { createOuterCity } from './outer-city.js';

// Inner roads are pedestrianised inside this half-size around the plaza.
const PROMENADE = 30;

const FACING_ROT = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 };
const box = new THREE.BoxGeometry(1, 1, 1);
const plane = new THREE.PlaneGeometry(1, 1);

function rand(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// Merge a group's static meshes that share a material into one mesh each.
// Cuts draw calls by an order of magnitude; picking still works because the
// merged meshes stay under the group that carries userData.ref.
export function batchStatic(group, { shallow = false } = {}) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map();
  const visit = (o, depth) => {
    for (const ch of [...o.children]) {
      if (ch.userData.dynamic || ch.userData.ref || ch.userData.product) {
        if (ch !== group && (ch.userData.ref || ch.userData.product || ch.userData.dynamic)) continue;
      }
      if (ch.isMesh && !ch.isInstancedMesh && !ch.isSkinnedMesh && !Array.isArray(ch.material) && ch.geometry.index && !ch.material.transparent) {
        const key = ch.material.uuid + (ch.castShadow ? 's' : '');
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(ch);
      } else if (!shallow && ch.isGroup && depth < 6) visit(ch, depth + 1);
    }
  };
  visit(group, 0);
  for (const meshes of buckets.values()) {
    if (meshes.length < 2) continue;
    const geos = [];
    for (const m of meshes) {
      const g = m.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      if (!g.attributes.uv || !g.attributes.normal) {
        geos.length = 0;
        break;
      }
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
      geos.push(g);
    }
    if (!geos.length) continue;
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, meshes[0].material);
    mesh.castShadow = meshes[0].castShadow;
    mesh.receiveShadow = true;
    for (const m of meshes) m.parent.remove(m);
    group.add(mesh);
  }
}

export class City {
  constructor(scene, cfg) {
    this.scene = scene;
    this.cfg = cfg;
    this.quality = cfg.quality || 'high';
    this.pbr = this.quality !== 'low';
    this.root = new THREE.Group();
    this.root.name = 'city';
    scene.add(this.root);
    this.colliders = [];
    this.obstacles = []; // [x, z, r] round props people must walk around
    this._localObs = [];
    this.pickables = [];
    this.windowMats = [];
    this.nightMats = [];
    this.billboards = new Map();
    this.parcelGroups = new Map();
    this.placeGroups = new Map();
    this.screens = [];
    this.leds = [];
    this.animated = [];
    const pav = paversPBR('#b4ada2');
    this.mats = {
      sidewalk: this.pbr ? new THREE.MeshStandardMaterial({ map: pav.map, normalMap: pav.normalMap, roughness: 0.9 }) : new THREE.MeshStandardMaterial({ map: tileTexture('#c9cfd4', '#bfc6cc', 4), roughness: 0.95 }),
      curb: new THREE.MeshStandardMaterial({ color: '#9aa3ab', roughness: 0.9 }),
      dark: new THREE.MeshStandardMaterial({ color: '#232a33', roughness: 0.7 }),
      metal: new THREE.MeshStandardMaterial({ color: '#5b6672', roughness: 0.4, metalness: 0.6 }),
      glass: new THREE.MeshStandardMaterial({ color: '#5d7a8f', roughness: 0.04, metalness: 0.75, emissive: '#ffcf8a', emissiveIntensity: 0.15 }),
      white: new THREE.MeshStandardMaterial({ color: '#f1f3f5', roughness: 0.8 }),
    };
    this.nightMats.push({ mat: this.mats.glass, day: 0.15, night: 0.55 });
    this._ground();
    this._roads();
    this._blocks();
    this._plaza();
    for (const p of cfg.places) this._place(p);
    for (const p of cfg.parcels) this._parcel(p);
    if (this.pbr) this._dressing();
    this.adSlots = [];
    for (const b of cfg.billboards) this._billboard(b);
    for (const c of cfg.filler) this._filler(c);
    if (cfg.billboards.length) this._placeBanners();
    this._streetFurniture();
    for (const g of this.placeGroups.values()) batchStatic(g);
    batchStatic(this.root);
    if (this.pbr) {
      this.tower = createLandmarkTower();
      this.tower.position.set(0, 0, -430);
      this.tower.scale.setScalar(1.35);
      this.root.add(this.tower);
      this.skyline = createSkyline(5, { inner: 345, outer: 560, avoid: [[0, -430, 70]] });
      this.root.add(this.skyline);
      this.airship = createAirship();
      this.airship.userData.dynamic = true;
      this.airship.position.set(0, 80, -60);
      this.root.add(this.airship);
    } else this._skyline();
    this._river();
    // The city keeps going past the playable district.
    const exits = [];
    for (const c of DISTRICT.roads) exits.push({ x: c, z: -DISTRICT.half - 3, ry: 0 }, { x: -DISTRICT.half - 3, z: c, ry: Math.PI / 2 }, { x: DISTRICT.half + 3, z: c, ry: Math.PI / 2 });
    const outer = createOuterCity({ half: DISTRICT.half, quality: this.quality, exits });
    this.root.add(outer.group);
    this.windowMats.push(...outer.windowMats);
    this.nightMats.push(...outer.nightMats);
  }

  // ───────── ground, roads, blocks ─────────
  _ground() {
    const g = grassPBR();
    g.map.repeat.set(160, 160);
    g.normalMap.repeat.set(160, 160);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshStandardMaterial({ map: g.map, normalMap: g.normalMap, roughness: 0.95 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    this.root.add(ground);
  }

  _roads() {
    const { roads, roadWidth, half } = DISTRICT;
    const len = half * 2 + 30;
    const a = asphaltPBR();
    const mk = (rx, ry) => {
      const map = a.map.clone();
      const nrm = a.normalMap.clone();
      const rgh = a.roughnessMap.clone();
      for (const t of [map, nrm, rgh]) {
        t.needsUpdate = true;
        t.repeat.set(rx, ry);
      }
      return new THREE.MeshStandardMaterial({ map, normalMap: nrm, roughnessMap: rgh, roughness: 1, metalness: 0 });
    };
    const mz = mk(roadWidth / 6, len / 6);
    const mx = mk(len / 6, roadWidth / 6);
    const plain = mk(roadWidth / 6, roadWidth / 6);
    // Segments along a road; inner roads stop at the pedestrian promenade.
    const segs = (r) => (Math.abs(r) < PROMENADE ? [[-(len / 2 + PROMENADE) / 2, len / 2 - PROMENADE], [(len / 2 + PROMENADE) / 2, len / 2 - PROMENADE]] : [[0, len]]);
    for (const r of roads) {
      for (const [c, l] of segs(r)) {
        const za = new THREE.Mesh(plane, mz);
        za.scale.set(roadWidth, l, 1);
        za.rotation.x = -Math.PI / 2;
        za.position.set(r, 0.01, c);
        za.receiveShadow = true;
        const xb = new THREE.Mesh(plane, mx);
        xb.scale.set(l, roadWidth, 1);
        xb.rotation.x = -Math.PI / 2;
        xb.position.set(c, 0.012, r);
        xb.receiveShadow = true;
        this.root.add(za, xb);
      }
    }
    // Lane markings: dashed centre line + solid edge lines, instanced.
    const dashes = [];
    const edges = [];
    for (const r of roads) {
      for (let t = -half - 10; t < half + 10; t += 6) {
        if (roads.some((q) => Math.abs(t + 1.5 - q) < roadWidth / 2 + 1.5)) continue;
        if (Math.abs(r) < PROMENADE && Math.abs(t + 1.5) < PROMENADE + 2) continue;
        dashes.push([r, t + 1.5, 0], [t + 1.5, r, 1]);
      }
      for (const off of [-roadWidth / 2 + 0.35, roadWidth / 2 - 0.35])
        for (const [c, l] of segs(r)) edges.push([r + off, c, 0, l], [c, r + off, 1, l]);
    }
    const yellow = new THREE.MeshStandardMaterial({ color: '#e8c547', roughness: 0.6 });
    const white = new THREE.MeshStandardMaterial({ color: '#e9edf0', roughness: 0.6 });
    const dm = new THREE.InstancedMesh(plane, yellow, dashes.length);
    const em = new THREE.InstancedMesh(plane, white, edges.length);
    const m4 = new THREE.Matrix4();
    const qx = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    const qz = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, Math.PI / 2));
    dashes.forEach(([x, z, rot], i) => dm.setMatrixAt(i, m4.compose(new THREE.Vector3(x, 0.022, z), rot ? qz : qx, new THREE.Vector3(0.22, 3, 1))));
    edges.forEach(([x, z, rot, l], i) => em.setMatrixAt(i, m4.compose(new THREE.Vector3(x, 0.021, z), rot ? qz : qx, new THREE.Vector3(0.15, l, 1))));
    dm.receiveShadow = em.receiveShadow = true;
    this.root.add(dm, em);
    // Intersections + crosswalks (instanced stripes).
    const stripes = [];
    for (const x of roads)
      for (const z of roads) {
        if (Math.abs(x) < PROMENADE && Math.abs(z) < PROMENADE) continue;
        const s = new THREE.Mesh(plane, plain);
        s.scale.set(roadWidth, roadWidth, 1);
        s.rotation.x = -Math.PI / 2;
        s.position.set(x, 0.016, z);
        s.receiveShadow = true;
        this.root.add(s);
        for (let k = -3; k <= 3; k++) {
          const o = k * 1.25;
          const e = roadWidth / 2 + 1.1;
          stripes.push([x + o, z - e, 0], [x + o, z + e, 0], [x - e, z + o, 1], [x + e, z + o, 1]);
        }
      }
    const sm = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ color: '#e9edf0', roughness: 0.8 }), stripes.length);
    const m = new THREE.Matrix4();
    stripes.forEach(([x, z, rot], i) => {
      m.compose(new THREE.Vector3(x, 0.03, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rot ? Math.PI / 2 : 0, 0)), new THREE.Vector3(0.6, 0.02, 2));
      sm.setMatrixAt(i, m);
    });
    sm.receiveShadow = true;
    this.root.add(sm);
  }

  _blocks() {
    for (let i = -2; i <= 2; i++)
      for (let j = -2; j <= 2; j++) {
        if (i === 0 && j === 0) continue;
        const b = cellBounds(i, j);
        const w = b.x1 - b.x0;
        const d = b.z1 - b.z0;
        const slab = new THREE.Mesh(box, this.mats.sidewalk.clone());
        for (const k of ['map', 'normalMap']) {
          if (!this.mats.sidewalk[k]) continue;
          slab.material[k] = this.mats.sidewalk[k].clone();
          slab.material[k].needsUpdate = true;
          slab.material[k].repeat.set(w / 3, d / 3);
        }
        slab.scale.set(w, 0.2, d);
        slab.position.set((b.x0 + b.x1) / 2, 0.1, (b.z0 + b.z1) / 2);
        slab.receiveShadow = true;
        this.root.add(slab);
      }
  }

  _plaza() {
    const p = this.cfg.plaza;
    const s = p.size;
    const pz = paversPBR('#c2b49d', 8);
    const t = pz.map.clone();
    const tn = pz.normalMap.clone();
    t.needsUpdate = tn.needsUpdate = true;
    t.repeat.set(s / 3.5, s / 3.5);
    tn.repeat.set(s / 3.5, s / 3.5);
    const base = new THREE.Mesh(box, new THREE.MeshStandardMaterial({ map: t, normalMap: tn, roughness: 0.85 }));
    base.scale.set(s, 0.2, s);
    base.position.y = 0.1;
    base.receiveShadow = true;
    this.root.add(base);
    // Fountain
    const f = new THREE.Group();
    const stone = new THREE.MeshStandardMaterial({ color: '#d9d4cc', roughness: 0.7 });
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(p.fountain.r, p.fountain.r + 0.3, 0.8, 40, 1, true), stone);
    rim.position.y = 0.6;
    const rimTop = new THREE.Mesh(new THREE.TorusGeometry(p.fountain.r, 0.25, 8, 48), stone);
    rimTop.rotation.x = Math.PI / 2;
    rimTop.position.y = 1;
    const water = new THREE.Mesh(new THREE.CircleGeometry(p.fountain.r - 0.1, 40), new THREE.MeshPhysicalMaterial({ color: '#1f6f8f', roughness: 0.04, metalness: 0.1, clearcoat: 1, emissive: '#0b3a4f', emissiveIntensity: 0.25, transparent: true, opacity: 0.92 }));
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.85;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 2.2, 16), stone);
    col.position.y = 1.6;
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 0.6, 0.5, 24), stone);
    bowl.position.y = 2.8;
    // Holographic Pludor ring — the plaza landmark.
    const ringMat = new THREE.MeshStandardMaterial({ color: '#8b7dff', emissive: '#7c5cff', emissiveIntensity: 1.2, roughness: 0.3, metalness: 0.4 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.22, 16, 64), ringMat);
    ring.position.y = 6.2;
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.12, 12, 48), new THREE.MeshStandardMaterial({ color: '#5ce1e6', emissive: '#22d3ee', emissiveIntensity: 1.2 }));
    ring2.position.y = 6.2;
    f.add(rim, rimTop, water, col, bowl, ring, ring2);
    if (this.pbr) this.spray = new FountainSpray(this.root, { x: p.fountain.x, z: p.fountain.z, y: 0.95, radius: p.fountain.r - 0.6 });
    f.children.forEach((c) => (c.castShadow = true));
    f.userData.ref = { type: 'plaza', id: p.id };
    this.pickables.push(f);
    this.root.add(f);
    this.animated.push((time) => {
      ring.rotation.y = time * 0.6;
      ring.rotation.x = Math.sin(time * 0.5) * 0.3;
      ring2.rotation.y = -time * 0.9;
      ring2.rotation.z = Math.cos(time * 0.4) * 0.4;
      water.material.emissiveIntensity = 0.35 + Math.sin(time * 2) * 0.08;
    });
    this.colliders.push({ x0: -p.fountain.r - 0.3, x1: p.fountain.r + 0.3, z0: -p.fountain.r - 0.3, z1: p.fountain.r + 0.3, round: p.fountain.r + 0.4 });
    if (this.pbr) for (const [px, pz] of [[-13, -13], [13, 13], [-13, 13], [13, -13]]) {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.9, 0.9, 24), new THREE.MeshStandardMaterial({ color: '#8f8a80', roughness: 0.8 }));
      pot.position.set(px, 0.65, pz);
      this.obstacles.push([px, pz, 1.15]);
      pot.castShadow = true;
      this.root.add(pot);
      this._placeModel(this.root, 'plant', 2.2, px, 1.1, pz);
    }
    // Benches and planters on a ring.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const bench = this._bench();
      bench.position.set(Math.cos(a) * 10.5, 0.2, Math.sin(a) * 10.5);
      bench.rotation.y = -a + Math.PI / 2;
      this.root.add(bench);
      const th = bench.rotation.y;
      for (const o of [-0.75, 0, 0.75]) this.obstacles.push([bench.position.x + Math.cos(th) * o, bench.position.z - Math.sin(th) * o, 0.42]);
    }
  }

  // Palms, café terraces and planters that make the promenade feel lived-in.
  _dressing() {
    const palms = [];
    for (const v of [-24, -16, -8, 8, 16, 24]) {
      palms.push([21.5, v], [-21.5, v], [v, 21.5], [v, -21.5]);
    }
    for (const v of [-60, -48, -36, 36, 48, 60]) palms.push([v, -31.2], [v, 31.2]);
    const ok = palms.filter(([x, z]) => !this.cfg.billboards.some((b) => Math.hypot(b.x - x, b.z - z) < 4.5) && !(this.cfg.agents || []).some((a) => Math.hypot(a.x - x, a.z - z) < 3) && !this.cfg.places.some((p) => {
      const f = footprint(p);
      return x > f.x0 - 1 && x < f.x1 + 1 && z > f.z0 - 1 && z < f.z1 + 1;
    }));
    addPalms(this.root, ok, 3);
    for (const [x, z] of ok) this.obstacles.push([x, z, 0.45]);
    this.terraceSeats = [
      ...addTerrace(this.root, { x: -25.5, z: -10.5, w: 6, d: 13, cols: 2, rows: 3, colors: ['#f4efe6', '#2f6e5a'] }),
      ...addTerrace(this.root, { x: -25.5, z: 10.5, w: 6, d: 13, cols: 2, rows: 3, colors: ['#b5422c', '#f4efe6'] }),
    ];
    for (let k = 0; k + 1 < this.terraceSeats.length; k += 2) {
      const [a, b] = [this.terraceSeats[k], this.terraceSeats[k + 1]];
      this.obstacles.push([(a.x + b.x) / 2, (a.z + b.z) / 2, 0.55], [a.x, a.z, 0.3], [b.x, b.z, 0.3]);
    }
    // Long planters with plants along the promenade edges.
    const shrubs = [];
    const planter = new THREE.MeshStandardMaterial({ color: '#d9d2c5', roughness: 0.85 });
    const soil = new THREE.MeshStandardMaterial({ color: '#3b2e22', roughness: 1 });
    for (const [x, z, rot] of [[25.5, -12, 0], [25.5, 12, 0], [-12, -25.5, 1], [12, -25.5, 1], [-12, 25.5, 1], [12, 25.5, 1]]) {
      const pl = new THREE.Mesh(box, planter);
      pl.scale.set(rot ? 8 : 1.4, 0.7, rot ? 1.4 : 8);
      pl.position.set(x, 0.55, z);
      const [hx, hz] = rot ? [4, 0.7] : [0.7, 4];
      this.colliders.push({ x0: x - hx, x1: x + hx, z0: z - hz, z1: z + hz, low: true });
      pl.castShadow = pl.receiveShadow = true;
      const so = new THREE.Mesh(box, soil);
      so.scale.set(rot ? 7.6 : 1.1, 0.05, rot ? 1.1 : 7.6);
      so.position.set(x, 0.92, z);
      this.root.add(pl, so);
      for (let k = -3; k <= 3; k++) shrubs.push([x + (rot ? k * 1.05 : 0), z + (rot ? 0 : k * 1.05)]);
    }
    // Instanced leafy shrubs: one draw call for every planter.
    const shrubMat = new THREE.MeshStandardMaterial({ map: leafCardTexture(9), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85 });
    const cards = new THREE.InstancedMesh(plane, shrubMat, shrubs.length * 4);
    const m4 = new THREE.Matrix4();
    let n = 0;
    const R = rand(17);
    for (const [x, z] of shrubs)
      for (let c = 0; c < 4; c++) {
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((R() - 0.5) * 0.4, R() * Math.PI, 0));
        const s = 1 + R() * 0.5;
        m4.compose(new THREE.Vector3(x + (R() - 0.5) * 0.4, 1.45 + R() * 0.2, z + (R() - 0.5) * 0.4), q, new THREE.Vector3(s, s, s));
        cards.setMatrixAt(n++, m4);
      }
    cards.castShadow = true;
    this.root.add(cards);
  }

  _bench() {
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: '#a46b3c', roughness: 0.8 });
    const seat = new THREE.Mesh(box, wood);
    seat.scale.set(2.2, 0.12, 0.6);
    seat.position.y = 0.5;
    const back = new THREE.Mesh(box, wood);
    back.scale.set(2.2, 0.5, 0.1);
    back.position.set(0, 0.85, -0.28);
    const l1 = new THREE.Mesh(box, this.mats.metal);
    l1.scale.set(0.1, 0.5, 0.5);
    l1.position.set(-0.95, 0.25, 0);
    const l2 = l1.clone();
    l2.position.x = 0.95;
    g.add(seat, back, l1, l2);
    g.children.forEach((c) => (c.castShadow = true));
    return g;
  }

  // ───────── building templates ─────────
  _facadeMat(color, seed, w, h, style) {
    if (!this.pbr) {
      const ft = facadeTextures(seed, color, style);
      const map = ft.map.clone();
      const em = ft.emissive.clone();
      map.needsUpdate = em.needsUpdate = true;
      const rx = Math.max(1, Math.round(w / 7));
      const ry = Math.max(1, Math.round(h / 4.2));
      map.repeat.set(rx, ry);
      em.repeat.set(rx, ry);
      const m = new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: '#ffe2b0', emissiveIntensity: 0, roughness: 0.75 });
      this.windowMats.push(m);
      return m;
    }
    // style: glass | brick | concrete (legacy 'tall'/'grid' map onto these)
    const kind = style === 'tall' ? 'glass' : style === 'grid' ? (seed % 2 ? 'brick' : 'concrete') : style;
    const base = kind === 'brick' ? ['#9c4f3c', '#8a5a44', '#a86a4c', '#7a4636'][seed % 4] : kind === 'glass' ? color : ['#c9c3b8', '#b8bcc0', '#d6cfc2', '#a9a49c'][seed % 4];
    const t = facadePBR(kind, seed, base);
    const rx = Math.max(1, Math.round(w / 8));
    const ry = Math.max(1, Math.round(h / 7));
    const maps = {};
    for (const k of ['map', 'roughnessMap', 'normalMap', 'emissiveMap']) {
      maps[k] = t[k].clone();
      maps[k].needsUpdate = true;
      maps[k].repeat.set(rx, ry);
    }
    const m = new THREE.MeshStandardMaterial({ ...maps, metalnessMap: maps.roughnessMap, roughness: 1, metalness: 1, emissive: '#ffe2b0', emissiveIntensity: 0, envMapIntensity: kind === 'glass' ? 1.4 : 1 });
    this.windowMats.push(m);
    return m;
  }

  _roofCap(w, d, h, color) {
    const g = new THREE.Group();
    const parapet = new THREE.Mesh(box, new THREE.MeshStandardMaterial({ color: shade(color, -12), roughness: 0.8 }));
    parapet.scale.set(w + 0.4, 0.6, d + 0.4);
    parapet.position.y = h + 0.3;
    const roof = new THREE.Mesh(box, this.mats.dark);
    roof.scale.set(w - 0.6, 0.2, d - 0.6);
    roof.position.y = h + 0.5;
    const unit = new THREE.Mesh(box, this.mats.metal);
    unit.scale.set(Math.min(4, w * 0.2), 1.2, Math.min(3, d * 0.2));
    unit.position.set(w * 0.2, h + 1.1, -d * 0.15);
    g.add(parapet, roof, unit);
    g.children.forEach((c) => {
      c.castShadow = true;
      c.receiveShadow = true;
    });
    return g;
  }

  _sign(text, sub, accent, width, height = 1.6) {
    const m = new THREE.MeshBasicMaterial({ map: signTexture(text, { sub, accent, bg: '#0f1722' }), transparent: true });
    const s = new THREE.Mesh(plane, m);
    s.scale.set(width, height, 1);
    return s;
  }

  _storefront(p, seed) {
    const g = new THREE.Group();
    const { w, d, h, color, accent } = p;
    const gf = Math.min(4.4, h * 0.6); // ground-floor height
    const inset = 1.8; // depth of the display window
    const upper = new THREE.Mesh(box, this._facadeMat(color, seed, w, h - gf, 'grid'));
    upper.scale.set(w, h - gf, d);
    upper.position.y = gf + (h - gf) / 2;
    upper.castShadow = upper.receiveShadow = true;
    const coreMat = new THREE.MeshStandardMaterial({ color: shade(color, -18), roughness: 0.8 });
    const core = new THREE.Mesh(box, coreMat);
    core.scale.set(w, gf, d - inset);
    core.position.set(0, gf / 2, -inset / 2);
    core.castShadow = core.receiveShadow = true;
    // Lit interior seen through the window.
    const interiorMat = new THREE.MeshStandardMaterial({ color: '#2a2622', roughness: 0.9, emissive: shade(accent, -10), emissiveIntensity: 0.35 });
    this.nightMats.push({ mat: interiorMat, day: 0.35, night: 0.9 });
    const back = new THREE.Mesh(plane, interiorMat);
    back.scale.set(w - 1, gf - 0.3, 1);
    back.position.set(0, gf / 2, d / 2 - inset + 0.01);
    const floor = new THREE.Mesh(box, new THREE.MeshStandardMaterial({ color: '#b8a58c', roughness: 0.35, metalness: 0.05 }));
    floor.scale.set(w - 1, 0.12, inset);
    floor.position.set(0, 0.06, d / 2 - inset / 2);
    floor.receiveShadow = true;
    const ceil = new THREE.Mesh(box, new THREE.MeshStandardMaterial({ color: '#f4efe6', emissive: '#fff1d6', emissiveIntensity: 0.6 }));
    ceil.scale.set(w - 1, 0.1, inset);
    ceil.position.set(0, gf - 0.25, d / 2 - inset / 2);
    const pierMat = new THREE.MeshStandardMaterial({ color: shade(color, -25), roughness: 0.7 });
    for (const sx of [-1, 1]) {
      const pier = new THREE.Mesh(box, pierMat);
      pier.scale.set(0.5, gf, inset);
      pier.position.set(sx * (w / 2 - 0.25), gf / 2, d / 2 - inset / 2);
      pier.castShadow = true;
      g.add(pier);
    }
    const fascia = new THREE.Mesh(box, new THREE.MeshStandardMaterial({ color: '#141a22', roughness: 0.5, metalness: 0.3 }));
    fascia.scale.set(w, 0.6, 0.4);
    fascia.position.set(0, gf - 0.1, d / 2 - 0.2);
    const glass = new THREE.Mesh(plane, new THREE.MeshPhysicalMaterial({ color: '#a9c4d4', roughness: 0.02, metalness: 0, transparent: true, opacity: 0.18, envMapIntensity: 2, side: THREE.DoubleSide, depthWrite: false }));
    glass.scale.set(w - 1, gf - 0.4, 1);
    glass.position.set(0, (gf - 0.4) / 2, d / 2 - 0.05);
    const doorFrame = new THREE.Mesh(box, new THREE.MeshStandardMaterial({ color: '#1b1f24', metalness: 0.6, roughness: 0.35 }));
    doorFrame.scale.set(1.9, 2.7, 0.08);
    doorFrame.position.set(0, 1.35, d / 2 - 0.04);
    const doorGlass = new THREE.Mesh(plane, new THREE.MeshPhysicalMaterial({ color: '#8fb0c0', transparent: true, opacity: 0.35, roughness: 0.02, envMapIntensity: 2 }));
    doorGlass.scale.set(1.6, 2.45, 1);
    doorGlass.position.set(0, 1.3, d / 2 + 0.01);
    const awning = new THREE.Mesh(box, new THREE.MeshStandardMaterial({ color: accent, roughness: 0.75 }));
    awning.scale.set(w * 0.92, 0.12, 2);
    awning.position.set(0, gf + 0.15, d / 2 + 0.95);
    awning.rotation.x = 0.2;
    awning.castShadow = true;
    const sw = Math.min(w * 0.7, 12);
    const sign = p.brand ? new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: brandSignTexture(p.name, p.brand, { sub: p.subtitle }), transparent: true })) : this._sign(p.name, p.subtitle || '', accent, sw, 1.5);
    if (p.brand) sign.scale.set(sw, sw * 0.215, 1);
    sign.position.set(0, gf + 1.35, d / 2 + 0.06);
    g.add(upper, core, back, floor, ceil, fascia, glass, doorFrame, doorGlass, awning, sign, this._roofCap(w, d, h, color));
    // Planters either side of the door.
    for (const sx of [-1, 1]) {
      const pl = new THREE.Mesh(box, this.mats.curb);
      pl.scale.set(0.9, 0.55, 0.9);
      pl.position.set(sx * (w * 0.43 - 0.6), 0.28, d / 2 + 0.9);
      g.add(pl);
      this._localObs.push([pl.position.x, pl.position.z, 0.62]);
      if (this.pbr) {
        const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 1), new THREE.MeshStandardMaterial({ color: '#3f7a3a', roughness: 0.9, flatShading: true }));
        bush.position.set(pl.position.x, 0.95, pl.position.z);
        bush.castShadow = true;
        g.add(bush);
      }
    }
    if (p.display) this._displayProducts(g, p.display, w, d - inset / 2);
    if (p.rooftop && this.pbr) this._rooftopModel(g, p.rooftop, h);
    return g;
  }

  // Real product models on pedestals inside the display window.
  _displayProducts(g, items, w, zc) {
    if (!this.pbr) return;
    const n = items.length;
    const span = w - 3;
    items.forEach((it, i) => {
      const x = -span / 2 + (n === 1 ? span / 2 : (span * i) / (n - 1));
      const xr = x + (Math.abs(x) < 1.4 ? (x < 0 ? -1.4 : 1.4) : 0); // keep the door clear
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 0.8, 24), new THREE.MeshStandardMaterial({ color: '#f2efe9', roughness: 0.3 }));
      ped.position.set(xr, 0.4, zc);
      ped.castShadow = true;
      g.add(ped);
      this._placeModel(g, it.model, it.size, xr, 0.8, zc, it.spin !== false);
    });
  }

  _placeModel(parent, name, size, x, y, z, spin = false) {
    productInstance(name, size).then((obj) => {
      obj.position.set(x, y, z);
      parent.add(obj);
      if (spin) this.animated.push((t) => void (obj.rotation.y = t * 0.6));
    }).catch(() => {});
  }

  _rooftopModel(g, { model, size }, h) {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.35, size * 0.4, 0.6, 32), new THREE.MeshStandardMaterial({ color: '#20242b', metalness: 0.6, roughness: 0.3 }));
    base.position.y = h + 0.9;
    g.add(base);
    productInstance(model, size).then((obj) => {
      obj.position.y = h + 1.2;
      g.add(obj);
      this.animated.push((t) => void (obj.rotation.y = t * 0.4));
    }).catch(() => {});
  }

  _tower(p, seed) {
    const g = new THREE.Group();
    const { w, d, h, color, accent } = p;
    const body = new THREE.Mesh(box, this._facadeMat(color, seed, w, h, 'tall'));
    body.scale.set(w, h, d);
    body.position.y = h / 2;
    body.castShadow = body.receiveShadow = true;
    const lobbyMat = this.mats.glass;
    const lobby = new THREE.Mesh(box, lobbyMat);
    lobby.scale.set(w * 0.7, 4.5, 0.4);
    lobby.position.set(0, 2.4, d / 2 + 0.1);
    const canopy = new THREE.Mesh(box, new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.25 }));
    canopy.scale.set(w * 0.5, 0.3, 3);
    canopy.position.set(0, 4.9, d / 2 + 1.4);
    canopy.castShadow = true;
    const stripMat = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.6 });
    this.nightMats.push({ mat: stripMat, day: 0.5, night: 1.0 });
    const crown = new THREE.Mesh(box, stripMat);
    crown.scale.set(w + 0.3, 0.6, d + 0.3);
    crown.position.y = h - 1.2;
    const sign = this._sign(p.name, p.subtitle || '', accent, Math.min(w * 0.85, 14), 2);
    sign.position.set(0, 6.6, d / 2 + 0.06);
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 5, 6), this.mats.metal);
    antenna.position.set(-w * 0.25, h + 3, 0);
    g.add(body, lobby, canopy, crown, sign, antenna, this._roofCap(w, d, h, color));
    return g;
  }

  _hall(p, seed) {
    const g = new THREE.Group();
    const { w, d, h, color, accent } = p;
    const body = new THREE.Mesh(box, this._facadeMat(color, seed, w, h, 'grid'));
    body.scale.set(w, h, d);
    body.position.y = h / 2;
    body.castShadow = body.receiveShadow = true;
    const curtainMat = new THREE.MeshStandardMaterial({ color: '#2a4152', roughness: 0.05, metalness: 0.85, envMapIntensity: 1.5, emissive: accent, emissiveIntensity: 0.2 });
    this.nightMats.push({ mat: curtainMat, day: 0.2, night: 0.85 });
    const curtain = new THREE.Mesh(box, curtainMat);
    curtain.scale.set(w * 0.8, h * 0.62, 0.3);
    curtain.position.set(0, h * 0.36, d / 2 + 0.05);
    // mullions
    for (let i = -3; i <= 3; i++) {
      const mu = new THREE.Mesh(box, this.mats.metal);
      mu.scale.set(0.15, h * 0.62, 0.35);
      mu.position.set((i / 3.5) * w * 0.4, h * 0.36, d / 2 + 0.1);
      g.add(mu);
    }
    const bandMat = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.5 });
    this.nightMats.push({ mat: bandMat, day: 0.4, night: 0.9 });
    const band = new THREE.Mesh(box, bandMat);
    band.scale.set(w + 0.2, 0.5, d + 0.2);
    band.position.y = h * 0.72;
    const sign = this._sign(p.name, p.subtitle || '', accent, Math.min(w * 0.6, 14), 2);
    sign.position.set(0, h * 0.86, d / 2 + 0.08);
    const canopy = new THREE.Mesh(box, this.mats.white);
    canopy.scale.set(w * 0.45, 0.3, 3.4);
    canopy.position.set(0, 3.6, d / 2 + 1.6);
    canopy.castShadow = true;
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.5, 8), this.mats.metal);
      post.position.set(sx * w * 0.2, 1.8, d / 2 + 3.1);
      g.add(post);
      this._localObs.push([sx * w * 0.2, d / 2 + 3.1, 0.2]);
    }
    g.add(body, curtain, band, sign, canopy, this._roofCap(w, d, h, color));
    if (this.pbr && p.led) {
      const led = new LedScreen(w * 0.24, h * 0.55, p.led);
      led.mesh.position.set(-w * 0.37, h * 0.42, d / 2 + 0.35);
      g.add(led.mesh);
      this.leds.push(led);
      const frame = new THREE.Mesh(box, this.mats.dark);
      frame.scale.set(w * 0.24 + 0.4, h * 0.55 + 0.4, 0.3);
      frame.position.set(-w * 0.37, h * 0.42, d / 2 + 0.18);
      g.add(frame);
    }
    return g;
  }

  _cinema(p, seed) {
    const g = this._hall({ ...p, h: p.h }, seed);
    const screen = screenTexture();
    const m = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: screen }));
    m.scale.set(p.w * 0.62, p.w * 0.62 * 0.5, 1);
    m.position.set(0, p.h * 0.5, p.d / 2 + 0.25);
    g.add(m);
    this.screens.push(screen);
    // Marquee bulbs
    const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 6, 4), new THREE.MeshBasicMaterial({ color: '#ffe8a3' }), 40);
    const mtx = new THREE.Matrix4();
    for (let i = 0; i < 40; i++) {
      mtx.makeTranslation(-p.w * 0.33 + (i / 39) * p.w * 0.66, p.h * 0.5 - p.w * 0.17, p.d / 2 + 0.35);
      bulbs.setMatrixAt(i, mtx);
    }
    g.add(bulbs);
    return g;
  }

  _market(p) {
    const g = new THREE.Group();
    const cols = ['#ff7a59', '#ffd166', '#36d399', '#7c9cff', '#ff5ce1', '#5ce1e6'];
    const tex = tileTexture('#d8c7a8', '#cbb894', 6).clone();
    tex.needsUpdate = true;
    tex.repeat.set(p.w / 6, p.d / 6);
    const floor = new THREE.Mesh(box, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
    floor.scale.set(p.w, 0.24, p.d);
    floor.position.y = 0.12;
    floor.receiveShadow = true;
    g.add(floor);
    let k = 0;
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++) {
        if (i === 0 && j === 1) continue; // central aisle opening
        const stall = new THREE.Group();
        const counter = new THREE.Mesh(box, new THREE.MeshStandardMaterial({ color: '#8a5a3c', roughness: 0.8 }));
        counter.scale.set(4.2, 1.1, 1.4);
        counter.position.set(0, 0.8, 1.2);
        const roof = new THREE.Mesh(new THREE.ConeGeometry(3.6, 1.6, 4), new THREE.MeshStandardMaterial({ color: cols[k % cols.length], roughness: 0.7, flatShading: true }));
        roof.rotation.y = Math.PI / 4;
        roof.position.y = 3.9;
        stall.add(counter, roof);
        for (const [px, pz] of [[-2, -1.6], [2, -1.6], [-2, 1.8], [2, 1.8]]) {
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.2, 6), this.mats.metal);
          pole.position.set(px, 1.7, pz);
          stall.add(pole);
        }
        // goods
        for (let n = 0; n < 4; n++) {
          const good = new THREE.Mesh(box, new THREE.MeshStandardMaterial({ color: cols[(k + n + 2) % cols.length] }));
          good.scale.set(0.5, 0.4, 0.5);
          good.position.set(-1.4 + n * 0.95, 1.55, 1.2);
          stall.add(good);
        }
        stall.children.forEach((c) => (c.castShadow = true));
        stall.position.set(i * 10.5, 0.2, j * 10);
        // Rentable: a header board that shows the tenant's brand.
        const sign = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: signTexture('FOR RENT', { sub: 'Market stall', accent: '#ffd166', bg: '#0f1722' }), transparent: true }));
        sign.scale.set(4.2, 0.9, 1);
        sign.position.set(0, 2.85, 1.95);
        sign.userData.dynamic = true;
        stall.add(sign);
        (this.marketStalls ||= []).push({ stall, sign, key: null });
        for (const ox of [-1.4, 0, 1.4]) this._localObs.push([i * 10.5 + ox, j * 10 + 1.2, 0.72]);
        for (const [px, pz] of [[-2, -1.6], [2, -1.6], [-2, 1.8], [2, 1.8]]) this._localObs.push([i * 10.5 + px, j * 10 + pz, 0.15]);
        if (this.pbr) {
          const props = ['boombox', 'camera', 'lantern', 'toycar', 'bottle', 'vase', 'olives', 'avocado'];
          this._placeModel(stall, props[k % props.length], { boombox: 0.6, camera: 0.45, lantern: 0.7, toycar: 0.45, bottle: 0.35, vase: 0.6, olives: 0.35, avocado: 0.2 }[props[k % props.length]], 0.6, 1.35, 1.2);
        }
        g.add(stall);
        k++;
      }
    // String lights across the aisles.
    const bulbMat = new THREE.MeshStandardMaterial({ color: '#ffe8a3', emissive: '#ffcf6b', emissiveIntensity: 0.2 });
    this.nightMats.push({ mat: bulbMat, day: 0.2, night: 1.3 });
    const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 6, 4), bulbMat, 120);
    const mtx = new THREE.Matrix4();
    let b = 0;
    for (const z of [-5, 5])
      for (let i = 0; i < 60 && b < 120; i++, b++) {
        const x = -p.w / 2 + (i / 59) * p.w;
        mtx.makeTranslation(x, 5.2 - Math.sin((i / 59) * Math.PI * 3) ** 2 * 0.8, z);
        bulbs.setMatrixAt(b, mtx);
      }
    g.add(bulbs);
    // Entrance arch + sign.
    const arch = new THREE.Group();
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(box, this.mats.dark);
      post.scale.set(0.6, 6, 0.6);
      post.position.set(sx * 5, 3, 0);
      arch.add(post);
    }
    const sign = this._sign(p.name, 'Marketplace · Classifieds', p.accent, 10, 1.8);
    sign.position.set(0, 6.4, 0.1);
    arch.add(sign);
    arch.position.set(0, 0, p.d / 2 - 0.5);
    g.add(arch);
    return g;
  }

  _kiosks(p) {
    const g = new THREE.Group();
    const tools = this.cfg.tools || [];
    const floor = new THREE.Mesh(box, new THREE.MeshStandardMaterial({ color: '#2b3442', roughness: 0.6 }));
    floor.scale.set(p.w, 0.22, p.d);
    floor.position.y = 0.11;
    floor.receiveShadow = true;
    g.add(floor);
    tools.slice(0, 6).forEach((t, i) => {
      const k = new THREE.Group();
      const bodyM = new THREE.Mesh(box, new THREE.MeshStandardMaterial({ color: '#e9eef3', roughness: 0.4 }));
      bodyM.scale.set(2.6, 2.8, 1.4);
      bodyM.position.y = 1.6;
      bodyM.castShadow = true;
      const scrMat = new THREE.MeshBasicMaterial({ map: signTexture(t.name, { sub: 'Free tool', accent: p.accent, bg: '#0b1d33', w: 384, h: 256 }) });
      const scr = new THREE.Mesh(plane, scrMat);
      scr.scale.set(2.2, 1.45, 1);
      scr.position.set(0, 2, 0.72);
      const top = new THREE.Mesh(box, new THREE.MeshStandardMaterial({ color: p.accent, emissive: p.accent, emissiveIntensity: 0.6 }));
      top.scale.set(2.8, 0.25, 1.6);
      top.position.y = 3.1;
      k.add(bodyM, scr, top);
      const col = i % 3;
      const row = Math.floor(i / 3);
      k.position.set(-9 + col * 9, 0.2, -3 + row * 7);
      for (const ox of [-0.65, 0.65]) this._localObs.push([-9 + col * 9 + ox, -3 + row * 7, 0.75]);
      g.add(k);
    });
    const sign = this._sign(p.name, 'Free Pludor tools', p.accent, 10, 1.8);
    sign.position.set(0, 4.8, p.d / 2 - 0.5);
    const post = new THREE.Mesh(box, this.mats.dark);
    post.scale.set(10.6, 0.3, 0.3);
    post.position.set(0, 3.8, p.d / 2 - 0.5);
    g.add(sign, post);
    return g;
  }

  _place(p) {
    const seed = [...p.id].reduce((a, c) => a + c.charCodeAt(0), 0);
    const T = { storefront: this._storefront, tower: this._tower, hall: this._hall, cinema: this._cinema, market: this._market, kiosks: this._kiosks }[p.template];
    this._localObs.length = 0;
    const g = T.call(this, p, seed);
    g.position.set(p.x, 0.2, p.z);
    g.rotation.y = FACING_ROT[p.facing];
    const th = g.rotation.y;
    for (const [lx, lz, r] of this._localObs) this.obstacles.push([p.x + lx * Math.cos(th) + lz * Math.sin(th), p.z - lx * Math.sin(th) + lz * Math.cos(th), r]);
    g.userData.ref = { type: 'place', id: p.id };
    this.root.add(g);
    this.pickables.push(g);
    this.placeGroups.set(p.id, g);
    if (!p.walkable) this.colliders.push(footprint(p));
  }

  // ───────── land parcels ─────────
  _parcel(p) {
    const g = new THREE.Group();
    g.position.set(p.x, 0.2, p.z);
    g.rotation.y = FACING_ROT[p.facing];
    g.userData.ref = { type: 'parcel', id: p.id };
    const lot = new THREE.Mesh(plane, new THREE.MeshStandardMaterial({ color: '#7d9a5a', roughness: 1 }));
    lot.scale.set(p.w - 0.6, p.d - 0.6, 1);
    lot.rotation.x = -Math.PI / 2;
    lot.position.y = 0.02;
    lot.receiveShadow = true;
    g.add(lot);
    const zoneColor = { residential: '#36d399', commercial: '#ffd166', 'mixed-use': '#7c9cff', premium: '#ff5ce1' }[p.zoning] || '#ffffff';
    const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]].map(([a, b]) => new THREE.Vector3((a * p.w) / 2 - a * 0.3, 0.06, (b * p.d) / 2 - b * 0.3));
    const border = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: zoneColor, dashSize: 1, gapSize: 0.6 }));
    border.computeLineDistances();
    g.add(border);
    const content = new THREE.Group();
    g.add(content);
    g.userData.content = content;
    g.userData.zoneColor = zoneColor;
    this.root.add(g);
    this.pickables.push(g);
    this.parcelGroups.set(p.id, { group: g, parcel: p, state: null });
    this.setParcelState(p.id, null);
  }

  // building: null (for rent) or { template, businessName, tenantName }
  setParcelState(parcelId, building, rentLabel = '') {
    const entry = this.parcelGroups.get(parcelId);
    if (!entry) return;
    const key = JSON.stringify(building);
    if (entry.state === key && entry.rentLabel === rentLabel) return;
    entry.state = key;
    entry.rentLabel = rentLabel;
    const { parcel: p, group } = entry;
    const content = group.userData.content;
    content.clear();
    this.colliders = this.colliders.filter((c) => c.parcelId !== parcelId);
    if (!building) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.6, 6), this.mats.metal);
      post.position.set(0, 1.3, p.d / 2 - 1.5);
      const sign = this._sign('FOR RENT', `${rentLabel} · ${p.zoning}`, group.userData.zoneColor, 4.2, 1.6);
      sign.position.set(0, 2.9, p.d / 2 - 1.45);
      const sign2 = sign.clone();
      sign2.rotation.y = Math.PI;
      sign2.position.z -= 0.02;
      // Survey stakes
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const stake = new THREE.Mesh(box, new THREE.MeshStandardMaterial({ color: group.userData.zoneColor }));
        stake.scale.set(0.2, 0.9, 0.2);
        stake.position.set((sx * (p.w - 1)) / 2, 0.45, (sz * (p.d - 1)) / 2);
        content.add(stake);
      }
      content.add(post, sign, sign2);
      return;
    }
    const tpl = building.template;
    const label = building.businessName || (tpl === 'home' ? `${building.tenantName}'s Home` : `${building.tenantName}'s ${tpl === 'studio' ? 'Studio' : 'Shop'}`);
    const bw = p.w - 4;
    const bd = p.d - 8;
    const spec = {
      name: label,
      w: bw,
      d: bd,
      h: tpl === 'home' ? 7 : tpl === 'studio' ? 11 : 9,
      color: tpl === 'home' ? '#b07d62' : tpl === 'studio' ? '#4b3f72' : '#3f5a73',
      accent: group.userData.zoneColor,
      subtitle: building.businessName ? 'Open on Pludor' : tpl === 'home' ? 'Residence' : 'Coming soon',
      brand: building.businessName ? building.brand || null : null,
    };
    const seed = [...parcelId].reduce((a, c) => a + c.charCodeAt(0), 0);
    const b = tpl === 'studio' ? this._hall(spec, seed) : this._storefront(spec, seed);
    if (tpl === 'home') {
      const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(bw, bd) * 0.72, 3.5, 4), new THREE.MeshStandardMaterial({ color: '#7a3e2f', flatShading: true }));
      roof.rotation.y = Math.PI / 4;
      roof.position.y = spec.h + 2.3;
      roof.castShadow = true;
      b.add(roof);
    }
    b.position.z = -2;
    content.add(b);
    // Construction pop-in animation.
    b.scale.set(1, 0.01, 1);
    const start = performance.now();
    this.animated.push(function grow() {
      const k = Math.min(1, (performance.now() - start) / 900);
      b.scale.y = 0.01 + (1 - (1 - k) ** 3) * 0.99;
      return k >= 1;
    });
    const swap = p.facing === 'e' || p.facing === 'w';
    const [fx, fz] = facingVector(p.facing);
    const cx = p.x - fx * 2;
    const cz = p.z - fz * 2;
    const hw = (swap ? bd : bw) / 2;
    const hd = (swap ? bw : bd) / 2;
    this.colliders.push({ x0: cx - hw, x1: cx + hw, z0: cz - hd, z1: cz + hd, parcelId });
    this.onCollidersChanged?.();
  }

  // Market stall signs follow who rents them (brand, or FOR RENT).
  setMarketStalls(units) {
    for (const u of units) {
      const ms = this.marketStalls?.[u.stallIndex];
      if (!ms) continue;
      const b = u.building;
      const key = JSON.stringify([u.status, b?.businessName, b?.brand, u.rentLabel]);
      if (key === ms.key) continue;
      ms.key = key;
      ms.sign.material.map?.dispose();
      ms.sign.material.map = b?.businessName
        ? brandSignTexture(b.businessName, b.brand || { color: '#ffd166' }, { sub: `by ${b.tenantName}` })
        : u.status === 'available' ? signTexture('FOR RENT', { sub: `${u.rentLabel} · rent this stall`, accent: '#ffd166', bg: '#0f1722' }) : signTexture(b?.tenantName || 'Taken', { sub: 'Opening soon', accent: '#8892a6', bg: '#0f1722' });
      ms.sign.scale.set(4.2, b?.businessName ? 0.9 : 0.9, 1);
      ms.sign.material.needsUpdate = true;
    }
  }

  // ───────── billboards (World ad inventory) ─────────
  _billboard(b) {
    const g = new THREE.Group();
    g.position.set(b.x, b.y + 0.2, b.z);
    g.rotation.y = Math.atan2(b.lookAt[0] - b.x, b.lookAt[1] - b.z);
    g.userData.ref = { type: 'billboard', id: b.id };
    if (!b.y && b.pole > 1) {
      for (const sx of [-1, 1]) {
        const ox = sx * b.w * 0.3;
        this.obstacles.push([b.x + Math.cos(g.rotation.y) * ox, b.z - Math.sin(g.rotation.y) * ox, 0.3]);
      }
    }
    if (!b.wall) for (const sx of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, b.pole, 8), this.mats.metal);
      pole.position.set(sx * b.w * 0.3, b.pole / 2, -0.2);
      pole.castShadow = true;
      g.add(pole);
    }
    const frame = new THREE.Mesh(box, this.mats.dark);
    frame.scale.set(b.w + 0.4, b.h + 0.4, 0.3);
    frame.position.y = b.pole + b.h / 2;
    frame.castShadow = true;
    const face = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ color: '#333' }));
    face.scale.set(b.w, b.h, 1);
    face.position.set(0, b.pole + b.h / 2, 0.17);
    g.add(frame, face);
    this.root.add(g);
    this.pickables.push(g);
    this.billboards.set(b.id, { group: g, face, placement: b, creativeId: null });
    this.adSlots.push(b);
  }

  // Extra ad inventory on buildings: a wall billboard facing the street and,
  // on mid-rise blocks, a rooftop billboard. Each is its own Ads placement.
  _buildingAds(id, { cx, cz, w, d, h, alongX, side, r }) {
    if (!this.cfg.billboards.length) return;
    const span = alongX ? w : d;
    const aw = Math.min(span * 0.72, 16);
    const ah = aw * 0.5;
    const nx = alongX ? 0 : side;
    const nz = alongX ? side : 0;
    const half = alongX ? d / 2 : w / 2;
    if (h >= 14) {
      const y = Math.min(h - ah - 1.5, 5 + r() * 6);
      this._billboard({ id: `wall-${id}`, placementId: `world.central.wall-${id}`, wall: true, x: cx + nx * (half + 0.25), z: cz + nz * (half + 0.25), y, w: aw, h: ah, pole: 0, lookAt: [cx + nx * 60, cz + nz * 60] });
    }
    if (h < 36 && r() < 0.6) {
      const rw = Math.min(span * 0.8, 15);
      this._billboard({ id: `roof-${id}`, placementId: `world.central.roof-${id}`, x: cx, z: cz, y: h, w: rw, h: rw * 0.42, pole: 2.2, lookAt: [cx + nx * 60, cz + nz * 60] });
    }
  }

  // Vertical banner ads on a free side wall of shops, halls and towers.
  _placeBanners() {
    const blocked = (x, z, own) => this.colliders.some((c) => c !== own && !c.low && x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1);
    for (const p of this.cfg.places) {
      if (!['storefront', 'tower', 'hall', 'cinema'].includes(p.template) || p.h < 9) continue;
      const own = this.colliders.find((c) => c.x0 === footprint(p).x0 && c.z0 === footprint(p).z0);
      const th = FACING_ROT[p.facing];
      for (const sx of [1, -1]) {
        const lx = sx * (p.w / 2 + 0.25);
        const wx = p.x + lx * Math.cos(th);
        const wz = p.z - lx * Math.sin(th);
        const ox = sx * Math.cos(th);
        const oz = -sx * Math.sin(th);
        if (blocked(wx + ox * 4, wz + oz * 4, own)) continue;
        const bw = Math.min(p.d * 0.5, 5.5);
        const bh = Math.min(p.h * 0.6, bw * 1.8);
        this._billboard({ id: `banner-${p.id}`, placementId: `world.central.banner-${p.id}`, wall: true, x: wx, z: wz, y: Math.max(3.2, p.h * 0.32), w: bw, h: bh, pole: 0, lookAt: [wx + ox * 60, wz + oz * 60] });
        break;
      }
    }
  }

  setBillboardCreative(id, creative) {
    const bb = this.billboards.get(id);
    if (!bb || !creative || bb.creativeId === creative.id) return;
    bb.creativeId = creative.id;
    bb.creative = creative;
    bb.face.material.map?.dispose();
    const pw = bb.placement;
    bb.face.material.map = pw.h > pw.w ? adTexture(creative, 512, 1024) : adTexture(creative);
    bb.face.material.color.set('#ffffff');
    bb.face.material.needsUpdate = true;
  }

  // ───────── filler buildings ─────────
  _filler([i, j]) {
    const b = cellBounds(i, j);
    const r = rand((i + 7) * 131 + (j + 7) * 17);
    const palette = ['#3d4f63', '#56606b', '#6b5b4e', '#3f5a52', '#5a4b63', '#4a5d74', '#705e52'];
    const inset = 3;
    const x0 = b.x0 + inset;
    const x1 = b.x1 - inset;
    const z0 = b.z0 + inset;
    const z1 = b.z1 - inset;
    const alongX = x1 - x0 >= z1 - z0;
    const n = 2 + Math.floor(r() * 2);
    const span = alongX ? x1 - x0 : z1 - z0;
    const gap = 2;
    const size = (span - gap * (n - 1)) / n;
    for (let k = 0; k < n; k++) {
      const c0 = (alongX ? x0 : z0) + k * (size + gap);
      const w = alongX ? size : x1 - x0;
      const d = alongX ? z1 - z0 : size;
      const cx = alongX ? c0 + size / 2 : (x0 + x1) / 2;
      const cz = alongX ? (z0 + z1) / 2 : c0 + size / 2;
      const outer = Math.abs(i) === 2 || Math.abs(j) === 2;
      const h = (outer ? 16 : 12) + Math.floor(r() * (outer ? 34 : 18));
      const color = palette[Math.floor(r() * palette.length)];
      const body = new THREE.Mesh(box, this._facadeMat(color, 1 + Math.floor(r() * 5), w, h, 'tall'));
      body.scale.set(w, h, d);
      body.position.set(cx, h / 2 + 0.2, cz);
      body.castShadow = body.receiveShadow = true;
      const cap = this._roofCap(w, d, h, color);
      cap.position.set(cx, 0.2, cz);
      this.root.add(body, cap);
      this.colliders.push({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2 });
      this._buildingAds(`${i}${j}${k}`.replace(/-/g, 'm'), { cx, cz, w, d, h, alongX, side: (k + i + j) % 2 ? 1 : -1, r });
    }
  }

  // ───────── trees, lamps, skyline, river ─────────
  _blocked(x, z, pad = 1.5) {
    for (const c of this.colliders) if (x > c.x0 - pad && x < c.x1 + pad && z > c.z0 - pad && z < c.z1 + pad) return true;
    for (const p of this.cfg.places) {
      const f = footprint(p);
      if (x > f.x0 - pad && x < f.x1 + pad && z > f.z0 - pad && z < f.z1 + pad) return true;
    }
    for (const p of this.cfg.parcels) if (Math.abs(x - p.x) < p.w / 2 + 0.5 && Math.abs(z - p.z) < p.d / 2 + 0.5) return true;
    for (const b of this.cfg.billboards) if (Math.hypot(x - b.x, z - b.z) < 4) return true;
    for (const a of this.cfg.agents || []) if (Math.hypot(x - a.x, z - a.z) < 3) return true;
    return false;
  }

  _streetFurniture() {
    const trees = [];
    const lamps = [];
    for (let i = -2; i <= 2; i++)
      for (let j = -2; j <= 2; j++) {
        const b = cellBounds(i, j);
        const inset = 1.3;
        const edges = [
          [b.x0 + inset, b.z0 + inset, b.x1 - inset, b.z0 + inset],
          [b.x0 + inset, b.z1 - inset, b.x1 - inset, b.z1 - inset],
          [b.x0 + inset, b.z0 + inset, b.x0 + inset, b.z1 - inset],
          [b.x1 - inset, b.z0 + inset, b.x1 - inset, b.z1 - inset],
        ];
        for (const [ax, az, bx, bz] of edges) {
          const len = Math.hypot(bx - ax, bz - az);
          const n = Math.max(1, Math.floor(len / 10));
          for (let k = 0; k <= n; k++) {
            const t = k / n;
            const x = ax + (bx - ax) * t;
            const z = az + (bz - az) * t;
            const corner = (k === 0 || k === n);
            if (corner) {
              if (!lamps.some((l) => Math.hypot(l[0] - x, l[1] - z) < 2)) lamps.push([x, z]);
            } else if (!this._blocked(x, z, 0.6) && !(i === 0 && j === 0)) trees.push([x, z]);
          }
        }
      }
    const r = rand(99);
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.24, 3.2, 7), new THREE.MeshStandardMaterial({ color: '#5a4332', roughness: 1 }), trees.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const c = new THREE.Color();
    if (this.pbr) {
      // Foliage: several alpha-cut leaf cards per tree, randomly oriented.
      const CARDS = 7;
      const leafMat = new THREE.MeshStandardMaterial({ map: leafCardTexture(4), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85 });
      const cards = new THREE.InstancedMesh(plane, leafMat, trees.length * CARDS);
      const core = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.2, 1), new THREE.MeshStandardMaterial({ color: '#2f5a2a', roughness: 1 }), trees.length);
      let k = 0;
      trees.forEach(([x, z], i) => {
        const s = 0.85 + r() * 0.4;
        m.compose(new THREE.Vector3(x, 1.8 * s, z), q.identity(), new THREE.Vector3(s, s, s));
        trunk.setMatrixAt(i, m);
        m.compose(new THREE.Vector3(x, 4.1 * s, z), q.identity(), new THREE.Vector3(s * 1.2, s, s * 1.2));
        core.setMatrixAt(i, m);
        for (let n = 0; n < CARDS; n++) {
          q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.9, r() * Math.PI, (r() - 0.5) * 0.6));
          const off = new THREE.Vector3((r() - 0.5) * 1.6, (r() - 0.3) * 1.6, (r() - 0.5) * 1.6).multiplyScalar(s);
          const cs = (2.6 + r() * 1.3) * s;
          m.compose(new THREE.Vector3(x + off.x, 4.2 * s + off.y, z + off.z), q, new THREE.Vector3(cs, cs, cs));
          cards.setMatrixAt(k, m);
          cards.setColorAt(k, c.setHSL(0.26 + r() * 0.06, 0.45 + r() * 0.15, 0.55 + r() * 0.2));
          k++;
        }
      });
      cards.castShadow = core.castShadow = trunk.castShadow = true;
      this.root.add(trunk, core, cards);
    } else {
      const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.6, 0), new THREE.MeshStandardMaterial({ color: '#4c9a52', roughness: 0.9, flatShading: true }), trees.length);
      trees.forEach(([x, z], k) => {
        const s = 0.85 + r() * 0.45;
        m.compose(new THREE.Vector3(x, 1.6, z), q.identity(), new THREE.Vector3(s, s, s));
        trunk.setMatrixAt(k, m);
        m.compose(new THREE.Vector3(x, 2.4 + 1.4 * s, z), q, new THREE.Vector3(s, s * 1.15, s));
        crown.setMatrixAt(k, m);
        crown.setColorAt(k, c.setHSL(0.28 + r() * 0.08, 0.45, 0.32 + r() * 0.1));
      });
      trunk.castShadow = crown.castShadow = true;
      this.root.add(trunk, crown);
    }
    this.treeCount = trees.length;
    for (const [x, z] of trees) this.obstacles.push([x, z, 0.4]);
    for (const [x, z] of lamps) this.obstacles.push([x, z, 0.2]);

    const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.12, 5, 6), this.mats.metal, lamps.length);
    const headMat = new THREE.MeshStandardMaterial({ color: '#fff4d6', emissive: '#ffd27a', emissiveIntensity: 0 });
    this.nightMats.push({ mat: headMat, day: 0, night: 1.4 });
    const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.32, 10, 8), headMat, lamps.length);
    q.identity();
    lamps.forEach(([x, z], k) => {
      m.compose(new THREE.Vector3(x, 2.7, z), q, new THREE.Vector3(1, 1, 1));
      pole.setMatrixAt(k, m);
      m.compose(new THREE.Vector3(x, 5.3, z), q, new THREE.Vector3(1, 1, 1));
      head.setMatrixAt(k, m);
    });
    this.root.add(pole, head);
  }

  _skyline() {
    const n = 140;
    const mat = new THREE.MeshStandardMaterial({ color: '#5a6b80', roughness: 0.9 });
    this.skylineMat = mat;
    const inst = new THREE.InstancedMesh(box, mat, n);
    const r = rand(42);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + r() * 0.04;
      const dist = 345 + r() * 150;
      const w = 12 + r() * 22;
      const h = 20 + r() ** 2 * 120;
      q.setFromEuler(new THREE.Euler(0, a, 0));
      m.compose(new THREE.Vector3(Math.cos(a) * dist, h / 2, Math.sin(a) * dist + (Math.sin(a) > 0.6 ? 60 : 0)), q, new THREE.Vector3(w, h, 10 + r() * 16));
      inst.setMatrixAt(k, m);
    }
    this.root.add(inst);
  }

  _river() {
    const water = new THREE.Mesh(new THREE.PlaneGeometry(1400, 34), new THREE.MeshStandardMaterial({ color: '#2f86b8', roughness: 0.15, metalness: 0.3, emissive: '#0c3550', emissiveIntensity: 0.4 }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, 0.03, 134);
    const prom = new THREE.Mesh(box, this.mats.sidewalk);
    prom.scale.set(DISTRICT.half * 2, 0.2, 6);
    prom.position.set(0, 0.1, 114);
    prom.receiveShadow = true;
    const rail = new THREE.Mesh(box, this.mats.metal);
    rail.scale.set(DISTRICT.half * 2, 0.9, 0.12);
    rail.position.set(0, 0.65, 116.9);
    this.root.add(water, prom, rail);
    this.water = water;
    this.colliders.push({ x0: -500, x1: 500, z0: 116.6, z1: 160 });
  }

  // ───────── per-frame ─────────
  update(time, daylight, reel) {
    const night = 1 - daylight;
    this.spray?.update(time);
    for (const l of this.leds) l.update(time);
    if (this.airship) {
      const a = time * 0.025;
      this.airship.position.set(Math.cos(a) * 150, 78 + Math.sin(time * 0.2) * 2, Math.sin(a) * 150 - 40);
      this.airship.rotation.y = -a;
      if (this.airship.userData.logoMat) this.airship.userData.logoMat.emissiveIntensity = 0.12 + night * 1.4;
    }
    if (this.tower) {
      for (const m of this.tower.userData.mats) m.emissiveIntensity = night * 1.1;
      this.tower.userData.beacon.visible = Math.sin(time * 3) > 0;
    }
    if (this.skyline) for (const m of this.skyline.userData.mats) m.emissiveIntensity = night * 1.0;
    for (const m of this.windowMats) m.emissiveIntensity = night * 0.65;
    // Screens are unlit (toneMapped off); dim them after dark so they don't glare.
    const scr = 1 - night * 0.38;
    for (const l of this.leds) l.mesh.material.color.setScalar(scr);
    for (const b of this.billboards.values()) b.face.material.color.setScalar(b.creativeId ? scr : 0.2);
    for (const { mat, day, night: n } of this.nightMats) mat.emissiveIntensity = day + (n - day) * night;
    if (this.skylineMat) this.skylineMat.color.setHSL(0.6, 0.15, 0.22 + daylight * 0.25);
    this.animated = this.animated.filter((fn) => !fn(time));
    if (this.screens.length && (!this._lastScreen || time - this._lastScreen > 0.1)) {
      this._lastScreen = time;
      for (const s of this.screens) drawCinemaFrame(s, time, reel);
    }
    if (this.water) this.water.material.emissiveIntensity = 0.3 + Math.sin(time * 0.8) * 0.06 + night * 0.2;
  }
}
