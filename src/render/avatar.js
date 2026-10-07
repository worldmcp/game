// Avatars. High/medium quality: realistic Rocketbox people driven by
// motion-capture clips (idle / walk / run blended by speed, wave and talk
// gestures). Low quality, or before a model has streamed in: a lightweight
// stylised figure that is swapped for the real person once it loads.

import * as THREE from 'three';
import { loadModel, cloneSkinned } from './assets.js';
import { PEOPLE } from '../config/assets.js';

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
