// Avatars. High quality: rigged, animated human models (idle / walk / run
// blended by speed, with a procedural wave). Low quality or if the models fail
// to load: a lightweight stylised figure built from shared primitives.

import * as THREE from 'three';
import { loadModel, cloneSkinned } from './assets.js';
import { MODELS } from '../config/assets.js';

let HUMANS = null; // { variants: { name: { scene, scale } }, clips: { idle, walk, run } }
const NATURAL = { walk: 1.45, run: 4.2 }; // metres/second the clips were authored at

// Keep rotations only, so one clip set drives skeletons with different
// proportions (retargeting between rigs that share Mixamo bone names).
function rotationOnly(clip) {
  const c = clip.clone();
  c.tracks = c.tracks.filter((t) => t.name.endsWith('.quaternion'));
  return c;
}

// Retarget rotation tracks between two Mixamo rigs whose bones share names
// but whose rest orientations differ: q_target = restT · restS⁻¹ · q_source.
function retarget(clip, sourceRest, targetRest) {
  const c = clip.clone();
  const C = new THREE.Quaternion();
  const q = new THREE.Quaternion();
  for (const track of c.tracks) {
    const bone = track.name.split('.')[0];
    const rs = sourceRest.get(bone);
    const rt = targetRest.get(bone);
    if (!rs || !rt) continue;
    C.copy(rt).multiply(rs.clone().invert());
    if (Math.abs(C.w) > 0.9995) continue;
    const v = track.values;
    for (let i = 0; i < v.length; i += 4) {
      q.set(v[i], v[i + 1], v[i + 2], v[i + 3]).premultiply(C);
      v[i] = q.x;
      v[i + 1] = q.y;
      v[i + 2] = q.z;
      v[i + 3] = q.w;
    }
  }
  return c;
}

function restPose(scene) {
  const m = new Map();
  scene.traverse((o) => o.isBone && m.set(o.name, o.quaternion.clone()));
  return m;
}

export async function initHumans() {
  const [michelle, soldier] = await Promise.all([loadModel('michelle'), loadModel('soldier')]);
  const byName = (n) => soldier.animations.find((a) => a.name.toLowerCase() === n);
  const base = { idle: rotationOnly(byName('idle')), walk: rotationOnly(byName('walk')), run: rotationOnly(byName('run')) };
  const soldierRest = restPose(soldier.scene);
  const variants = {};
  for (const [name, gltf] of [['michelle', michelle], ['soldier', soldier]]) {
    const clips = {};
    const rest = restPose(gltf.scene);
    for (const [k, clip] of Object.entries(base)) clips[k] = name === 'soldier' ? clip : retarget(clip, soldierRest, rest);
    // Measure standing height with the idle pose applied.
    const probe = cloneSkinned(gltf.scene);
    const mixer = new THREE.AnimationMixer(probe);
    mixer.clipAction(clips.idle).play();
    mixer.update(0);
    probe.updateMatrixWorld(true);
    let footY = Infinity;
    let headY = -Infinity;
    probe.traverse((o) => {
      if (!o.isBone) return;
      const y = o.getWorldPosition(new THREE.Vector3()).y;
      if (/Foot$/.test(o.name)) footY = Math.min(footY, y);
      if (/Head$/.test(o.name)) headY = Math.max(headY, y);
    });
    // Anatomy: ankle ≈ 0.05·h above ground, head joint ≈ 0.91·h.
    const scale = (MODELS[name].height * 0.86) / (headY - footY || 1);
    variants[name] = { scene: gltf.scene, scale, footY, clips };
  }
  HUMANS = { variants };
  return HUMANS;
}

export function humansReady() {
  return !!HUMANS;
}

// ───────────────────────── stylised fallback ─────────────────────────
const G = {
  leg: new THREE.CapsuleGeometry(0.16, 0.55, 3, 8),
  body: new THREE.CapsuleGeometry(0.34, 0.55, 4, 12),
  head: new THREE.SphereGeometry(0.3, 16, 12),
  hair: new THREE.SphereGeometry(0.315, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
  arm: new THREE.CapsuleGeometry(0.11, 0.5, 3, 8),
  ring: new THREE.RingGeometry(0.55, 0.72, 32),
};
const matCache = new Map();
function mat(color, opts = {}) {
  const key = `${color}:${JSON.stringify(opts)}`;
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.65, ...opts }));
  return matCache.get(key);
}
const HAIR = ['#1b1b1f', '#3b2a20', '#6b4423', '#c9a46b', '#2d1f3d'];
const PANTS = ['#2b3445', '#3d3d4a', '#1f2f3a', '#4a3b32'];

function stylised({ color, skin, seed }) {
  const rig = new THREE.Group();
  const pants = mat(PANTS[seed % PANTS.length]);
  const legL = new THREE.Mesh(G.leg, pants);
  const legR = new THREE.Mesh(G.leg, pants);
  legL.position.set(-0.17, 0.45, 0);
  legR.position.set(0.17, 0.45, 0);
  const body = new THREE.Mesh(G.body, mat(color));
  body.position.y = 1.25;
  const armL = new THREE.Mesh(G.arm, mat(color));
  const armR = new THREE.Mesh(G.arm, mat(color));
  armL.position.set(-0.46, 1.3, 0);
  armR.position.set(0.46, 1.3, 0);
  const head = new THREE.Mesh(G.head, mat(skin));
  head.position.y = 2.02;
  const hair = new THREE.Mesh(G.hair, mat(HAIR[seed % HAIR.length]));
  hair.position.y = 2.06;
  hair.rotation.x = -0.25;
  for (const m of [legL, legR, body, armL, armR, head, hair]) {
    m.castShadow = true;
    rig.add(m);
  }
  rig.scale.setScalar(0.85);
  return { rig, parts: { legL, legR, armL, armR, rig } };
}

