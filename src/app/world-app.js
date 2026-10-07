// WorldApp — the spatial runtime. Owns the Three.js scene, the player, NPCs,
// remote players, proximity, navigation and the per-frame loop. All product
// behaviour goes through `this.api` (the Pludor adapter); this file only
// decides WHERE things are and WHAT is near you.

import * as THREE from 'three';
import { City } from '../render/city.js';
import { createAvatar, animateAvatar, initHumans, recolorAvatar, setPerson, pickPerson, portraitOf, applyLook } from '../render/avatar.js';
import { lookKey } from '../core/look.js';
import { Environment, PostFX } from '../render/environment.js';
import { loadModel, fitObject, assetErrors } from '../render/assets.js';
import { PLACES, PARCELS, BILLBOARDS, AGENTS, TOKENS, PLAZA, DISTRICT, FILLER_CELLS, WORLD, cellBounds, entrancePoint, footprint, zoneAt, facingVector } from '../config/nova-city.js';
import { ECONOMY } from '../config/economy.js';
import { TOOLS, RESIDENTS, FACULTIES } from '../pludor/demo-data.js';
import { SpatialGrid } from '../core/spatial-grid.js';
import { NavGrid } from '../core/pathfind.js';
import { Obstacles, separate, steer } from '../core/obstacles.js';
import { worldTimeAt } from '../core/world-time.js';
import { EV } from '../core/events.js';
import { Hud } from '../ui/hud.js';
import { honk, chime } from '../render/audio.js';
import { buildInterior, interiorKindFor, INTERIOR_Y, drawCinemaFrame } from '../render/interiors.js';
import { Sheets } from '../ui/sheets.js';

const PROX = ECONOMY.proximity;
const BOT_ANCHORS = {
  plaza: { x: 9, z: 9, r: 9 }, creator: { x: 0, z: -29, r: 8 }, market: { x: 48, z: 0, r: 11 },
  grill: { x: -29, z: 9, r: 5 }, grind: { x: -29, z: -9, r: 5 }, kicks: { x: 78.5, z: 0, r: 6 },
};

export class WorldApp {
  constructor(root, { api, transport, flags, me, spawn = null, mode = 'embedded' }) {
    this.spawn = spawn;
    this.mode = mode;
    this.root = root;
    this.api = api;
    this.transport = transport;
    this.flags = flags;
    this.me = me;
    this.clock = new THREE.Clock();
    this.keys = new Set();
    this.lowPower = matchMedia('(pointer: coarse)').matches || (navigator.hardwareConcurrency || 8) <= 4;
    // high: full PBR + bloom · medium: PBR, no post · low: stylised, no shadows
    let q = new URLSearchParams(location.search).get('quality');
    try {
      q ||= localStorage.getItem('pw-quality');
    } catch {
      /* storage blocked */
    }
    this.quality = ['high', 'medium', 'low'].includes(q) ? q : this.lowPower ? 'medium' : 'high';
    this.state = { places: [], gigs: [], parcels: [], events: [], progress: null, wallet: null, needs: {}, profile: null, tokens: [], courses: [] };
    this.focus = null;
    this.nav = null;
    this.zoneId = null;
    this.peers = new Map();
    this.bots = new Map();
    this.sitting = false;
    this.inside = null; // { key, spec, built, ... } while in a building interior
    this.interiors = new Map();
    this.floorY = 0.2;
  }

  async start(onProgress = () => {}) {
    onProgress(0.05, 'Preparing renderer');
    this._initRenderer();
    if (this.quality !== 'low') {
      onProgress(0.1, 'Loading people & vehicles');
      let n = 0;
      const tick = () => onProgress(0.1 + (++n / 3) * 0.25, 'Loading people & vehicles');
      await Promise.all([initHumans(this.quality, [this.me.avatar || pickPerson([...this.me.id].reduce((a, c) => a + c.charCodeAt(0), 0)), ...AGENTS.map((a) => a.person), ...RESIDENTS.map((r) => r.person)]).then(tick), this._loadCar().then(tick), loadModel('plant').then(tick)]).catch((e) => console.warn('Realistic assets unavailable, using stylised fallback', e));
    }
    onProgress(0.4, `Building ${WORLD.name}`);
    await frame();
    this.city = new City(this.scene, { quality: this.quality, places: PLACES, parcels: PARCELS.filter((p) => !p.venue), billboards: this.flags.WORLD_ADS_ENABLED ? BILLBOARDS : [], plaza: PLAZA, filler: FILLER_CELLS, tools: TOOLS, agents: AGENTS });
    this.obstacles = new Obstacles(4);
    for (const [x, z, r] of this.city.obstacles) this.obstacles.add(x, z, r);
    this.crowd = [];
    this.city.onCollidersChanged = () => this._rebuildNav();
    this._rebuildNav();
    onProgress(0.6, 'Loading your Pludor identity');
    await frame();
    this.hud = new Hud(this.root, this);
    this.sheets = new Sheets(this.hud.sheetEl, this);
    if (assetErrors.length) {
      console.warn('Asset errors', assetErrors);
      setTimeout(() => this.hud.toast(`Some 3D models couldn't load (${assetErrors.length}). Showing simplified figures.`, '⚠️'), 1500);
    }
    this._initPlayer();
    this._initAgents();
    this._initAmbient();
    this._initTokens();
    this._initInput();
    await this.refresh();
    onProgress(0.9, 'Entering the world');
    this._initMultiplayer();
    this.api.subscribe((evt) => this._onAdapterEvent(evt));
    this.api.gamification.track(EV.ENTERED_WORLD, { worldId: WORLD.id, districtId: DISTRICT.id }).then((r) => this.hud.showProgress(r)).catch(() => {});
    this.api.analytics.track('world_entry', { worldId: WORLD.id });
    setInterval(() => this.refreshLight(), 4000);
    setInterval(() => this._rotateAds(), 5000);
    this._rotateAds();
    this.renderer.setAnimationLoop(() => this._tick());
    onProgress(1, 'Ready');
  }

