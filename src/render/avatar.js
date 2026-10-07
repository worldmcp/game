// Avatars. High/medium quality: realistic Rocketbox people driven by
// motion-capture clips (idle / walk / run blended by speed, wave and talk
// gestures). Low quality, or before a model has streamed in: a lightweight
// stylised figure that is swapped for the real person once it loads.

import * as THREE from 'three';
import { loadModel, cloneSkinned } from './assets.js';
import { PEOPLE } from '../config/assets.js';
import { sanitizeLook, lookKey } from '../core/look.js';

const NATURAL = { walk: 1.4, run: 3.9 }; // metres/second the clips were captured at
const people = new Map(); // id -> { scene, gender }
const clips = { m: null, f: null };
const waiting = new Map(); // id -> Set(avatar roots awaiting that model)
let QUALITY = 'high';

function rootMotionFree(clip) {
  const c = clip.clone();
  // Keep rotations; keep the pelvis' vertical bob but not its travel.
  c.tracks = c.tracks
    .filter((t) => !/Footsteps|MotionExtraction/.test(t.name))
    .filter((t) => t.name.endsWith('.quaternion') || t.name === 'Bip01.position')
    .map((t) => {
      if (t.name !== 'Bip01.position') return t;
      const v = t.values.slice();
      for (let i = 0; i < v.length; i += 3) {
        v[i] = v[0];
        v[i + 2] = v[2];
      }
      return new THREE.VectorKeyframeTrack(t.name, t.times, v);
    });
  return c;
}

async function loadPerson(id) {
  if (people.has(id)) return people.get(id);
  const def = PEOPLE.find((p) => p.id === id);
  const gltf = await loadModel(id);
  // Builder Joe's welding visor (an alpha-masked mesh) reads as a black box
  // over the face at any distance: people are more fun with faces.
  if (id === 'construction_male_01') gltf.scene.traverse((o) => o.isMesh && /_opacity$/.test(o.material?.name || '') && (o.visible = false));
  const entry = { scene: gltf.scene, gender: def?.gender || 'm' };
  people.set(id, entry);
  for (const av of waiting.get(id) || []) swapIn(av, id);
  waiting.delete(id);
  return entry;
}

// Load animation sets + core people, then stream the rest in the background.
export async function initHumans(quality = 'high', priority = []) {
  QUALITY = quality;
  const [am, af] = await Promise.all([loadModel('anims_m'), loadModel('anims_f')]);
  const pick = (g) => Object.fromEntries(['idle', 'walk', 'run', 'wave', 'talk'].map((n) => [n, rootMotionFree(g.animations.find((a) => a.name === n))]));
  clips.m = pick(am);
  clips.f = pick(af);
  const first = new Set([...PEOPLE.filter((p) => p.core).map((p) => p.id), ...priority.filter(Boolean)]);
  await Promise.all([...first].map((id) => loadPerson(id)));
  const rest = PEOPLE.filter((p) => !first.has(p.id));
  (async () => {
    for (const p of rest) await loadPerson(p.id).catch(() => {});
  })();
}

export function humansReady() {
  return !!clips.m;
}

export function personIds() {
  return PEOPLE.map((p) => p.id);
}

// ───────────────────────── stylised fallback ─────────────────────────
const G = {
  leg: new THREE.CapsuleGeometry(0.13, 0.62, 3, 8),
  body: new THREE.CapsuleGeometry(0.24, 0.42, 4, 12),
  head: new THREE.SphereGeometry(0.13, 16, 12),
  arm: new THREE.CapsuleGeometry(0.07, 0.48, 3, 8),
  ring: new THREE.RingGeometry(0.45, 0.58, 32),
};
const matCache = new Map();
function mat(color) {
  if (!matCache.has(color)) matCache.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.65 }));
  return matCache.get(color);
}
const PANTS = ['#2b3445', '#3d3d4a', '#1f2f3a', '#4a3b32'];

function stylised({ color, skin, seed }) {
  const rig = new THREE.Group();
  const pants = mat(PANTS[seed % PANTS.length]);
  const legL = new THREE.Mesh(G.leg, pants);
  const legR = new THREE.Mesh(G.leg, pants);
  legL.position.set(-0.12, 0.45, 0);
  legR.position.set(0.12, 0.45, 0);
  const body = new THREE.Mesh(G.body, mat(color));
  body.position.y = 1.18;
  const armL = new THREE.Mesh(G.arm, mat(color));
  const armR = new THREE.Mesh(G.arm, mat(color));
  armL.position.set(-0.33, 1.12, 0);
  armR.position.set(0.33, 1.12, 0);
  const head = new THREE.Mesh(G.head, mat(skin));
  head.position.y = 1.66;
  for (const m of [legL, legR, body, armL, armR, head]) {
    m.castShadow = true;
    rig.add(m);
  }
  return { rig, parts: { legL, legR, armL, armR, rig } };
}

// ───────────────────────── realistic person ─────────────────────────
function human(id, seed) {
  const p = people.get(id);
  const model = cloneSkinned(p.scene);
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = false;
    o.frustumCulled = false; // skinned bounds don't follow the animation
  });
  const mixer = new THREE.AnimationMixer(model);
  const set = clips[p.gender] || clips.m;
  const actions = {};
  for (const [k, clip] of Object.entries(set)) {
    const a = mixer.clipAction(clip);
    if (k === 'wave' || k === 'talk') {
      a.setLoop(THREE.LoopRepeat);
      a.enabled = true;
      a.setEffectiveWeight(0);
      a.play();
    } else {
      a.play();
      a.setEffectiveWeight(k === 'idle' ? 1 : 0);
    }
    a.time = (seed * 0.61) % clip.duration;
    actions[k] = a;
  }
  return { model, mixer, actions, gesture: 0 };
}

function swapIn(root, id) {
  const ud = root.userData;
  if (ud.human || QUALITY === 'low') return;
  if (ud.parts) {
    root.remove(ud.parts.rig);
    ud.parts = null;
  }
  const h = human(id, ud.seed);
  root.add(h.model);
  ud.human = h;
  if (ud.look) {
    const look = ud.look;
    ud.lookApplied = null;
    applyLook(root, look, { hi: !!ud.lookHi });
  }
}

