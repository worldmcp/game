// Walk-in interiors. Every enterable building gets a furnished room built
// from its kind (café, restaurant, store, salon, repair shop, creator studio,
// community lounge, classroom, AI lab, arcade, transit hall, cinema with live
// screens, player home, player shop). Rooms are generated, not hand-modelled,
// so new businesses get an interior for free.
//
// Interiors share the building's x/z footprint and sit below the city at
// INTERIOR_Y, so a player's server-side position stays truthful (they are
// "in" the building) and no teleport is needed to walk in or out.
// Coordinates here are LOCAL: x across the façade, z depth, door at +z.

import * as THREE from 'three';
import { productInstance } from './assets.js';
import { tileTexture, screenTexture, drawCinemaFrame } from './textures.js';

export const INTERIOR_Y = -60;

const box = new THREE.BoxGeometry(1, 1, 1);
const cyl = new THREE.CylinderGeometry(1, 1, 1, 24);
const sphere = new THREE.SphereGeometry(1, 16, 12);
const plane = new THREE.PlaneGeometry(1, 1);
const matCache = new Map();

function M(color, { rough = 0.75, metal = 0, emissive = null, ei = 1, map = null } = {}) {
  const key = `${color}|${rough}|${metal}|${emissive}|${ei}|${map ? map.uuid : ''}`;
  if (!matCache.has(key)) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, map });
    if (emissive) {
      m.emissive.set(emissive);
      m.emissiveIntensity = ei;
    }
    matCache.set(key, m);
  }
  return matCache.get(key);
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, repeat = null) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

let woodTex = null;
function woodFloor(w, d) {
  if (!woodTex) {
    const [c, g] = canvas(512, 512);
    const tones = ['#9b6a43', '#8a5c38', '#a87650', '#7f5534', '#b07d55'];
    for (let row = 0; row < 8; row++) {
      let x = (row % 2) * -90;
      while (x < 512) {
        const len = 160 + ((row * 37 + x) % 120);
        g.fillStyle = tones[(row * 3 + Math.abs(x)) % tones.length];
        g.fillRect(x, row * 64, len, 64);
        g.globalAlpha = 0.12;
        for (let k = 0; k < 6; k++) {
          g.fillStyle = k % 2 ? '#000' : '#fff';
          g.fillRect(x, row * 64 + 6 + k * 9, len, 2);
        }
        g.globalAlpha = 1;
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect(x, row * 64, 2, 64);
        x += len;
      }
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fillRect(0, row * 64, 512, 2);
    }
    woodTex = tex(c);
    woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping;
  }
  const t = woodTex.clone();
  t.needsUpdate = true;
  t.repeat.set(w / 4, d / 4);
  return t;
}

function boardTexture(title, lines, { bg = '#14181f', fg = '#fff', accent = '#ffcf8a', w = 1024, h = 512 } = {}) {
  const [c, g] = canvas(w, h);
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = accent;
  g.lineWidth = 10;
  g.strokeRect(14, 14, w - 28, h - 28);
  g.fillStyle = accent;
  g.font = `900 ${Math.round(h * 0.13)}px Inter, system-ui, sans-serif`;
  g.textAlign = 'center';
  g.fillText(title, w / 2, h * 0.2);
  g.textAlign = 'left';
  const rows = lines.slice(0, 7);
  const lh = (h * 0.72) / Math.max(5, rows.length);
  g.font = `600 ${Math.round(lh * 0.55)}px Inter, system-ui, sans-serif`;
  rows.forEach((l, i) => {
    const y = h * 0.34 + i * lh;
    const [left, right] = Array.isArray(l) ? l : [l, ''];
    g.fillStyle = fg;
    g.fillText(String(left).slice(0, 34), 54, y);
    if (right) {
      g.textAlign = 'right';
      g.fillStyle = accent;
      g.fillText(String(right), w - 54, y);
      g.textAlign = 'left';
    }
  });
  return tex(c);
}

// Animated "LIVE" tile for entertainment screens.
class LiveTile {
  constructor(handle, viewers, hue) {
    [this.c, this.g] = canvas(384, 216);
    this.t = tex(this.c);
    this.handle = handle;
    this.viewers = viewers;
    this.hue = hue;
    this.last = -1;
  }

