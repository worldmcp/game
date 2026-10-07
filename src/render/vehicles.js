// City vehicles. A mix of everyday traffic built procedurally (hatchbacks,
// sedans, SUVs, taxis, minibuses, delivery vans, pickups, city buses) plus
// the odd sports car from the glTF model. Every vehicle exposes its wheels
// as named pivots so they roll with speed and the front pair steers.

import * as THREE from 'three';
import { signTexture } from './textures.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// weight: share of traffic; speed: cruising m/s.
export const VEHICLE_TYPES = {
  hatch: { weight: 22, speed: 9, L: 3.9, W: 1.76, belt: 0.92, roof: 1.48, hood: 0.75, ws: 0.75, rw: 0.45, trunk: 0.15, r: 0.31, base: 2.45 },
  sedan: { weight: 22, speed: 10, L: 4.6, W: 1.82, belt: 0.95, roof: 1.45, hood: 1.15, ws: 0.75, rw: 0.6, trunk: 0.85, r: 0.33, base: 2.75 },
  suv: { weight: 14, speed: 10, L: 4.7, W: 1.92, belt: 1.15, roof: 1.82, hood: 1.05, ws: 0.6, rw: 0.3, trunk: 0.15, r: 0.38, base: 2.8 },
  taxi: { weight: 10, speed: 10, base: 2.75, like: 'sedan', color: '#ffc300', sign: 'TAXI' },
  minibus: { weight: 7, speed: 8, L: 5.1, W: 1.98, belt: 1.15, roof: 2.25, hood: 0.45, ws: 0.4, rw: 0.08, trunk: 0.05, r: 0.36, base: 3.1, color: '#ffc300', stripe: '#111' },
  van: { weight: 9, speed: 8.5, L: 5.3, W: 2.02, belt: 1.15, roof: 2.4, hood: 0.7, ws: 0.45, rw: 0.05, trunk: 0.05, r: 0.36, base: 3.3, color: '#f4f5f7', brand: 'PLUDOR EXPRESS' },
  pickup: { weight: 7, speed: 9, L: 5.3, W: 1.95, belt: 1.12, roof: 1.85, hood: 1.15, ws: 0.6, rw: 0.15, trunk: 1.9, r: 0.38, base: 3.2, bed: true },
  bus: { weight: 4, speed: 7.5, L: 11.5, W: 2.5, belt: 1.3, roof: 3.1, hood: 0.15, ws: 0.15, rw: 0.08, trunk: 0.1, r: 0.48, base: 6.2, color: '#1d6fd8', brand: 'PLUDOR TRANSIT', bus: true },
  sports: { weight: 5, speed: 12, glb: true },
};

const PAINTS = ['#e63946', '#f1faee', '#1d3557', '#2a9d8f', '#8d99ae', '#111111', '#adb5bd', '#3a5a40', '#7f5539', '#457b9d', '#c9c3b8', '#6d597a', '#d62828', '#f4a261'];

export function pickVehicleType(rnd) {
  const entries = Object.entries(VEHICLE_TYPES);
  const total = entries.reduce((n, [, t]) => n + t.weight, 0);
  let x = rnd() * total;
  for (const [k, t] of entries) {
    x -= t.weight;
    if (x <= 0) return k;
  }
  return 'sedan';
}

const matCache = new Map();
function paint(color, metal = 0.55, rough = 0.32) {
  const k = `${color}|${metal}|${rough}`;
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshPhysicalMaterial({ color, metalness: metal, roughness: rough, clearcoat: 0.8, clearcoatRoughness: 0.15 }));
  return matCache.get(k);
}
const GLASS = new THREE.MeshPhysicalMaterial({ color: '#22313f', metalness: 0.4, roughness: 0.04, clearcoat: 1, envMapIntensity: 1.6 });
const TRIM = new THREE.MeshStandardMaterial({ color: '#121417', roughness: 0.6 });
const TIRE = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.9 });
const RIM = new THREE.MeshStandardMaterial({ color: '#b9c0c8', metalness: 0.9, roughness: 0.25 });

// Side profile (z along the car, y up) extruded across the width, bevelled
// so edges catch the light.
function extrudeProfile(pts, width, bevel = 0.06) {
  const sh = new THREE.Shape();
  sh.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, steps: 1 });
  // Shape is in (x=z_car, y); extrusion along +z → rotate so length runs on z
  // and width on x, centred.
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.rotateY(-Math.PI / 2); // shape x (car length) → +z (front)
  return g;
}

