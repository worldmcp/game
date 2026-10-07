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
// Skin tone, hair and outfit colours are re-painted into copies of the
// person's textures (shading and detail preserved); height/build scale the
// rig; accessories ride on the head and spine bones.

const lookTexCache = new Map();
const anchorCache = new Map();

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
const lum = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

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

// Returns { body, head, hair } replacement textures for this person + look.
function lookTextures(personId, mats, look, max) {
  const key = `${personId}|${look.skin}|${look.hair}|${look.top}|${max}`;
  if (lookTexCache.has(key)) return lookTexCache.get(key);
  const out = {};
  const hairPx = mats.hair?.map ? readPixels(mats.hair.map, max) : null;
  const headPx = mats.head?.map ? readPixels(mats.head.map, max) : null;
  const bodyPx = mats.body?.map ? readPixels(mats.body.map, max) : null;
  const hairRef = hairPx ? medianColor(hairPx.d, () => true, 3) : null;
  const skinLike = (r, g, b) => r > g && g >= b * 0.85 && r - b > 18 && lum(r, g, b) > 0.22 && lum(r, g, b) < 0.9 && (!hairRef || dist(r, g, b, hairRef) > 40);
  const skinRef = (headPx && medianColor(headPx.d, skinLike)) || (bodyPx && medianColor(bodyPx.d, skinLike)) || [200, 150, 120];
  const sL = lum(...skinRef);
  const hL = hairRef ? Math.max(0.05, lum(...hairRef)) : 0.2;
  const skinT = look.skin ? hexRgb(look.skin) : null;
  const hairT = look.hair ? hexRgb(look.hair) : null;
  const topT = look.top ? hexRgb(look.top) : null;
  const isSkin = (r, g, b) => dist(r, g, b, skinRef) < 62 && (!hairRef || dist(r, g, b, skinRef) < dist(r, g, b, hairRef));
  const paint = (d, i, t, ref, mix) => {
    const L = lum(d[i], d[i + 1], d[i + 2]) / ref;
    for (let c = 0; c < 3; c++) d[i + c] = Math.min(255, d[i + c] * (1 - mix) + t[c] * L * mix);
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
  if (bodyPx && (skinT || topT)) {
    const d = bodyPx.d.data;
    for (let i = 0; i < d.length; i += 4) {
      const [r, g, b] = [d[i], d[i + 1], d[i + 2]];
      if (isSkin(r, g, b)) {
        if (skinT) paint(d, i, skinT, sL, 0.9);
      } else if (topT && lum(r, g, b) > 0.06) {
        // Outfit: colourise, brighter fabric keeps its highlights.
        const L = lum(r, g, b);
        for (let c = 0; c < 3; c++) d[i + c] = Math.min(255, d[i + c] * 0.28 + topT[c] * Math.min(1.5, 0.35 + L * 1.25) * 0.72);
      }
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

// Head/spine anchors measured once per person on the untouched base model.
function anchorsFor(personId) {
  if (anchorCache.has(personId)) return anchorCache.get(personId);
  const base = people.get(personId)?.scene;
  if (!base) return null;
  base.updateMatrixWorld(true);
  let head = null;
  let spine = null;
  base.traverse((o) => {
    if (!o.isBone) return;
    if (/Head$/.test(o.name)) head = o;
    if (/Spine2$/.test(o.name) || (!spine && /Spine1?$/.test(o.name))) spine = o;
  });
  // Measure the head as it is actually drawn: skinned vertex positions.
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  base.traverse((o) => {
    if (!o.isSkinnedMesh || !/_head$/.test(o.material?.name || '')) return;
    o.skeleton.update();
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 3) {
      v.fromBufferAttribute(pos, i);
      o.applyBoneTransform(i, v);
      box.expandByPoint(v.applyMatrix4(o.matrixWorld));
    }
  });
  if (!head || box.isEmpty()) return null;
  const a = { head, spine, box, headInv: head.matrixWorld.clone().invert(), spineInv: spine ? spine.matrixWorld.clone().invert() : null, spinePos: spine ? spine.getWorldPosition(new THREE.Vector3()) : null };
  anchorCache.set(personId, a);
  return a;
}

const accMat = (color, metal = 0.1, rough = 0.6) => new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough });

// Accessories in base-model space; returned with the bone they ride on.
function buildAccessories(a, look) {
  const out = [];
  const { box } = a;
  const top = box.max.y;
  const cx = (box.min.x + box.max.x) / 2;
  const cz = (box.min.z + box.max.z) / 2;
  const halfW = (box.max.x - box.min.x) / 2;
  const front = box.max.z;
  const eyeY = top - 0.088;
  if (look.glasses) {
    const g = new THREE.Group();
    const frame = accMat('#141414', 0.7, 0.3);
    const lens = new THREE.MeshStandardMaterial({ color: '#2b3a4a', metalness: 0.2, roughness: 0.05, transparent: true, opacity: 0.55 });
    for (const s of [-1, 1]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.0035, 6, 20), frame);
      ring.position.set(s * 0.032, 0, 0);
      const l = new THREE.Mesh(new THREE.CircleGeometry(0.023, 16), lens);
      l.position.set(s * 0.032, 0, -0.001);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.004, 0.1), frame);
      arm.position.set(s * 0.058, 0.004, -0.05);
      g.add(ring, l, arm);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.004, 0.004), frame);
    g.add(bridge);
    g.position.set(cx, eyeY, front - 0.028);
    out.push([g, 'head']);
  }
  if (look.cap) {
    const g = new THREE.Group();
    const m = accMat(look.cap, 0, 0.8);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(halfW * 1.12, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), m);
    dome.scale.set(1, 0.75, 1.08);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(halfW * 0.95, halfW * 0.95, 0.008, 20, 1, false, -Math.PI / 2, Math.PI), m);
    brim.position.set(0, 0.004, halfW * 0.55);
    brim.scale.set(1, 1, 1.1);
    g.add(dome, brim);
    g.position.set(cx, top - 0.075, cz + 0.005);
    out.push([g, 'head']);
  }
  if (look.headphones) {
    const g = new THREE.Group();
    const m = accMat('#1b1b1f', 0.4, 0.4);
    const band = new THREE.Mesh(new THREE.TorusGeometry(halfW + 0.022, 0.009, 6, 24, Math.PI), m);
    band.position.y = 0;
    const cupG = new THREE.CylinderGeometry(0.035, 0.035, 0.03, 16);
    for (const s of [-1, 1]) {
      const cup = new THREE.Mesh(cupG, m);
      cup.rotation.z = Math.PI / 2;
      cup.position.set(s * (halfW + 0.018), 0, 0);
      g.add(cup);
    }
    g.add(band);
    g.position.set(cx, eyeY - 0.015, cz - 0.01);
    out.push([g, 'head']);
  }
  if (look.backpack && a.spine) {
    const g = new THREE.Group();
    const m = accMat(look.backpack, 0, 0.85);
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.38, 0.13), m);
    const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.04), m);
    pocket.position.set(0, -0.08, -0.08);
    g.add(bag, pocket);
    const p = a.spinePos;
    g.position.set(p.x, p.y + 0.02, p.z - 0.2);
    out.push([g, 'spine']);
  }
  return out;
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
    if (o.isMesh && o.userData.origMat) o.material = o.userData.origMat;
  });
  for (const acc of h.acc || []) acc.parent?.remove(acc);
  h.acc = [];
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
  if (look.skin || look.hair || look.top) {
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
  const a = anchorsFor(personId);
  if (!a) return;
  let headBone = null;
  let spineBone = null;
  h.model.traverse((o) => {
    if (!o.isBone) return;
    if (o.name === a.head.name) headBone = o;
    if (a.spine && o.name === a.spine.name) spineBone = o;
  });
  for (const [obj, where] of buildAccessories(a, look)) {
    const bone = where === 'head' ? headBone : spineBone;
    if (!bone) continue;
    obj.updateMatrix();
    const rel = (where === 'head' ? a.headInv : a.spineInv).clone().multiply(obj.matrix);
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

// Head-and-shoulders portrait (data URL) for HUD cards.
const portraitCache = new Map();
export function portraitOf(renderer, id) {
  if (portraitCache.has(id)) return portraitCache.get(id);
  const p = people.get(id);
  if (!p || !renderer) return null;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#2a3d5c');
  scene.add(new THREE.HemisphereLight('#ffffff', '#445566', 2.2));
  const key = new THREE.DirectionalLight('#fff3e0', 2.4);
  key.position.set(1, 2, 3);
  scene.add(key);
  const m = cloneSkinned(p.scene);
  const mixer = new THREE.AnimationMixer(m);
  mixer.clipAction((clips[p.gender] || clips.m).idle).play();
  mixer.update(0.5);
  scene.add(m);
  m.updateMatrixWorld(true);
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
  portraitCache.set(id, url);
  return url;
}