// ───────────────────────── customisation (Avatar Studio) ─────────────────────────
// Skin, hair and clothing colours are re-painted into copies of the person's
// textures (shading and detail preserved). A per-person region map, built
// once from the skinned mesh (which bone each vertex follows) and its UVs,
// tells top, bottoms and shoes apart in texture space and carries each
// pixel's height on the body, so patterns wrap the figure like real fabric.
// Height/build scale the rig; hats, eyewear, jewellery, bags and hair
// pieces ride on bones; the aura glows on the ground.

const lookTexCache = new Map();
const anchorCache = new Map();
const regionCache = new Map();

function readPixels(tex, max) {
  const img = tex?.image;
  if (!img || !img.width) return null;
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, c.width, c.height);
  return { c, g, d: g.getImageData(0, 0, c.width, c.height) };
}

const hexRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const rgbHex = (c) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
const lum = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const WHITE = [255, 255, 255];
const BLACK = [10, 10, 14];
// A readable second tone for patterns: lighter on dark garments, darker on light ones.
const contrast = (c) => (lum(...c) > 0.55 ? mix(c, BLACK, 0.55) : mix(c, WHITE, 0.72));

function medianColor(d, pred, step = 7) {
  const rs = [];
  const gs = [];
  const bs = [];
  for (let i = 0; i < d.length; i += 4 * step) {
    if (d[i + 3] < 128) continue;
    if (!pred(d[i], d[i + 1], d[i + 2])) continue;
    rs.push(d[i]);
    gs.push(d[i + 1]);
    bs.push(d[i + 2]);
  }
  if (rs.length < 20) return null;
  const med = (a) => a.sort((x, y) => x - y)[a.length >> 1];
  return [med(rs), med(gs), med(bs)];
}

const dist = (r, g, b, c) => Math.hypot(r - c[0], g - c[1], b - c[2]);

function toTexture(src, px) {
  px.g.putImageData(px.d, 0, 0);
  const t = new THREE.CanvasTexture(px.c);
  t.flipY = src.flipY;
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = src.wrapS;
  t.wrapT = src.wrapT;
  t.anisotropy = 4;
  return t;
}

// Cheap value noise for camo / tie-dye.
function hash(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, y) => vnoise(x, y) * 0.55 + vnoise(x * 2.1, y * 2.1) * 0.3 + vnoise(x * 4.3, y * 4.3) * 0.15;
function hsl(h, s, l) {
  const k = (n) => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

// Pattern colour for a top pixel. u,v: texture coords; h: height on body 0..1.
function patternAt(pattern, base, alt, u, v, h) {
  switch (pattern) {
    case 'stripes':
      return Math.floor(h * 46) % 2 ? alt : base;
    case 'dots': {
      const n = 38;
      const fx = (u * n) % 1;
      const fy = (v * n * 2) % 1;
      return Math.hypot(fx - 0.5, (fy - 0.5) * 0.5) < 0.22 ? alt : base;
    }
    case 'ombre':
      return mix(alt, base, Math.max(0, Math.min(1, (h - 0.5) / 0.38)));
    case 'check':
      return (Math.floor(h * 34) + Math.floor(u * 44)) % 2 ? mix(base, alt, 0.6) : base;
    case 'camo': {
      const n = fbm(u * 9, v * 9);
      return n < 0.42 ? base : n < 0.56 ? mix(base, BLACK, 0.45) : n < 0.68 ? mix(base, [120, 110, 70], 0.5) : mix(base, WHITE, 0.25);
    }
    case 'tiedye': {
      const n = fbm(u * 5, v * 5);
      return mix(hsl((n * 2.2 + h * 2) % 1, 0.85, 0.6), base, 0.35);
    }
    default:
      return base;
  }
}

// Texture-space map of clothing regions (1 top, 2 bottoms, 3 shoes) and
// body height for one person's body texture at W×H.
function regionMap(personId, W, H) {
  const key = `${personId}|${W}x${H}`;
  if (regionCache.has(key)) return regionCache.get(key);
  const base = people.get(personId)?.scene;
  if (!base) return null;
  base.updateMatrixWorld(true);
  const meshes = [];
  base.traverse((o) => o.isSkinnedMesh && /_body$/.test(o.material?.name || '') && o.geometry.attributes.uv && meshes.push(o));
  const v = new THREE.Vector3();
  let ymin = Infinity;
  let ymax = -Infinity;
  const per = meshes.map((o) => {
    o.skeleton.update();
    const g = o.geometry;
    const pos = g.attributes.position;
    const si = g.attributes.skinIndex;
    const sw = g.attributes.skinWeight;
    const bones = o.skeleton.bones;
    const pelvis = bones.find((b) => /Pelvis$/.test(b.name));
    const pelvisY = pelvis ? pelvis.getWorldPosition(new THREE.Vector3()).y : 1;
    const ys = new Float32Array(pos.count);
    const lab = new Uint8Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      o.applyBoneTransform(i, v);
      v.applyMatrix4(o.matrixWorld);
      ys[i] = v.y;
      ymin = Math.min(ymin, v.y);
      ymax = Math.max(ymax, v.y);
      let best = 0;
      let bw = -1;
      const ws = [sw.getX(i), sw.getY(i), sw.getZ(i), sw.getW(i)];
      const is = [si.getX(i), si.getY(i), si.getZ(i), si.getW(i)];
      for (let k = 0; k < 4; k++) {
        if (ws[k] > bw) {
          bw = ws[k];
          best = is[k];
        }
      }
      const nm = bones[best]?.name || '';
      lab[i] = /Foot|Toe/.test(nm) ? 3 : /Thigh|Calf/.test(nm) ? 2 : /Pelvis|Bip01$/.test(nm) ? (v.y < pelvisY - 0.02 ? 2 : 1) : 1;
    }
    return { o, ys, lab };
  });
  if (!per.length) return null;
  const label = new Uint8Array(W * H);
  const hgt = new Uint8Array(W * H);
  const span = Math.max(0.01, ymax - ymin);
  for (const { o, ys, lab } of per) {
    const g = o.geometry;
    const uv = g.attributes.uv;
    const idx = g.index;
    const tri = idx ? idx.count / 3 : uv.count / 3;
    const vi = (t, k) => (idx ? idx.getX(t * 3 + k) : t * 3 + k);
    // A garment is one UV island: vote per island so waistbands, hems and
    // collars take their garment's region, not the nearest bone's.
    const parent = Int32Array.from({ length: uv.count }, (_, i) => i);
    const find = (x) => {
      while (parent[x] !== x) x = parent[x] = parent[parent[x]];
      return x;
    };
    for (let t = 0; t < tri; t++) {
      const a = find(vi(t, 0));
      parent[find(vi(t, 1))] = a;
      parent[find(vi(t, 2))] = a;
    }
    const votes = new Map();
    for (let i = 0; i < uv.count; i++) {
      const r = find(i);
      const v4 = votes.get(r) || [0, 0, 0, 0];
      v4[lab[i]] += 1;
      votes.set(r, v4);
    }
    const islandLab = new Map([...votes].map(([r, v4]) => [r, v4.indexOf(Math.max(...v4))]));
    for (let t = 0; t < tri; t++) {
      const a = vi(t, 0);
      const b = vi(t, 1);
      const c = vi(t, 2);
      const L = islandLab.get(find(a)) || 1;
      const ax = uv.getX(a) * W;
      const ay = uv.getY(a) * H;
      const bx = uv.getX(b) * W;
      const by = uv.getY(b) * H;
      const cx = uv.getX(c) * W;
      const cy = uv.getY(c) * H;
      const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      if (Math.abs(area) < 1e-6) continue;
      const ha = (ys[a] - ymin) / span;
      const hb = (ys[b] - ymin) / span;
      const hc = (ys[c] - ymin) / span;
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx)) - 1);
      const x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)) + 1);
      const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy)) - 1);
      const y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)) + 1);
      const e = -0.04;
      for (let py = y0; py <= y1; py++) {
        for (let px = x0; px <= x1; px++) {
          const sx = px + 0.5;
          const sy = py + 0.5;
          const w0 = ((bx - sx) * (cy - sy) - (by - sy) * (cx - sx)) / area;
          const w1 = ((cx - sx) * (ay - sy) - (cy - sy) * (ax - sx)) / area;
          const w2 = 1 - w0 - w1;
          if (w0 < e || w1 < e || w2 < e) continue;
          const p = py * W + px;
          label[p] = L;
          hgt[p] = Math.max(0, Math.min(255, Math.round((w0 * ha + w1 * hb + w2 * hc) * 255)));
        }
      }
    }
  }
  // Grow regions a few pixels so island seams don't keep the old colour.
  for (let pass = 0; pass < 3; pass++) {
    const src = label.slice();
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const p = y * W + x;
        if (src[p]) continue;
        const n = src[p - 1] ? p - 1 : src[p + 1] ? p + 1 : src[p - W] ? p - W : src[p + W] ? p + W : -1;
        if (n >= 0) {
          label[p] = src[n];
          hgt[p] = hgt[n];
        }
      }
    }
  }
  const out = { label, hgt, W, H };
  regionCache.set(key, out);
  return out;
}

