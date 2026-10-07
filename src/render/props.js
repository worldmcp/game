// Set-dressing that makes the city read as a real place: palms, café terraces,
// fountain spray, the Pludor airship, the landmark tower, a glass skyline and
// LED facade screens. All procedural (no third-party art).

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { facadePBR, signTexture } from './textures.js';

function rand(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

// ───────── palms ─────────
function frondTexture() {
  const [c, g] = canvas(128, 512);
  g.clearRect(0, 0, 128, 512);
  // rachis
  g.strokeStyle = '#6b7a3a';
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(64, 0);
  g.lineTo(64, 512);
  g.stroke();
  // leaflets
  for (let y = 10; y < 500; y += 7) {
    const t = y / 512;
    const len = Math.sin(t * Math.PI) * 58 + 6;
    for (const side of [-1, 1]) {
      const shade = 0.75 + Math.random() * 0.3;
      g.strokeStyle = `rgb(${Math.round(70 * shade)},${Math.round(128 * shade)},${Math.round(48 * shade)})`;
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(64, y);
      g.quadraticCurveTo(64 + side * len * 0.6, y + 8, 64 + side * len, y + 22);
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function palmGeometries() {
  // Trunk: tapered, gently curved tube.
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.3, 3, 0), new THREE.Vector3(0.9, 6, 0), new THREE.Vector3(1.6, 8.6, 0)]);
  const trunk = new THREE.TubeGeometry(curve, 24, 0.22, 8, false);
  const pos = trunk.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const p = new THREE.Vector3().fromBufferAttribute(pos, i);
    const t = p.y / 8.6;
    const c = curve.getPointAt(Math.min(1, Math.max(0, t)));
    const d = p.clone().sub(c);
    const ring = 1 + Math.sin(p.y * 9) * 0.06; // bark rings
    d.multiplyScalar((1.25 - t * 0.45) * ring);
    pos.setXYZ(i, c.x + d.x, p.y, c.z + d.z);
  }
  trunk.computeVertexNormals();
  // Crown: arching fronds built from bent strips.
  const fronds = [];
  const top = curve.getPointAt(1);
  const N = 13;
  for (let k = 0; k < N; k++) {
    const g = new THREE.PlaneGeometry(1.1, 4.2, 1, 10);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) + 2.1; // 0..4.2 along frond
      const droop = (y / 4.2) ** 2 * 2.2;
      p.setXYZ(i, p.getX(i) * (0.4 + 0.6 * Math.sin((y / 4.2) * Math.PI * 0.95)), -droop, y);
    }
    g.rotateX(-0.35 - (k % 3) * 0.12);
    g.rotateY((k / N) * Math.PI * 2 + (k % 2) * 0.2);
    g.translate(top.x, top.y, top.z);
    fronds.push(g);
  }
  const fr = mergeGeometries(fronds);
  fr.computeVertexNormals();
  return { trunk, fronds: fr };
}

export function addPalms(root, points, seed = 1) {
  if (!points.length) return;
  const { trunk, fronds } = palmGeometries();
  const bark = new THREE.MeshStandardMaterial({ color: '#8a7358', roughness: 0.95 });
  const leaf = new THREE.MeshStandardMaterial({ map: frondTexture(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.75 });
  const ti = new THREE.InstancedMesh(trunk, bark, points.length);
  const fi = new THREE.InstancedMesh(fronds, leaf, points.length);
  const r = rand(seed);
  const m = new THREE.Matrix4();
  points.forEach(([x, z, y = 0.2], i) => {
    const s = 0.85 + r() * 0.45;
    m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r() * Math.PI * 2, 0)), new THREE.Vector3(s, s * (0.9 + r() * 0.3), s));
    ti.setMatrixAt(i, m);
    fi.setMatrixAt(i, m);
  });
  ti.castShadow = fi.castShadow = true;
  root.add(ti, fi);
  return { trunks: ti, fronds: fi };
}

