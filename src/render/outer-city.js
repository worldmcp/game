// The city beyond the playable district: the road grid keeps going, bridges
// carry the avenues over the river, and every block is built up with
// futuristic high-rises (setbacks, lit crowns, spires) and the odd park. It's
// all merged into a handful of meshes, so it costs a few draw calls.
//
// Districts open later: road exits from the playable area carry
// "opening soon" barriers instead of dead-ending in grass.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { facadePBR, asphaltPBR, signTexture } from './textures.js';

function rand(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// Box whose side UVs are scaled to its real size, so window grids keep their
// proportions after merging (roof gets a flat corner of the texture).
function sizedBox(w, h, d, x, y, z, tileW = 8, tileH = 7) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z (4 verts each)
  const faces = [[d, h], [d, h], null, null, [w, h], [w, h]];
  for (let f = 0; f < 6; f++)
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      if (!faces[f]) {
        uv.setXY(i, 0.02, 0.02);
        continue;
      }
      uv.setXY(i, uv.getX(i) * Math.max(1, Math.round(faces[f][0] / tileW)), uv.getY(i) * Math.max(1, Math.round(faces[f][1] / tileH)));
    }
  g.translate(x, y, z);
  return g;
}

export function createOuterCity({ half = 110, extent = 330, roadWidth = 10, river = { z0: 114, z1: 152 }, quality = 'high', exits = [] } = {}) {
  const root = new THREE.Group();
  root.name = 'outer-city';
  const r = rand(2026);
  const lines = [-extent, -275, -225, -175, -125, -75, -25, 25, 75, 125, 175, 225, 275, extent];
  const roadsAt = lines.slice(1, -1);
  const out = { group: root, windowMats: [], nightMats: [] };

  // ── roads beyond the district (the district builds its own inside ±125) ──
  const a = asphaltPBR();
  const roadMat = (rx, ry) => {
    const m = new THREE.MeshStandardMaterial({ map: a.map.clone(), normalMap: a.normalMap.clone(), roughness: 0.95 });
    for (const t of [m.map, m.normalMap]) {
      t.needsUpdate = true;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(rx, ry);
    }
    return m;
  };
  const roadGeos = [];
  const walkGeos = [];
  const inRiver = (z0, z1) => z1 > river.z0 && z0 < river.z1;
  const strip = (x0, x1, z0, z1, y = 0.01) => {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
    g.rotateX(-Math.PI / 2);
    g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
    // world-space UVs so asphalt tiles evenly
    const uv = g.attributes.uv;
    const p = g.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / 12, p.getZ(i) / 12);
    return g;
  };
  const W2 = roadWidth / 2;
  for (const c of roadsAt) {
    const inner = Math.abs(c) < 125; // the district already paves |coord| ≤ 125
    // north–south avenue at x = c (stops at the river; bridges carry it over)
    if (inner) roadGeos.push(strip(c - W2, c + W2, -extent, -125), strip(c - W2, c + W2, river.z1, extent));
    else roadGeos.push(strip(c - W2, c + W2, -extent, river.z0), strip(c - W2, c + W2, river.z1, extent));
    // east–west street at z = c
    if (inRiver(c - W2, c + W2)) continue;
    if (inner) roadGeos.push(strip(-extent, -125, c - W2, c + W2), strip(125, extent, c - W2, c + W2));
    else roadGeos.push(strip(-extent, extent, c - W2, c + W2));
  }
  const roads = new THREE.Mesh(mergeGeometries(roadGeos), roadMat(1, 1));
  roads.receiveShadow = true;
  root.add(roads);

  // ── bridges over the river for every north–south avenue ──
  const deckMat = new THREE.MeshStandardMaterial({ color: '#8c939b', roughness: 0.8 });
  const railMat = new THREE.MeshStandardMaterial({ color: '#d9dee3', roughness: 0.4, metalness: 0.6 });
  const bridgeGeos = [];
  const railGeos = [];
  for (const c of roadsAt) {
    const len = river.z1 - river.z0 + 2;
    const zc = (river.z0 + river.z1) / 2;
    bridgeGeos.push(sizedBox(roadWidth + 3, 0.6, len, c, 0.05, zc));
    for (const s of [-1, 1]) {
      railGeos.push(sizedBox(0.15, 1, len, c + s * (roadWidth / 2 + 1.3), 0.85, zc));
      // cable-stay pylons on the main avenues
      if (Math.abs(c) === 25 || Math.abs(c) === 75) railGeos.push(sizedBox(0.6, 16, 0.6, c + s * (roadWidth / 2 + 1.3), 8, zc));
    }
    // piers
    for (const z of [river.z0 + 9, river.z1 - 9]) bridgeGeos.push(sizedBox(3, 6, 2.2, c, -3, z));
  }
  root.add(new THREE.Mesh(mergeGeometries(bridgeGeos), deckMat), new THREE.Mesh(mergeGeometries(railGeos), railMat));
  const deckRoad = [];
  for (const c of roadsAt) deckRoad.push(strip(c - W2, c + W2, river.z0 - 1, river.z1 + 1, 0.37));
  root.add(new THREE.Mesh(mergeGeometries(deckRoad), roadMat(1, 1)));

  // ── blocks ──
  const kinds = [
    { kind: 'glass', base: '#3f6fa8' }, { kind: 'glass', base: '#2f5f7f' }, { kind: 'glass', base: '#4b6f96' },
    { kind: 'glass', base: '#24435f' }, { kind: 'concrete', base: '#c9c3b8' }, { kind: 'brick', base: '#9c4f3c' },
  ];
  const buckets = kinds.map(() => []);
  const crownGeos = [];
  const spireGeos = [];
  const parkGeos = [];
  const trees = [];
  const sideGeos = [];
  for (let i = 0; i < lines.length - 1; i++)
    for (let j = 0; j < lines.length - 1; j++) {
      const x0 = lines[i] + W2;
      const x1 = lines[i + 1] - W2;
      const z0 = lines[j] + W2;
      const z1 = lines[j + 1] - W2;
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      if (Math.abs(cx) < half + 10 && Math.abs(cz) < half + 10) continue; // playable district
      let zz0 = z0;
      if (inRiver(z0, z1)) {
        if (z1 < river.z1 + 12) continue;
        zz0 = river.z1 + 2;
      }
      sideGeos.push(strip(x0, x1, zz0, z1, 0.08));
      const dist = Math.max(Math.abs(cx), Math.abs(cz));
      if (r() < 0.1) {
        parkGeos.push(strip(x0 + 2, x1 - 2, z0 + 2, z1 - 2, 0.1));
        for (let k = 0; k < 10; k++) trees.push([x0 + 4 + r() * (x1 - x0 - 8), z0 + 4 + r() * (z1 - z0 - 8)]);
        continue;
      }
      // Split the block into 1–4 lots.
      const splitX = x1 - x0 > 30 && r() < 0.7;
      const splitZ = z1 - z0 > 30 && r() < 0.7;
      const xs = splitX ? [x0 + 2, (x0 + x1) / 2 - 1, (x0 + x1) / 2 + 1, x1 - 2] : [x0 + 2, x1 - 2];
      const zs = splitZ && z1 - zz0 > 30 ? [zz0 + 2, (zz0 + z1) / 2 - 1, (zz0 + z1) / 2 + 1, z1 - 2] : [zz0 + 2, z1 - 2];
      for (let a = 0; a < xs.length; a += 2)
        for (let b = 0; b < zs.length; b += 2) {
          const w = xs[a + 1] - xs[a];
          const d = zs[b + 1] - zs[b];
          const bx = (xs[a] + xs[a + 1]) / 2;
          const bz = (zs[b] + zs[b + 1]) / 2;
          // Taller towards the centre line of view, with occasional supertalls.
          const tall = r() < 0.12;
          const h = (tall ? 90 + r() * 110 : 22 + r() * 60) * (dist > 250 ? 1.2 : 1);
          const k = Math.floor(r() * kinds.length);
          const tiers = h > 60 ? 2 + Math.floor(r() * 2) : 1;
          let y = 0;
          let tw = w;
          let td = d;
          for (let t = 0; t < tiers; t++) {
            const th = t === tiers - 1 ? h - y : h * (t === 0 ? 0.55 : 0.25);
            buckets[k].push(sizedBox(tw, th, td, bx, y + th / 2, bz));
            y += th;
            tw *= 0.78;
            td *= 0.78;
          }
          // Lit crown ring and occasional spire.
          crownGeos.push(sizedBox(tw / 0.78 + 0.3, 0.5, td / 0.78 + 0.3, bx, y - 1.2, bz));
          if (tall && r() < 0.7) spireGeos.push(sizedBox(0.5, 18 + r() * 20, 0.5, bx, y + 12, bz));
        }
    }
  kinds.forEach((kd, idx) => {
    if (!buckets[idx].length) return;
    const t = facadePBR(kd.kind, 40 + idx, kd.base);
    const opts = { emissive: '#ffe2b0', emissiveIntensity: 0, roughness: 1, metalness: kd.kind === 'glass' ? 1 : 0, envMapIntensity: 1.2 };
    for (const key of ['map', 'roughnessMap', 'normalMap', 'emissiveMap']) {
      const tx = t[key].clone();
      tx.needsUpdate = true;
      tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
      tx.repeat.set(1, 1);
      opts[key] = tx;
    }
    if (kd.kind === 'glass') opts.metalnessMap = opts.roughnessMap;
    const m = new THREE.MeshStandardMaterial(opts);
    out.windowMats.push(m);
    const mesh = new THREE.Mesh(mergeGeometries(buckets[idx]), m);
    mesh.receiveShadow = true;
    root.add(mesh);
  });
  const crownMat = new THREE.MeshStandardMaterial({ color: '#cfe8ff', emissive: '#7cc7ff', emissiveIntensity: 0.3 });
  out.nightMats.push({ mat: crownMat, day: 0.3, night: 2.2 });
  if (crownGeos.length) root.add(new THREE.Mesh(mergeGeometries(crownGeos), crownMat));
  const spireMat = new THREE.MeshStandardMaterial({ color: '#c8d0d8', metalness: 0.8, roughness: 0.3, emissive: '#ff4060', emissiveIntensity: 0.2 });
  out.nightMats.push({ mat: spireMat, day: 0.2, night: 1.6 });
  if (spireGeos.length) root.add(new THREE.Mesh(mergeGeometries(spireGeos), spireMat));
  const walk = new THREE.Mesh(mergeGeometries(sideGeos), new THREE.MeshStandardMaterial({ color: '#b9b4ab', roughness: 0.9 }));
  walk.receiveShadow = true;
  root.add(walk);
  if (parkGeos.length) root.add(new THREE.Mesh(mergeGeometries(parkGeos), new THREE.MeshStandardMaterial({ color: '#4f7f3a', roughness: 1 })));
  if (trees.length) {
    const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2.4, 1), new THREE.MeshStandardMaterial({ color: '#3d6e34', roughness: 1, flatShading: quality === 'low' }), trees.length);
    const m4 = new THREE.Matrix4();
    trees.forEach(([x, z], i) => crown.setMatrixAt(i, m4.makeTranslation(x, 4, z)));
    root.add(crown);
  }

  // ── "opening soon" barriers where roads leave the playable district ──
  const fenceMat = new THREE.MeshStandardMaterial({ color: '#ff8a00', roughness: 0.6 });
  const stripeMat = new THREE.MeshStandardMaterial({ color: '#f5f5f5', roughness: 0.6 });
  for (const e of exits) {
    const g = new THREE.Group();
    for (const s of [-1, 0, 1]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(3, 1, 0.5), s === 0 ? stripeMat : fenceMat);
      bar.position.set(s * 3.1, 0.6, 0);
      g.add(bar);
    }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.75), new THREE.MeshBasicMaterial({ map: signTexture('NEXT DISTRICT', { sub: 'Opening soon · lots available', accent: '#ff8a00', bg: '#111827' }), side: THREE.DoubleSide }));
    sign.position.set(0, 2.4, 0);
    g.add(sign);
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.4, 6), stripeMat);
      post.position.set(s * 3.3, 1.2, 0);
      g.add(post);
    }
    g.position.set(e.x, 0, e.z);
    g.rotation.y = e.ry;
    root.add(g);
  }
  return out;
}