const baseHairCache = new Map();
// The person's own hair colour (for hair pieces when no colour is chosen).
function baseHair(personId, mats) {
  if (baseHairCache.has(personId)) return baseHairCache.get(personId);
  const px = mats.hair?.map ? readPixels(mats.hair.map, 128) : null;
  const c = px ? medianColor(px.d.data, () => true, 2) : null;
  const hexc = c ? rgbHex(c) : '#2e1f17';
  baseHairCache.set(personId, hexc);
  return hexc;
}

// Returns { body, head, hair } replacement textures for this person + look.
function lookTextures(personId, mats, look, max) {
  const key = `${personId}|${look.skin}|${look.hair}|${look.top}|${look.pattern}|${look.bottom}|${look.shoes}|${max}`;
  if (lookTexCache.has(key)) return lookTexCache.get(key);
  const out = {};
  const hairPx = mats.hair?.map ? readPixels(mats.hair.map, max) : null;
  const headPx = mats.head?.map ? readPixels(mats.head.map, max) : null;
  const bodyPx = mats.body?.map ? readPixels(mats.body.map, max) : null;
  const hairRef = hairPx ? medianColor(hairPx.d.data, () => true, 3) : null;
  const skinLike = (r, g, b) => r > g && g >= b * 0.85 && r - b > 18 && lum(r, g, b) > 0.22 && lum(r, g, b) < 0.9 && (!hairRef || dist(r, g, b, hairRef) > 40);
  const skinRef = (headPx && medianColor(headPx.d.data, skinLike)) || (bodyPx && medianColor(bodyPx.d.data, skinLike)) || [200, 150, 120];
  const sL = lum(...skinRef);
  const hL = hairRef ? Math.max(0.05, lum(...hairRef)) : 0.2;
  const skinT = look.skin ? hexRgb(look.skin) : null;
  const hairT = look.hair ? hexRgb(look.hair) : null;
  const garment = { 1: look.top ? hexRgb(look.top) : null, 2: look.bottom ? hexRgb(look.bottom) : null, 3: look.shoes ? hexRgb(look.shoes) : null };
  const patterned = look.top && look.pattern && look.pattern !== 'solid';
  const isSkin = (r, g, b) => dist(r, g, b, skinRef) < 62 && (!hairRef || dist(r, g, b, skinRef) < dist(r, g, b, hairRef));
  const paint = (d, i, t, ref, k) => {
    const L = lum(d[i], d[i + 1], d[i + 2]) / ref;
    for (let c = 0; c < 3; c++) d[i + c] = Math.min(255, d[i + c] * (1 - k) + t[c] * L * k);
  };
  if (headPx && (skinT || hairT)) {
    const d = headPx.d.data;
    for (let i = 0; i < d.length; i += 4) {
      const [r, g, b] = [d[i], d[i + 1], d[i + 2]];
      if (skinT && isSkin(r, g, b)) paint(d, i, skinT, sL, 0.9);
      else if (hairT && hairRef && dist(r, g, b, hairRef) < 55) paint(d, i, hairT, hL, 0.92);
    }
    out.head = toTexture(mats.head.map, headPx);
  }
  if (bodyPx && (skinT || garment[1] || garment[2] || garment[3])) {
    const W = bodyPx.c.width;
    const H = bodyPx.c.height;
    const rm = regionMap(personId, W, H);
    const d = bodyPx.d.data;
    const alt = garment[1] ? contrast(garment[1]) : null;
    // Average brightness of each garment, so the chosen colour comes out
    // true on light and dark fabrics alike.
    const sum = [0, 0, 0, 0];
    const cnt = [0, 0, 0, 0];
    for (let i = 0, p = 0; i < d.length; i += 16, p += 4) {
      if (d[i + 3] < 128 || isSkin(d[i], d[i + 1], d[i + 2])) continue;
      const region = rm ? rm.label[p] : 1;
      sum[region] += lum(d[i], d[i + 1], d[i + 2]);
      cnt[region] += 1;
    }
    const ref = sum.map((v, k) => Math.max(0.08, cnt[k] ? v / cnt[k] : 0.4));
    const dye = (d, i, t, region) => {
      const k = Math.min(1.3, Math.max(0.28, lum(d[i], d[i + 1], d[i + 2]) / ref[region]));
      for (let c = 0; c < 3; c++) d[i + c] = Math.min(255, d[i + c] * 0.12 + t[c] * k * 0.9);
    };
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const [r, g, b] = [d[i], d[i + 1], d[i + 2]];
      if (isSkin(r, g, b)) {
        if (skinT) paint(d, i, skinT, sL, 0.9);
        continue;
      }
      const region = rm ? rm.label[p] : 1;
      let t = garment[region];
      if (!t || lum(r, g, b) < 0.03) continue;
      if (region === 1 && patterned) t = patternAt(look.pattern, t, alt, (p % W) / W, Math.floor(p / W) / H, rm ? rm.hgt[p] / 255 : 0.7);
      dye(d, i, t, region);
    }
    out.body = toTexture(mats.body.map, bodyPx);
  }
  if (hairPx && hairT) {
    const d = hairPx.d.data;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0) paint(d, i, hairT, hL, 0.95);
    out.hair = toTexture(mats.hair.map, hairPx);
  }
  lookTexCache.set(key, out);
  return out;
}