// ───────── café terrace ─────────
export function addTerrace(root, { x, z, w, d, cols = 3, rows = 2, colors = ['#f4efe6', '#2f6e5a'] }) {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: '#7a5236', roughness: 0.6 });
  const metal = new THREE.MeshStandardMaterial({ color: '#2b2f35', roughness: 0.4, metalness: 0.7 });
  const top = new THREE.MeshStandardMaterial({ color: '#e9e4da', roughness: 0.3 });
  const seats = [];
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      const tx = x - w / 2 + (w / cols) * (i + 0.5);
      const tz = z - d / 2 + (d / rows) * (j + 0.5);
      const table = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.05, 20), top);
      table.position.set(tx, 0.95, tz);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.2, 0.75, 8), metal);
      leg.position.set(tx, 0.58, tz);
      g.add(table, leg);
      for (const a of [0, Math.PI]) {
        const cx = tx + Math.cos(a) * 0.8;
        const cz = tz + Math.sin(a) * 0.8;
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.06, 0.45), wood);
        seat.position.set(cx, 0.68, cz);
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.05), wood);
        back.position.set(cx + Math.cos(a) * 0.22, 0.92, cz + Math.sin(a) * 0.22);
        back.rotation.y = a + Math.PI / 2;
        const cl = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.48, 6), metal);
        cl.position.set(cx, 0.43, cz);
        g.add(seat, back, cl);
        seats.push({ x: cx, z: cz, facing: a + Math.PI });
      }
      // Market umbrella every other table.
      if ((i + j) % 2 === 0) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.6, 8), metal);
        pole.position.set(tx, 1.3 + 0.2, tz);
        const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.7, 0.6, 8, 1, true), new THREE.MeshStandardMaterial({ color: colors[(i + j) % colors.length], roughness: 0.85, side: THREE.DoubleSide }));
        canopy.position.set(tx, 2.75, tz);
        g.add(pole, canopy);
      }
    }
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  g.position.y = 0.2;
  root.add(g);
  return seats;
}

// ───────── fountain spray ─────────
export class FountainSpray {
  constructor(root, { x = 0, z = 0, y = 0.9, radius = 4.6, jets = 12 }) {
    const N = 1600;
    this.N = N;
    this.data = new Float32Array(N * 4); // angle, t0, jet, speed
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      this.data[i * 4] = ((i % jets) / jets) * Math.PI * 2;
      this.data[i * 4 + 1] = Math.random();
      this.data[i * 4 + 2] = i % 5 === 0 ? 1 : 0; // 1 = central plume
      this.data[i * 4 + 3] = 0.85 + Math.random() * 0.3;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const [c, g] = canvas(64, 64);
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.4, 'rgba(220,240,255,0.6)');
    grd.addColorStop(1, 'rgba(220,240,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.22, map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, opacity: 0.85, color: '#eaf6ff' }));
    this.points.position.set(x, y, z);
    this.points.frustumCulled = false;
    this.radius = radius;
    root.add(this.points);
  }