// ───────────────────────── human ─────────────────────────
function human({ color, seed, variant }) {
  const v = HUMANS.variants[variant] || HUMANS.variants.michelle;
  const model = cloneSkinned(v.scene);
  model.scale.setScalar(v.scale);
  model.position.y = -v.footY * v.scale + 0.05 * MODELS[variant === 'soldier' ? 'soldier' : 'michelle'].height;
  const tint = new THREE.Color(color);
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = false;
    o.frustumCulled = false; // skinned bounds don't follow animation
    const m = o.material.clone();
    if (/visor/i.test(m.name)) {
      m.color = tint.clone();
      m.emissive = tint.clone().multiplyScalar(0.25);
    } else {
      // Subtle per-person clothing tint keeps a crowd from looking cloned.
      m.color = new THREE.Color(1, 1, 1).lerp(tint, variant === 'soldier' ? 0.45 : 0.18);
    }
    o.material = m;
  });
  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const [k, clip] of Object.entries(v.clips)) {
    const a = mixer.clipAction(clip);
    a.play();
    a.setEffectiveWeight(k === 'idle' ? 1 : 0);
    a.time = (seed * 0.37) % clip.duration;
    actions[k] = a;
  }
  let rightArm = null;
  let rightForeArm = null;
  model.traverse((o) => {
    if (o.isBone && /RightArm$/.test(o.name)) rightArm = o;
    if (o.isBone && /RightForeArm$/.test(o.name)) rightForeArm = o;
  });
  return { model, mixer, actions, rightArm, rightForeArm };
}

export function createAvatar({ color = '#39a6df', skin = '#c68642', seed = 0, scale = 1, ring = null, variant = null, quality = 'high' } = {}) {
  const root = new THREE.Group();
  if (HUMANS && quality !== 'low') {
    const h = human({ color, seed, variant: variant || (seed % 2 ? 'soldier' : 'michelle') });
    root.add(h.model);
    root.userData.human = h;
  } else {
    const s = stylised({ color, skin, seed });
    root.add(s.rig);
    root.userData.parts = s.parts;
  }
  if (ring) {
    const r = new THREE.Mesh(G.ring, new THREE.MeshBasicMaterial({ color: ring, transparent: true, opacity: 0.85, depthWrite: false }));
    r.rotation.x = -Math.PI / 2;
    r.position.y = 0.04;
    root.add(r);
    root.userData.ring = r;
  }
  root.scale.setScalar(scale);
  root.userData.phase = (seed * 1.37) % (Math.PI * 2);
  return root;
}

const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

// speed is normalised (metres per second / 6) for backwards compatibility.
export function animateAvatar(avatar, t, speed, emote = null) {
  const ud = avatar.userData;
  const dt = Math.min(0.1, ud.lastT === undefined ? 0 : t - ud.lastT);
  ud.lastT = t;
  if (ud.ring) ud.ring.material.opacity = 0.55 + Math.sin(t * 3) * 0.25;
  const h = ud.human;
  if (h) {
    const v = speed * 6;
    const moving = smooth(0.15, 0.8, v);
    const running = smooth(2.6, 4.6, v);
    h.actions.idle.setEffectiveWeight(1 - moving);
    h.actions.walk.setEffectiveWeight(moving * (1 - running));
    h.actions.run.setEffectiveWeight(moving * running);
    h.actions.walk.timeScale = Math.max(0.6, Math.min(2.2, v / NATURAL.walk));
    h.actions.run.timeScale = Math.max(0.7, Math.min(1.6, v / NATURAL.run));
    h.mixer.update(dt);
    if (emote === 'wave' && h.rightArm) {
      // Raise the right arm and swing the forearm on top of the clip.
      _q.setFromEuler(_e.set(0, 0, 2.2 + Math.sin(t * 2) * 0.05));
      h.rightArm.quaternion.multiply(_q);
      if (h.rightForeArm) h.rightForeArm.quaternion.multiply(_q.setFromEuler(_e.set(0, 0, 0.5 + Math.sin(t * 12) * 0.45)));
    }
    return;
  }
  const { legL, legR, armL, armR, rig } = ud.parts;
  const s = Math.min(1, speed);
  const swing = Math.sin(t * 10 + ud.phase) * 0.7 * s;
  legL.rotation.x = swing;
  legR.rotation.x = -swing;
  armL.rotation.x = -swing * 0.8;
  armR.rotation.x = swing * 0.8;
  armR.rotation.z = 0;
  rig.position.y = Math.abs(Math.sin(t * 10 + ud.phase)) * 0.08 * s;
  if (emote === 'wave') {
    armR.rotation.z = 2.6 + Math.sin(t * 14) * 0.35;
    armR.rotation.x = 0;
  }
}

export function recolorAvatar(avatar, color) {
  const tint = new THREE.Color(color);
  const h = avatar.userData.human;
  if (h) {
    h.model.traverse((o) => {
      if (!o.isMesh) return;
      if (/visor/i.test(o.material.name)) o.material.color.copy(tint);
      else o.material.color = new THREE.Color(1, 1, 1).lerp(tint, 0.3);
    });
    return;
  }
  avatar.traverse((o) => {
    if (o.isMesh && o.material?.color && o.geometry === G.body) o.material = mat(color);
  });
}