// Anchors measured once per person on the untouched base model: the head
// as drawn (skinned vertices), bones accessories ride on, chest bounds.
function anchorsFor(personId) {
  if (anchorCache.has(personId)) return anchorCache.get(personId);
  const base = people.get(personId)?.scene;
  if (!base) return null;
  base.updateMatrixWorld(true);
  const bones = {};
  base.traverse((o) => {
    if (!o.isBone) return;
    if (/Head$/.test(o.name)) bones.head = o;
    if (/Spine2$/.test(o.name) || (!bones.spine && /Spine1?$/.test(o.name))) bones.spine = o;
    if (/Neck$/.test(o.name)) bones.neck = o;
    if (/Pelvis$/.test(o.name)) bones.pelvis = o;
    if (/L[ _]Forearm$/.test(o.name)) bones.forearm = o;
    if (/L[ _]Hand$/.test(o.name)) bones.hand = o;
    if (/LEye$/.test(o.name)) bones.eyeL = o;
    if (/REye$/.test(o.name)) bones.eyeR = o;
  });
  const box = new THREE.Box3();
  const chest = new THREE.Box3();
  const v = new THREE.Vector3();
  const spineY = bones.spine ? bones.spine.getWorldPosition(new THREE.Vector3()).y : 1.3;
  base.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const n = o.material?.name || '';
    const isHead = /_head$/.test(n);
    const isBody = /_body$/.test(n);
    if (!isHead && !isBody) return;
    o.skeleton.update();
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += isHead ? 3 : 1) {
      v.fromBufferAttribute(pos, i);
      o.applyBoneTransform(i, v);
      v.applyMatrix4(o.matrixWorld);
      if (isHead) box.expandByPoint(v);
      else if (Math.abs(v.y - spineY) < 0.12 && Math.abs(v.x) < 0.24) chest.expandByPoint(v);
    }
  });
  if (!bones.head || box.isEmpty()) return null;
  const at = (b) => (b ? b.getWorldPosition(new THREE.Vector3()) : null);
  const inv = Object.fromEntries(Object.entries(bones).map(([k, b]) => [k, b.matrixWorld.clone().invert()]));
  const a = { bones, inv, box, chest: chest.isEmpty() ? null : chest, pos: Object.fromEntries(Object.entries(bones).map(([k, b]) => [k, at(b)])) };
  anchorCache.set(personId, a);
  return a;
}

const accMat = (color, metal = 0.1, rough = 0.6, extra = {}) => new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough, ...extra });
const GOLD = () => accMat('#d4af37', 1, 0.28, { emissive: '#3a2a00', emissiveIntensity: 0.4 });
const HAT_DEFAULT = { cap: '#111111', beanie: '#e63946', bucket: '#c2b280', fedora: '#3d2b1f', crown: '#d4af37' };

let curlTex = null;
function curls() {
  if (curlTex) return curlTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#9a9a9a';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2200; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const r = 2 + Math.random() * 4;
    const l = 140 + Math.random() * 115;
    g.strokeStyle = `rgb(${l},${l},${l})`;
    g.lineWidth = 1.2;
    g.beginPath();
    g.arc(x, y, r, Math.random() * 6, Math.random() * 6 + 4);
    g.stroke();
  }
  curlTex = new THREE.CanvasTexture(c);
  curlTex.wrapS = curlTex.wrapT = THREE.RepeatWrapping;
  curlTex.repeat.set(3, 3);
  curlTex.colorSpace = THREE.SRGBColorSpace;
  return curlTex;
}
const hairMat = (color) => new THREE.MeshStandardMaterial({ color, map: curls(), bumpMap: curls(), bumpScale: 1.2, roughness: 0.95 });

function ring(r, tube, color, arc = Math.PI * 2) {
  return new THREE.Mesh(new THREE.TorusGeometry(r, tube, 8, 32, arc), color);
}

// Place a box between two points (straps).
function strap(a, b, w, t, m) {
  const len = a.distanceTo(b);
  const s = new THREE.Mesh(new THREE.BoxGeometry(w, len, t), m);
  s.position.copy(a).add(b).multiplyScalar(0.5);
  s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return s;
}