  // ───────────────────────── setup ─────────────────────────
  _initRenderer() {
    const canvas = this.root.querySelector('.pw-canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.lowPower, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, this.quality === 'low' ? 1 : this.lowPower ? 1.5 : 1.75));
    this.renderer.shadowMap.enabled = this.quality !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog('#bcd7ea', this.quality === 'low' ? 120 : 260, this.quality === 'low' ? 420 : 1500);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.3, 2000);
    // Over-the-shoulder by default: low, behind the player, looking up the boulevard.
    this.cam = { yaw: 0, pitch: 0.16, dist: 7.5, target: new THREE.Vector3(), lookUp: 1.3 };
    this.hemi = new THREE.HemisphereLight('#dfefff', '#4b5a3c', 0.9);
    this.sun = new THREE.DirectionalLight('#fff3dc', 2.2);
    this.sun.castShadow = true;
    const S = this.lowPower ? 1024 : 2048;
    this.sun.shadow.mapSize.set(S, S);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -60;
    sc.right = sc.top = 60;
    sc.near = 1;
    sc.far = 260;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.hemi, this.sun, this.sun.target);
    if (this.quality !== 'low') {
      this.env = new Environment(this.renderer, this.scene, this.quality);
      this.env.addWater({ z: 134 });
    }
    this.post = new PostFX(this.renderer, this.scene, this.camera, this.quality);
    const resize = () => {
      const w = this.root.clientWidth;
      const h = this.root.clientHeight;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.fov = w < 700 ? 70 : 60;
      this.camera.updateProjectionMatrix();
      this.post?.setSize(w, h);
    };
    new ResizeObserver(resize).observe(this.root);
    resize();
  }

  _rebuildNav() {
    this.navGrid = new NavGrid({ half: DISTRICT.half + 6, cell: 2, blockers: this.city.colliders.filter((c) => !c.round && c.x1 - c.x0 < 400), pad: 0.8 });
    this.navGrid.block(-6, 6, -6, 6);
    for (const o of this.obstacles?.list || []) if (o.r >= 0.35) this.navGrid.block(o.x, o.x, o.z, o.z);
  }

  _initPlayer() {
    const p = this.me;
    this.player = createAvatar({ color: p.color, skin: p.skin, seed: [...p.id].reduce((a, c) => a + c.charCodeAt(0), 0), ring: p.color, quality: this.quality, person: p.avatar || pickPerson([...p.id].reduce((a, c) => a + c.charCodeAt(0), 0)) });
    // Resume where the server last saw this player, else the district spawn.
    const sp = this.spawn || DISTRICT.spawn;
    this.player.position.set(sp.x, 0.2, sp.z);
    this.player.rotation.y = this.spawn?.ry ?? Math.PI; // face north, towards the plaza and Pludor Tower
    this.cam.yaw = this.player.rotation.y - Math.PI;
    this.scene.add(this.player);
    this.vel = new THREE.Vector2();
    this.speed = 0;
    this.cam.target.copy(this.player.position);
    // Destination marker for AI / map navigation.
    this.navMarker = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.1, 32), new THREE.MeshBasicMaterial({ color: '#7c5cff', transparent: true, opacity: 0.9, depthWrite: false }));
    this.navMarker.rotation.x = -Math.PI / 2;
    this.navMarker.visible = false;
    this.scene.add(this.navMarker);
  }

  // Normalise the car model: real-world length, front facing +Z, on the ground.
  async _loadCar() {
    const gltf = await loadModel('car');
    const src = gltf.scene.clone(true);
    src.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(src);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const head = new THREE.Box3();
    src.traverse((o) => o.isMesh && /headlight/i.test(o.material.name) && head.expandByObject(o));
    const hc = head.isEmpty() ? center.clone().add(new THREE.Vector3(0, 0, 1)) : head.getCenter(new THREE.Vector3());
    const alongX = size.x > size.z;
    const sign = Math.sign(alongX ? hc.x - center.x : hc.z - center.z) || 1;
    const holder = new THREE.Group();
    holder.add(src);
    holder.rotation.y = alongX ? (sign > 0 ? -Math.PI / 2 : Math.PI / 2) : sign > 0 ? 0 : Math.PI;
    this.carTemplate = fitObject(holder, 4.5);
  }

  recolorPlayer(color) {
    recolorAvatar(this.player, color);
  }

  setPlayerPerson(id) {
    setPerson(this.player, id);
  }

  portrait(personId) {
    return portraitOf(this.renderer, personId);
  }

  personOf(userId) {
    if (userId === this.state.profile?.id) return this.player.userData.person;
    const b = this.bots.get(userId);
    if (b) return b.avatar.userData.person;
    return this.peers.get(userId)?.avatar.userData.person || null;
  }

  _initAgents() {
    this.agents = AGENTS.map((a, i) => {
      const av = createAvatar({ color: a.color, skin: ['#c68642', '#8d5524', '#f1c27d', '#5c3a21', '#e0ac69'][i % 5], seed: i + 1, ring: a.color, quality: this.quality, person: a.person });
      av.position.set(a.x, 0.2, a.z);
      this.scene.add(av);
      return { ...a, avatar: av };
    });
  }

  _initAmbient() {
    // Pedestrians loop sidewalk rings; cars loop road rings.
    const count = this.lowPower ? 10 : 20;
    const shirt = ['#e76f51', '#2a9d8f', '#e9c46a', '#8ab17d', '#6d597a', '#457b9d', '#f4a261', '#b5838d'];
    const skins = ['#8d5524', '#c68642', '#e0ac69', '#f1c27d', '#5c3a21'];
    this.walkers = [];
    for (let k = 0; k < count; k++) {
      const i = (k * 7) % 5 - 2;
      const j = (k * 3) % 5 - 2;
      const b = cellBounds(i, j);
      const inset = 1.6;
      const ring = [[b.x0 + inset, b.z0 + inset], [b.x1 - inset, b.z0 + inset], [b.x1 - inset, b.z1 - inset], [b.x0 + inset, b.z1 - inset]];
      if (k % 2) ring.reverse();
      const av = createAvatar({ color: shirt[k % shirt.length], skin: skins[k % skins.length], seed: k * 7 + 3, quality: this.quality });
      this.scene.add(av);
      this.walkers.push({ av, ring, seg: k % 4, t: (k * 0.37) % 1, speed: 1.15 + (k % 5) * 0.1 });
    }
    // Plaza crowd: strollers looping around the fountain at varied radii.
    const strollers = this.quality === 'low' ? 6 : this.lowPower ? 10 : 16;
    for (let k = 0; k < strollers; k++) {
      const r0 = 9 + (k % 5) * 3.2;
      const n = 8;
      const ring = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + k * 0.4;
        const r = r0 + Math.sin(i * 1.7 + k) * 1.5;
        ring.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
      if (k % 2) ring.reverse();
      const av = createAvatar({ color: shirt[k % shirt.length], skin: skins[k % skins.length], seed: k * 13 + 5, quality: this.quality });
      this.scene.add(av);
      this.walkers.push({ av, ring, seg: k % n, t: (k * 0.29) % 1, speed: 1.1 + (k % 4) * 0.12 });
    }
    // People chatting in small groups near the terraces and the hub.
    this.idlers = [];
    const groups = [[-19, -6], [-19, 15], [17, 4], [6, -24], [-9, 22]];
    groups.forEach(([gx, gz], gi) => {
      const size = 2 + (gi % 2);
      for (let i = 0; i < size; i++) {
        const a = (i / size) * Math.PI * 2 + gi;
        const av = createAvatar({ color: shirt[(gi + i) % shirt.length], skin: skins[i % skins.length], seed: gi * 31 + i * 7 + 11, quality: this.quality });
        av.position.set(gx + Math.cos(a) * 0.8, 0.2, gz + Math.sin(a) * 0.8);
        av.rotation.y = Math.atan2(gx - av.position.x, gz - av.position.z);
        this.scene.add(av);
        this.idlers.push({ av, emote: i === 0 ? 'talk' : null });
      }
    });
    const carGeo = { body: new THREE.BoxGeometry(2, 0.8, 4.2), cabin: new THREE.BoxGeometry(1.7, 0.7, 2.2), wheel: new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12) };
    const carCols = ['#e63946', '#f1faee', '#1d3557', '#ffb703', '#2a9d8f', '#8338ec', '#fb5607', '#adb5bd'];
    const wheelMat = new THREE.MeshStandardMaterial({ color: '#1b1b1b' });
    const glassMat = new THREE.MeshStandardMaterial({ color: '#1e2a38', roughness: 0.1, metalness: 0.5 });
    this.lightMat = new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#fff2c4', emissiveIntensity: 0.2 });
    this.carLights = new Set([this.lightMat]);
    this.cars = [];
    const loops = [-75, -75]; // inner ring is pedestrianised around the plaza
    const nCars = this.lowPower ? 5 : 8;
    for (let k = 0; k < nCars; k++) {
      const R = Math.abs(loops[k % 2]);
      const cw = k % 4 < 2;
      const off = cw ? -2.4 : 2.4;
      const r = R + off;
      let ring = [[-r, -r], [r, -r], [r, r], [-r, r]];
      if (!cw) ring = ring.reverse();
      let g;
      let brake = null;
      if (this.carTemplate) {
        g = this.carTemplate.clone(true);
        const paint = new THREE.Color(carCols[k % carCols.length]);
        g.traverse((o) => {
          if (!o.isMesh) return;
          if (/paint/i.test(o.material.name)) {
            o.material = o.material.clone();
            o.material.color.copy(paint);
          }
          if (/brakelight/i.test(o.material.name)) {
            brake ||= o.material.clone();
            o.material = brake;
          } else if (/headlight/i.test(o.material.name)) this.carLights.add(o.material);
        });
      } else {
        g = new THREE.Group();
        const body = new THREE.Mesh(carGeo.body, new THREE.MeshStandardMaterial({ color: carCols[k % carCols.length], roughness: 0.35, metalness: 0.4 }));
        body.position.y = 0.75;
        const cabin = new THREE.Mesh(carGeo.cabin, glassMat);
        cabin.position.set(0, 1.45, -0.2);
        g.add(body, cabin);
        for (const [x, z] of [[-0.95, 1.3], [0.95, 1.3], [-0.95, -1.3], [0.95, -1.3]]) {
          const w = new THREE.Mesh(carGeo.wheel, wheelMat);
          w.rotation.z = Math.PI / 2;
          w.position.set(x, 0.4, z);
          g.add(w);
        }
        for (const x of [-0.6, 0.6]) {
          const l = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.1), this.lightMat);
          l.position.set(x, 0.85, 2.12);
          g.add(l);
        }
      }
      g.traverse((c) => c.isMesh && (c.castShadow = true));
      this.scene.add(g);
      if (!brake) {
        brake = new THREE.MeshStandardMaterial({ color: '#400', emissive: '#ff1a1a', emissiveIntensity: 0.3 });
        for (const x of [-0.6, 0.6]) {
          const l = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.08), brake);
          l.position.set(x, 0.85, -2.12);
          g.add(l);
        }
      }
      if (brake.emissive) brake.emissive.set('#ff1a1a');
      this.cars.push({ g, ring, seg: k % 4, t: (k * 0.29) % 1, speed: 7 + (k % 3) * 2, brake, honkAt: 0, blockedFor: 0 });
    }
  }

  _initTokens() {
    const geo = new THREE.OctahedronGeometry(0.7, 0);
    const mat = new THREE.MeshStandardMaterial({ color: '#ffb703', emissive: '#ff8800', emissiveIntensity: 1, metalness: 0.6, roughness: 0.2 });
    this.tokenMeshes = new Map();
    for (const t of TOKENS) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(t.x, 1.6, t.z);
      m.visible = false;
      this.scene.add(m);
      this.tokenMeshes.set(t.id, m);
    }
  }

  _initInput() {
    const canvas = this.renderer.domElement;
    addEventListener('keydown', (e) => {
      if (e.target.closest('input, textarea, select')) return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) this.cancelNav();
      if (k === 'e' && !e.repeat) this.hud.primaryAction();
      if (k === 'm' && !e.repeat) this.sheets.open('map');
      if (k === 'escape') this.sheets.close();
      if (k === '/' && !e.repeat) {
        e.preventDefault();
        this.sheets.open('ai');
      }
    });
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => this.keys.clear());
    let drag = null;
    canvas.addEventListener('pointerdown', (e) => {
      drag = { x: e.clientX, y: e.clientY, yaw: this.cam.yaw, pitch: this.cam.pitch, moved: false, id: e.pointerId };
    });
    addEventListener('pointermove', (e) => {
      if (!drag || drag.id !== e.pointerId || this.pinch) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (Math.hypot(dx, dy) > 6) drag.moved = true;
      if (drag.moved) {
        this.cam.yaw = drag.yaw - dx * 0.006;
        this.cam.pitch = Math.max(0.04, Math.min(1.3, drag.pitch + dy * 0.004));
      }
    });
    addEventListener('pointerup', (e) => {
      if (drag && drag.id === e.pointerId && !drag.moved && e.target === canvas) this._click(e);
      drag = null;
    });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.cam.dist = Math.max(3.5, Math.min(70, this.cam.dist * (1 + Math.sign(e.deltaY) * 0.1)));
    }, { passive: false });
    // Pinch zoom
    const touches = new Map();
    canvas.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) touches.set(t.identifier, t);
      if (touches.size === 2) {
        const [a, b] = [...touches.values()];
        this.pinch = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), dist: this.cam.dist };
      }
    }, { passive: true });
    canvas.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) touches.set(t.identifier, t);
      if (this.pinch && touches.size === 2) {
        const [a, b] = [...touches.values()];
        const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        this.cam.dist = Math.max(3.5, Math.min(70, (this.pinch.dist * this.pinch.d) / d));
      }
    }, { passive: true });
    const endTouch = (e) => {
      for (const t of e.changedTouches) touches.delete(t.identifier);
      if (touches.size < 2) setTimeout(() => (this.pinch = null), 50);
    };
    canvas.addEventListener('touchend', endTouch);
    canvas.addEventListener('touchcancel', endTouch);
    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.2);
  }

  _click(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const avatars = [...this.peers.values(), ...this.bots.values()].map((p) => p.avatar).concat(this.agents.map((a) => a.avatar));
    const hits = this.raycaster.intersectObjects([...this.city.pickables, ...avatars], true);
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData.ref && !o.userData.personRef) o = o.parent;
      if (!o) continue;
      if (o.userData.personRef) return this.openRef(o.userData.personRef);
      if (o.userData.ref.type === 'place' && this.interiorSpec('place', o.userData.ref.id)) return this.visitPlace(o.userData.ref.id);
      return this.openRef(o.userData.ref);
    }
    const pt = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.groundPlane, pt)) this.navigateTo({ x: pt.x, z: pt.z }, null, true);
  }

  _initMultiplayer() {
    if (!this.flags.WORLD_MULTIPLAYER_ENABLED) return;
    // Demo residents: always-on players so a single tab still feels alive.
    RESIDENTS.forEach((r, i) => {
      const a = BOT_ANCHORS[r.walk] || BOT_ANCHORS.plaza;
      const av = createAvatar({ color: r.color, skin: r.skin, seed: i + 2, quality: this.quality, person: r.person });
      av.position.set(a.x + (i % 3) - 1, 0.2, a.z + 1);
      av.userData.personRef = { type: 'player', id: r.id };
      this.scene.add(av);
      this.bots.set(r.id, { id: r.id, handle: r.handle, displayName: r.displayName, presence: r.presence, color: r.color, avatar: av, anchor: a, path: null, wait: Math.random() * 3, speed: 0, bot: true });
    });
    if (!this.transport) return;
    this.transport.onPeers(() => this._syncPeers());
    // Server-authoritative movement: snap back when the hub rejects a move.
    this.transport.onCorrection?.((pos) => {
      this.player.position.set(pos.x, 0.2, pos.z);
      this.cancelNav();
    });
    setInterval(() => this._syncPeers(), 1500);
    this.transport.hello();
    setInterval(() => this._publish(), 100);
  }

  _publish() {
    const p = this.player.position;
    const prof = this.state.profile || {};
    this.transport.publishState({
      profile: { handle: prof.handle, displayName: prof.displayName, color: prof.color, skin: this.me.skin, presence: prof.presence, roles: prof.roles, bio: prof.bio, avatar: this.player.userData.person, look: this.player.userData.look || null },
      x: +p.x.toFixed(2), z: +p.z.toFixed(2), ry: +this.player.rotation.y.toFixed(2), moving: this.speed > 0.1, emote: this.emote, inside: this.inside?.key || null,
    });
  }

  _syncPeers() {
    const live = new Set();
    for (const peer of this.transport.peers()) {
      live.add(peer.id);
      let entry = this.peers.get(peer.id);
      if (entry && peer.avatar && entry.avatar.userData.person !== peer.avatar) setPerson(entry.avatar, peer.avatar);
      if (entry && lookKey(peer.look) !== lookKey(entry.avatar.userData.look)) applyLook(entry.avatar, peer.look);
      if (!entry) {
        const av = createAvatar({ color: peer.color, skin: peer.skin, seed: [...peer.id].reduce((a, c) => a + c.charCodeAt(0), 0), quality: this.quality, person: peer.avatar || pickPerson([...peer.id].reduce((a, c) => a + c.charCodeAt(0), 0)) });
        av.position.set(peer.x, 0.2, peer.z);
        av.userData.personRef = { type: 'player', id: peer.id };
        if (peer.look) applyLook(av, peer.look);
        this.scene.add(av);
        entry = { id: peer.id, avatar: av, speed: 0 };
        this.peers.set(peer.id, entry);
        this.hud.toast(`@${peer.handle} entered ${WORLD.name}`, '👋');
      }
    }
    for (const [id, e] of this.peers) {
      if (!live.has(id)) {
        this.scene.remove(e.avatar);
        this.peers.delete(id);
      }
    }
  }

  // ───────────────────────── data ─────────────────────────
  async refresh() {
    const [profile, progress, wallet, needs, gigs, parcels, events, tokens, courses] = await Promise.all([
      this.api.identity.getCurrentUser(),
      this.api.gamification.getProgress(),
      this.api.wallet.getWallet(),
      this.flags.WORLD_NEEDS_ENABLED ? this.api.needs.getNeeds() : {},
      this.flags.WORLD_GIGS_ENABLED ? this.api.work.listGigs() : [],
      this.flags.WORLD_LAND_ENABLED ? this.api.land.listParcels() : [],
      this.flags.WORLD_EVENTS_ENABLED ? this.api.events.listEvents() : [],
      this.api.world.listTokens(),
      this.api.learning.listCourses(),
    ]);
    Object.assign(this.state, { profile, progress, wallet, needs, gigs, parcels, events, tokens, courses });
    if (profile.avatar && profile.avatar !== this.player.userData.person) setPerson(this.player, profile.avatar);
    if (!this.studio && lookKey(profile.look) !== lookKey(this.player.userData.look)) applyLook(this.player, profile.look, { hi: true });
    for (const p of parcels) this.city.setParcelState(p.id, p.building, p.rentLabel);
    if (this.inside?.spec.units) this._refreshInterior();
    this._parkMyCars();
    this.hud.render();
    this.sheets.refresh();
  }

  async refreshLight() {
    const [needs, events, wallet] = await Promise.all([
      this.flags.WORLD_NEEDS_ENABLED ? this.api.needs.getNeeds() : {},
      this.flags.WORLD_EVENTS_ENABLED ? this.api.events.listEvents() : [],
      this.api.wallet.getWallet(),
    ]);
    Object.assign(this.state, { needs, events, wallet });
    this.hud.render();
  }

  _refreshSoon() {
    clearTimeout(this._rt);
    this._rt = setTimeout(() => this.refresh(), 60);
  }

  _onAdapterEvent(evt) {
    switch (evt.kind) {
      case 'progress':
        this.hud.showProgress(evt);
        this._refreshSoon();
        break;
      case 'message':
        this.hud.notify({ icon: '💬', title: this.personName(evt.from), body: evt.text, action: () => this.sheets.open('chat', { userId: evt.from }) });
        this.sheets.onMessage(evt);
        break;
      case 'call':
        this.hud.onCall(evt.call);
        break;
      case 'wave':
        this.hud.toast(`@${this.personHandle(evt.from)} waved at you`, '👋');
        break;
      case 'friend':
        this.hud.toast(`@${this.personHandle(evt.from)} added you as a friend`, '🤝');
        break;
      case 'order':
        this.hud.notify({ icon: '📦', title: evt.businessName, body: `Order ${String(evt.status).replace(/_/g, ' ')}`, action: () => this.sheets.open(evt.orderId ? 'track' : 'orders', evt.orderId ? { id: evt.orderId } : {}) });
        if (this.sheets.top?.view === 'track') this.sheets.refresh();
        break;
      case 'work': {
        const msg = { assigned: `You're hired for “${evt.title}”. Do the work, then submit.`, completed: `Payment released: “${evt.title}”`, applicant: `${evt.requester} applied to “${evt.title}”`, submitted: `${evt.requester} delivered “${evt.title}” — review it` }[evt.status];
        if (msg) this.hud.notify({ icon: evt.status === 'completed' ? '💸' : '💼', title: 'Work', body: msg, action: () => this.sheets.open('gig', { id: evt.gigId }) });
        this._refreshSoon();
        break;
      }
      case 'merchant-order':
        this.hud.notify({ icon: '🧾', title: evt.businessName, body: evt.status === 'placed' ? 'New order — accept it in your store' : evt.status === 'sold' ? 'Your listing sold!' : `Order ${String(evt.status).replace(/_/g, ' ')}`, action: () => this.sheets.open('land') });
        this._refreshSoon();
        break;
      case 'delivery':
        this.hud.notify({ icon: '🛵', title: 'Delivery', body: `${evt.businessName}: ${String(evt.status).replace(/_/g, ' ')}`, action: () => this.sheets.open('work', { tab: 'deliveries' }) });
        break;
      case 'link':
        this.hud.showLink(evt.route);
        break;
      case 'state':
      case 'sync':
        this._refreshSoon();
        break;
      default:
    }
  }

  personName(id) {
    const b = this.bots.get(id);
    if (b) return b.displayName;
    const p = this.transport?.getPeer(id);
    return p?.displayName || 'Player';
  }

  personHandle(id) {
    const b = this.bots.get(id);
    if (b) return b.handle;
    return this.transport?.getPeer(id)?.handle || 'player';
  }

  people() {
    const out = [];
    const here = this.inside?.key || null;
    if (here) {
      for (const [id] of this.peers) {
        const p = this.transport.getPeer(id);
        if (p && (p.inside || null) === here) out.push({ id, name: p.handle, displayName: p.displayName, presence: p.presence, color: p.color, x: p.x, z: p.z });
      }
      return out;
    }
    for (const b of this.bots.values()) out.push({ id: b.id, name: b.handle, displayName: b.displayName, presence: b.presence, color: b.color, x: b.avatar.position.x, z: b.avatar.position.z, bot: true });
    for (const [id] of this.peers) {
      const p = this.transport.getPeer(id);
      if (p && !p.inside) out.push({ id, name: p.handle, displayName: p.displayName, presence: p.presence, color: p.color, x: p.x, z: p.z });
    }
    return out;
  }

  // ───────────────────────── world model for HUD / AI ─────────────────────────
  placeView(p) {
    const t = this.worldTime();
    const open = !p.hours || (t.hoursF >= p.hours[0] && t.hoursF < (p.hours[1] > 24 ? 24 : p.hours[1]));
    return {
      ...p, open, entrance: entrancePoint(p),
      kindLabel: { cafe: 'Café', restaurant: 'Restaurant', market: 'Market', creator: 'Creator Hub', community: 'Signals community', education: 'University', ai: 'AI Studio', games: 'Arcade', transit: 'Transit hub', media: 'Cinema', store: 'Store', service: 'Service', tools: 'Free tools', foodcourt: 'Food court', hotel: 'Hotel', conference: 'Conference center', cowork: 'Cowork space', supermarket: 'Supermarket', apartments: 'Apartments' }[p.kind] || p.kind,
      commerce: ['cafe', 'restaurant', 'store'].includes(p.kind),
      bookable: p.kind === 'service' && p.link.id !== 'lb_fixit_repair',
      rating: { biz_casa_nova: 4.7, biz_daily_grind: 4.7, biz_ember_grill: 4.6, biz_kicks_co: 4.8, biz_lumi_salon: 4.9, lb_fixit_repair: 4.1 }[p.link.id],
      ownerId: RESIDENTS.find((r) => r.owns === p.link.id)?.id,
    };
  }

  gigPosition(g) {
    if (g.placeId) {
      const p = PLACES.find((x) => x.id === g.placeId);
      if (p) return entrancePoint(p, 1.2);
    }
    if (g.parcelId) {
      const p = PARCELS.find((x) => x.id === g.parcelId);
      if (p) return { x: p.x, z: p.z - p.d / 2 - 1 };
    }
    return { x: 0, z: -33 };
  }

  aiContext() {
    const pos = this.player.position;
    return {
      player: { x: pos.x, z: pos.z },
      zoneName: zoneAt(pos.x, pos.z)?.name || WORLD.name,
      focus: this.focus ? { type: this.focus.ref.type, id: this.focus.ref.id, name: this.focus.label, x: this.focus.x, z: this.focus.z } : null,
      places: PLACES.map((p) => this.placeView(p)),
      gigs: this.state.gigs.filter((g) => !g.mine && (g.status === undefined || g.status === 'open') && g.application?.status !== 'completed').map((g) => ({ ...g, ...this.gigPosition(g), missing: g.missing.map((m) => `${m.label} L${m.level}`), courseId: g.course?.id })),
      parcels: this.state.parcels.map((p) => ({ ...p, entrance: { x: p.x, z: p.z - p.d / 2 - 2 } })),
      players: this.people(),
      courses: this.state.courses,
      liveEvents: this.state.events.filter((e) => e.live),
    };
  }

  worldTime() {
    return worldTimeAt(Date.now(), ECONOMY.time);
  }

  // ───────────────────────── navigation ─────────────────────────
  navigateTo(target, label = null, quiet = false) {
    const from = { x: this.player.position.x, z: this.player.position.z };
    const path = this.navGrid.find(from, target);
    if (!path) {
      if (!quiet) this.hud.toast("Can't find a way there", '🚧');
      return false;
    }
    this.sitting = false;
    this.nav = { path, i: 1, label, target };
    this.navMarker.position.set(target.x, 0.25, target.z);
    this.navMarker.visible = true;
    this.hud.setNav(label);
    return true;
  }

  cancelNav() {
    if (!this.nav) return;
    this.nav = null;
    this.navMarker.visible = false;
    this.hud.setNav(null);
  }

  // Fast travel via Wayfare (in-world only; real rides open Wayfare).
  async teleport(placeId) {
    const p = PLACES.find((x) => x.id === placeId);
    const dest = p ? entrancePoint(p, 3.5) : DISTRICT.spawn;
    if (this.inside) this._leaveInterior();
    this.hud.fade(async () => {
      this.player.position.set(dest.x, 0.2, dest.z);
      this.cam.target.copy(this.player.position);
      this.cancelNav();
    });
  }

  openRef(ref) {
    if (!ref) return;
    switch (ref.type) {
      case 'place':
        return this.enterPlace(ref.id);
      case 'parcel':
        return this.sheets.open('parcel', { id: ref.id });
      case 'billboard':
        return this.sheets.open('billboard', { id: ref.id });
      case 'player':
        return this.sheets.open('player', { id: ref.id });
      case 'agent':
        return this.sheets.open('agent', { id: ref.id });
      case 'plaza':
        return this.sheets.open('plaza');
      case 'gig':
        return this.sheets.open('gig', { id: ref.id });
      case 'course':
        return this.sheets.open('course', { id: ref.id });
      case 'event':
        return this.sheets.open('events', { highlight: ref.id });
      case 'spot':
        return this.focus?.acts?.[0]?.run();
      case 'mycar':
        this.hud.toast('Hop in — pick where to drive', '🚗');
        return this.sheets.open('map');
      default:
    }
  }

  enterPlace(id) {
    const p = PLACES.find((x) => x.id === id);
    if (!p) return;
    this.api.gamification.track(EV.ENTERED_BUSINESS, { placeId: id, businessId: p.link.id }).then((r) => this.hud.showProgress(r)).catch(() => {});
    this.api.analytics.track('building_entry', { placeId: id });
    this.sheets.open('place', { id });
  }

  // Cars bought in the Pludor Store park outside your home.
  _parkMyCars() {
    const owned = this.state.wallet?.owned || [];
    const cars = (ECONOMY.virtualItems || []).filter((i) => i.kind === 'car' && owned.includes(i.id));
    const key = cars.map((c) => c.id).join(',') + (this.state.parcels.find((p) => p.mine)?.id || '');
    if (key === this._myCarsKey) return;
    this._myCarsKey = key;
    for (const g of this.myCars || []) {
      this.scene.remove(g);
      this.city.pickables = this.city.pickables.filter((x) => x !== g);
      this._grid?.remove(`mycar:${g.userData.ref.id}`);
    }
    this.myCars = [];
    const apt = this.state.parcels.find((p) => p.mine && p.building?.template === 'apartment');
    const home = this.state.parcels.find((p) => p.mine && !p.venue);
    const base = apt ? entrancePoint(PLACES.find((p) => p.id === apt.venue), 4) : home ? { x: home.x + 6, z: home.z - home.d / 2 - 3 } : { x: 9, z: 31 };
    cars.forEach((c, i) => {
      let g;
      if (this.carTemplate) {
        g = this.carTemplate.clone(true);
        g.traverse((o) => {
          if (o.isMesh && /paint/i.test(o.material.name)) {
            o.material = o.material.clone();
            o.material.color.set(c.color);
          }
        });
      } else {
        g = new THREE.Mesh(new THREE.BoxGeometry(2, 1.3, 4.3), new THREE.MeshStandardMaterial({ color: c.color, metalness: 0.4, roughness: 0.35 }));
        g.position.y = 0.65;
      }
      const holder = new THREE.Group();
      holder.add(g);
      holder.position.set(base.x + i * 2.8, 0.2, base.z + 3);
      holder.rotation.y = Math.PI / 2;
      holder.userData.ref = { type: 'mycar', id: c.id };
      this.scene.add(holder);
      this.city.pickables.push(holder);
      this.myCars.push(holder);
      this.obstacles.add(holder.position.x, holder.position.z, 1.4);
      this._grid?.upsert(`mycar:${c.id}`, holder.position.x, holder.position.z, { ref: { type: 'mycar', id: c.id }, label: `Your ${c.name}`, r: 4 });
    });
  }

  onVirtualOwned() {
    this._parkMyCars();
  }

  // ───────────────────────── avatar studio ─────────────────────────
  startStudio() {
    if (this.studio) return;
    this.cancelNav();
    this.studio = { person: this.player.userData.person, look: this.player.userData.look || null, cam: { yaw: this.cam.yaw, pitch: this.cam.pitch, dist: this.cam.dist } };
    this.studioSaved = false;
    // Face the camera: camera sits in front of the player.
    this.cam.yaw = this.player.rotation.y;
    this.cam.pitch = 0.1;
    this.cam.dist = 2.7;
    this.cam.curDist = undefined;
  }

  previewLook(draft) {
    if (draft.person !== this.player.userData.person) setPerson(this.player, draft.person);
    applyLook(this.player, draft.look, { hi: true });
  }

  endStudio() {
    const st = this.studio;
    if (!st) return;
    this.studio = null;
    if (!this.studioSaved) {
      // Discard the preview.
      if (st.person !== this.player.userData.person) setPerson(this.player, st.person);
      applyLook(this.player, st.look, { hi: true });
    }
    Object.assign(this.cam, st.cam);
    this.cam.curDist = undefined;
    if (this.transport) this._publish();
  }

  // ───────────────────────── interiors ─────────────────────────
  interiorSpec(type, id) {
    if (type === 'apt') {
      // A private apartment: a furnished home layered on the tower's footprint.
      const u = this.state.parcels.find((x) => x.id === id);
      const v = u && PLACES.find((p) => p.id === u.venue);
      if (!v) return null;
      return { key: `apt:${id}`, type, id, kind: 'home', x: v.x, z: v.z, w: 20, d: 16, facing: v.facing, name: u.name.split(' · ')[0], accent: v.accent, parcelId: id, exitTo: { type: 'place', id: v.id } };
    }
    if (type === 'place') {
      const p = PLACES.find((x) => x.id === id);
      const kind = interiorKindFor(p);
      if (!kind) return null;
      const units = this.state.parcels.filter((u) => u.venue === id).map((u) => ({ ...u, staff: RESIDENTS.find((r) => r.id === u.tenant?.id)?.person || null }));
      return { units, key: `place:${id}`, type, id, kind, x: p.x, z: p.z, w: p.w, d: p.d, facing: p.facing, name: p.name, accent: p.accent, placeId: id, activity: p.activity, linkId: p.link?.id, place: p };
    }
    const p = this.state.parcels.find((x) => x.id === id) || PARCELS.find((x) => x.id === id);
    if (p?.venue) return this.interiorSpec('place', p.venue);
    const b = p?.building;
    if (!b) return null;
    const [fx, fz] = facingVector(p.facing);
    const label = b.businessName || (b.template === 'home' ? `${b.tenantName}'s Home` : `${b.tenantName}'s ${b.template === 'studio' ? 'Studio' : 'Shop'}`);
    return { key: `parcel:${id}`, type, id, kind: b.template === 'home' ? 'home' : 'shop', x: p.x - fx * 2, z: p.z - fz * 2, w: p.w - 4, d: p.d - 8, facing: p.facing, name: label, accent: '#36d399', parcelId: id, owner: b.tenantName, parcel: p };
  }

  // Walk to a building's door and go in (or go straight in if already there).
  visitPlace(id) {
    const p = PLACES.find((x) => x.id === id);
    if (!p) return;
    if (this.inside?.key === `place:${id}`) return;
    const e = entrancePoint(p, 1.2);
    const pp = this.player.position;
    if (!this.inside && Math.hypot(e.x - pp.x, e.z - pp.z) < 6) return this.enterBuilding('place', id);
    if (this.inside) this.exitBuilding();
    setTimeout(() => {
      if (this.navigateTo(e, p.name)) this.nav.enter = { type: 'place', id };
    }, this.inside ? 900 : 0);
  }

  _rot(facing) {
    return { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }[facing] || 0;
  }

  _toWorld(spec, lx, lz) {
    const th = this._rot(spec.facing);
    return { x: spec.x + lx * Math.cos(th) + lz * Math.sin(th), z: spec.z - lx * Math.sin(th) + lz * Math.cos(th) };
  }

  _toLocal(inside, x, z) {
    const th = this._rot(inside.spec.facing);
    const dx = x - inside.spec.x;
    const dz = z - inside.spec.z;
    return { x: dx * Math.cos(th) - dz * Math.sin(th), z: dx * Math.sin(th) + dz * Math.cos(th) };
  }

  async _menuFor(spec) {
    const extra = {};
    if (spec.units?.length) {
      extra.units = await Promise.all(spec.units.map(async (u) => {
        if (!u.building?.businessName) return u;
        const biz = await this.api.commerce.getBusiness(`pb_${u.id}`).catch(() => null);
        return { ...u, catalog: biz?.catalog || [] };
      }));
    }
    try {
      if (['cafe', 'restaurant'].includes(spec.kind)) {
        const biz = await this.api.commerce.getBusiness(spec.linkId);
        extra.menu = (biz.catalog || []).slice(0, 7).map((c) => ({ name: c.name, price: `${this.state.wallet?.symbol || '$'}${c.price}` }));
      }
      if (spec.kind === 'cowork' || spec.kind === 'creator') extra.gigs = this.state.gigs.filter((g) => !g.mine && (!g.status || g.status === 'open')).slice(0, 6).map((g) => ({ title: g.title, budget: g.compensation?.amount ?? '' }));
      if (spec.kind === 'classroom') {
        extra.courses = (this.state.courses || []).map((c) => ({ title: c.title, minutes: c.minutes || c.durationMin, faculty: c.faculty, done: c.completed }));
        extra.faculties = FACULTIES;
      }
      if (spec.kind === 'cinema' || spec.kind === 'conference') extra.liveHandles = [...this.bots.values()].map((b) => b.handle).concat(['kemi', 'dev', 'ines']).slice(0, 6);
    } catch {
      /* boards fall back to defaults */
    }
    return extra;
  }

  _unitSig(spec) {
    return (spec.units || []).map((u) => `${u.id}:${u.status}:${u.building?.businessName || ''}:${u.mine ? 1 : 0}`).join('|');
  }

  async _ensureInterior(spec) {
    const sig = this._unitSig(spec);
    const cached = this.interiors.get(spec.key);
    if (cached && cached.sig === sig) return cached;
    if (cached) {
      this.scene.remove(cached.built.group);
      this.interiors.delete(spec.key);
    }
    const built = buildInterior({ ...spec, ...(await this._menuFor(spec)) });
    const g = built.group;
    g.position.set(spec.x, INTERIOR_Y, spec.z);
    g.rotation.y = this._rot(spec.facing);
    g.visible = false;
    this.scene.add(g);
    const toW = (lx, lz) => this._toWorld(spec, lx, lz);
    const boxW = (c) => {
      const a = toW(c.x0, c.z0);
      const b = toW(c.x1, c.z1);
      return { x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), z0: Math.min(a.z, b.z), z1: Math.max(a.z, b.z) };
    };
    const colliders = built.colliders.map(boxW);
    const walls = colliders.slice(0, 5);
    const obstacles = built.obstacles.map(([x, z, r]) => ({ ...toW(x, z), r }));
    const grid = new SpatialGrid(8);
    built.spots.forEach((sp, i) => {
      const w = toW(sp.x, sp.z);
      grid.upsert(`spot:${i}`, w.x, w.z, { ref: { type: 'spot', id: `${spec.key}#${i}` }, label: sp.label, sub: sp.sub, r: sp.r, acts: sp.acts.map((a) => ({ id: a.id, icon: a.icon, label: a.label, run: () => this._spotAction(a.action, spec) })) });
    });
    const staff = built.staff.map((st, i) => {
      const av = createAvatar({ seed: 500 + i, quality: this.quality, person: st.person });
      av.position.set(st.x, 0.2, st.z);
      av.rotation.y = st.ry;
      g.add(av);
      return av;
    });
    const entry = { key: spec.key, spec, built, colliders, walls, obstacles, grid, staff, sig };
    this.interiors.set(spec.key, entry);
    return entry;
  }

  _spotAction(action, spec) {
    switch (action.type) {
      case 'exit':
        return this.exitBuilding();
      case 'sheet':
        return this.sheets.open(action.view, action.props || {});
      case 'activity':
        return this.sheets.activity(action.id, spec.kind === 'home' ? 'home' : spec.placeId || spec.id);
      case 'golive':
        return this.sheets.open('events', {});
      case 'home':
        return this.enterBuilding('apt', action.id);
      case 'tour':
        this.hud.toast('Showing you around — rent it from the concierge or the door', '🏢');
        return this.enterBuilding('apt', action.id, true);
      default:
    }
  }

  async enterBuilding(type, id, tour = false) {
    const spec = this.interiorSpec(type, id);
    if (type === 'apt' && spec && !tour && !this.state.parcels.find((x) => x.id === id)?.mine) return this.hud.toast("That's someone else's home", '🚪');
    if (!spec) return type === 'place' ? this.enterPlace(id) : this.sheets.open('parcel', { id });
    if (this._doorBusy || this.inside?.key === spec.key) return;
    this._doorBusy = true;
    const entry = await this._ensureInterior(spec);
    this.hud.fade(() => {
      if (this.inside) this._leaveInterior();
      this.inside = entry;
      entry.built.group.visible = true;
      this.city.root.visible = false;
      if (this.env?.water) this.env.water.visible = false;
      this.floorY = INTERIOR_Y + 0.2;
      const inPt = this._toWorld(spec, 0, entry.built.d / 2 - 2.4);
      this.player.position.set(inPt.x, this.floorY, inPt.z);
      const th = this._rot(spec.facing);
      this.player.rotation.y = th + Math.PI; // face into the room
      this.cam.yaw = th;
      this.cam.pitch = 0.32;
      this._savedDist = this.cam.dist;
      this.cam.dist = Math.min(this.cam.dist, 5);
      this.cam.target.set(inPt.x, this.floorY + 1.4, inPt.z);
      this.cam.curDist = undefined;
      this.cancelNav();
      this.scene.fog.near = 1e4;
      this.scene.fog.far = 2e4;
      this.hud.setZone(spec.name);
      this._focusKey = undefined;
      chime();
      this._doorBusy = false;
    });
    if (type === 'place') {
      const p = spec.place;
      this.api.gamification.track(EV.ENTERED_BUSINESS, { placeId: id, businessId: p.link.id }).then((r) => this.hud.showProgress(r)).catch(() => {});
      this.api.analytics.track('building_entry', { placeId: id, interior: true });
    }
  }

  // Units inside a venue changed (someone rented a stall, opened a business):
  // rebuild the room in place without moving the player.
  async _refreshInterior() {
    const cur = this.inside;
    const spec = this.interiorSpec(cur.spec.type, cur.spec.id);
    if (!spec || this._unitSig(spec) === cur.sig || this._rebuilding) return;
    this._rebuilding = true;
    try {
      const entry = await this._ensureInterior(spec);
      if (this.inside !== cur) return;
      cur.built.group.visible = false;
      entry.built.group.visible = true;
      this.inside = entry;
      this._focusKey = undefined;
    } finally {
      this._rebuilding = false;
    }
  }

  _leaveInterior() {
    const entry = this.inside;
    if (!entry) return;
    entry.built.group.visible = false;
    this.inside = null;
    this.city.root.visible = true;
    if (this.env?.water) this.env.water.visible = true;
    this.floorY = 0.2;
    this.scene.fog.near = this.quality === 'low' ? 120 : 260;
    this.scene.fog.far = this.quality === 'low' ? 420 : 1500;
    if (this._savedDist) this.cam.dist = this._savedDist;
    this._focusKey = undefined;
    this.zoneId = null;
  }

  exitBuilding() {
    const entry = this.inside;
    if (!entry || this._doorBusy) return;
    if (entry.spec.exitTo) return this.enterBuilding(entry.spec.exitTo.type, entry.spec.exitTo.id);
    this._doorBusy = true;
    const spec = entry.spec;
    const [fx, fz] = facingVector(spec.facing);
    const out = spec.type === 'place' ? entrancePoint(spec.place, 1.6) : { x: spec.x + fx * (spec.d / 2 + 1.8), z: spec.z + fz * (spec.d / 2 + 1.8) };
    this.hud.fade(() => {
      this._leaveInterior();
      this.player.position.set(out.x, 0.2, out.z);
      this.player.rotation.y = Math.atan2(fx, fz);
      this.cam.yaw = this.player.rotation.y - Math.PI;
      this.cam.target.set(out.x, 1.6, out.z);
      this.cam.curDist = undefined;
      this._doorExitAt = performance.now();
      this._doorBusy = false;
    });
  }

  // Walking into a building's front door takes you inside.
  _checkDoors(pos, dx, dz) {
    if (this._doorExitAt && performance.now() - this._doorExitAt < 1500) return;
    if (!this._doors || this._doorsFor !== this.state.parcels) {
      this._doorsFor = this.state.parcels;
      this._doors = [];
      for (const p of PLACES) if (interiorKindFor(p)) {
        const [fx, fz] = facingVector(p.facing);
        this._doors.push({ type: 'place', id: p.id, x: p.x + fx * (p.d / 2), z: p.z + fz * (p.d / 2), fx, fz });
      }
      for (const p of this.state.parcels) {
        if (!p.building || p.venue) continue;
        const [fx, fz] = facingVector(p.facing);
        const bd = p.d - 8;
        this._doors.push({ type: 'parcel', id: p.id, x: p.x - fx * 2 + fx * (bd / 2), z: p.z - fz * 2 + fz * (bd / 2), fx, fz });
      }
    }
    for (const d of this._doors) {
      const rx = pos.x - d.x;
      const rz = pos.z - d.z;
      const out = rx * d.fx + rz * d.fz; // distance in front of the façade
      const lat = Math.abs(rx * d.fz - rz * d.fx);
      if (out < 1.1 && out > -0.5 && lat < 1.3 && dx * d.fx + dz * d.fz < -0.5) {
        this.enterBuilding(d.type, d.id);
        return;
      }
    }
  }

  _interiorFrame(t) {
    const b = this.inside.built;
    for (const fn of b.tickers) fn(t);
    if (b.reelScreen && (!this._lastInnerReel || t - this._lastInnerReel > 0.1)) {
      this._lastInnerReel = t;
      drawCinemaFrame(b.reelScreen, t, this._reel);
    }
    for (const av of this.inside.staff) {
      const w = av.getWorldPosition(new THREE.Vector3());
      const pp = this.player.position;
      const near = Math.hypot(pp.x - w.x, pp.z - w.z) < 4;
      animateAvatar(av, t, 0, near && Math.sin(t * 0.9 + av.userData.seed) > 0.2 ? 'talk' : null);
    }
  }

  // ───────────────────────── frame ─────────────────────────
  _tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;
    this._buildCrowd();
    this._movePlayer(dt, t);
    this._moveBots(dt, t);
    this._moveAmbient(dt, t);
    this._movePeers(dt, t);
    this._agentsLook(t);
    this._tokens(t);
    this._proximity();
    this._camera(dt);
    this._sky(dt);
    if (this.inside) this._interiorFrame(t);
    else this.city.update(t, this.daylight, this._reel);
    if (this.navMarker.visible) this.navMarker.material.opacity = 0.5 + Math.sin(t * 5) * 0.35;
    this.post.render(this.scene, this.camera);
    this.hud.frame(t);
  }

  // Everyone who occupies space this frame (for avoidance and separation).
  _buildCrowd() {
    const c = this.crowd;
    c.length = 0;
    const add = (av, r = 0.32) => av.visible !== false && c.push({ x: av.position.x, z: av.position.z, r, ref: av });
    if (this.inside) {
      add(this.player);
      for (const s of this.interiorStaff || []) add(s);
      for (const e of this.peers.values()) if (e.avatar.visible) add(e.avatar);
      return;
    }
    add(this.player);
    for (const w of this.walkers) add(w.av);
    for (const it of this.idlers) add(it.av);
    for (const b of this.bots.values()) add(b.avatar);
    for (const a of this.agents) add(a.avatar);
    for (const e of this.peers.values()) add(e.avatar);
  }

  _input() {
    let ix = 0;
    let iz = 0;
    if (this.keys.has('w') || this.keys.has('arrowup')) iz += 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) iz -= 1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) ix -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) ix += 1;
    if (this.hud.stick) {
      ix += this.hud.stick.x;
      iz += -this.hud.stick.y;
    }
    return { ix, iz, run: this.keys.has('shift') };
  }

  _movePlayer(dt, t) {
    const pos = this.player.position;
    const { ix, iz, run } = this.studio ? { ix: 0, iz: 0, run: false } : this._input();
    let dx = 0;
    let dz = 0;
    if (ix || iz) {
      this.cancelNav();
      this.sitting = false;
      const fwd = new THREE.Vector2(-Math.sin(this.cam.yaw), -Math.cos(this.cam.yaw));
      const right = new THREE.Vector2(-fwd.y, fwd.x);
      dx = fwd.x * iz + right.x * ix;
      dz = fwd.y * iz + right.y * ix;
    } else if (this.nav) {
      const wp = this.nav.path[this.nav.i];
      if (!wp) {
        this.cancelNav();
        return this._movePlayer(dt, t);
      }
      const vx = wp.x - pos.x;
      const vz = wp.z - pos.z;
      const d = Math.hypot(vx, vz);
      if (d < 0.6) {
        this.nav.i += 1;
        if (this.nav.i >= this.nav.path.length) {
          const { label, enter } = this.nav;
          this.cancelNav();
          if (enter) this.enterBuilding(enter.type, enter.id);
          else if (label) this.hud.toast(`Arrived at ${label}`, '📍');
        }
      } else {
        dx = vx / d;
        dz = vz / d;
      }
    }
    const len = Math.hypot(dx, dz);
    const target = len ? (run || this.nav ? 6.5 : 3.8) : 0;
    this.speed += (target - this.speed) * Math.min(1, dt * 10);
    if (len > 0.01) {
      dx /= len;
      dz /= len;
      const nx = pos.x + dx * this.speed * dt;
      const nz = pos.z + dz * this.speed * dt;
      let res = this._collide(nx, nz, pos.x, pos.z);
      if (!this.inside) res = this.obstacles.resolve(res.x, res.z, 0.38);
      res = separate(res.x, res.z, 0.32, this.crowd, this.player);
      // Never let separation shove the player into a wall.
      const back = this._collide(res.x, res.z, pos.x, pos.z);
      pos.x = back.x;
      pos.z = back.z;
      const want = Math.atan2(dx, dz);
      let diff = want - this.player.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.player.rotation.y += diff * Math.min(1, dt * 12);
    }
    pos.y = this.floorY;
    animateAvatar(this.player, t, this.speed / 6, this.emote);
    if (this.inside) {
      const l = this._toLocal(this.inside, pos.x, pos.z);
      if (l.z > this.inside.built.d / 2 - 0.15 && Math.abs(l.x) < 1.4 && !this._doorBusy) this.exitBuilding();
      return;
    }
    if (len > 0.01 && !this._doorBusy) this._checkDoors(pos, dx, dz);
    const zone = zoneAt(pos.x, pos.z);
    if (zone && zone.id !== this.zoneId) {
      this.zoneId = zone.id;
      this.hud.setZone(zone.name);
      this.api.gamification.track(EV.ENTERED_DISTRICT, { districtId: zone.id }).then((r) => this.hud.showProgress(r)).catch(() => {});
    }
  }

  _collide(nx, nz, ox, oz) {
    if (this.inside) return this._collideBoxes(nx, nz, ox, oz, this.inside.colliders, 0.4);
    const r = 0.55;
    const lim = DISTRICT.half + 5;
    nx = Math.max(-lim, Math.min(lim, nx));
    nz = Math.max(-lim, Math.min(116, nz));
    for (const c of this.city.colliders) {
      if (c.round) {
        const d = Math.hypot(nx, nz);
        if (d < c.round + r) {
          const k = (c.round + r) / (d || 1);
          nx *= k;
          nz *= k;
        }
        continue;
      }
      if (nx > c.x0 - r && nx < c.x1 + r && nz > c.z0 - r && nz < c.z1 + r) {
        // Slide: keep whichever axis was already outside.
        const wasInX = ox > c.x0 - r && ox < c.x1 + r;
        const wasInZ = oz > c.z0 - r && oz < c.z1 + r;
        if (!wasInX) nx = ox;
        else if (!wasInZ) nz = oz;
        else {
          const pens = [[nx - (c.x0 - r), 'x', c.x0 - r], [(c.x1 + r) - nx, 'x', c.x1 + r], [nz - (c.z0 - r), 'z', c.z0 - r], [(c.z1 + r) - nz, 'z', c.z1 + r]];
          pens.sort((a, b) => a[0] - b[0]);
          if (pens[0][1] === 'x') nx = pens[0][2];
          else nz = pens[0][2];
        }
      }
    }
    return { x: nx, z: nz };
  }

  _collideBoxes(nx, nz, ox, oz, boxes, r) {
    for (const c of boxes) {
      if (nx > c.x0 - r && nx < c.x1 + r && nz > c.z0 - r && nz < c.z1 + r) {
        const wasInX = ox > c.x0 - r && ox < c.x1 + r;
        const wasInZ = oz > c.z0 - r && oz < c.z1 + r;
        if (!wasInX) nx = ox;
        else if (!wasInZ) nz = oz;
        else {
          const pens = [[nx - (c.x0 - r), 'x', c.x0 - r], [(c.x1 + r) - nx, 'x', c.x1 + r], [nz - (c.z0 - r), 'z', c.z0 - r], [(c.z1 + r) - nz, 'z', c.z1 + r]];
          pens.sort((a, b) => a[0] - b[0]);
          if (pens[0][1] === 'x') nx = pens[0][2];
          else nz = pens[0][2];
        }
      }
    }
    if (this.inside) for (const o of this.inside.obstacles) {
      const dx = nx - o.x;
      const dz = nz - o.z;
      const d = Math.hypot(dx, dz);
      if (d < o.r + 0.3 && d > 1e-4) {
        nx = o.x + (dx / d) * (o.r + 0.3);
        nz = o.z + (dz / d) * (o.r + 0.3);
      }
    }
    return { x: nx, z: nz };
  }

  _moveBots(dt, t) {
    for (const b of this.bots.values()) {
      const pos = b.avatar.position;
      b.avatar.visible = !this.inside;
      if (this.inside) continue;
      if (b.talking) {
        b.speed = 0;
        const dx = this.player.position.x - pos.x;
        const dz = this.player.position.z - pos.z;
        b.avatar.rotation.y = Math.atan2(dx, dz);
      } else if (!b.path) {
        b.wait -= dt;
        b.speed = 0;
        if (b.wait <= 0) {
          const a = b.anchor;
          const ang = Math.random() * Math.PI * 2;
          const goal = { x: a.x + Math.cos(ang) * a.r * Math.random(), z: a.z + Math.sin(ang) * a.r * Math.random() };
          const path = this.navGrid.find({ x: pos.x, z: pos.z }, goal);
          if (path) b.path = { pts: path, i: 1 };
          b.wait = 3 + Math.random() * 6;
        }
      } else {
        const wp = b.path.pts[b.path.i];
        if (!wp) {
          b.path = null;
          continue;
        }
        const dx = wp.x - pos.x;
        const dz = wp.z - pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.4) {
          b.path.i += 1;
          if (b.path.i >= b.path.pts.length) b.path = null;
        } else {
          const st = steer(pos.x, pos.z, dx / d, dz / d, this.obstacles, this.crowd, b.avatar, 1.1);
          b.speed = 1.4 * st.slow;
          let nx = pos.x + (dx / d) * b.speed * dt + (-dz / d) * st.lateral * dt * 1.2;
          let nz = pos.z + (dz / d) * b.speed * dt + (dx / d) * st.lateral * dt * 1.2;
          ({ x: nx, z: nz } = this.obstacles.resolve(nx, nz, 0.32));
          ({ x: nx, z: nz } = separate(nx, nz, 0.3, this.crowd, b.avatar));
          pos.x = nx;
          pos.z = nz;
          b.avatar.rotation.y = Math.atan2(dx, dz);
          // Stuck behind something for a while: re-plan.
          b.stuck = st.slow < 0.2 ? (b.stuck || 0) + dt : 0;
          if (b.stuck > 2.5) {
            b.path = null;
            b.wait = 0.5;
            b.stuck = 0;
          }
        }
      }
      animateAvatar(b.avatar, t, b.speed / 6, b.emote || (b.talking ? 'talk' : null));
    }
  }

  _moveAmbient(dt, t) {
    const step = (o, getPos) => {
      const a = o.ring[o.seg];
      const b = o.ring[(o.seg + 1) % o.ring.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      o.t += (o.speed * dt) / len;
      if (o.t >= 1) {
        o.t = 0;
        o.seg = (o.seg + 1) % o.ring.length;
      }
      const x = a[0] + (b[0] - a[0]) * o.t;
      const z = a[1] + (b[1] - a[1]) * o.t;
      getPos(x, z, Math.atan2(b[0] - a[0], b[1] - a[1]));
    };
    const ppos = this.player.position;
    for (const w of this.walkers) {
      // Walk the route, stepping around props and people and pausing for
      // anyone directly in front, instead of ghosting through them.
      const av = w.av;
      const a = w.ring[w.seg];
      const b = w.ring[(w.seg + 1) % w.ring.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const dirX = (b[0] - a[0]) / len;
      const dirZ = (b[1] - a[1]) / len;
      const near = Math.hypot(av.position.x - ppos.x, av.position.z - ppos.z) < 70;
      const st = near ? steer(av.position.x, av.position.z, dirX, dirZ, this.obstacles, this.crowd, av) : { lateral: 0, slow: 1 };
      w.lat = (w.lat || 0) + (st.lateral - (w.lat || 0)) * Math.min(1, dt * 2.5);
      w.slow = (w.slow ?? 1) + (st.slow - (w.slow ?? 1)) * Math.min(1, dt * 6);
      const saved = w.speed;
      w.speed = saved * w.slow;
      step(w, (x, z, ry) => {
        let px = x - dirZ * w.lat;
        let pz = z + dirX * w.lat;
        if (near) {
          ({ x: px, z: pz } = this.obstacles.resolve(px, pz, 0.3));
          ({ x: px, z: pz } = separate(px, pz, 0.3, this.crowd, av));
        }
        av.position.set(px, 0.2, pz);
        let diff = ry - av.rotation.y;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        av.rotation.y += diff * Math.min(1, dt * 8);
      });
      const moved = w.speed;
      w.speed = saved;
      av.visible = near && !this.inside;
      if (av.visible) animateAvatar(av, t, moved / 6);
    }
    // Only people near the camera cast shadows (big draw-call saving).
    if (!this._shadowT || t - this._shadowT > 0.5) {
      this._shadowT = t;
      const cp = this.camera.position;
      const all = [...this.walkers.map((x) => x.av), ...this.idlers.map((x) => x.av), ...[...this.bots.values()].map((b) => b.avatar)];
      for (const av of all) {
        const near = Math.hypot(av.position.x - cp.x, av.position.z - cp.z) < 38;
        if (av.userData.castsShadow !== near) {
          av.userData.castsShadow = near;
          av.traverse((o) => o.isMesh && (o.castShadow = near));
        }
      }
    }
    for (const it of this.idlers) {
      const d = Math.hypot(it.av.position.x - ppos.x, it.av.position.z - ppos.z);
      it.av.visible = d < 70 && !this.inside;
      if (it.av.visible) animateAvatar(it.av, t, 0, it.emote);
    }
    this._traffic(dt, step);
  }

  // Cars brake for anything in their lane (people, players, the car ahead),
  // light their brake lights, and honk at a player standing in the road.
  _traffic(dt, step) {
    const now = performance.now();
    const pp = this.player.position;
    for (const c of this.cars) {
      c.g.visible = !this.inside;
      const gx = c.g.position.x;
      const gz = c.g.position.z;
      const fx = Math.sin(c.g.rotation.y);
      const fz = Math.cos(c.g.rotation.y);
      let gap = Infinity;
      let playerGap = Infinity;
      const look = 6 + (c.v ?? c.speed) * 2.2;
      const check = (x, z, halfLen, lat) => {
        const dx = x - gx;
        const dz = z - gz;
        const ahead = dx * fx + dz * fz;
        if (ahead <= 0 || ahead > look + halfLen) return Infinity;
        if (Math.abs(dx * fz - dz * fx) > lat) return Infinity;
        return ahead - halfLen;
      };
      if (!this.inside) {
        playerGap = check(pp.x, pp.z, 2.6, 1.7);
        gap = playerGap;
      }
      for (const p of this.crowd) if (p.ref !== this.player) gap = Math.min(gap, check(p.x, p.z, 2.6, 1.6));
      for (const o of this.cars) if (o !== c) gap = Math.min(gap, check(o.g.position.x, o.g.position.z, 5.2, 1.4));
      const v = c.v ?? c.speed;
      // Speed that still stops ~1 m short of the obstacle at 7 m/s² braking.
      const safe = Math.sqrt(2 * 7 * Math.max(0, gap - 1));
      const target = Math.min(c.speed, safe);
      c.v = target < v ? Math.max(target, v - 14 * dt) : Math.min(target, v + 2.5 * dt);
      const braking = target < v - 0.3 || c.v < 0.2;
      if (c.brake) c.brake.emissiveIntensity = braking ? 3.5 : 0.35 + (1 - (this.daylight ?? 1)) * 0.8;
      // Honk when the player is what's stopping us.
      c.blockedFor = playerGap < 14 && c.v < 3 ? c.blockedFor + dt : 0;
      const closeCall = playerGap < 9 && v > 4;
      if ((c.blockedFor > 0.8 || closeCall) && now - c.honkAt > 4500) {
        c.honkAt = now;
        const dist = Math.hypot(gx - this.camera.position.x, gz - this.camera.position.z);
        const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
        const pan = ((gx - this.camera.position.x) * right.x + (gz - this.camera.position.z) * right.z) / Math.max(4, dist);
        honk(Math.max(0.15, 1 - dist / 60), pan, c.blockedFor > 3);
        if (!this._honkToastAt || now - this._honkToastAt > 12000) {
          this._honkToastAt = now;
          this.hud.toast('Beep beep! A driver is waiting for you to get out of the road', '🚗');
        }
      }
      const saved = c.speed;
      c.speed = c.v;
      step(c, (x, z, ry) => {
        c.g.position.set(x, 0, z);
        c.g.rotation.y = ry;
      });
      c.speed = saved;
    }
  }

  _movePeers(dt, t) {
    for (const [id, e] of this.peers) {
      const p = this.transport.getPeer(id);
      if (!p) continue;
      const pos = e.avatar.position;
      const k = Math.min(1, dt * 10);
      const dx = p.x - pos.x;
      const dz = p.z - pos.z;
      pos.x += dx * k;
      pos.z += dz * k;
      let diff = p.ry - e.avatar.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      e.avatar.rotation.y += diff * k;
      const v = Math.hypot(dx, dz) / Math.max(dt, 0.016);
      e.speed += ((p.moving ? Math.min(6.5, Math.max(1.4, v)) : 0) - e.speed) * k;
      // Interiors share x/z with the city: only show people in the same space.
      e.avatar.visible = (p.inside || null) === (this.inside?.key || null);
      e.avatar.position.y = p.inside ? INTERIOR_Y + 0.2 : 0.2;
      if (e.avatar.visible) animateAvatar(e.avatar, t, e.speed / 6, p.emote);
    }
  }

  _agentsLook(t) {
    const pp = this.player.position;
    for (const a of this.agents) {
      a.avatar.visible = !this.inside;
      if (this.inside) continue;
      const d = Math.hypot(pp.x - a.x, pp.z - a.z);
      if (d < 10) a.avatar.rotation.y = Math.atan2(pp.x - a.x, pp.z - a.z);
      animateAvatar(a.avatar, t, 0, d < 5 && Math.sin(t * 0.8) > 0.6 ? 'wave' : null);
    }
  }

  _tokens(t) {
    const active = new Map(this.state.tokens.map((x) => [x.id, x]));
    for (const [id, m] of this.tokenMeshes) {
      const tok = active.get(id);
      m.visible = !!tok && tok.active && !tok.collected && !this.inside;
      if (!m.visible) continue;
      m.rotation.y = t * 2;
      m.position.y = 1.6 + Math.sin(t * 3) * 0.25;
      const pp = this.player.position;
      if (Math.hypot(pp.x - m.position.x, pp.z - m.position.z) < 2.4 && !tok.pending) {
        tok.pending = true;
        this.api.world.collectToken(id, { x: pp.x, z: pp.z }).then(() => {
          this.hud.toast('Kicks token collected!', '🪙');
        }).catch((err) => {
          tok.pending = false;
          this.hud.toast(err.message, '⚠️');
        });
      }
    }
  }

  // Build the list of interactables near the player and pick the focus.
  _proximity() {
    const pp = this.player.position;
    if (!this._grid) {
      this._grid = new SpatialGrid(16);
      for (const p of PLACES) {
        const e = entrancePoint(p);
        this._grid.upsert(`place:${p.id}`, e.x, e.z, { ref: { type: 'place', id: p.id }, label: p.name, r: PROX.interactRadius });
      }
      for (const p of PARCELS.filter((x) => !x.venue)) this._grid.upsert(`parcel:${p.id}`, p.x, p.z - p.d / 2 - 1, { ref: { type: 'parcel', id: p.id }, label: p.name, r: 8 });
      if (this.flags.WORLD_ADS_ENABLED) for (const b of this.city.adSlots.filter((x) => !x.y)) this._grid.upsert(`bb:${b.id}`, b.x, b.z, { ref: { type: 'billboard', id: b.id }, label: 'Billboard', r: 9 });
      for (const a of AGENTS) this._grid.upsert(`agent:${a.id}`, a.x, a.z, { ref: { type: 'agent', id: a.id }, label: `${a.name} · ${a.role}`, r: 4.5 });
      for (const g of this.myCars || []) this._grid.upsert(`mycar:${g.userData.ref.id}`, g.position.x, g.position.z, { ref: g.userData.ref, label: 'Your car', r: 4 });
      this._grid.upsert('plaza', 0, 0, { ref: { type: 'plaza', id: PLAZA.id }, label: 'Central Plaza fountain', r: 8.5 });
    }
    for (const p of this.people()) this._grid.upsert(`player:${p.id}`, p.x, p.z, { ref: { type: 'player', id: p.id }, label: `@${p.name}`, r: PROX.approachRadius, person: p });
    for (const id of [...this._grid.items.keys()]) {
      if (id.startsWith('player:') && !this.bots.has(id.slice(7)) && !this.peers.has(id.slice(7))) this._grid.remove(id);
    }
    const grid = this.inside ? this.inside.grid : this._grid;
    if (this.inside) for (const p of this.people()) grid.upsert(`player:${p.id}`, p.x, p.z, { ref: { type: 'player', id: p.id }, label: `@${p.name}`, r: PROX.approachRadius, person: p });
    const near = grid.query(pp.x, pp.z, 10, (it) => Math.hypot(it.x - pp.x, it.z - pp.z) <= it.data.r);
    // People win ties: they're the core social mechanic.
    near.sort((a, b) => (a.data.ref.type === 'player' ? a.dist - 2 : a.dist) - (b.data.ref.type === 'player' ? b.dist - 2 : b.dist));
    const f = near[0] || null;
    const key = f ? f.id : null;
    if (key !== this._focusKey) {
      this._focusKey = key;
      this.focus = f ? { ...f.data, x: f.x, z: f.z, key } : null;
      if (this.talkingTo && (!f || f.data.ref.id !== this.talkingTo)) {
        const b = this.bots.get(this.talkingTo);
        if (b) b.talking = false;
        this.talkingTo = null;
      }
      if (f?.data.ref.type === 'player') {
        const b = this.bots.get(f.data.ref.id);
        if (b) {
          b.talking = true;
          b.path = null;
          this.talkingTo = b.id;
        }
      }
      this.hud.setFocus(this.focus);
    }
    // Nearby list (wider radius), throttled.
    if (!this._nearT || performance.now() - this._nearT > 500) {
      this._nearT = performance.now();
      const nearby = this.people()
        .map((p) => ({ ...p, dist: Math.hypot(p.x - pp.x, p.z - pp.z) }))
        .filter((p) => p.dist <= PROX.nearbyRadius)
        .sort((a, b) => a.dist - b.dist);
      this.hud.setNearby(nearby);
    }
  }

  _camera(dt) {
    const c = this.cam;
    const k = Math.min(1, dt * 6);
    const ty = this.floorY + (this.studio ? 1.05 : 1.4);
    if (Math.abs(c.target.y - ty) > 5) c.target.set(this.player.position.x, ty, this.player.position.z);
    c.target.lerp(new THREE.Vector3(this.player.position.x, ty, this.player.position.z), k);
    const dir = new THREE.Vector3(Math.sin(c.yaw) * Math.cos(c.pitch), Math.sin(c.pitch), Math.cos(c.yaw) * Math.cos(c.pitch));
    // Pull the camera in front of any building between it and the player.
    const maxD = this.inside ? Math.min(c.dist, 6.5) : c.dist;
    let dist = maxD;
    const boxes = this.inside ? this.inside.walls : this.city.colliders;
    for (let s = 0.5; s <= maxD; s += 0.5) {
      const p = c.target.clone().addScaledVector(dir, s);
      if (this.inside && p.y > this.floorY + this.inside.built.h - 0.4) {
        dist = Math.max(1.5, s - 0.4);
        break;
      }
      if (boxes.some((b) => !b.round && !b.low && b.x1 - b.x0 < 400 && p.x > b.x0 - 0.3 && p.x < b.x1 + 0.3 && p.z > b.z0 - 0.3 && p.z < b.z1 + 0.3)) {
        dist = Math.max(1.5, s - 0.6);
        break;
      }
    }
    c.curDist = c.curDist === undefined ? dist : c.curDist + (dist - c.curDist) * Math.min(1, dt * (dist < c.curDist ? 14 : 3));
    this.camera.position.copy(c.target).addScaledVector(dir, c.curDist);
    if (this.inside) {
      // Keep the camera inside the room (the doorway would let it slip out).
      const b = this.inside.built;
      const l = this._toLocal(this.inside, this.camera.position.x, this.camera.position.z);
      const lx = Math.max(-b.w / 2 + 0.35, Math.min(b.w / 2 - 0.35, l.x));
      const lz = Math.max(-b.d / 2 + 0.35, Math.min(b.d / 2 - 0.45, l.z));
      if (lx !== l.x || lz !== l.z) {
        const w = this._toWorld(this.inside.spec, lx, lz);
        this.camera.position.x = w.x;
        this.camera.position.z = w.z;
      }
      this.camera.position.y = Math.min(this.camera.position.y, this.floorY + b.h - 0.5);
    }
    if (this.camera.position.y < this.floorY + 0.4) this.camera.position.y = this.floorY + 0.4;
    // Look slightly above the player so the skyline fills the frame when close.
    const lift = this.studio ? 0 : c.lookUp * Math.max(0, 1 - c.pitch / 0.7) * Math.min(1, c.curDist / 7);
    this.camera.lookAt(c.target.x, c.target.y + lift, c.target.z);
    // Shadow frustum follows the player.
    this.sun.target.position.copy(c.target);
    this.sun.position.copy(c.target).add(this._sunDir || new THREE.Vector3(60, 90, 40));
  }

  _sky(dt = 0.016) {
    const t = this.worldTime();
    const d = t.daylight;
    this.daylight = d;
    const night = 1 - d;
    if (this.inside) {
      // Indoors: steady, warm artificial light whatever the time of day.
      this.env?.update(t.hoursF, d, dt);
      this.hemi.intensity = 0.55;
      this.hemi.color.set('#fff3e3');
      this.sun.intensity = 0.4;
      this._sunDir = new THREE.Vector3(20, 90, 30);
      this.renderer.toneMappingExposure = this.env ? 0.62 : 0.9;
      this.post.setNight(0.6);
      if (this.inside.built.streetMat) this.inside.built.streetMat.color.set(d > 0.3 ? '#d7ebf7' : '#1b2740');
      return;
    }
    const duskAmt = Math.max(0, 1 - Math.abs(t.hoursF - 18.5) / 1.6) + Math.max(0, 1 - Math.abs(t.hoursF - 6) / 1.2);
    if (this.env) {
      const { sunDir, elevation } = this.env.update(t.hoursF, d, dt);
      const up = elevation > 2;
      this._sunDir = up ? sunDir.clone().multiplyScalar(140) : new THREE.Vector3(-50, 110, -40);
      const fog = new THREE.Color('#0c1426').lerp(new THREE.Color('#a8c4dd'), d);
      fog.lerp(new THREE.Color('#e7a77c'), Math.min(0.45, duskAmt * 0.45));
      this.scene.fog.color.copy(fog);
      this.scene.background = null;
      this.hemi.intensity = 0.15 + d * 0.55;
      this.hemi.color.set(d > 0.2 ? '#dfefff' : '#6f86c6');
      this.sun.intensity = up ? 0.6 + d * 3.4 : 0.35;
      this.sun.color.set(up ? (duskAmt > 0.25 ? '#ffc08a' : '#fff4e2') : '#8fa6e6');
      this.renderer.toneMappingExposure = 0.42 + d * 0.2;
    } else if (this._lastSkyH !== t.hoursF.toFixed(2)) {
      this._lastSkyH = t.hoursF.toFixed(2);
      const sky = new THREE.Color('#0d1530').lerp(new THREE.Color('#9fd0f0'), d);
      sky.lerp(new THREE.Color('#f2a272'), Math.min(0.6, duskAmt * 0.6));
      this.scene.background = sky;
      this.scene.fog.color.copy(sky);
      this.hemi.intensity = 0.35 + d * 0.65;
      this.sun.intensity = 0.25 + d * 2.1;
      const ang = ((t.hoursF - 6) / 12) * Math.PI;
      this._sunDir = d > 0.02 ? new THREE.Vector3(Math.cos(ang) * 80, 30 + Math.sin(ang) * 80, 40) : new THREE.Vector3(-40, 90, -30);
      this.renderer.toneMappingExposure = 0.85 + d * 0.25;
    }
    for (const m of this.carLights) m.emissiveIntensity = 0.3 + night * 3;
    this.post.setNight(night);
  }

  _rotateAds() {
    if (!this.flags.WORLD_ADS_ENABLED) return;
    const pp = this.player.position;
    const now = Date.now();
    for (const b of this.city.adSlots) {
      // Only screens near the player are fetched, and only when their
      // creative is due to rotate, to keep Ads traffic proportional.
      const dist = Math.hypot(pp.x - b.x, pp.z - b.z);
      if (dist > 160 || (b._next && now < b._next) || b._pending) continue;
      b._pending = true;
      this.api.ads.getCreative(b.placementId).then((c) => {
        b._pending = false;
        if (!c) return;
        b._next = Date.now() + Math.max(6000, c.rotatesInMs || 15000);
        this.city.setBillboardCreative(b.id, c);
        // Impression: within 60 m and roughly in view.
        if (dist < 60 && !this.inside) {
          const v = new THREE.Vector3(b.x, (b.y || 0) + b.pole + b.h / 2, b.z).project(this.camera);
          if (Math.abs(v.x) < 1 && Math.abs(v.y) < 1 && v.z < 1) this.api.ads.trackImpression(b.placementId, c.id);
        }
      }).catch(() => (b._pending = false));
    }
    this.api.world.listReels().then((r) => (this._reel = r[Math.floor(Date.now() / 12000) % r.length]));
  }
}

function frame() {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

export { footprint, facingVector };