function wheel(r, w, name, front, x, z) {
  const steer = new THREE.Group();
  steer.name = `wheel-steer-${name}`;
  steer.userData.front = front;
  steer.userData.r = r;
  steer.position.set(x, r, z);
  const spin = new THREE.Group();
  spin.name = `wheel-spin-${name}`;
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 20), TIRE);
  tire.rotation.z = Math.PI / 2;
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.62, r * 0.62, w + 0.02, 16), RIM);
  rim.rotation.z = Math.PI / 2;
  spin.add(tire, rim);
  // Spokes make the rotation readable.
  for (let k = 0; k < 5; k++) {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, r * 1.05, 0.05), RIM);
    sp.rotation.x = (k / 5) * Math.PI;
    spin.add(sp);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.2, r * 0.2, w + 0.06, 8), TRIM);
  hub.rotation.z = Math.PI / 2;
  spin.add(hub);
  steer.add(spin);
  return steer;
}

function lights(g, t, headMat, brakeMat) {
  const z = t.L / 2;
  const y = t.belt - 0.18;
  for (const s of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(t.W * 0.22, 0.12, 0.06), headMat);
    hl.position.set(s * t.W * 0.33, y, z + 0.02);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(t.W * 0.2, 0.12, 0.06), brakeMat);
    tl.position.set(s * t.W * 0.34, y + 0.05, -z - 0.02);
    g.add(hl, tl);
  }
}

function sideSign(text, bg, fg, w, h) {
  const tex = signTexture(text, { sub: '', accent: fg, bg });
  return new THREE.MeshBasicMaterial({ map: tex, transparent: true });
}

// Build a procedural vehicle. Returns a Group facing +Z, wheels on y=0.
export function buildVehicle(type, { color = null, headMat, brakeMat, rnd = Math.random } = {}) {
  let t = { ...VEHICLE_TYPES[type] };
  if (t.like) t = { ...VEHICLE_TYPES[t.like], ...t };
  const g = new THREE.Group();
  g.name = `vehicle-${type}`;
  const col = color || t.color || PAINTS[Math.floor(rnd() * PAINTS.length)];
  const body = paint(col, t.bus ? 0.2 : 0.55);
  const L = t.L;
  const h0 = t.r * 0.95; // body floor
  const z0 = L / 2;
  // Lower body: bumper → hood → beltline → trunk.
  const lower = [[z0, h0], [z0 + 0.02, t.belt - 0.12], [z0 - 0.2, t.belt], [-z0 + 0.15, t.belt], [-z0, t.belt - 0.1], [-z0, h0]];
  g.add(new THREE.Mesh(extrudeProfile(lower, t.W), body));
  // Greenhouse (glass) and roof.
  const fz = z0 - t.hood;
  const rz = -z0 + t.trunk;
  const top = [[fz, t.belt], [fz - t.ws, t.roof], [rz + t.rw, t.roof], [rz, t.belt]];
  if (!t.bed) {
    g.add(new THREE.Mesh(extrudeProfile(top, t.W * 0.9, 0.04), GLASS));
    const roofSlab = new THREE.Mesh(new THREE.BoxGeometry(t.W * 0.9, 0.07, Math.max(0.3, fz - t.ws - (rz + t.rw)) + 0.04), body);
    roofSlab.position.set(0, t.roof + 0.02, (fz - t.ws + rz + t.rw) / 2);
    g.add(roofSlab);
    // Pillars split the glass into windows.
    const nP = t.bus ? 6 : t.L > 5 ? 3 : 2;
    for (let k = 1; k < nP; k++) {
      const z = fz - t.ws + ((rz + t.rw - (fz - t.ws)) * k) / nP;
      const p = new THREE.Mesh(new THREE.BoxGeometry(t.W * 0.92, t.roof - t.belt, 0.08), body);
      p.position.set(0, (t.roof + t.belt) / 2, z);
      g.add(p);
    }
  } else {
    // Pickup: cab + open bed.
    const cabRear = fz - t.ws - 0.9;
    g.add(new THREE.Mesh(extrudeProfile([[fz, t.belt], [fz - t.ws, t.roof], [cabRear, t.roof], [cabRear, t.belt]], t.W * 0.9, 0.04), GLASS));
    const roofSlab = new THREE.Mesh(new THREE.BoxGeometry(t.W * 0.9, 0.07, 0.95), body);
    roofSlab.position.set(0, t.roof + 0.02, cabRear + 0.45);
    const back = new THREE.Mesh(new THREE.BoxGeometry(t.W * 0.92, t.roof - t.belt, 0.08), body);
    back.position.set(0, (t.roof + t.belt) / 2, cabRear);
    g.add(roofSlab, back);
    for (const s of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, -z0 + 0.1 - cabRear + 0.1), body);
      side.position.set(s * (t.W / 2 - 0.05), t.belt + 0.2, (cabRear - z0) / 2);
      g.add(side);
    }
    const gate = new THREE.Mesh(new THREE.BoxGeometry(t.W - 0.1, 0.4, 0.06), body);
    gate.position.set(0, t.belt + 0.2, -z0 + 0.05);
    g.add(gate);
  }
  // Black trim along the sills and bumpers.
  const sill = new THREE.Mesh(new THREE.BoxGeometry(t.W + 0.02, 0.12, L - t.r * 4.2), TRIM);
  sill.position.set(0, h0 + 0.05, 0);
  g.add(sill);
  for (const s of [-1, 1]) {
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(t.W * 0.96, 0.16, 0.12), TRIM);
    bumper.position.set(0, h0 + 0.1, s * (z0 + 0.03));
    g.add(bumper);
  }
  // Taxi light, minibus stripe, van / bus branding.
  if (t.sign) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 0.25), new THREE.MeshStandardMaterial({ color: '#fff7c2', emissive: '#ffd60a', emissiveIntensity: 0.6 }));
    box.position.set(0, t.roof + 0.15, (fz - t.ws + rz + t.rw) / 2);
    g.add(box);
    for (const s of [-1, 1]) {
      const chk = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.1, L * 0.6), TRIM);
      chk.position.set(s * (t.W / 2 + 0.005), t.belt - 0.25, 0);
      g.add(chk);
    }
  }
  if (t.stripe) {
    for (const s of [-1, 1]) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.14, L * 0.92), new THREE.MeshStandardMaterial({ color: t.stripe }));
      st.position.set(s * (t.W / 2 + 0.005), t.belt - 0.2, 0);
      g.add(st);
    }
  }
  if (t.brand) {
    const m = sideSign(t.brand, t.bus ? '#0b3d91' : '#7c5cff', '#ffffff');
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(L * 0.62, (t.belt - h0) * 0.8), m);
      p.rotation.y = s * Math.PI / 2;
      p.position.set(s * (t.W / 2 + 0.012), (t.belt + h0) / 2 + 0.03, -0.1);
      g.add(p);
    }
  }
  if (headMat && brakeMat) lights(g, t, headMat, brakeMat);
  // Wheels (front pair steers). Buses get a second rear axle feel via base.
  const wx = t.W / 2 - 0.2;
  const ww = t.bus ? 0.34 : 0.24;
  const fzW = t.base / 2;
  for (const [n, x, z, front] of [['fl', -wx, fzW, true], ['fr', wx, fzW, true], ['rl', -wx, -fzW, false], ['rr', wx, -fzW, false]]) g.add(wheel(t.r, ww, n, front, x, z));
  compact(g);
  g.userData.type = type;
  g.userData.base = t.base;
  return g;
}