// Accessories in base-model space; returned with the bone they ride on.
function buildAccessories(a, look, hairColor) {
  const out = [];
  const { box } = a;
  const top = box.max.y;
  const cx = (box.min.x + box.max.x) / 2;
  const cz = (box.min.z + box.max.z) / 2;
  const halfW = (box.max.x - box.min.x) / 2;
  // Eyes from the face rig when present (exact), else estimated from the head.
  const eye = a.pos.eyeL && a.pos.eyeR ? a.pos.eyeL.clone().add(a.pos.eyeR).multiplyScalar(0.5) : null;
  const eyeY = eye ? eye.y + 0.004 : top - 0.088;
  const front = eye ? eye.z + 0.056 : box.max.z;
  const head = (g) => out.push([g, 'head']);

  // ── hair pieces ──
  if (look.hairStyle && look.hairStyle !== 'natural' && look.hairStyle !== 'buzz') {
    const g = new THREE.Group();
    const m = hairMat(hairColor);
    if (look.hairStyle === 'afro') {
      const s = new THREE.Mesh(new THREE.SphereGeometry(halfW * 1.42, 28, 20), m);
      s.scale.set(1.05, 0.9, 1);
      s.position.set(cx, top - 0.03, cz - 0.03);
      g.add(s);
    } else if (look.hairStyle === 'puffs') {
      for (const sx of [-1, 1]) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(halfW * 0.62, 20, 14), m);
        s.position.set(cx + sx * halfW * 0.78, top - 0.005, cz - 0.02);
        g.add(s);
      }
    } else if (look.hairStyle === 'bun') {
      const s = new THREE.Mesh(new THREE.SphereGeometry(halfW * 0.5, 20, 14), m);
      s.position.set(cx, top + 0.025, cz - 0.035);
      const band = ring(halfW * 0.36, 0.008, accMat('#222'));
      band.rotation.x = Math.PI / 2;
      band.position.set(cx, top - 0.005, cz - 0.03);
      g.add(s, band);
    } else if (look.hairStyle === 'pony') {
      const tail = new THREE.Mesh(new THREE.CapsuleGeometry(halfW * 0.33, 0.16, 6, 12), m);
      tail.position.set(cx, top - 0.13, cz - halfW * 1.05);
      tail.rotation.x = 0.35;
      const band = ring(halfW * 0.3, 0.008, accMat('#222'));
      band.rotation.x = 0.3;
      band.position.set(cx, top - 0.05, cz - halfW * 0.98);
      g.add(tail, band);
    }
    head(g);
  }

  // ── hats ──
  if (look.hat) {
    const g = new THREE.Group();
    const col = look.hatColor || HAT_DEFAULT[look.hat];
    const m = accMat(col, 0, 0.8);
    const big = look.hairStyle === 'afro' ? 1.25 : 1;
    if (look.hat === 'cap') {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(halfW * 1.12 * big, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), m);
      dome.scale.set(1, 0.75, 1.08);
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(halfW * 0.95, halfW * 0.95, 0.008, 20, 1, false, -Math.PI / 2, Math.PI), m);
      brim.position.set(0, 0.004, halfW * 0.55 * big);
      brim.scale.set(1, 1, 1.1);
      g.add(dome, brim);
      g.position.set(cx, top - 0.075, cz + 0.005);
    } else if (look.hat === 'beanie') {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(halfW * 1.13 * big, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2 + 0.2), accMat(col, 0, 0.95));
      dome.scale.set(1, 0.95, 1.06);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(halfW * 1.16 * big, halfW * 1.16 * big, 0.04, 24), accMat(col, 0, 0.9));
      cuff.position.y = -0.03;
      const pom = new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 8), accMat('#f1f1f1', 0, 1));
      pom.position.y = halfW * 1.08 * big;
      g.add(dome, cuff, pom);
      g.position.set(cx, top - 0.07, cz - 0.005);
    } else if (look.hat === 'bucket') {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(halfW * 1.12 * big, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), m);
      dome.scale.set(1, 0.72, 1.06);
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(halfW * 1.1 * big, halfW * 1.75 * big, 0.045, 28, 1, true), new THREE.MeshStandardMaterial({ color: col, roughness: 0.85, side: THREE.DoubleSide }));
      brim.position.y = -0.02;
      g.add(dome, brim);
      g.position.set(cx, top - 0.07, cz);
    } else if (look.hat === 'fedora') {
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(halfW * 0.92 * big, halfW * 1.08 * big, 0.1, 24), m);
      crown.position.y = 0.04;
      const pinch = new THREE.Mesh(new THREE.SphereGeometry(halfW * 0.93 * big, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), m);
      pinch.scale.y = 0.35;
      pinch.position.y = 0.088;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(halfW * 1.085 * big, halfW * 1.09 * big, 0.022, 24), accMat('#111', 0, 0.6));
      band.position.y = 0.0;
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(halfW * 1.95 * big, halfW * 1.95 * big, 0.007, 32), m);
      brim.position.y = -0.012;
      g.add(crown, pinch, band, brim);
      g.position.set(cx, top - 0.055, cz);
    } else if (look.hat === 'crown') {
      const gold = GOLD();
      const band = new THREE.Mesh(new THREE.CylinderGeometry(halfW * 0.98 * big, halfW * 0.98 * big, 0.04, 24, 1, true), new THREE.MeshStandardMaterial({ color: '#d4af37', metalness: 1, roughness: 0.28, side: THREE.DoubleSide, emissive: '#3a2a00', emissiveIntensity: 0.4 }));
      g.add(band);
      const gem = accMat('#e63946', 0.2, 0.1, { emissive: '#600', emissiveIntensity: 0.6 });
      for (let i = 0; i < 8; i++) {
        const th = (i / 8) * Math.PI * 2;
        const sp = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.05, 6), gold);
        sp.position.set(Math.sin(th) * halfW * 0.98 * big, 0.045, Math.cos(th) * halfW * 0.98 * big);
        const jewel = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), gem);
        jewel.position.set(Math.sin(th) * halfW * 1.0 * big, 0, Math.cos(th) * halfW * 1.0 * big);
        g.add(sp, jewel);
      }
      g.position.set(cx, top - 0.01, cz - 0.01);
    }
    head(g);
  }

  // ── eyewear ──
  if (look.eyes === 'glasses') {
    const g = new THREE.Group();
    const frame = accMat('#141414', 0.7, 0.3);
    const lens = new THREE.MeshStandardMaterial({ color: '#2b3a4a', metalness: 0.2, roughness: 0.05, transparent: true, opacity: 0.55 });
    for (const s of [-1, 1]) {
      const r = ring(0.024, 0.0035, frame);
      r.position.set(s * 0.032, 0, 0);
      const l = new THREE.Mesh(new THREE.CircleGeometry(0.023, 16), lens);
      l.position.set(s * 0.032, 0, -0.001);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.004, 0.1), frame);
      arm.position.set(s * 0.058, 0.004, -0.05);
      g.add(r, l, arm);
    }
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.004, 0.004), frame));
    g.position.set(cx, eyeY, front - 0.028);
    head(g);
  } else if (look.eyes === 'shades') {
    const g = new THREE.Group();
    const frame = accMat('#111', 0.6, 0.3);
    const lens = new THREE.MeshStandardMaterial({ color: '#1a1410', metalness: 0.7, roughness: 0.06, transparent: true, opacity: 0.92, envMapIntensity: 2 });
    const rr = (w, h, r) => {
      const sh = new THREE.Shape();
      sh.moveTo(-w / 2 + r, -h / 2);
      sh.lineTo(w / 2 - r, -h / 2);
      sh.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
      sh.lineTo(w / 2, h / 2 - r * 0.4);
      sh.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
      sh.lineTo(-w / 2 + r, h / 2);
      sh.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r * 0.4);
      sh.lineTo(-w / 2, -h / 2 + r);
      sh.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
      return new THREE.ShapeGeometry(sh, 8);
    };
    for (const s of [-1, 1]) {
      const rim = new THREE.Mesh(rr(0.05, 0.032, 0.013), frame);
      rim.position.set(s * 0.032, 0, -0.001);
      const l = new THREE.Mesh(rr(0.044, 0.026, 0.011), lens);
      l.position.set(s * 0.032, 0, 0.0005);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.005, 0.1), frame);
      arm.position.set(s * 0.06, 0.008, -0.05);
      g.add(rim, l, arm);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.004, 0.004), frame);
    bridge.position.y = 0.008;
    g.add(bridge);
    g.position.set(cx, eyeY, front - 0.026);
    head(g);
  } else if (look.eyes === 'visor') {
    const vis = new THREE.Mesh(new THREE.CylinderGeometry(halfW * 1.1, halfW * 1.1, 0.036, 28, 1, true, -1.0, 2.0), new THREE.MeshStandardMaterial({ color: '#4cc9f0', emissive: '#22b8cf', emissiveIntensity: 1.1, transparent: true, opacity: 0.78, metalness: 0.4, roughness: 0.1, side: THREE.DoubleSide }));
    vis.position.set(cx, eyeY, cz + 0.004);
    head(vis);
  }

  if (look.headphones) {
    const g = new THREE.Group();
    const m = accMat('#1b1b1f', 0.4, 0.4);
    const w = look.hairStyle === 'afro' ? halfW * 1.35 : halfW;
    g.add(ring(w + 0.022, 0.009, m, Math.PI));
    const cupG = new THREE.CylinderGeometry(0.035, 0.035, 0.03, 16);
    for (const s of [-1, 1]) {
      const cup = new THREE.Mesh(cupG, m);
      cup.rotation.z = Math.PI / 2;
      cup.position.set(s * (w + 0.018), 0, 0);
      g.add(cup);
    }
    g.position.set(cx, eyeY - 0.015, cz - 0.01);
    head(g);
  }

  if (look.earrings) {
    const g = new THREE.Group();
    for (const s of [-1, 1]) {
      const hoop = ring(0.013, 0.0025, GOLD());
      hoop.rotation.y = Math.PI / 2;
      hoop.position.set(cx + s * (halfW + 0.006), eyeY - 0.062, cz - 0.004);
      g.add(hoop);
    }
    head(g);
  }

  if (look.chain && a.pos.neck) {
    const g = new THREE.Group();
    const n = a.pos.neck;
    const r = ring(halfW * 0.92, 0.0055, GOLD(), Math.PI * 2);
    r.rotation.x = Math.PI / 2 - 0.45;
    r.scale.set(1, 1.12, 1);
    r.position.set(n.x, n.y - 0.035, n.z + 0.012);
    const pend = new THREE.Mesh(new THREE.OctahedronGeometry(0.014), GOLD());
    pend.position.set(n.x, n.y - 0.085, n.z + halfW * 0.95);
    g.add(r, pend);
    out.push([g, 'neck']);
  }

  if (look.watch && a.pos.forearm && a.pos.hand) {
    const f = a.pos.forearm;
    const h = a.pos.hand;
    const axis = h.clone().sub(f).normalize();
    const g = new THREE.Group();
    const band = ring(0.028, 0.008, accMat('#111', 0.3, 0.5));
    const face = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.03), accMat('#0b0b0b', 0.5, 0.2, { emissive: '#4cc9f0', emissiveIntensity: 0.6 }));
    face.position.set(0, 0, 0.03);
    face.rotation.x = Math.PI / 2;
    g.add(band, face);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
    g.position.copy(f.clone().lerp(h, 0.86));
    out.push([g, 'forearm']);
  }

  if (look.bag && a.bones.spine) {
    const col = look.bagColor || (look.bag === 'backpack' ? '#222222' : '#7f5539');
    const m = accMat(col, 0, 0.85);
    const ch = a.chest;
    const p = a.pos.spine;
    if (look.bag === 'backpack') {
      const g = new THREE.Group();
      const bag = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.38, 0.13), m);
      const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.04), m);
      pocket.position.set(0, -0.08, -0.08);
      g.add(bag, pocket);
      g.position.set(p.x, p.y + 0.02, (ch ? ch.min.z : p.z - 0.13) - 0.07);
      out.push([g, 'spine']);
    } else {
      const g = new THREE.Group();
      const zf = (ch ? ch.max.z : p.z + 0.12) + 0.008;
      const zb = (ch ? ch.min.z : p.z - 0.12) - 0.008;
      const sx = ch ? ch.max.x * 0.62 : 0.12;
      const sy = p.y + 0.16;
      const hip = new THREE.Vector3(-sx * 0.95, p.y - 0.3, 0);
      g.add(strap(new THREE.Vector3(sx, sy, zf), new THREE.Vector3(hip.x, hip.y, zf + 0.01), 0.035, 0.006, m));
      g.add(strap(new THREE.Vector3(sx, sy, zb), new THREE.Vector3(hip.x, hip.y, zb - 0.01), 0.035, 0.006, m));
      // Pouch rests on the front of the hip, where the strap ends.
      const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.05), m);
      pouch.position.set(hip.x * 0.8, hip.y - 0.045, zf + 0.03);
      const flap = new THREE.Mesh(new THREE.BoxGeometry(0.162, 0.055, 0.054), accMat(col, 0, 0.6));
      flap.position.set(hip.x * 0.8, hip.y - 0.008, zf + 0.031);
      g.add(pouch, flap);
      out.push([g, 'spine']);
    }
  }
  return out;
}

