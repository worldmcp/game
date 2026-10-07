// Asset loading: GLTF + meshopt, cached, normalised to real-world scale.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { MODELS } from '../config/assets.js';

const loader = new GLTFLoader();
// meshopt needs WebAssembly; web bundles ship decoded models and skip it.
const decoderReady = globalThis.PLUDOR_SAFE_TEXTURES
  ? Promise.resolve()
  : import('three/addons/libs/meshopt_decoder.module.js').then((m) => loader.setMeshoptDecoder(m.MeshoptDecoder)).catch(() => {});
// Locked-down hosts (strict CSP) may refuse fetch() of blob: URLs, which the
// default ImageBitmapLoader uses for embedded textures. <img> works there.
if (globalThis.PLUDOR_SAFE_TEXTURES) {
  loader.register((parser) => {
    parser.textureLoader = new THREE.TextureLoader(parser.options.manager);
    return { name: 'pludor_safe_textures' };
  });
}
const cache = new Map();
export const assetErrors = [];

// Web bundles ship each .glb as base64 text (served everywhere as text/plain).
async function fetchModel(url) {
  await decoderReady;
  if (!url.endsWith('.b64.txt')) return loader.loadAsync(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const bin = atob((await res.text()).trim());
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return loader.parseAsync(bytes.buffer, url.slice(0, url.lastIndexOf('/') + 1));
}

export function loadModel(name) {
  if (!MODELS[name]) return Promise.reject(new Error(`Unknown model ${name}`));
  if (!cache.has(name)) {
    cache.set(name, fetchModel(MODELS[name].url).catch((e) => {
      assetErrors.push(`${name}: ${e?.message || e}`);
      cache.delete(name);
      throw e;
    }).then((gltf) => {
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
  const o = fitObject(gltf.scene.clone(true), size ?? MODELS[name].size);
  o.userData.product = name;
  return o;
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