// Plain float, non-indexed copy (the shipped model uses quantised and
// interleaved attributes, which can't be transformed or sliced directly).
function floatGeometry(src) {
  const idx = src.index;
  const n = idx ? idx.count : src.attributes.position.count;
  const g = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(src.attributes)) {
    const k = attr.itemSize;
    const arr = new Float32Array(n * k);
    const get = [attr.getX, attr.getY, attr.getZ, attr.getW];
    for (let i = 0; i < n; i++) {
      const v = idx ? idx.getX(i) : i;
      for (let c = 0; c < k; c++) arr[i * k + c] = get[c].call(attr, v);
    }
    g.setAttribute(name, new THREE.BufferAttribute(arr, k));
  }
  return g;
}

const WHEEL_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.55, roughness: 0.45 });
const colourOf = (m) => (m === TIRE ? [0.02, 0.02, 0.02] : m === TRIM ? [0.03, 0.03, 0.035] : [0.55, 0.58, 0.62]);

// Bake a set of meshes (relative to `root`) into one geometry.
function bake(meshes, root, colour = null) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const geos = meshes.map((m) => {
    let geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    geo.applyMatrix4(inv.clone().multiply(m.matrixWorld));
    if (colour) {
      const c = colour(m.material);
      const n = geo.attributes.position.count;
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) arr.set(c, i * 3);
      geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    }
    return geo;
  });
  return mergeGeometries(geos, false);
}