let auraTex = null;
function auraTexture() {
  if (auraTex) return auraTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 18, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.55, 'rgba(255,255,255,0.15)');
  grd.addColorStop(0.78, 'rgba(255,255,255,0.9)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  auraTex = new THREE.CanvasTexture(c);
  return auraTex;
}

// Apply (or clear, with null) a look on an avatar. Cheap to call repeatedly.
export function applyLook(root, look, { hi = false } = {}) {
  const ud = root.userData;
  look = sanitizeLook(look);
  ud.look = look;
  ud.lookHi = hi;
  const key = lookKey(look) + (hi ? 'H' : '');
  const h = ud.human;
  if (!h || ud.lookApplied === key) return;
  ud.lookApplied = key;
  const personId = ud.person;
  // Restore originals first.
  h.model.traverse((o) => {
    if (!o.isMesh) return;
    if (o.userData.origMat) o.material = o.userData.origMat;
    if (o.userData.lookHidden) {
      o.visible = true;
      o.userData.lookHidden = false;
    }
  });
  for (const acc of h.acc || []) acc.parent?.remove(acc);
  h.acc = [];
  ud.aura = null;
  h.baseScale ||= h.model.scale.clone();
  h.model.scale.copy(h.baseScale);
  if (!look) return;
  h.model.scale.set(h.baseScale.x * look.build, h.baseScale.y * look.height, h.baseScale.z * look.build);
  const mats = {};
  h.model.traverse((o) => {
    if (!o.isMesh) return;
    const n = o.material.name || '';
    if (/_body$/.test(n)) mats.body = o.material;
    else if (/_head$/.test(n)) mats.head = o.material;
    else if (/_opacity$/.test(n)) mats.hair = o.material;
  });
  if (look.skin || look.hair || look.top || look.bottom || look.shoes) {
    const tx = lookTextures(personId, mats, look, hi ? 1024 : 512);
    const clones = new Map();
    h.model.traverse((o) => {
      if (!o.isMesh) return;
      const n = o.material.name || '';
      const which = /_body$/.test(n) ? 'body' : /_head$/.test(n) ? 'head' : /_opacity$/.test(n) ? 'hair' : null;
      if (!which || !tx[which]) return;
      if (!clones.has(o.material)) {
        const m = o.material.clone();
        m.map = tx[which];
        clones.set(o.material, m);
      }
      o.userData.origMat ||= o.material;
      o.material = clones.get(o.material);
    });
  }
  // Hair pieces and short cuts replace the modelled hair cards.
  if (look.hairStyle && look.hairStyle !== 'natural') {
    h.model.traverse((o) => {
      if (o.isMesh && /_opacity$/.test(o.material.name || '') && o.visible) {
        o.visible = false;
        o.userData.lookHidden = true;
      }
    });
  }
  if (look.aura) {
    const aura = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), new THREE.MeshBasicMaterial({ map: auraTexture(), color: look.aura, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    aura.rotation.x = -Math.PI / 2;
    aura.position.y = 0.035;
    aura.renderOrder = 2;
    root.add(aura);
    h.acc.push(aura);
    ud.aura = aura;
  }
  const a = anchorsFor(personId);
  if (!a) return;
  const boneByName = {};
  h.model.traverse((o) => {
    if (!o.isBone) return;
    for (const [k, b] of Object.entries(a.bones)) if (o.name === b.name) boneByName[k] = o;
  });
  for (const [obj, where] of buildAccessories(a, look, look.hair || baseHair(personId, mats))) {
    const bone = boneByName[where];
    if (!bone) continue;
    obj.updateMatrix();
    const rel = a.inv[where].clone().multiply(obj.matrix);
    obj.matrixAutoUpdate = false;
    obj.matrix.copy(rel);
    obj.traverse((c) => {
      if (c.isMesh) {
        c.castShadow = true;
        c.frustumCulled = false;
      }
    });
    bone.add(obj);
    h.acc.push(obj);
  }
}

export function pickPerson(seed, { gender = null, prefer = null } = {}) {
  if (prefer && PEOPLE.some((p) => p.id === prefer)) return prefer;
  const pool = PEOPLE.filter((p) => !gender || p.gender === gender);
  return pool[Math.abs(seed) % pool.length].id;
}

export function createAvatar({ color = '#39a6df', skin = '#c68642', seed = 0, ring = null, person = null, quality = 'high' } = {}) {
  const root = new THREE.Group();
  const id = person || pickPerson(seed);
  root.userData.seed = seed;
  root.userData.person = id;
  if (quality !== 'low' && people.has(id) && clips.m) {
    const h = human(id, seed);
    root.add(h.model);
    root.userData.human = h;
  } else {
    const s = stylised({ color, skin, seed });
    root.add(s.rig);
    root.userData.parts = s.parts;
    if (quality !== 'low') {
      if (!waiting.has(id)) waiting.set(id, new Set());
      waiting.get(id).add(root);
    }
  }
  if (ring) {
    const r = new THREE.Mesh(G.ring, new THREE.MeshBasicMaterial({ color: ring, transparent: true, opacity: 0.85, depthWrite: false }));
    r.rotation.x = -Math.PI / 2;
    r.position.y = 0.04;
    root.add(r);
    root.userData.ring = r;
  }
  root.userData.phase = (seed * 1.37) % (Math.PI * 2);
  return root;
}

// Change which person an avatar shows (e.g. the player picks a new look).
export function setPerson(root, id) {
  if (root.userData.person === id) return;
  root.userData.aura?.parent?.remove(root.userData.aura);
  root.userData.aura = null;
  const h = root.userData.human;
  if (h) {
    root.remove(h.model);
    root.userData.human = null;
  }
  root.userData.person = id;
  root.userData.lookApplied = null;
  if (people.has(id)) swapIn(root, id);
  else {
    const s = stylised({ color: '#39a6df', skin: '#c68642', seed: root.userData.seed });
    root.add(s.rig);
    root.userData.parts = s.parts;
    loadPerson(id).then(() => swapIn(root, id)).catch(() => {});
  }
}

const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// speed is normalised (metres per second / 6). emote: 'wave' | 'talk' | null
export function animateAvatar(avatar, t, speed, emote = null) {
  const ud = avatar.userData;
  const dt = Math.min(0.1, ud.lastT === undefined ? 0 : t - ud.lastT);
  ud.lastT = t;
  if (ud.ring) ud.ring.material.opacity = 0.55 + Math.sin(t * 3) * 0.25;
  if (ud.aura) {
    ud.aura.rotation.z = t * 0.6;
    ud.aura.material.opacity = 0.65 + Math.sin(t * 2.2) * 0.3;
  }
  const h = ud.human;
  if (h) {
    const v = speed * 6;
    const moving = smooth(0.15, 0.9, v);
    const running = smooth(2.4, 4.4, v);
    // Gestures fade in only while standing still.
    const target = emote && moving < 0.2 ? 1 : 0;
    h.gesture += (target - h.gesture) * Math.min(1, dt * 5);
    if (emote && emote !== h.gestureName) {
      h.gestureName = emote;
      h.actions[emote]?.reset();
    }
    const gw = h.gesture;
    const gName = h.gestureName;
    h.actions.idle.setEffectiveWeight((1 - moving) * (1 - gw));
    h.actions.walk.setEffectiveWeight(moving * (1 - running));
    h.actions.run.setEffectiveWeight(moving * running);
    h.actions.wave.setEffectiveWeight(gName === 'wave' ? gw * (1 - moving) : 0);
    h.actions.talk.setEffectiveWeight(gName === 'talk' ? gw * (1 - moving) : 0);
    h.actions.walk.timeScale = Math.max(0.6, Math.min(2.4, v / NATURAL.walk));
    h.actions.run.timeScale = Math.max(0.7, Math.min(1.7, v / NATURAL.run));
    h.mixer.update(dt);
    if (ud.sit) applySit(h);
    return;
  }
  const { legL, legR, armL, armR, rig } = ud.parts;
  const s = Math.min(1, speed * 1.5);
  const swing = Math.sin(t * 9 + ud.phase) * 0.6 * s;
  legL.rotation.x = swing;
  legR.rotation.x = -swing;
  armL.rotation.x = -swing * 0.8;
  armR.rotation.x = swing * 0.8;
  armR.rotation.z = 0;
  rig.position.y = Math.abs(Math.sin(t * 9 + ud.phase)) * 0.05 * s;
  if (emote === 'wave') {
    armR.rotation.z = 2.6 + Math.sin(t * 14) * 0.35;
    armR.rotation.x = 0;
  }
}

export function recolorAvatar(avatar, color) {
  // Realistic people keep their clothing; the identity colour lives on the ring.
  avatar.userData.ring?.material.color.set(color);
}

// Seated pose layered on the idle clip: hips and knees bent ~90°.
// Axes follow the Biped rig (bend about each bone's local Z).
export const SIT_POSE = { thigh: [0, 0, 1, 1.45], calf: [0, 0, 1, -1.5], spine: [0, 0, 1, 0.08] };
const _q = new THREE.Quaternion();
function applySit(h) {
  if (!h.sitBones) {
    h.sitBones = {};
    h.model.traverse((o) => {
      if (!o.isBone) return;
      if (/L[ _]Thigh$/.test(o.name)) h.sitBones.tl = o;
      if (/R[ _]Thigh$/.test(o.name)) h.sitBones.tr = o;
      if (/L[ _]Calf$/.test(o.name)) h.sitBones.cl = o;
      if (/R[ _]Calf$/.test(o.name)) h.sitBones.cr = o;
      if (/Spine$/.test(o.name)) h.sitBones.sp = o;
    });
  }
  const b = h.sitBones;
  const rot = (bone, [x, y, z, a]) => bone && bone.quaternion.multiply(_q.setFromAxisAngle(new THREE.Vector3(x, y, z), a));
  rot(b.tl, SIT_POSE.thigh);
  rot(b.tr, SIT_POSE.thigh);
  rot(b.cl, SIT_POSE.calf);
  rot(b.cr, SIT_POSE.calf);
  rot(b.sp, SIT_POSE.spine);
}

// Head-and-shoulders portrait (data URL) for HUD cards — with the
// player's look (colours, hair, hat, eyewear…) when one is given.
const portraitCache = new Map();
export function portraitOf(renderer, id, look = null) {
  const ck = look ? `${id}|${lookKey(look)}` : id;
  if (portraitCache.has(ck)) return portraitCache.get(ck);
  const p = people.get(id);
  if (!p || !renderer || !clips.m) return null;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#2a3d5c');
  scene.add(new THREE.HemisphereLight('#ffffff', '#445566', 2.2));
  const key = new THREE.DirectionalLight('#fff3e0', 2.4);
  key.position.set(1, 2, 3);
  scene.add(key);
  const root = new THREE.Group();
  const hm = human(id, 0);
  root.add(hm.model);
  root.userData = { person: id, human: hm, seed: 0 };
  if (look) applyLook(root, look);
  const m = hm.model;
  hm.mixer.update(0.5);
  scene.add(root);
  root.updateMatrixWorld(true);
  let head = null;
  m.traverse((o) => o.isBone && /Head$/.test(o.name) && (head = o));
  const hp = head ? head.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(0, 1.6, 0);
  const cam = new THREE.PerspectiveCamera(28, 1, 0.05, 10);
  cam.position.set(hp.x, hp.y + 0.02, hp.z + 0.95);
  cam.lookAt(hp.x, hp.y - 0.04, hp.z);
  const rt = new THREE.WebGLRenderTarget(128, 128);
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(rt);
  renderer.render(scene, cam);
  const px = new Uint8Array(128 * 128 * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, 128, 128, px);
  renderer.setRenderTarget(prev);
  rt.dispose();
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const img = g.createImageData(128, 128);
  for (let y = 0; y < 128; y++) img.data.set(px.subarray((127 - y) * 512, (128 - y) * 512), y * 512);
  g.putImageData(img, 0, 0);
  const url = c.toDataURL('image/jpeg', 0.85);
  portraitCache.set(ck, url);
  if (portraitCache.size > 120) portraitCache.delete(portraitCache.keys().next().value);
  return url;
}

// Debug/QA: the clothing-region map for a person as a data URL
// (red top, green bottoms, blue shoes), plus timings.
export function regionDebug(personId, size = 512) {
  const t0 = performance.now();
  const rm = regionMap(personId, size, size);
  const t1 = performance.now();
  if (!rm) return null;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const col = { 1: [230, 60, 60], 2: [60, 200, 90], 3: [70, 110, 240] };
  for (let p = 0; p < rm.label.length; p++) {
    const k = col[rm.label[p]] || [0, 0, 0];
    img.data.set([k[0], k[1], k[2], 255], p * 4);
  }
  g.putImageData(img, 0, 0);
  return { url: c.toDataURL(), ms: t1 - t0 };
}
