// Asset loading: GLTF + meshopt, cached, normalised to real-world scale.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { MODELS } from '../config/assets.js';

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const cache = new Map();

export function loadModel(name) {
  if (!MODELS[name]) return Promise.reject(new Error(`Unknown model ${name}`));
  if (!cache.has(name)) {
    cache.set(name, loader.loadAsync(MODELS[name].url).then((gltf) => {
      gltf.scene.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      return gltf;
    }));
  }
  return cache.get(name);
}

// Product instance scaled so its largest dimension equals `size` metres
// (or the manifest size) and resting on y=0, centred on x/z.
export async function productInstance(name, size) {
  const gltf = await loadModel(name);
  return fitObject(gltf.scene.clone(true), size ?? MODELS[name].size);
}

export function fitObject(obj, size) {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const dim = box.getSize(new THREE.Vector3());
  const s = size / Math.max(dim.x, dim.y, dim.z);
  obj.scale.multiplyScalar(s);
  obj.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(obj);
  const c = b2.getCenter(new THREE.Vector3());
  obj.position.x -= c.x;
  obj.position.z -= c.z;
  obj.position.y -= b2.min.y;
  const wrap = new THREE.Group();
  wrap.add(obj);
  return wrap;
}

export function cloneSkinned(scene) {
  return SkeletonUtils.clone(scene);
}

export function preload(names, onEach) {
  let done = 0;
  return Promise.all(names.map((n) => loadModel(n).catch((e) => {
    console.warn(`asset ${n} failed`, e);
    return null;
  }).finally(() => onEach?.(++done / names.length))));
}