  update(time) {
    const p = this.points.geometry.attributes.position.array;
    for (let i = 0; i < this.N; i++) {
      const a = this.data[i * 4];
      const t = (time * 0.55 * this.data[i * 4 + 3] + this.data[i * 4 + 1]) % 1;
      if (this.data[i * 4 + 2]) {
        // Central plume: straight up, falls back around the bowl.
        const spread = t * 0.9;
        p[i * 3] = Math.cos(a * 7 + i) * spread;
        p[i * 3 + 1] = 2.2 + t * 6.5 - t * t * 6.5 + 0.0;
        p[i * 3 + 2] = Math.sin(a * 7 + i) * spread;
      } else {
        // Ring jets arcing inward from the rim.
        const r = this.radius * (1 - t * 0.75);
        p[i * 3] = Math.cos(a) * r;
        p[i * 3 + 1] = 0.1 + Math.sin(t * Math.PI) * 2.4;
        p[i * 3 + 2] = Math.sin(a) * r;
      }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}

// ───────── airship ─────────
export function createAirship() {
  const g = new THREE.Group();
  const [c, ctx] = canvas(1024, 256);
  const grd = ctx.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#f4f7fb');
  grd.addColorStop(1, '#9fb3c8');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 1024, 256);
  ctx.fillStyle = '#1b2d6b';
  ctx.fillRect(0, 150, 1024, 26);
  ctx.font = '900 92px Inter, system-ui, sans-serif';
  ctx.fillStyle = '#1b2d6b';
  ctx.textAlign = 'center';
  ctx.fillText('P  PLUDOR', 512, 120);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.MeshStandardMaterial({ map, roughness: 0.35, metalness: 0.2 }));
  body.scale.set(16, 4.2, 4.2);
  body.rotation.y = Math.PI / 2;
  const finMat = new THREE.MeshStandardMaterial({ color: '#1b2d6b', roughness: 0.4 });
  for (let k = 0; k < 4; k++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.25, 4, 3), finMat);
    fin.position.set(0, 0, -14);
    fin.rotation.z = (k * Math.PI) / 2;
    fin.translateY(2.6);
    g.add(fin);
  }
  const gondola = new THREE.Mesh(new THREE.CapsuleGeometry(0.9, 3, 4, 12), new THREE.MeshStandardMaterial({ color: '#222a36', metalness: 0.5, roughness: 0.3 }));
  gondola.rotation.x = Math.PI / 2;
  gondola.position.y = -4.3;
  g.add(body, gondola);
  g.traverse((o) => o.isMesh && (o.castShadow = true));
  // PLUDOR livery on both flanks: a decal bent to hug the hull, glowing at night.
  const [lc, lx] = canvas(1024, 192);
  const grad = lx.createLinearGradient(0, 0, 160, 160);
  grad.addColorStop(0, '#7c5cff');
  grad.addColorStop(1, '#22d3ee');
  lx.fillStyle = grad;
  lx.beginPath();
  if (lx.roundRect) lx.roundRect(40, 16, 160, 160, 36);
  else lx.rect(40, 16, 160, 160);
  lx.fill();
  lx.fillStyle = '#ffffff';
  lx.font = '900 120px Inter, system-ui, sans-serif';
  lx.textAlign = 'center';
  lx.textBaseline = 'middle';
  lx.fillText('P', 120, 100);
  lx.fillStyle = '#16245e';
  lx.textAlign = 'left';
  lx.font = '900 132px Inter, system-ui, sans-serif';
  lx.fillText('PLUDOR', 236, 104);
  const logo = new THREE.CanvasTexture(lc);
  logo.colorSpace = THREE.SRGBColorSpace;
  logo.anisotropy = 8;
  const decalMat = new THREE.MeshStandardMaterial({ map: logo, transparent: true, roughness: 0.4, emissive: '#ffffff', emissiveMap: logo, emissiveIntensity: 0.15, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  g.userData.logoMat = decalMat;
  for (const side of [1, -1]) {
    const geo = new THREE.PlaneGeometry(20, 3.75, 40, 8);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i); // along the hull
      const v = pos.getY(i) + 0.4;
      const r = 1 - (u / 16) ** 2 - (v / 4.2) ** 2;
      const x = 4.2 * Math.sqrt(Math.max(0.0001, r)) + 0.04;
      pos.setXYZ(i, side * x, v, -side * u);
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, decalMat);
    g.add(m);
  }
  return g;
}

// ───────── landmark tower + skyline ─────────
export function createLandmarkTower() {
  const g = new THREE.Group();
  const glass = facadePBR('glass', 77, '#3f6fa8');
  const mk = (w, h, d) => {
    const maps = {};
    for (const k of ['map', 'roughnessMap', 'normalMap', 'emissiveMap']) {
      maps[k] = glass[k].clone();
      maps[k].needsUpdate = true;
      maps[k].repeat.set(Math.max(1, w / 8), Math.max(1, h / 7));
    }
    return new THREE.MeshStandardMaterial({ ...maps, metalnessMap: maps.roughnessMap, roughness: 1, metalness: 1, envMapIntensity: 1.6, emissive: '#bcd8ff', emissiveIntensity: 0 });
  };
  const tiers = [[34, 70, 34], [28, 60, 28], [22, 50, 22], [15, 35, 15]];
  let y = 0;
  const mats = [];
  for (const [w, h, d] of tiers) {
    const m = mk(w, h, d);
    mats.push(m);
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.y = y + h / 2;
    b.castShadow = true;
    g.add(b);
    // chamfer fins
    const fin = new THREE.Mesh(new THREE.BoxGeometry(w + 1, 1.2, d + 1), new THREE.MeshStandardMaterial({ color: '#dfe7ef', metalness: 0.6, roughness: 0.25 }));
    fin.position.y = y + h;
    g.add(fin);
    y += h;
  }
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 2.2, 45, 12), new THREE.MeshStandardMaterial({ color: '#dfe7ef', metalness: 0.8, roughness: 0.2 }));
  spire.position.y = y + 22;
  g.add(spire);
  // Glowing P logo on two faces.
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.fillRect(0, 0, 256, 256);
  ctx.font = '900 210px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('P', 128, 140);
  const logoTex = new THREE.CanvasTexture(c);
  const logoMat = new THREE.MeshBasicMaterial({ map: logoTex, transparent: true, color: '#a8c8ff', depthWrite: false });
  for (const s of [1, -1]) {
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(18, 18), logoMat);
    logo.position.set(0, 150, (s * 28) / 2 + s * 0.2);
    if (s < 0) logo.rotation.y = Math.PI;
    g.add(logo);
  }
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.8, 12, 8), new THREE.MeshBasicMaterial({ color: '#ff4d6d' }));
  beacon.position.y = y + 45;
  beacon.userData.dynamic = true;
  g.add(beacon);
  g.userData.mats = mats;
  g.userData.beacon = beacon;
  return g;
}