// Merge a procedural vehicle down to a few draw calls: one mesh per body
// material and one vertex-coloured mesh per wheel.
function compact(g) {
  for (const steer of g.children.filter((c) => c.name?.startsWith('wheel-steer-'))) {
    const spin = steer.children[0];
    const parts = spin.children.filter((c) => c.isMesh);
    const m = new THREE.Mesh(bake(parts, spin, colourOf), WHEEL_MAT);
    for (const p of parts) spin.remove(p);
    spin.add(m);
  }
  const groups = new Map();
  for (const c of [...g.children]) {
    if (!c.isMesh) continue;
    if (!groups.has(c.material)) groups.set(c.material, []);
    groups.get(c.material).push(c);
  }
  for (const [mat, meshes] of groups) {
    const m = new THREE.Mesh(bake(meshes, g), mat);
    m.castShadow = mat !== GLASS;
    for (const x of meshes) g.remove(x);
    g.add(m);
  }
}

// The glTF car ships with its four wheels merged into one mesh. Split them
// back into four pivots (by quadrant) so they can roll and steer.
export function rigGlbWheels(template) {
  template.updateMatrixWorld(true);
  const inv = template.matrixWorld.clone().invert();
  const wheelMeshes = [];
  template.traverse((o) => {
    if (!o.isMesh) return;
    const n = `${o.name} ${o.parent?.name || ''} ${o.material?.name || ''}`;
    if (/wheel|tire|tyre|rim|brake(?!light)|disc/i.test(n)) wheelMeshes.push(o);
  });
  if (!wheelMeshes.length) return false;
  const quads = { fl: [], fr: [], rl: [], rr: [] };
  for (const m of wheelMeshes) {
    const geo = floatGeometry(m.geometry);
    geo.applyMatrix4(inv.clone().multiply(m.matrixWorld));
    const pos = geo.attributes.position;
    const tri = pos.count / 3;
    const buckets = { fl: [], fr: [], rl: [], rr: [] };
    for (let t = 0; t < tri; t++) {
      const cx = (pos.getX(t * 3) + pos.getX(t * 3 + 1) + pos.getX(t * 3 + 2)) / 3;
      const cz = (pos.getZ(t * 3) + pos.getZ(t * 3 + 1) + pos.getZ(t * 3 + 2)) / 3;
      buckets[(cz > 0 ? 'f' : 'r') + (cx < 0 ? 'l' : 'r')].push(t);
    }
    for (const [q, tris] of Object.entries(buckets)) {
      if (!tris.length) continue;
      const sub = new THREE.BufferGeometry();
      for (const [name, attr] of Object.entries(geo.attributes)) {
        const arr = new attr.array.constructor(tris.length * 3 * attr.itemSize);
        tris.forEach((t, i) => {
          for (let v = 0; v < 3; v++) for (let c = 0; c < attr.itemSize; c++) arr[(i * 3 + v) * attr.itemSize + c] = attr.array[(t * 3 + v) * attr.itemSize + c];
        });
        sub.setAttribute(name, new THREE.BufferAttribute(arr, attr.itemSize));
      }
      quads[q].push(new THREE.Mesh(sub, m.material));
    }
    m.parent.remove(m);
  }
  for (const [q, meshes] of Object.entries(quads)) {
    if (!meshes.length) continue;
    const box = new THREE.Box3();
    for (const m of meshes) {
      m.geometry.computeBoundingBox();
      box.union(m.geometry.boundingBox);
    }
    const c = box.getCenter(new THREE.Vector3());
    const steer = new THREE.Group();
    steer.name = `wheel-steer-${q}`;
    steer.userData.front = q[0] === 'f';
    steer.userData.r = (box.max.y - box.min.y) / 2;
    steer.position.copy(c);
    const spin = new THREE.Group();
    spin.name = `wheel-spin-${q}`;
    for (const m of meshes) {
      m.geometry.translate(-c.x, -c.y, -c.z);
      m.castShadow = true;
      spin.add(m);
    }
    steer.add(spin);
    template.add(steer);
  }
  return true;
}

// Wheel pivots of a vehicle instance (cached on the object).
export function wheelsOf(g) {
  if (g.userData.wheels) return g.userData.wheels;
  const out = [];
  g.traverse((o) => {
    if (!o.name?.startsWith('wheel-steer-')) return;
    const spin = o.children.find((c) => c.name?.startsWith('wheel-spin-'));
    if (spin) out.push({ steer: o, spin, front: !!o.userData.front, r: o.userData.r || 0.33 });
  });
  g.userData.wheels = out;
  return out;
}

// Roll the wheels by distance travelled; steer the front pair.
export function updateWheels(g, v, dt, steer = 0) {
  for (const w of wheelsOf(g)) {
    w.spin.rotation.x += (v * dt) / w.r;
    if (w.front) w.steer.rotation.y += (steer - w.steer.rotation.y) * Math.min(1, dt * 8);
  }
}
