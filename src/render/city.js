// Builds Nova City · Central from config using reusable building templates.
// Nothing is hand-modelled per building: a place's template + size + colours
// produce its geometry, so new districts are data, not code.

import * as THREE from 'three';
import { DISTRICT, cellBounds, footprint, facingVector } from '../config/nova-city.js';
import { facadeTextures, facadePBR, asphaltPBR, paversPBR, grassPBR, leafCardTexture, signTexture, tileTexture, screenTexture, drawCinemaFrame, adTexture, shade } from './textures.js';
import { productInstance } from './assets.js';

const FACING_ROT = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 };
const box = new THREE.BoxGeometry(1, 1, 1);
const plane = new THREE.PlaneGeometry(1, 1);

function rand(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
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
    this.pickables = [];
    this.windowMats = [];
    this.nightMats = [];
    this.billboards = new Map();
    this.parcelGroups = new Map();
    this.placeGroups = new Map();
    this.screens = [];
    this.animated = [];
    const pav = paversPBR('#c7c3bb');
    this.mats = {
      sidewalk: this.pbr ? new THREE.MeshStandardMaterial({ map: pav.map, normalMap: pav.normalMap, roughness: 0.9 }) : new THREE.MeshStandardMaterial({ map: tileTexture('#c9cfd4', '#bfc6cc', 4), roughness: 0.95 }),
      curb: new THREE.MeshStandardMaterial({ color: '#9aa3ab', roughness: 0.9 }),
      dark: new THREE.MeshStandardMaterial({ color: '#232a33', roughness: 0.7 }),
      metal: new THREE.MeshStandardMaterial({ color: '#5b6672', roughness: 0.4, metalness: 0.6 }),
      glass: new THREE.MeshStandardMaterial({ color: '#5d7a8f', roughness: 0.04, metalness: 0.75, emissive: '#ffcf8a', emissiveIntensity: 0.15 }),
      white: new THREE.MeshStandardMaterial({ color: '#f1f3f5', roughness: 0.8 }),
    };
    this.nightMats.push({ mat: this.mats.glass, day: 0.15, night: 0.9 });
    this._ground();
    this._roads();
    this._blocks();
    this._plaza();
    for (const p of cfg.places) this._place(p);
    for (const p of cfg.parcels) this._parcel(p);
    for (const b of cfg.billboards) this._billboard(b);
    for (const c of cfg.filler) this._filler(c);
    this._streetFurniture();
    this._skyline();
    this._river();
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
    for (const r of roads) {
      const za = new THREE.Mesh(plane, mz);
      za.scale.set(roadWidth, len, 1);
      za.rotation.x = -Math.PI / 2;
      za.position.set(r, 0.01, 0);
      za.receiveShadow = true;
      const xb = new THREE.Mesh(plane, mx);
      xb.scale.set(len, roadWidth, 1);
      xb.rotation.x = -Math.PI / 2;
      xb.position.set(0, 0.012, r);
      xb.receiveShadow = true;
      this.root.add(za, xb);
    }
    // Lane markings: dashed centre line + solid edge lines, instanced.
    const dashes = [];
    const edges = [];
    for (const r of roads) {
      for (let t = -half - 10; t < half + 10; t += 6) {
        if (roads.some((q) => Math.abs(t + 1.5 - q) < roadWidth / 2 + 1.5)) continue;
        dashes.push([r, t + 1.5, 0], [t + 1.5, r, 1]);
      }
      for (const off of [-roadWidth / 2 + 0.35, roadWidth / 2 - 0.35]) edges.push([r + off, 0, 0], [0, r + off, 1]);
    }
    const yellow = new THREE.MeshStandardMaterial({ color: '#e8c547', roughness: 0.6 });
    const white = new THREE.MeshStandardMaterial({ color: '#e9edf0', roughness: 0.6 });
    const dm = new THREE.InstancedMesh(plane, yellow, dashes.length);
    const em = new THREE.InstancedMesh(plane, white, edges.length);
    const m4 = new THREE.Matrix4();
    const qx = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    const qz = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, Math.PI / 2));
    dashes.forEach(([x, z, rot], i) => dm.setMatrixAt(i, m4.compose(new THREE.Vector3(x, 0.022, z), rot ? qz : qx, new THREE.Vector3(0.22, 3, 1))));
    edges.forEach(([x, z, rot], i) => em.setMatrixAt(i, m4.compose(new THREE.Vector3(x, 0.021, z), rot ? qz : qx, new THREE.Vector3(0.15, len, 1))));
    dm.receiveShadow = em.receiveShadow = true;
    this.root.add(dm, em);
    // Intersections + crosswalks (instanced stripes).
    const stripes = [];
    for (const x of roads)
      for (const z of roads) {
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
    const pz = paversPBR('#ddd5c6', 8);
    const t = pz.map.clone();
    const tn = pz.normalMap.clone();
    t.needsUpdate = tn.needsUpdate = true;
    t.repeat.set(s / 2.5, s / 2.5);
    tn.repeat.set(s / 2.5, s / 2.5);
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
    }
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
    const sign = this._sign(p.name, p.subtitle || '', accent, Math.min(w * 0.7, 12), 1.5);
    sign.position.set(0, gf + 1.35, d / 2 + 0.06);
    g.add(upper, core, back, floor, ceil, fascia, glass, doorFrame, doorGlass, awning, sign, this._roofCap(w, d, h, color));
    // Planters either side of the door.
    for (const sx of [-1, 1]) {
      const pl = new THREE.Mesh(box, this.mats.curb);
      pl.scale.set(0.9, 0.55, 0.9);
      pl.position.set(sx * (w * 0.43 - 0.6), 0.28, d / 2 + 0.9);
      g.add(pl);
      if (this.pbr) this._placeModel(g, 'plant', 1.2, pl.position.x, 0.55, pl.position.z);
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
    this.nightMats.push({ mat: stripMat, day: 0.5, night: 1.6 });
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
    this.nightMats.push({ mat: bandMat, day: 0.4, night: 1.4 });
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
    }
    g.add(body, curtain, band, sign, canopy, this._roofCap(w, d, h, color));
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
        if (this.pbr) {
          const props = ['boombox', 'camera', 'lantern', 'toycar', 'bottle', 'vase', 'olives', 'avocado'];
          this._placeModel(stall, props[k % props.length], { boombox: 0.6, camera: 0.45, lantern: 0.7, toycar: 0.45, bottle: 0.35, vase: 0.6, olives: 0.35, avocado: 0.2 }[props[k % props.length]], 0.6, 1.35, 1.2);
        }
        g.add(stall);
        k++;
      }
    // String lights across the aisles.
    const bulbMat = new THREE.MeshStandardMaterial({ color: '#ffe8a3', emissive: '#ffcf6b', emissiveIntensity: 0.2 });
    this.nightMats.push({ mat: bulbMat, day: 0.2, night: 2.2 });
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
    const g = T.call(this, p, seed);
    g.position.set(p.x, 0.2, p.z);
    g.rotation.y = FACING_ROT[p.facing];
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

  // ───────── billboards (World ad inventory) ─────────
  _billboard(b) {
    const g = new THREE.Group();
    g.position.set(b.x, b.y + 0.2, b.z);
    g.rotation.y = Math.atan2(b.lookAt[0] - b.x, b.lookAt[1] - b.z);
    g.userData.ref = { type: 'billboard', id: b.id };
    for (const sx of [-1, 1]) {
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
  }

  setBillboardCreative(id, creative) {
    const bb = this.billboards.get(id);
    if (!bb || !creative || bb.creativeId === creative.id) return;
    bb.creativeId = creative.id;
    bb.creative = creative;
    bb.face.material.map?.dispose();
    bb.face.material.map = adTexture(creative);
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
            } else if (!this._blocked(x, z, 0.6) && !(i === 0 && j === 0 && Math.hypot(x, z) < 14)) trees.push([x, z]);
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

    const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.12, 5, 6), this.mats.metal, lamps.length);
    const headMat = new THREE.MeshStandardMaterial({ color: '#fff4d6', emissive: '#ffd27a', emissiveIntensity: 0 });
    this.nightMats.push({ mat: headMat, day: 0, night: 2.4 });
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
      const dist = 190 + r() * 120;
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
    for (const m of this.windowMats) m.emissiveIntensity = night * 1.05;
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