  update(time) {
    const f = Math.floor(time * 6);
    if (f === this.last) return;
    this.last = f;
    const { c, g } = this;
    const grd = g.createLinearGradient(0, 0, c.width, c.height);
    grd.addColorStop(0, `hsl(${(this.hue + time * 8) % 360},70%,35%)`);
    grd.addColorStop(1, `hsl(${(this.hue + 60 + time * 8) % 360},75%,18%)`);
    g.fillStyle = grd;
    g.fillRect(0, 0, c.width, c.height);
    // A performer silhouette that sways, plus stage lights.
    for (let i = 0; i < 3; i++) {
      g.fillStyle = `rgba(255,255,255,${0.08 + 0.06 * Math.sin(time * 3 + i)})`;
      g.beginPath();
      g.moveTo(60 + i * 130, 0);
      g.lineTo(20 + i * 130 + Math.sin(time + i) * 30, c.height);
      g.lineTo(110 + i * 130 + Math.sin(time + i) * 30, c.height);
      g.fill();
    }
    const sway = Math.sin(time * 2.2 + this.hue) * 8;
    g.fillStyle = 'rgba(10,10,20,0.85)';
    g.beginPath();
    g.arc(c.width / 2 + sway, 92, 24, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.ellipse(c.width / 2 + sway * 0.6, 190, 52, 70, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ff2d55';
    g.beginPath();
    g.roundRect ? g.roundRect(12, 12, 78, 30, 8) : g.rect(12, 12, 78, 30);
    g.fill();
    g.fillStyle = '#fff';
    g.font = '800 18px Inter, system-ui, sans-serif';
    g.fillText('● LIVE', 20, 33);
    g.font = '700 18px Inter, system-ui, sans-serif';
    g.fillText(`👁 ${this.viewers + Math.floor(Math.sin(time / 3) * 7 + 7)}`, 100, 33);
    g.fillText(`@${this.handle}`, 14, c.height - 14);
    this.t.needsUpdate = true;
  }
}

// ─────────────────────────────────────────────────────────────────────────

export function interiorKindFor(place) {
  if (!place || place.walkable) return null;
  const byId = { 'kicks-co': 'shoes', 'casa-nova': 'furniture', 'lumi-salon': 'salon', 'fixit-repair': 'repair' };
  return byId[place.id] || { cafe: 'cafe', restaurant: 'restaurant', store: 'shoes', service: 'repair', creator: 'creator', community: 'community', education: 'classroom', ai: 'ai', games: 'arcade', transit: 'transit', media: 'cinema', foodcourt: 'foodcourt', apartments: 'apartments', hotel: 'hotel', conference: 'conference', cowork: 'cowork', supermarket: 'supermarket' }[place.kind] || 'lounge';
}

// spec: { key, kind, w, d, name, accent, menu?: [[name, price]], owner?: string }
export function buildInterior(spec) {
  const W = Math.max(8, spec.w - 0.6);
  const D = Math.max(8, spec.d - 0.6);
  const big = W * D > 500;
  const H = big ? 7 : 4.4;
  const g = new THREE.Group();
  const out = { group: g, w: W, d: D, h: H, colliders: [], obstacles: [], spots: [], staff: [], tickers: [], kind: spec.kind };
  const accent = spec.accent || '#7c5cff';

  const add = (geo, mat, sx, sy, sz, x, y, z, ry = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  const solid = (x, z, hw, hd) => out.colliders.push({ x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd });
  const post = (x, z, r) => out.obstacles.push([x, z, r]);
  const spot = (x, z, label, sub, acts, r = 2.2) => out.spots.push({ x, z, label, sub, acts, r });
  const product = (name, size, x, y, z, ry = 0) => {
    productInstance(name, size).then((o) => {
      o.position.set(x, y, z);
      o.rotation.y = ry;
      o.traverse((c) => c.isMesh && (c.castShadow = false));
      g.add(o);
    }).catch(() => {});
  };

  // ── shell: floor, walls with a door gap at +z, ceiling, lights ──
  const floorMat = ['cafe', 'restaurant', 'furniture', 'apartments', 'home', 'lounge', 'community', 'classroom', 'hotel', 'cowork'].includes(spec.kind)
    ? new THREE.MeshStandardMaterial({ map: woodFloor(W, D), roughness: 0.55 })
    : new THREE.MeshStandardMaterial({ map: (() => {
      const t = tileTexture(spec.kind === 'arcade' || spec.kind === 'cinema' ? '#2a2236' : '#b9bec4', spec.kind === 'arcade' || spec.kind === 'cinema' ? '#231c2e' : '#a7adb4', 8).clone();
      t.needsUpdate = true;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(W / 6, D / 6);
      return t;
    })(), roughness: 0.35 });
  add(box, floorMat, W, 0.2, D, 0, 0.1, 0);
  const wallCol = { apartments: '#e6e1d8', foodcourt: '#2b2238', hotel: '#e9dfcf', conference: '#121c2b', cowork: '#e7ece4', supermarket: '#f4f6f2', cafe: '#efe4d3', restaurant: '#5b2e2a', shoes: '#f2f2f0', furniture: '#ece6dc', salon: '#f7e9ef', repair: '#dfe5da', creator: '#262038', community: '#1f3b4a', classroom: '#eef2ee', ai: '#141a33', arcade: '#16101f', transit: '#e7eef0', cinema: '#140f18', home: '#efe7dc', shop: '#f2f0ec', lounge: '#e8e4ee' }[spec.kind] || '#eeeeee';
  const wallMat = M(wallCol, { rough: 0.9 });
  const T = 0.3;
  const door = 2.6;
  add(box, wallMat, W + T * 2, H, T, 0, H / 2, -D / 2 - T / 2); // back
  add(box, wallMat, T, H, D, -W / 2 - T / 2, H / 2, 0); // left
  add(box, wallMat, T, H, D, W / 2 + T / 2, H / 2, 0); // right
  const seg = (W - door) / 2;
  add(box, wallMat, seg + T, H, T, -(door / 2 + seg / 2) - T / 2, H / 2, D / 2 + T / 2); // front left
  add(box, wallMat, seg + T, H, T, door / 2 + seg / 2 + T / 2, H / 2, D / 2 + T / 2); // front right
  add(box, wallMat, door, H - 3, T, 0, 3 + (H - 3) / 2, D / 2 + T / 2); // over door
  solid(0, -D / 2 - T / 2, W / 2 + T, T / 2);
  solid(-W / 2 - T / 2, 0, T / 2, D / 2);
  solid(W / 2 + T / 2, 0, T / 2, D / 2);
  solid(-(door / 2 + seg / 2), D / 2 + T / 2, seg / 2 + 0.05, T / 2);
  solid(door / 2 + seg / 2, D / 2 + T / 2, seg / 2 + 0.05, T / 2);
  const base = M('#2b2f36', { rough: 0.6 });
  add(box, base, W, 0.14, 0.04, 0, 0.27, -D / 2 + 0.02);
  add(box, M(spec.kind === 'cinema' || spec.kind === 'arcade' || spec.kind === 'ai' ? '#0d0b12' : '#fbfaf7', { rough: 0.95 }), W + T * 2, 0.2, D + T * 2, 0, H + 0.1, 0);
  // Ceiling light panels.
  const lightMat = M('#ffffff', { emissive: spec.kind === 'arcade' || spec.kind === 'cinema' ? accent : '#fff4e0', ei: spec.kind === 'arcade' || spec.kind === 'cinema' ? 1.2 : 2 });
  for (let x = -W / 2 + 3; x <= W / 2 - 2.9; x += Math.max(4, W / 4))
    for (let z = -D / 2 + 3; z <= D / 2 - 2.9; z += Math.max(4, D / 3)) add(box, lightMat, 1.6, 0.05, 0.6, x, H - 0.03, z);
  // Door: frame, glowing street view outside and an EXIT sign.
  add(box, M('#1b1f24', { metal: 0.6, rough: 0.35 }), 0.12, 3, 0.4, -door / 2, 1.5, D / 2 + T / 2);
  add(box, M('#1b1f24', { metal: 0.6, rough: 0.35 }), 0.12, 3, 0.4, door / 2, 1.5, D / 2 + T / 2);
  const street = add(plane, new THREE.MeshBasicMaterial({ color: '#cfe3f3', side: THREE.DoubleSide }), door + 0.4, 3.2, 1, 0, 1.6, D / 2 + T + 0.6);
  out.streetMat = street.material;
  const exitTex = boardTexture('EXIT', [], { bg: '#0b6e3a', accent: '#ffffff', w: 256, h: 96 });
  add(plane, new THREE.MeshBasicMaterial({ map: exitTex, toneMapped: false }), 0.9, 0.34, 1, 0, 3.3, D / 2 - 0.02, Math.PI);
  // Door mat.
  add(box, M('#3a3f46', { rough: 1 }), 2.2, 0.03, 1.2, 0, 0.21, D / 2 - 0.8);
  spot(0, D / 2 - 1.1, 'Exit to street', spec.name, [{ id: 'exit', icon: '🚪', label: 'Exit', action: { type: 'exit' } }], 1.3);
  // Name on the back wall.
  const nameTex = boardTexture(spec.name, [], { bg: wallCol, accent, w: 1024, h: 180 });
  add(plane, new THREE.MeshBasicMaterial({ map: nameTex, transparent: false }), Math.min(W * 0.5, 8), Math.min(W * 0.5, 8) * 0.176, 1, 0, H - 0.75, -D / 2 + 0.02);

  const zBack = -D / 2;
  const sit = (x, z, ry = 0, color = '#7a5236') => {
    add(box, M(color, { rough: 0.7 }), 0.46, 0.06, 0.46, x, 0.68, z, ry);
    const back = add(box, M(color, { rough: 0.7 }), 0.46, 0.5, 0.05, x - Math.sin(ry) * 0.22, 0.93, z - Math.cos(ry) * 0.22, ry);
    back.castShadow = false;
    add(cyl, M('#2b2f35', { metal: 0.7, rough: 0.4 }), 0.03, 0.46, 0.03, x, 0.43, z);
  };
  const table = (x, z, r = 0.45, color = '#e9e4da') => {
    add(cyl, M(color, { rough: 0.35 }), r, 0.05, r, x, 0.95, z);
    add(cyl, M('#2b2f35', { metal: 0.7, rough: 0.4 }), 0.05, 0.75, 0.05, x, 0.58, z);
    post(x, z, r + 0.05);
  };
  const counter = (x, z, w, d, color = '#3b2f2a', top = '#e9e4da') => {
    add(box, M(color, { rough: 0.6 }), w, 1.0, d, x, 0.7, z);
    add(box, M(top, { rough: 0.25 }), w + 0.08, 0.06, d + 0.08, x, 1.23, z);
    solid(x, z, w / 2, d / 2);
  };
  const shelf = (x, z, w, ry, items) => {
    const s = new THREE.Group();
    const wood = M('#d8cfc2', { rough: 0.7 });
    for (const y of [0.5, 1.15, 1.8]) {
      const b = new THREE.Mesh(box, wood);
      b.scale.set(w, 0.05, 0.5);
      b.position.set(0, y, 0);
      s.add(b);
    }
    const back = new THREE.Mesh(box, M('#ffffff', { rough: 0.9 }));
    back.scale.set(w, 2.2, 0.04);
    back.position.set(0, 1.1, -0.24);
    s.add(back);
    // A warm LED strip under each shelf.
    for (const y of [1.1, 1.75]) {
      const l = new THREE.Mesh(box, M('#fff', { emissive: '#ffe6b0', ei: 1.4 }));
      l.scale.set(w - 0.1, 0.02, 0.03);
      l.position.set(0, y, 0.2);
      s.add(l);
    }
    s.position.set(x, 0.2, z);
    s.rotation.y = ry;
    g.add(s);
    const n = Math.max(2, Math.floor(w / 0.8));
    items.forEach(([name, size], k) => {
      const row = k % 3;
      const col = Math.floor(k / 3) % n;
      const lx = -w / 2 + (w / n) * (col + 0.5);
      const wx = x + Math.cos(ry) * lx;
      const wz = z - Math.sin(ry) * lx;
      product(name, size, wx, 0.2 + [0.53, 1.18, 1.83][row], wz, ry);
    });
    const c = Math.abs(Math.sin(ry)) > 0.5;
    solid(x, z, c ? 0.3 : w / 2, c ? w / 2 : 0.3);
  };
  const plant = (x, z, s = 1.3) => {
    add(cyl, M('#7d756b', { rough: 0.8 }), 0.32, 0.5, 0.28, x, 0.45, z);
    product('plant', s, x, 0.7, z);
    post(x, z, 0.4);
  };
  const pendant = (x, z, color = '#ffd27a') => {
    add(cyl, M('#222', { metal: 0.6 }), 0.008, H - 2.6, 0.008, x, 2.6 + (H - 2.6) / 2, z);
    add(sphere, M('#fff', { emissive: color, ei: 2.2 }), 0.16, 0.16, 0.16, x, 2.55, z);
  };
  const person = (x, z, ry, personId) => out.staff.push({ x, z, ry, person: personId });
  const screen = (w, h, x, y, z, ry, texture) => {
    add(box, M('#0b0d11', { rough: 0.4 }), w + 0.15, h + 0.15, 0.08, x, y, z, ry);
    const m = add(plane, new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }), w, h, 1, x + Math.sin(ry) * 0.05, y, z + Math.cos(ry) * 0.05, ry);
    m.receiveShadow = false;
    return m;
  };
  const rug = (x, z, w, d, color) => add(box, M(color, { rough: 1 }), w, 0.02, d, x, 0.21, z);
  const sofa = (x, z, w, ry, color = '#5b6b7a') => {
    const s = new THREE.Group();
    const mat = M(color, { rough: 0.9 });
    const seatM = new THREE.Mesh(box, mat);
    seatM.scale.set(w, 0.45, 0.9);
    seatM.position.y = 0.42;
    const backM = new THREE.Mesh(box, mat);
    backM.scale.set(w, 0.55, 0.22);
    backM.position.set(0, 0.85, -0.36);
    const armL = new THREE.Mesh(box, mat);
    armL.scale.set(0.2, 0.6, 0.9);
    armL.position.set(-w / 2 + 0.1, 0.55, 0);
    const armR = armL.clone();
    armR.position.x = w / 2 - 0.1;
    s.add(seatM, backM, armL, armR);
    s.position.set(x, 0.2, z);
    s.rotation.y = ry;
    g.add(s);
    const c = Math.abs(Math.sin(ry)) > 0.5;
    solid(x, z, c ? 0.45 : w / 2, c ? w / 2 : 0.45);
  };

  // Rentable unit (stall / booth / desk) with its live state.
  const unitBlock = (u) => {
    const open = u.building?.businessName;
    const label = open || (u.status === 'available' ? `FOR RENT · ${u.rentLabel}` : `${u.tenant?.displayName || 'Taken'}`);
    const front = u.side === 'l' ? [1, 0] : u.side === 'r' ? [-1, 0] : [0, 1];
    const ry = Math.atan2(front[0], front[1]);
    const col = open ? accent : u.status === 'available' ? '#ffd166' : '#8892a6';
    if (u.zoning === 'apartment') {
      // Apartment door on the lobby wall with its number and status light.
      add(box, M(u.mine ? '#2f6e5a' : '#6b5644', { rough: 0.5 }), 1.3, 2.4, 0.08, u.lx, 1.4, u.lz - 0.2);
      add(sphere, M('#fff', { emissive: u.status === 'available' ? '#ffd166' : u.mine ? '#36d399' : '#ff5c5c', ei: 2 }), 0.06, 0.06, 0.06, u.lx + 0.45, 1.45, u.lz - 0.14);
      const plate = add(plane, new THREE.MeshBasicMaterial({ map: boardTexture(u.name.split(' · ')[0], [[u.status === 'available' ? u.rentLabel : u.mine ? 'Your home' : 'Occupied', '']], { bg: '#1d2430', accent: col, w: 512, h: 256 }), toneMapped: false }), 1.2, 0.6, 1, u.lx, 3.05, u.lz - 0.14);
      plate.receiveShadow = false;
      const acts = u.mine
        ? [{ id: 'home', icon: '🏠', label: 'Go home', action: { type: 'home', id: u.id } }, { id: 'manage', icon: '🔑', label: 'Lease', action: { type: 'sheet', view: 'parcel', props: { id: u.id } } }]
        : u.status === 'available'
          ? [{ id: 'rent', icon: '🔑', label: `Rent · ${u.rentLabel}`, action: { type: 'sheet', view: 'parcel', props: { id: u.id } } }, { id: 'tour', icon: '👀', label: 'Tour', action: { type: 'tour', id: u.id } }]
          : [{ id: 'view', icon: '👀', label: 'View', action: { type: 'sheet', view: 'parcel', props: { id: u.id } } }];
      spot(u.lx, u.lz + 1, u.name, u.status === 'available' ? `${u.aptSize} · ${u.rentLabel}` : u.mine ? 'Your apartment' : `Home of ${u.tenant?.displayName || 'a resident'}`, acts, 1.3);
      return;
    }
    if (u.zoning === 'desk') {
      add(box, M('#f2f2f2', { rough: 0.4 }), u.w, 0.05, u.d, u.lx, 0.95, u.lz);
      add(box, M('#333', { metal: 0.5 }), u.w - 0.1, 0.72, 0.05, u.lx, 0.58, u.lz - u.d / 2 + 0.05);
      solid(u.lx, u.lz, u.w / 2, u.d / 2);
      screen(0.8, 0.45, u.lx, 1.32, u.lz - 0.25, 0, boardTexture(open ? open : u.status === 'available' ? 'FREE DESK' : 'IN USE', [[u.status === 'available' ? u.rentLabel : u.tenant?.displayName || '', '']], { accent: col, w: 512, h: 288 }));
      sit(u.lx, u.lz + 0.75, Math.PI);
    } else {
      const along = front[0] === 0;
      const cw = along ? u.w : u.d;
      const cx = u.lx + front[0] * (u.side ? u.w / 2 - 0.5 : 0);
      const cz = u.lz + front[1] * (u.side ? 0 : u.d / 2 - 0.5);
      // Counter facing the room, back wall panel, and a lit header sign.
      add(box, M(u.zoning === 'stall' ? '#3b2f2a' : '#2b3442', { rough: 0.6 }), along ? cw : 0.8, 1.05, along ? 0.8 : cw, cx, 0.72, cz);
      add(box, M('#f4efe6', { rough: 0.3 }), along ? cw + 0.06 : 0.86, 0.05, along ? 0.86 : cw + 0.06, cx, 1.27, cz);
      solid(cx, cz, along ? cw / 2 : 0.4, along ? 0.4 : cw / 2);
      const sx = u.lx - front[0] * (u.side ? u.w / 2 - 0.1 : 0);
      const sz = u.lz - front[1] * (u.side ? 0 : u.d / 2 - 0.1);
      add(box, M(col, { rough: 0.5, emissive: col, ei: 0.15 }), along ? cw : 0.1, 2.6, along ? 0.1 : cw, sx, 1.5, sz);
      const sign = add(plane, new THREE.MeshBasicMaterial({ map: boardTexture(label, [], { bg: '#111318', accent: col, w: 1024, h: 200 }), toneMapped: false }), Math.min(cw, 6), Math.min(cw, 6) * 0.195, 1, cx, 3.05, cz, ry);
      sign.receiveShadow = false;
      if (open && u.catalog?.length) screen(Math.min(cw * 0.55, 2.6), 1.1, sx + front[0] * 0.1, 1.95, sz + front[1] * 0.1, ry, boardTexture(open, u.catalog.slice(0, 5).map((c) => [c.name, `$${c.price}`]), { accent: col, w: 768, h: 384 }));
      if (open && u.staff) person(sx + front[0] * 0.8, sz + front[1] * 0.8, ry, u.staff);
    }
    const fx = u.lx + front[0] * (u.zoning === 'desk' ? 0 : u.side ? u.w / 2 + 1.1 : 0);
    const fz = u.lz + front[1] * (u.zoning === 'desk' ? u.d / 2 + 1 : u.side ? 0 : u.d / 2 + 1.1);
    const acts = [];
    if (open && !u.mine) acts.push({ id: 'order', icon: u.zoning === 'stall' ? '🍽️' : '📅', label: u.zoning === 'stall' ? 'Order' : 'Book', action: { type: 'sheet', view: 'pbiz', props: { parcelId: u.id } } });
    if (u.mine) acts.push({ id: 'manage', icon: '🧾', label: 'Manage', action: { type: 'sheet', view: 'parcel', props: { id: u.id } } });
    if (u.mine && u.zoning === 'desk') acts.push({ id: 'work', icon: '💻', label: 'Work a shift', action: { type: 'activity', id: 'workShift' } });
    if (u.status === 'available') acts.push({ id: 'rent', icon: '🔑', label: `Rent · ${u.rentLabel}`, action: { type: 'sheet', view: 'parcel', props: { id: u.id } } });
    if (!acts.length) acts.push({ id: 'view', icon: '👀', label: 'View', action: { type: 'sheet', view: 'parcel', props: { id: u.id } } });
    spot(fx, fz, open || (u.status === 'available' ? `${u.name} — for rent` : u.name), open ? `${u.tenant?.displayName ? `by ${u.tenant.displayName}` : ''}` : u.status === 'available' ? `${u.rentLabel} · rent it for your business` : 'Rented', acts, u.zoning === 'desk' ? 1.2 : 1.8);
  };
  for (const u of spec.units || []) unitBlock(u);

  const menuItems = (spec.menu || []).map((m) => [m.name, m.price]);
  const order = (label = 'Order here', icon = '🛍️') => ({ id: 'order', icon, label, action: { type: 'sheet', view: 'place', props: { id: spec.placeId } } });

  switch (spec.kind) {
    case 'cafe':
    case 'restaurant': {
      const isCafe = spec.kind === 'cafe';
      counter(-W * 0.12, zBack + 2.4, Math.min(W * 0.55, 8), 0.9, isCafe ? '#3b2f2a' : '#2a1d1a', isCafe ? '#e9e4da' : '#1d1d1f');
      person(-W * 0.12, zBack + 1.3, 0, isCafe ? 'female_adult_08' : 'chef_female_01');
      if (isCafe) {
        add(box, M('#c9ccd1', { metal: 0.8, rough: 0.25 }), 0.7, 0.5, 0.45, -W * 0.12 - 1.4, 1.5, zBack + 2.4);
        add(box, M('#1b1b1d', { rough: 0.5 }), 0.25, 0.3, 0.25, -W * 0.12 + 1.2, 1.4, zBack + 2.4);
        product('bottle', 0.3, -W * 0.12 + 2, 1.26, zBack + 2.4);
        product('fridge', 1.9, W / 2 - 1.2, 0.2, zBack + 1.1);
        solid(W / 2 - 1.2, zBack + 1.1, 0.7, 0.6);
      } else {
        // Open grill glowing behind the pass.
        add(box, M('#2b2b2e', { metal: 0.6, rough: 0.4 }), 3, 0.9, 0.9, -W * 0.12, 0.65, zBack + 0.6);
        add(box, M('#ff6a00', { emissive: '#ff4d00', ei: 2.5 }), 2.6, 0.04, 0.6, -W * 0.12, 1.12, zBack + 0.6);
        product('olives', 0.35, -W * 0.12 + 1.6, 1.26, zBack + 2.4);
        product('lantern', 0.6, -W * 0.12 - 1.8, 1.26, zBack + 2.4);
      }
      screen(Math.min(4.2, W * 0.32), 1.7, -W * 0.12, 3.0, zBack + 0.05, 0, boardTexture(isCafe ? 'MENU' : 'TONIGHT', menuItems.length ? menuItems : [['House special', ''], ['Chef’s choice', '']], { accent }));
      spot(-W * 0.12, zBack + 3.4, isCafe ? 'Order at the counter' : 'Order at the pass', spec.name, [order(isCafe ? 'Order' : 'Order food'), ...(spec.activity ? [{ id: 'act', icon: '☕', label: 'Free tasting', action: { type: 'activity', id: spec.activity } }] : [])]);
      // Dining floor.
      const cols = Math.max(2, Math.floor((W - 3) / 3));
      const rows = Math.max(1, Math.floor((D - 7) / 3));
      for (let i = 0; i < cols; i++)
        for (let j = 0; j < rows; j++) {
          const x = -W / 2 + 2 + i * ((W - 4) / Math.max(1, cols - 1));
          const z = zBack + 5.5 + j * 3;
          if (Math.abs(x) < 1.6 && z > D / 2 - 3) continue;
          table(x, z, 0.42, isCafe ? '#e9e4da' : '#3a2a22');
          sit(x - 0.75, z, Math.PI / 2, isCafe ? '#7a5236' : '#5a1f1f');
          sit(x + 0.75, z, -Math.PI / 2, isCafe ? '#7a5236' : '#5a1f1f');
          post(x - 0.75, z, 0.28);
          post(x + 0.75, z, 0.28);
          if (!isCafe) pendant(x, z, '#ffb36b');
          else if ((i + j) % 2 === 0) pendant(x, z);
        }
      spot(-W / 2 + 2, zBack + 5.5, 'Take a seat', 'Relax and recharge', [{ id: 'rest', icon: '🪑', label: 'Sit down', action: { type: 'activity', id: 'rest' } }], 1.6);
      plant(W / 2 - 0.8, D / 2 - 1.2);
      plant(-W / 2 + 0.8, D / 2 - 1.2);
      break;
    }
    case 'shoes': {
      shelf(-W / 2 + 0.35, -1, Math.min(D - 5, 9), Math.PI / 2, Array.from({ length: 12 }, (_, k) => (k % 4 === 3 ? ['watch', 0.22] : ['shoe', 0.36])));
      shelf(W / 2 - 0.35, -1, Math.min(D - 5, 9), -Math.PI / 2, Array.from({ length: 12 }, (_, k) => (k % 3 === 2 ? ['watch', 0.22] : ['shoe', 0.36])));
      for (const [x, z] of [[-W * 0.18, -1], [W * 0.18, -1]]) {
        add(box, M('#f4f4f2', { rough: 0.3 }), 2.2, 0.85, 1.1, x, 0.62, z);
        solid(x, z, 1.1, 0.55);
        product('shoe', 0.45, x - 0.5, 1.05, z, 0.4);
        product('shoe', 0.45, x + 0.5, 1.05, z, -0.3);
      }
      add(box, M('#e0e3e8', { metal: 0.9, rough: 0.05 }), 1.2, 2.2, 0.05, 0, 1.4, zBack + 0.04); // mirror
      counter(W * 0.25, zBack + 2, 3.2, 0.8, '#1f2329', '#f4f4f2');
      person(W * 0.25, zBack + 1.1, 0, 'female_adult_15');
      spot(W * 0.25, zBack + 3, 'Checkout', spec.name, [order('Shop & pay', '🛍️')]);
      spot(0, -1, 'Browse the collection', spec.name, [order('View products', '👟')], 2.6);
      add(box, M('#30343f', { rough: 0.6 }), 2, 0.45, 0.6, -W / 2 + 2.4, 0.42, D / 2 - 2.2); // try-on bench
      solid(-W / 2 + 2.4, D / 2 - 2.2, 1, 0.3);
      for (let x = -W / 2 + 3; x < W / 2 - 2; x += 4) pendant(x, 0.5, '#fff1d0');
      break;
    }
    case 'furniture': {
      rug(-W * 0.2, -1, 4.5, 3.4, '#c8b89c');
      product('sofa', 2.3, -W * 0.2, 0.2, -2.2);
      solid(-W * 0.2, -2.2, 1.2, 0.5);
      product('pouf', 0.6, -W * 0.2 + 1.3, 0.2, -0.3);
      post(-W * 0.2 + 1.3, -0.3, 0.4);
      product('plant', 1.4, -W * 0.2 - 2.1, 0.2, -2.6);
      rug(W * 0.22, -1, 3.6, 3, '#8a9a8b');
      product('chair', 1, W * 0.22 - 0.8, 0.2, -1.2, 0.5);
      product('chair', 1, W * 0.22 + 0.8, 0.2, -1.2, -0.5);
      post(W * 0.22 - 0.8, -1.2, 0.45);
      post(W * 0.22 + 0.8, -1.2, 0.45);
      table(W * 0.22, -0.2, 0.55, '#d9cbb3');
      product('vase', 0.5, W * 0.22, 0.98, -0.2);
      shelf(0, zBack + 0.4, Math.min(W - 6, 8), 0, [['vase', 0.4], ['lantern', 0.4], ['vase', 0.4], ['olives', 0.3], ['boombox', 0.35], ['vase', 0.4]]);
      counter(W / 2 - 2.5, D / 2 - 3.5, 2.6, 0.8, '#5d5148', '#efe7dc');
      person(W / 2 - 2.5, D / 2 - 4.4, 0, 'business_female_02');
      spot(W / 2 - 2.5, D / 2 - 2.5, 'Talk to a design advisor', spec.name, [order('Shop furniture', '🛋️')]);
      spot(-W * 0.2, 0.6, 'Try the showroom sofa', 'Relax and recharge', [{ id: 'rest', icon: '🛋️', label: 'Sit', action: { type: 'activity', id: 'rest' } }, order('Buy it', '🛍️')], 1.8);
      for (let x = -W / 2 + 3; x < W / 2 - 2; x += 4.5) pendant(x, -1, '#fff1d0');
      break;
    }
    case 'salon': {
      for (let k = 0; k < 3; k++) {
        const z = zBack + 2 + k * 2.6;
        add(box, M('#e8e0e4', { metal: 0.9, rough: 0.04 }), 0.05, 1.3, 1.1, -W / 2 + 0.05, 1.7, z); // mirror
        add(box, M('#fff', { emissive: '#fff4ea', ei: 2 }), 0.04, 1.5, 0.06, -W / 2 + 0.08, 1.7, z - 0.62);
        add(box, M('#fff', { emissive: '#fff4ea', ei: 2 }), 0.04, 1.5, 0.06, -W / 2 + 0.08, 1.7, z + 0.62);
        add(cyl, M('#222', { metal: 0.7, rough: 0.3 }), 0.25, 0.4, 0.25, -W / 2 + 1.4, 0.4, z);
        add(box, M('#ff9ecf', { rough: 0.6 }), 0.6, 0.18, 0.6, -W / 2 + 1.4, 0.7, z);
        add(box, M('#ff9ecf', { rough: 0.6 }), 0.1, 0.7, 0.6, -W / 2 + 1.7, 1.1, z);
        post(-W / 2 + 1.4, z, 0.45);
      }
      person(-W / 2 + 2.3, zBack + 2, -Math.PI / 2, 'female_adult_12');
      add(box, M('#fff', { rough: 0.3 }), 1.2, 0.9, 0.6, W / 2 - 1, 0.65, zBack + 1.2); // basin
      solid(W / 2 - 1, zBack + 1.2, 0.6, 0.3);
      counter(W * 0.2, D / 2 - 3.2, 2.4, 0.7, '#6b4a5e', '#fff');
      person(W * 0.2, D / 2 - 4, 0, 'female_adult_03');
      product('vase', 0.55, W * 0.2 + 0.8, 1.26, D / 2 - 3.2);
      spot(W * 0.2, D / 2 - 2.2, 'Reception', spec.name, [order('Book appointment', '📅'), { id: 'act', icon: '🧖', label: 'Freshen up', action: { type: 'activity', id: 'shower' } }]);
      sofa(W / 2 - 0.8, 0, 2, -Math.PI / 2, '#d9a5bd');
      plant(W / 2 - 0.8, D / 2 - 1.2, 1.1);
      break;
    }
    case 'repair': {
      for (let k = 0; k < 2; k++) {
        const x = -W * 0.22 + k * W * 0.44;
        counter(x, zBack + 1.4, 3.2, 0.9, '#4f5b4a', '#c8cdc4');
        product(k ? 'camera' : 'boombox', 0.45, x - 0.6, 1.26, zBack + 1.4);
        add(box, M('#2f3a44', { rough: 0.5 }), 0.5, 0.35, 0.05, x + 0.7, 1.45, zBack + 1.3);
      }
      // Pegboard tool wall.
      add(box, M('#c9a26b', { rough: 0.9 }), W * 0.6, 1.6, 0.04, 0, 2.6, zBack + 0.03);
      for (let i = 0; i < 14; i++) add(box, M(['#e63946', '#1d3557', '#ffb703', '#2a9d8f'][i % 4], { metal: 0.5, rough: 0.4 }), 0.06, 0.4, 0.05, -W * 0.27 + i * (W * 0.54 / 13), 2.6 + ((i % 3) - 1) * 0.35, zBack + 0.08);
      person(-W * 0.22, zBack + 0.6, 0, 'construction_male_01');
      counter(W * 0.2, D / 2 - 3, 2.4, 0.7, '#2b3138', '#c3e88d');
      spot(W * 0.2, D / 2 - 2, 'Service desk', spec.name, [order('Get it fixed', '🔧')]);
      spot(0, zBack + 2.8, 'Repair benches', 'Phones, cameras, audio', [order('Book a repair', '📅')]);
      break;
    }
    case 'creator': {
      // Green-screen set with ring light and camera.
      add(box, M('#20c060', { rough: 0.95 }), 6, 4.2, 0.05, -W * 0.25, 2.3, zBack + 0.05);
      add(box, M('#20c060', { rough: 0.95 }), 6, 0.02, 3, -W * 0.25, 0.21, zBack + 1.5);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.04, 8, 32), M('#fff', { emissive: '#ffffff', ei: 3 }));
      ring.position.set(-W * 0.25, 1.7, zBack + 4);
      g.add(ring);
      add(cyl, M('#222', { metal: 0.6 }), 0.02, 1.5, 0.02, -W * 0.25, 0.95, zBack + 4);
      post(-W * 0.25, zBack + 4, 0.3);
      product('camera', 0.4, -W * 0.25 + 1.2, 1.5, zBack + 4.5, Math.PI);
      add(cyl, M('#222', { metal: 0.6 }), 0.02, 1.3, 0.02, -W * 0.25 + 1.2, 0.85, zBack + 4.5);
      post(-W * 0.25 + 1.2, zBack + 4.5, 0.3);
      // Podcast table.
      table(W * 0.25, zBack + 3, 0.9, '#2b2f36');
      for (const a of [0, 2.1, 4.2]) sit(W * 0.25 + Math.cos(a) * 1.4, zBack + 3 + Math.sin(a) * 1.4, -a - Math.PI / 2, '#b794ff');
      // Desks with monitors.
      for (let i = 0; i < 4; i++) {
        const x = -W / 2 + 4 + i * ((W - 8) / 3);
        const z = D / 2 - 6;
        add(box, M('#f2f2f2', { rough: 0.4 }), 1.8, 0.05, 0.8, x, 0.95, z);
        add(box, M('#333', { metal: 0.5 }), 1.7, 0.75, 0.05, x, 0.58, z - 0.35);
        solid(x, z, 0.9, 0.4);
        screen(0.9, 0.5, x, 1.35, z - 0.2, 0, boardTexture('EDIT', [['UGC cut v3', ''], ['Brand reel', '']], { accent, w: 512, h: 288 }));
        sit(x, z + 0.75, Math.PI);
      }
      out.gigBoard = screen(Math.min(5, W * 0.2), 2.6, W * 0.25, 3.6, zBack + 0.05, 0, boardTexture('OPEN GIGS', (spec.gigs || []).map((x) => [x.title, `$${x.budget}`]), { accent }));
      person(W * 0.25 + 1.2, zBack + 1.4, 0, 'business_male_02');
      spot(W * 0.25, zBack + 1.8, 'Gig board', 'UGC, design, delivery & more', [{ id: 'gigs', icon: '💼', label: 'Find gigs', action: { type: 'sheet', view: 'work', props: {} } }, { id: 'hire', icon: '📌', label: 'Hire someone', action: { type: 'sheet', view: 'work', props: { tab: 'hire' } } }], 2.6);
      spot(-W * 0.25, zBack + 2.5, 'Green-screen studio', 'Record content for gigs', [{ id: 'create', icon: '🎬', label: 'Create content', action: { type: 'sheet', view: 'place', props: { id: spec.placeId } } }], 2.4);
      break;
    }
    case 'community':
    case 'lounge': {
      const tv = screenTexture();
      out.reelScreen = tv;
      screen(Math.min(9, W * 0.4), Math.min(9, W * 0.4) * 0.5, 0, H * 0.48, zBack + 0.06, 0, tv);
      add(box, M('#2b3442', { rough: 0.7 }), Math.min(10, W * 0.45), 0.5, 3, 0, 0.45, zBack + 1.8); // stage
      solid(0, zBack + 1.8, Math.min(10, W * 0.45) / 2, 1.5);
      for (let k = 0; k < 4; k++) {
        const x = -W / 2 + 4 + (k % 2) * (W - 8);
        const z = -1 + Math.floor(k / 2) * 5;
        rug(x, z, 4, 3.4, ['#3c6e71', '#8e5572', '#c97b63', '#5b8e7d'][k]);
        sofa(x, z - 1.2, 2.6, 0, ['#e9d8a6', '#94d2bd', '#ee9b00', '#ae2012'][k]);
        table(x, z + 0.3, 0.45, '#2b2f36');
      }
      person(3, zBack + 4.5, 0, 'female_adult_05');
      spot(0, zBack + 4.5, 'Community stage', 'Meetups, AMAs and live events', [{ id: 'events', icon: '🎟️', label: 'Events', action: { type: 'sheet', view: 'events', props: {} } }, { id: 'communities', icon: '📡', label: 'Communities', action: { type: 'sheet', view: 'place', props: { id: spec.placeId } } }, { id: 'act', icon: '🤝', label: 'Mingle', action: { type: 'activity', id: 'socialize' } }], 3);
      break;
    }
    case 'classroom': {
      screen(Math.min(6, W * 0.3), 2.4, 0, 2.5, zBack + 0.06, 0, boardTexture('PLUDOR UNIVERSITY', (spec.courses || []).slice(0, 6).map((c) => [c.title, `${c.minutes || 12} min`]), { bg: '#123524', accent: '#7ee8a2' }));
      // One board per school along the side walls, each a doorway to its courses.
      (spec.faculties || []).forEach((f, k) => {
        const side = k % 2 ? 1 : -1;
        const z = zBack + 4 + Math.floor(k / 2) * 5.5;
        const list = (spec.courses || []).filter((c) => c.faculty === f.id).map((c) => [`${c.done ? '✓ ' : ''}${c.title}`, `${c.minutes || 10}m`]);
        screen(3.4, 1.9, side * (W / 2 - 0.07), 2.4, z, side < 0 ? Math.PI / 2 : -Math.PI / 2, boardTexture(`${f.icon} ${f.name.replace('School of ', '').toUpperCase()}`, list.length ? list : [['New courses soon', '']], { bg: '#10202a', accent: f.color }));
        spot(side * (W / 2 - 1.6), z, f.name, `${list.length} course${list.length === 1 ? '' : 's'} · earn credentials`, [{ id: 'enrol', icon: f.icon, label: 'Enrol', action: { type: 'sheet', view: 'learn', props: { faculty: f.id } } }], 1.8);
      });
      person(-3.2, zBack + 1.6, 0.3, 'female_adult_12');
      const cols = Math.max(2, Math.floor((W - 6) / 3));
      for (let i = 0; i < cols; i++)
        for (let j = 0; j < Math.max(2, Math.floor((D - 9) / 2.6)); j++) {
          const x = -((cols - 1) * 3) / 2 + i * 3;
          const z = zBack + 5 + j * 2.6;
          add(box, M('#e8e2d4', { rough: 0.5 }), 1.4, 0.05, 0.6, x, 0.95, z);
          add(box, M('#2b2f36', { metal: 0.5 }), 1.3, 0.72, 0.05, x, 0.58, z - 0.25);
          solid(x, z, 0.7, 0.3);
          sit(x, z + 0.6, Math.PI, '#2f4f4f');
        }
      spot(0, zBack + 3.2, 'Lecture hall', 'Learn skills, unlock gigs', [{ id: 'learn', icon: '🎓', label: 'Courses', action: { type: 'sheet', view: 'place', props: { id: spec.placeId } } }, { id: 'act', icon: '📚', label: 'Study', action: { type: 'activity', id: 'study' } }], 3);
      plant(W / 2 - 1, zBack + 1);
      plant(-W / 2 + 1, zBack + 1);
      break;
    }
    case 'ai': {
      for (let k = 0; k < 6; k++) {
        const x = -W / 2 + 4 + (k % 3) * ((W - 8) / 2);
        const z = zBack + 4 + Math.floor(k / 3) * 6;
        add(cyl, M('#1d2340', { metal: 0.6, rough: 0.3 }), 1.1, 0.9, 1.1, x, 0.65, z);
        const holo = add(cyl, new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.25, depthWrite: false }), 0.8, 1.8, 0.8, x, 2, z);
        holo.receiveShadow = false;
        out.tickers.push((t) => {
          holo.rotation.y = t * 0.8;
          holo.material.opacity = 0.18 + Math.sin(t * 2 + k) * 0.08;
        });
        post(x, z, 1.15);
      }
      screen(Math.min(8, W * 0.35), 3, 0, 3.4, zBack + 0.06, 0, boardTexture('CREATE WITH AI', [['Images & logos', '✓'], ['Video & voice', '✓'], ['Avatars & branding', '✓'], ['Ad copy', '✓']], { bg: '#0c1030', accent }));
      person(2, zBack + 2, 0, 'male_adult_11');
      spot(0, zBack + 2.5, 'AI Studio desk', 'Images, video, voice, branding', [{ id: 'ai', icon: '✨', label: 'Create', action: { type: 'sheet', view: 'place', props: { id: spec.placeId } } }, { id: 'ask', icon: '🤖', label: 'Ask Pludor AI', action: { type: 'sheet', view: 'ai', props: {} } }], 3);
      break;
    }
    case 'arcade': {
      const cols = Math.max(3, Math.floor((W - 6) / 2));
      for (const row of [-1, 1]) {
        for (let i = 0; i < cols; i++) {
          const x = -((cols - 1) * 2) / 2 + i * 2;
          const z = row * 3.2 - 1;
          const ry = row < 0 ? 0 : Math.PI;
          add(box, M(['#ff5ce1', '#5ce1e6', '#ffd166', '#7c5cff'][i % 4], { rough: 0.4, emissive: ['#ff5ce1', '#5ce1e6', '#ffd166', '#7c5cff'][i % 4], ei: 0.25 }), 1.2, 2, 0.9, x, 1.2, z, ry);
          const c = canvas(128, 96);
          const t = tex(c[0]);
          const scr = add(plane, new THREE.MeshBasicMaterial({ map: t, toneMapped: false }), 0.9, 0.7, 1, x, 1.6, z + (row < 0 ? 0.46 : -0.46), ry);
          scr.receiveShadow = false;
          const hue = i * 47 + (row + 1) * 90;
          out.tickers.push((time) => {
            const f = Math.floor(time * 8);
            if (scr.userData.f === f) return;
            scr.userData.f = f;
            const gg = c[1];
            gg.fillStyle = `hsl(${(hue + time * 40) % 360},80%,20%)`;
            gg.fillRect(0, 0, 128, 96);
            gg.fillStyle = `hsl(${(hue + 180) % 360},90%,60%)`;
            for (let k = 0; k < 6; k++) gg.fillRect((k * 23 + time * 60 * (k % 2 ? 1 : -1)) % 128, 10 + k * 14, 14, 8);
            gg.fillStyle = '#fff';
            gg.font = '700 12px monospace';
            gg.fillText(`SCORE ${Math.floor(time * 137 + i * 900) % 99999}`, 6, 92);
            t.needsUpdate = true;
          });
          solid(x, z, 0.6, 0.45);
        }
      }
      counter(0, zBack + 1.4, 4, 0.8, '#3a1f4d', '#ff5ce1');
      product('toycar', 0.35, -1, 1.26, zBack + 1.4);
      product('boombox', 0.4, 1, 1.26, zBack + 1.4);
      person(0, zBack + 0.6, 0, 'male_adult_15');
      spot(0, -1, 'Arcade floor', 'Play for XP and tournament rank', [{ id: 'play', icon: '🎮', label: 'Play', action: { type: 'sheet', view: 'place', props: { id: spec.placeId } } }, { id: 'fun', icon: '🕹️', label: 'Free play', action: { type: 'activity', id: 'play' } }], 3.5);
      spot(0, zBack + 2.4, 'Prize counter', 'Tournaments 7–9 PM', [{ id: 'events', icon: '🏆', label: 'Tournaments', action: { type: 'sheet', view: 'events', props: {} } }]);
      break;
    }
    case 'transit': {
      for (let k = 0; k < 3; k++) counter(-W / 2 + 4 + k * 3.4, zBack + 1.6, 2.6, 0.8, '#20434a', '#e7eef0');
      person(-W / 2 + 4, zBack + 0.8, 0, 'male_adult_04');
      screen(Math.min(9, W * 0.35), 2.6, W * 0.2, 3.2, zBack + 0.06, 0, boardTexture('DEPARTURES', [['Creator Quarter', 'NOW'], ['Market Row', '2 min'], ['Riverside Lots', '4 min'], ['Neon Arcade', '6 min'], ['Academy', '8 min']], { bg: '#0b1a1e', accent: '#36d399' }));
      for (let i = 0; i < 4; i++) {
        const x = -W / 2 + 4 + i * ((W - 8) / 3);
        add(box, M('#5b6672', { metal: 0.6, rough: 0.4 }), 2.6, 0.12, 0.6, x, 0.65, 2);
        add(box, M('#5b6672', { metal: 0.6, rough: 0.4 }), 2.6, 0.6, 0.08, x, 1, 1.72);
        solid(x, 2, 1.3, 0.35);
      }
      spot(-W / 2 + 4, zBack + 2.6, 'Wayfare tickets', 'Rides, couriers, rentals', [{ id: 'ride', icon: '🚕', label: 'Rides & delivery', action: { type: 'sheet', view: 'place', props: { id: spec.placeId } } }, { id: 'courier', icon: '🛵', label: 'Courier jobs', action: { type: 'sheet', view: 'work', props: { tab: 'deliveries' } } }]);
      break;
    }
    case 'cinema': {
      // Entertainment centre: main screen, stepped seating, and a wall of
      // live streams from creators going live on Pludor.
      const main = screenTexture();
      out.reelScreen = main;
      const sw = Math.min(14, W * 0.6);
      screen(sw, sw * 0.5, 0, H * 0.55, zBack + 0.08, 0, main);
      add(box, M('#2a2233', { rough: 0.8 }), sw + 2, 0.6, 3, 0, 0.5, zBack + 2);
      solid(0, zBack + 2, sw / 2 + 1, 1.5);
      for (let r = 0; r < 4; r++) {
        const z = zBack + 6 + r * 1.8;
        const y = 0.2 + r * 0.25;
        add(box, M('#1d1622', { rough: 0.9 }), W - 6, 0.25 + r * 0.25, 1.8, 0, y / 2 + 0.1, z);
        for (let x = -W / 2 + 4; x <= W / 2 - 4; x += 1.1) {
          add(box, M('#a4161a', { rough: 0.8 }), 0.75, 0.15, 0.6, x, y + 0.5, z);
          add(box, M('#a4161a', { rough: 0.8 }), 0.75, 0.7, 0.12, x, y + 0.85, z + 0.33);
        }
      }
      out.liveTiles = [];
      const handles = spec.liveHandles || ['maya', 'jay', 'lena', 'marcus', 'kemi', 'dev'];
      const tw = 2.4;
      handles.slice(0, 6).forEach((h, k) => {
        const tile = new LiveTile(h, 40 + k * 23, k * 55);
        out.liveTiles.push(tile);
        const side = k < 3 ? -1 : 1;
        const z = zBack + 4 + (k % 3) * 3;
        screen(tw, tw * 0.5625, side * (W / 2 - 0.06), 2.6, z, side < 0 ? Math.PI / 2 : -Math.PI / 2, tile.t);
      });
      out.tickers.push((t) => out.liveTiles.forEach((x) => x.update(t)));
      counter(-W / 2 + 3, D / 2 - 3.5, 2.6, 0.8, '#2a2233', '#ff4d6d');
      person(-W / 2 + 3, D / 2 - 4.3, 0, 'female_adult_01');
      product('lantern', 0.5, -W / 2 + 3.8, 1.26, D / 2 - 3.5);
      spot(0, zBack + 4.2, 'Main screen', 'Flika premieres and live concerts', [{ id: 'watch', icon: '🎬', label: 'Watch', action: { type: 'sheet', view: 'place', props: { id: spec.placeId } } }, { id: 'events', icon: '🎟️', label: 'Shows & tickets', action: { type: 'sheet', view: 'events', props: {} } }], 3.5);
      spot(-W / 2 + 1.6, zBack + 7, 'Live wall', 'Creators streaming right now', [{ id: 'live', icon: '🔴', label: 'Watch live', action: { type: 'sheet', view: 'place', props: { id: spec.placeId } } }, { id: 'golive', icon: '📹', label: 'Go live', action: { type: 'golive' } }], 2.6);
      spot(-W / 2 + 3, D / 2 - 2.5, 'Box office & snacks', 'Tickets, popcorn, merch', [{ id: 'tickets', icon: '🎟️', label: 'Tickets', action: { type: 'sheet', view: 'events', props: {} } }, { id: 'snack', icon: '🍿', label: 'Snack', action: { type: 'activity', id: 'snack' } }]);
      break;
    }
    case 'apartments': {
      counter(10, 4, 3.4, 0.8, '#3d4a5c', '#efe7da');
      person(10, 3.1, 0, 'male_adult_19');
      screen(4.2, 2, 10, 3, -11.6, 0, boardTexture('RESIDENTS', (spec.units || []).map((u) => [u.name, u.status === 'available' ? u.rentLabel : 'occupied']), { bg: '#1d2430', accent }));
      spot(10, 5.2, 'Concierge', 'Lease an apartment · packages · visitors', [{ id: 'list', icon: '🏢', label: 'Available apartments', action: { type: 'sheet', view: 'place', props: { id: spec.placeId, tab: 'spots' } } }, { id: 'nia', icon: '🔑', label: 'Ask Nia (realtor)', action: { type: 'sheet', view: 'agent', props: { id: 'npc-nia' } } }], 2);
      rug(-4, 3, 7, 4.5, '#4a5d74');
      sofa(-6, 4.8, 2.6, Math.PI, '#d9c7a5');
      sofa(-2, 4.8, 2.6, Math.PI, '#d9c7a5');
      table(-4, 2.8, 0.55, '#2b2f36');
      for (let k = 0; k < 12; k++) add(box, M('#b8a07a', { metal: 0.8, rough: 0.3 }), 0.4, 0.3, 0.05, 13 + (k % 4) * 0.45 - 0.7, 1.2 + Math.floor(k / 4) * 0.35, D / 2 - 0.1); // mailboxes
      plant(W / 2 - 1, D / 2 - 1.5, 1.4);
      plant(-W / 2 + 1, D / 2 - 1.5, 1.4);
      for (let x = -12; x <= 12; x += 6) pendant(x, -6, '#fff1d0');
      break;
    }
    case 'foodcourt': {
      // Shared seating in the middle, self-serve kiosks by the door.
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 2; j++) {
          const x = -7.5 + i * 5;
          const z = -1.5 + j * 4;
          table(x, z, 0.55, '#f2efe8');
          for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
            sit(x + Math.sin(a) * 0.95, z + Math.cos(a) * 0.95, a + Math.PI, '#ff9f43');
            post(x + Math.sin(a) * 0.95, z + Math.cos(a) * 0.95, 0.25);
          }
          pendant(x, z, '#ffd9a0');
        }
      for (const x of [-4, 4]) {
        const z = D / 2 - 3.2;
        add(box, M('#e9edf2', { rough: 0.3 }), 0.9, 1.7, 0.4, x, 1.05, z);
        screen(0.7, 1.1, x, 1.35, z + 0.21, 0, boardTexture('ORDER', [['Tap to order', ''], ['All stalls', '']], { accent, w: 384, h: 600 }));
        solid(x, z, 0.45, 0.2);
        spot(x, z + 1, 'Self-serve kiosk', 'Order from any stall · pickup or delivery', [{ id: 'kiosk', icon: '🍜', label: 'Order food', action: { type: 'sheet', view: 'place', props: { id: spec.placeId, tab: 'order' } } }, { id: 'stalls', icon: '🔑', label: 'Rent a stall', action: { type: 'sheet', view: 'place', props: { id: spec.placeId, tab: 'spots' } } }], 1.6);
      }
      plant(W / 2 - 1, D / 2 - 1.3);
      plant(-W / 2 + 1, D / 2 - 1.3);
      break;
    }
    case 'hotel': {
      counter(4, -8.5, 6, 0.9, '#5a4632', '#efe7da');
      person(4, -9.6, 0, 'business_female_02');
      add(box, M('#c9a15a', { metal: 0.8, rough: 0.3 }), 6.4, 0.6, 0.1, 4, 3, -11.6);
      for (const x of [9, 12.5]) {
        add(box, M('#b8a07a', { metal: 0.9, rough: 0.2 }), 2, 3, 0.1, x, 1.7, -11.6); // elevators
        add(box, M('#fff', { emissive: '#ffd27a', ei: 1.5 }), 0.3, 0.1, 0.05, x, 3.4, -11.5);
      }
      spot(4, -7, 'Reception', 'Book a room, suite or day pass', [{ id: 'book', icon: '🛏️', label: 'Book a stay', action: { type: 'sheet', view: 'place', props: { id: spec.placeId, tab: 'book' } } }, { id: 'booths', icon: '🔑', label: 'Rent a booth', action: { type: 'sheet', view: 'place', props: { id: spec.placeId, tab: 'spots' } } }], 2.2);
      rug(4, 1, 8, 5, '#7b2d26');
      sofa(1.5, 2.5, 2.6, Math.PI, '#e9d8a6');
      sofa(6.5, 2.5, 2.6, Math.PI, '#e9d8a6');
      table(4, 0.5, 0.6, '#3a2a22');
      product('vase', 0.6, 4, 0.98, 0.5);
      // Chandelier.
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        add(sphere, M('#fff', { emissive: '#ffe2a8', ei: 2.5 }), 0.12, 0.12, 0.12, 4 + Math.cos(a) * 1.2, H - 1.4 - (k % 2) * 0.3, 0.5 + Math.sin(a) * 1.2);
      }
      plant(W / 2 - 1, D / 2 - 1.3, 1.5);
      plant(W / 2 - 1, -4, 1.5);
      spot(4, 4.2, 'Lobby lounge', 'Relax while you wait', [{ id: 'rest', icon: '🛋️', label: 'Relax', action: { type: 'activity', id: 'rest' } }], 2);
      break;
    }
    case 'conference': {
      const main = screenTexture();
      out.reelScreen = main;
      add(box, M('#1c2a3d', { rough: 0.7 }), 14, 0.7, 4, -2, 0.55, -9.5);
      solid(-2, -9.5, 7, 2);
      screen(12, 6, -2, H * 0.55, -11.6, 0, main);
      add(box, M('#2b3442', { rough: 0.5 }), 1, 1.2, 0.6, -2, 1.5, -8.5); // lectern
      person(-2, -9.1, 0, 'business_male_02');
      out.liveTiles = [];
      const handles = spec.liveHandles || ['maya', 'jay', 'lena', 'marcus', 'kemi', 'dev', 'ines', 'ayo'];
      for (let k = 0; k < 8; k++) {
        const tile = new LiveTile(handles[k % handles.length], 120 + k * 37, k * 45);
        out.liveTiles.push(tile);
        if (k < 4) screen(3.2, 1.8, -W / 2 + 0.07, 2.3 + (k % 2) * 2.2, -6 + Math.floor(k / 2) * 5, Math.PI / 2, tile.t);
        else screen(3.2, 1.8, -12 + (k - 4) * 3.5 - (k > 5 ? 0 : 0), H - 1.4, -11.62, 0, tile.t);
      }
      out.tickers.push((t) => out.liveTiles.forEach((x) => x.update(t)));
      for (let r = 0; r < 3; r++)
        for (let x = -10; x <= 6; x += 1.2) {
          const z = -3 + r * 2;
          add(box, M('#2a4d6e', { rough: 0.8 }), 0.75, 0.12, 0.6, x, 0.55, z);
          add(box, M('#2a4d6e', { rough: 0.8 }), 0.75, 0.7, 0.1, x, 0.9, z + 0.3);
          if (x === -10 || x > 5.5) post(x, z, 0.4);
        }
      for (let r = 0; r < 3; r++) solid(-2, -3 + r * 2, 8.6, 0.4);
      spot(-2, -6.5, 'Keynote stage', 'Live talks streamed to 12 screens', [{ id: 'events', icon: '🎤', label: 'Sessions', action: { type: 'sheet', view: 'events', props: {} } }, { id: 'golive', icon: '📹', label: 'Go live', action: { type: 'golive' } }], 3);
      spot(-W / 2 + 1.6, -3.5, 'Live wall', 'Creators streaming right now', [{ id: 'watch', icon: '🔴', label: 'Watch live', action: { type: 'sheet', view: 'place', props: { id: spec.placeId, tab: 'live' } } }], 2.2);
      spot(10, 7, 'Expo booths', 'Rent a booth to show your business', [{ id: 'booths', icon: '🔑', label: 'Rent a booth', action: { type: 'sheet', view: 'place', props: { id: spec.placeId, tab: 'spots' } } }], 2);
      break;
    }
    case 'cowork': {
      // UGC filming booth, meeting pod, gig board, coffee bar.
      add(box, M('#20c060', { rough: 0.95 }), 4, 3.4, 0.05, -11, 1.9, -11.6);
      add(box, M('#20c060', { rough: 0.95 }), 4, 0.02, 2.6, -11, 0.21, -10.3);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.035, 8, 32), M('#fff', { emissive: '#ffffff', ei: 3 }));
      ring.position.set(-11, 1.7, -7.8);
      g.add(ring);
      post(-11, -7.8, 0.3);
      spot(-11, -7, 'UGC booth', 'Film content for brand gigs', [{ id: 'ugc', icon: '🎬', label: 'UGC gigs', action: { type: 'sheet', view: 'work', props: {} } }], 2);
      add(box, new THREE.MeshPhysicalMaterial({ color: '#cfe8f5', transparent: true, opacity: 0.25, roughness: 0.05 }), 5, 2.8, 0.06, 3, 1.6, -7.5);
      add(box, new THREE.MeshPhysicalMaterial({ color: '#cfe8f5', transparent: true, opacity: 0.25, roughness: 0.05 }), 0.06, 2.8, 4, 0.5, 1.6, -9.5);
      solid(3, -7.5, 2.5, 0.05);
      solid(0.5, -9.5, 0.05, 2);
      table(3, -9.6, 0.8, '#f2f2f2');
      for (const a of [0.5, 2.6, 4.7]) sit(3 + Math.cos(a) * 1.3, -9.6 + Math.sin(a) * 1.3, -a - Math.PI / 2, '#c3e88d');
      out.gigBoard = screen(4.5, 2.4, 11, 3, -11.6, 0, boardTexture('OPEN GIGS', (spec.gigs || []).map((x) => [x.title, `$${x.budget}`]), { accent }));
      spot(11, -9.5, 'Gig board', 'Pick up work, hire freelancers', [{ id: 'gigs', icon: '💼', label: 'Find gigs', action: { type: 'sheet', view: 'work', props: {} } }, { id: 'hire', icon: '📌', label: 'Hire', action: { type: 'sheet', view: 'work', props: { tab: 'hire' } } }], 2.4);
      counter(12, 8, 3.4, 0.8, '#3b4a3f', '#f2efe8');
      person(12, 7.1, 0, 'female_adult_08');
      spot(12, 9.2, 'Coffee bar', 'Members’ coffee', [{ id: 'snack', icon: '☕', label: 'Grab a coffee', action: { type: 'activity', id: 'snack' } }, { id: 'desks', icon: '🔑', label: 'Rent a desk', action: { type: 'sheet', view: 'place', props: { id: spec.placeId, tab: 'spots' } } }], 1.8);
      for (let x = -9; x <= 9; x += 6) pendant(x, 3, '#fff1d0');
      plant(-W / 2 + 1, D / 2 - 1.3);
      break;
    }
    case 'supermarket': {
      const goods = [['bottle', 0.3], ['avocado', 0.12], ['olives', 0.25], ['bottle', 0.3], ['vase', 0.3], ['lantern', 0.3]];
      for (let k = 0; k < 4; k++) {
        const x = -W / 2 + 4 + k * ((W - 8) / 3);
        shelf(x - 0.35, -2, 8, Math.PI / 2, goods.map((g2, i) => goods[(i + k) % goods.length]));
        shelf(x + 0.35, -2, 8, -Math.PI / 2, goods.map((g2, i) => goods[(i + k + 2) % goods.length]));
        const sign = add(plane, new THREE.MeshBasicMaterial({ map: boardTexture(['FRESH', 'DRINKS', 'PANTRY', 'DELI'][k], [], { bg: '#1f3d2a', accent: '#7bd389', w: 512, h: 128 }), toneMapped: false, side: THREE.DoubleSide }), 2, 0.5, 1, x, 3.2, -2, Math.PI / 2);
        sign.receiveShadow = false;
      }
      for (let k = 0; k < 3; k++) product('fridge', 2, -W / 2 + 5 + k * 2.2, 0.2, -D / 2 + 0.9);
      solid(-W / 2 + 7.2, -D / 2 + 0.9, 3.4, 0.6);
      for (let k = 0; k < 3; k++) {
        const x = 2 + k * 3;
        counter(x, D / 2 - 4, 1.2, 2, '#2f5d3a', '#e9ecef');
        if (k < 2) person(x + 0.9, D / 2 - 4, -Math.PI / 2, k ? 'female_adult_03' : 'male_adult_01');
      }
      spot(5, D / 2 - 2.2, 'Checkout', 'Pay or arrange delivery', [order('Shop groceries', '🛒'), { id: 'deliver', icon: '🛵', label: 'Courier jobs', action: { type: 'sheet', view: 'work', props: { tab: 'deliveries' } } }], 2.2);
      spot(-W / 2 + 4, 2.5, 'Aisles', 'Fresh produce and pantry staples', [order('Browse products', '🥑')], 3);
      break;
    }
    case 'home': {
      rug(-W * 0.15, 0.5, 4, 3, '#b8a58c');
      sofa(-W * 0.15, 1.8, 2.6, Math.PI, '#6d7f8f');
      table(-W * 0.15, 0.4, 0.5, '#5d4a3a');
      const tv = screenTexture();
      out.reelScreen = tv;
      screen(2.2, 1.24, -W * 0.15, 1.7, -1.4, 0, tv);
      add(box, M('#2b2f36', { rough: 0.5 }), 2.4, 0.5, 0.45, -W * 0.15, 0.45, -1.55);
      solid(-W * 0.15, -1.55, 1.2, 0.25);
      // Bed.
      add(box, M('#e9e4da', { rough: 0.9 }), 2, 0.45, 2.3, -W / 2 + 1.4, 0.45, zBack + 1.5);
      add(box, M('#5b7a99', { rough: 0.9 }), 2.02, 0.12, 1.4, -W / 2 + 1.4, 0.72, zBack + 1.9);
      add(box, M('#ffffff', { rough: 0.9 }), 1.6, 0.14, 0.45, -W / 2 + 1.4, 0.76, zBack + 0.6);
      add(box, M('#5d4a3a', { rough: 0.7 }), 2.2, 1.1, 0.12, -W / 2 + 1.4, 0.75, zBack + 0.32);
      solid(-W / 2 + 1.4, zBack + 1.5, 1, 1.15);
      spot(-W / 2 + 2.9, zBack + 1.6, 'Bed', 'Sleep to restore energy', [{ id: 'sleep', icon: '😴', label: 'Sleep', action: { type: 'activity', id: 'sleep' } }], 1.8);
      // Kitchen.
      counter(W / 2 - 2.2, zBack + 0.6, 3.6, 0.7, '#f2efe9', '#3a3f46');
      product('fridge', 1.9, W / 2 - 0.6, 0.2, zBack + 1.8);
      solid(W / 2 - 0.6, zBack + 1.8, 0.5, 0.5);
      product('bottle', 0.3, W / 2 - 2.8, 1.26, zBack + 0.6);
      spot(W / 2 - 2.2, zBack + 1.7, 'Kitchen', 'Grab a bite', [{ id: 'snack', icon: '🍳', label: 'Cook a snack', action: { type: 'activity', id: 'snack' } }, { id: 'order', icon: '🛵', label: 'Order delivery', action: { type: 'sheet', view: 'shops', props: {} } }]);
      // Shower corner.
      add(box, new THREE.MeshPhysicalMaterial({ color: '#bfe3f2', transparent: true, opacity: 0.3, roughness: 0.05 }), 0.04, 2.2, 1.4, W / 2 - 1.5, 1.3, D / 2 - 2.2);
      add(box, M('#ffffff', { rough: 0.3 }), 1.4, 0.1, 1.4, W / 2 - 0.8, 0.25, D / 2 - 2.2);
      spot(W / 2 - 0.9, D / 2 - 2.2, 'Shower', 'Freshen up', [{ id: 'shower', icon: '🚿', label: 'Shower', action: { type: 'activity', id: 'shower' } }], 1.3);
      spot(-W * 0.15, 2.9, 'Living room', 'Watch Flika, relax', [{ id: 'rest', icon: '🛋️', label: 'Relax', action: { type: 'activity', id: 'rest' } }, { id: 'play', icon: '🎮', label: 'Play games', action: { type: 'sheet', view: 'games', props: {} } }], 1.8);
      plant(W / 2 - 0.8, 1, 1.2);
      product('lantern', 0.5, -W / 2 + 0.5, 0.2, D / 2 - 1.5);
      break;
    }
    default: {
      // Player-run shop or studio on a rented parcel.
      shelf(-W / 2 + 0.35, -0.5, Math.min(D - 4, 6), Math.PI / 2, [['bottle', 0.3], ['vase', 0.35], ['boombox', 0.35], ['lantern', 0.35], ['camera', 0.3], ['shoe', 0.32]]);
      shelf(W / 2 - 0.35, -0.5, Math.min(D - 4, 6), -Math.PI / 2, [['shoe', 0.32], ['watch', 0.2], ['toycar', 0.3], ['olives', 0.25], ['avocado', 0.15], ['vase', 0.35]]);
      counter(0, zBack + 1.6, 3, 0.8, '#3f5a73', '#f2f0ec');
      spot(0, zBack + 2.6, spec.owner ? `${spec.name}` : 'Shop counter', spec.owner ? `Run by ${spec.owner}` : 'Player-run business', [{ id: 'open', icon: '🏪', label: 'Open store', action: { type: 'sheet', view: spec.parcelId ? 'parcel' : 'place', props: { id: spec.parcelId || spec.placeId } } }]);
      plant(W / 2 - 1, D / 2 - 1.2);
    }
  }

  g.traverse((o) => {
    if (o.isMesh) o.castShadow = false;
  });
  return out;
}

export { drawCinemaFrame };