export function createSkyline(seed = 5, { inner = 175, outer = 420, count = 46, avoid = [] } = {}) {
  const g = new THREE.Group();
  const r = rand(seed);
  const palettes = ['#3d6b94', '#4b7aa6', '#5d8fb5', '#365d7d', '#6e95b0', '#2f4f6e'];
  const mats = [];
  const matFor = (kind, k) => {
    const key = `${kind}${k}`;
    if (mats[key]) return mats[key];
    const t = facadePBR(kind, 30 + k, kind === 'glass' ? palettes[k % palettes.length] : '#c9c3b8');
    const m = new THREE.MeshStandardMaterial({ map: t.map, roughnessMap: t.roughnessMap, metalnessMap: t.roughnessMap, normalMap: t.normalMap, emissiveMap: t.emissiveMap, emissive: '#ffe2b0', emissiveIntensity: 0, roughness: 1, metalness: 1, envMapIntensity: 1.3 });
    mats[key] = m;
    mats.push(m);
    return m;
  };
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2;
    const dist = inner + r() * (outer - inner);
    const x = Math.cos(a) * dist;
    const z = Math.sin(a) * dist;
    if (z > 110 && z < 200) continue; // keep the river view open
    if (avoid.some(([ax, az, ar]) => Math.hypot(x - ax, z - az) < ar)) continue;
    const w = 18 + r() * 22;
    const d = 18 + r() * 22;
    const h = 40 + r() ** 1.7 * 170;
    const kind = r() < 0.75 ? 'glass' : 'concrete';
    const m = matFor(kind, i % 6).clone();
    for (const k of ['map', 'roughnessMap', 'normalMap', 'emissiveMap']) {
      m[k] = m[k].clone();
      m[k].needsUpdate = true;
      m[k].repeat.set(Math.max(1, Math.round(w / 8)), Math.max(1, Math.round(h / 7)));
    }
    m.metalnessMap = m.roughnessMap;
    mats.push(m);
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, h / 2, z);
    b.rotation.y = r() * Math.PI;
    g.add(b);
    if (h > 120) {
      const crown = new THREE.Mesh(new THREE.BoxGeometry(w * 0.6, 8, d * 0.6), m);
      crown.position.set(x, h + 4, z);
      crown.rotation.y = b.rotation.y;
      g.add(crown);
    }
  }
  g.userData.mats = mats.filter((m) => m.isMaterial);
  return g;
}

// ───────── LED facade screens ─────────
export class LedScreen {
  constructor(w, h, slides) {
    const [c, ctx] = canvas(512, Math.round((512 * h) / w));
    this.c = c;
    this.ctx = ctx;
    this.slides = slides;
    this.tex = new THREE.CanvasTexture(c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false }));
    this.last = -1;
  }

  update(time) {
    const slot = Math.floor(time / 6) % this.slides.length;
    const phase = (time % 6) / 6;
    if (Math.floor(time * 8) === this.last) return;
    this.last = Math.floor(time * 8);
    const s = this.slides[slot];
    const { c, ctx } = this;
    const grd = ctx.createLinearGradient(0, 0, c.width, c.height);
    grd.addColorStop(0, s.bg[0]);
    grd.addColorStop(1, s.bg[1]);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.05 + 0.04 * Math.sin(time * 2 + i)})`;
      ctx.beginPath();
      ctx.arc(((i * 131 + time * 30) % (c.width + 120)) - 60, c.height * (0.3 + 0.15 * Math.sin(time + i)), 40 + i * 12, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = Math.min(1, phase * 6, (1 - phase) * 6);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    const lines = s.lines;
    const size = Math.min(c.width / 6.2, c.height / (lines.length + 1.6));
    ctx.font = `900 ${size}px Inter, system-ui, sans-serif`;
    lines.forEach((l, i) => ctx.fillText(l, c.width * 0.08, c.height * 0.18 + size * (i + 1)));
    if (s.tag) {
      ctx.font = `800 ${size * 0.38}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillText(s.tag, c.width * 0.08, c.height * 0.9);
    }
    ctx.globalAlpha = 1;
    this.tex.needsUpdate = true;
  }
}

export function makeSignMesh(text, sub, accent, w, h) {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: signTexture(text, { sub, accent, bg: '#0f1722' }), transparent: true }));
}
