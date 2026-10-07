// WorldApp — the spatial runtime. Owns the Three.js scene, the player, NPCs,
// remote players, proximity, navigation and the per-frame loop. All product
// behaviour goes through `this.api` (the Pludor adapter); this file only
// decides WHERE things are and WHAT is near you.

import * as THREE from 'three';
import { City } from '../render/city.js';
import { createAvatar, animateAvatar, initHumans, recolorAvatar, setPerson, pickPerson, portraitOf } from '../render/avatar.js';
import { Environment, PostFX } from '../render/environment.js';
import { loadModel, fitObject } from '../render/assets.js';
import { PLACES, PARCELS, BILLBOARDS, AGENTS, TOKENS, PLAZA, DISTRICT, FILLER_CELLS, WORLD, cellBounds, entrancePoint, footprint, zoneAt, facingVector } from '../config/nova-city.js';
import { ECONOMY } from '../config/economy.js';
import { TOOLS, RESIDENTS } from '../pludor/demo-data.js';
import { SpatialGrid } from '../core/spatial-grid.js';
import { NavGrid } from '../core/pathfind.js';
import { worldTimeAt } from '../core/world-time.js';
import { EV } from '../core/events.js';
import { Hud } from '../ui/hud.js';
import { Sheets } from '../ui/sheets.js';

const PROX = ECONOMY.proximity;
const BOT_ANCHORS = {
  plaza: { x: 9, z: 9, r: 9 }, creator: { x: 0, z: -29, r: 8 }, market: { x: 48, z: 0, r: 11 },
  grill: { x: -29, z: 9, r: 5 }, grind: { x: -29, z: -9, r: 5 }, kicks: { x: 78.5, z: 0, r: 6 },
};

export class WorldApp {
  constructor(root, { api, transport, flags, me }) {
    this.root = root;
    this.api = api;
    this.transport = transport;
    this.flags = flags;
    this.me = me;
    this.clock = new THREE.Clock();
    this.keys = new Set();
    this.lowPower = matchMedia('(pointer: coarse)').matches || (navigator.hardwareConcurrency || 8) <= 4;
    // high: full PBR + bloom · medium: PBR, no post · low: stylised, no shadows
    const q = new URLSearchParams(location.search).get('quality');
    this.quality = ['high', 'medium', 'low'].includes(q) ? q : this.lowPower ? 'medium' : 'high';
    this.state = { places: [], gigs: [], parcels: [], events: [], progress: null, wallet: null, needs: {}, profile: null, tokens: [], courses: [] };
    this.focus = null;
    this.nav = null;
    this.zoneId = null;
    this.peers = new Map();
    this.bots = new Map();
    this.sitting = false;
  }

  async start(onProgress = () => {}) {
    onProgress(0.05, 'Preparing renderer');
    this._initRenderer();
    if (this.quality !== 'low') {
      onProgress(0.1, 'Loading people & vehicles');
      let n = 0;
      const tick = () => onProgress(0.1 + (++n / 3) * 0.25, 'Loading people & vehicles');
      await Promise.all([initHumans(this.quality).then(tick), this._loadCar().then(tick), loadModel('plant').then(tick)]).catch((e) => console.warn('Realistic assets unavailable, using stylised fallback', e));
    }
    onProgress(0.4, `Building ${WORLD.name}`);
    await frame();
    this.city = new City(this.scene, { quality: this.quality, places: PLACES, parcels: PARCELS, billboards: this.flags.WORLD_ADS_ENABLED ? BILLBOARDS : [], plaza: PLAZA, filler: FILLER_CELLS, tools: TOOLS, agents: AGENTS });
    this.city.onCollidersChanged = () => this._rebuildNav();
    this._rebuildNav();
    onProgress(0.6, 'Loading your Pludor identity');
    await frame();
    this.hud = new Hud(this.root, this);
    this.sheets = new Sheets(this.hud.sheetEl, this);
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
  }

  _initPlayer() {
    const p = this.me;
    this.player = createAvatar({ color: p.color, skin: p.skin, seed: [...p.id].reduce((a, c) => a + c.charCodeAt(0), 0), ring: p.color, quality: this.quality, person: p.avatar || pickPerson([...p.id].reduce((a, c) => a + c.charCodeAt(0), 0)) });
    this.player.position.set(DISTRICT.spawn.x, 0.2, DISTRICT.spawn.z);
    this.player.rotation.y = Math.PI; // face north, towards the plaza and Pludor Tower
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
      if (this.carTemplate) {
        g = this.carTemplate.clone(true);
        const paint = new THREE.Color(carCols[k % carCols.length]);
        g.traverse((o) => {
          if (!o.isMesh) return;
          if (/paint/i.test(o.material.name)) {
            o.material = o.material.clone();
            o.material.color.copy(paint);
          }
          if (/headlight|brakelight/i.test(o.material.name)) this.carLights.add(o.material);
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
      this.cars.push({ g, ring, seg: k % 4, t: (k * 0.29) % 1, speed: 7 + (k % 3) * 2 });
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
    setInterval(() => this._syncPeers(), 1500);
    this.transport.hello();
    setInterval(() => this._publish(), 100);
  }

  _publish() {
    const p = this.player.position;
    const prof = this.state.profile || {};
    this.transport.publishState({
      profile: { handle: prof.handle, displayName: prof.displayName, color: prof.color, skin: this.me.skin, presence: prof.presence, roles: prof.roles, bio: prof.bio, avatar: this.player.userData.person },
      x: +p.x.toFixed(2), z: +p.z.toFixed(2), ry: +this.player.rotation.y.toFixed(2), moving: this.speed > 0.1, emote: this.emote,
    });
  }

  _syncPeers() {
    const live = new Set();
    for (const peer of this.transport.peers()) {
      live.add(peer.id);
      let entry = this.peers.get(peer.id);
      if (entry && peer.avatar && entry.avatar.userData.person !== peer.avatar) setPerson(entry.avatar, peer.avatar);
      if (!entry) {
        const av = createAvatar({ color: peer.color, skin: peer.skin, seed: [...peer.id].reduce((a, c) => a + c.charCodeAt(0), 0), quality: this.quality, person: peer.avatar || pickPerson([...peer.id].reduce((a, c) => a + c.charCodeAt(0), 0)) });
        av.position.set(peer.x, 0.2, peer.z);
        av.userData.personRef = { type: 'player', id: peer.id };
        this.scene.add(av);
        entry = { id: peer.id, avatar: av, speed: 0 };
        this.peers.set(peer.id, entry);
        this.hud.toast(`@${peer.handle} entered Nova City`, '👋');
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
    for (const p of parcels) this.city.setParcelState(p.id, p.building, p.rentLabel);
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
        this.hud.notify({ icon: '📦', title: evt.businessName, body: `Order ${evt.status}`, action: () => this.sheets.open('orders') });
        break;
      case 'work': {
        const msg = { assigned: `You're hired for “${evt.title}”. Do the work, then submit.`, completed: `Payment released: “${evt.title}”`, applicant: `${evt.requester} applied to “${evt.title}”`, submitted: `${evt.requester} delivered “${evt.title}” — review it` }[evt.status];
        if (msg) this.hud.notify({ icon: evt.status === 'completed' ? '💸' : '💼', title: 'Work', body: msg, action: () => this.sheets.open('gig', { id: evt.gigId }) });
        this._refreshSoon();
        break;
      }
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
    for (const b of this.bots.values()) out.push({ id: b.id, name: b.handle, displayName: b.displayName, presence: b.presence, color: b.color, x: b.avatar.position.x, z: b.avatar.position.z, bot: true });
    for (const [id] of this.peers) {
      const p = this.transport.getPeer(id);
      if (p) out.push({ id, name: p.handle, displayName: p.displayName, presence: p.presence, color: p.color, x: p.x, z: p.z });
    }
    return out;
  }

  // ───────────────────────── world model for HUD / AI ─────────────────────────
  placeView(p) {
    const t = this.worldTime();
    const open = !p.hours || (t.hoursF >= p.hours[0] && t.hoursF < (p.hours[1] > 24 ? 24 : p.hours[1]));
    return {
      ...p, open, entrance: entrancePoint(p),
      kindLabel: { cafe: 'Café', restaurant: 'Restaurant', market: 'Market', creator: 'Creator Hub', community: 'Signals community', education: 'Academy', ai: 'AI Studio', games: 'Arcade', transit: 'Transit hub', media: 'Cinema', store: 'Store', service: 'Service', tools: 'Free tools' }[p.kind] || p.kind,
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
      zoneName: zoneAt(pos.x, pos.z)?.name || 'Nova City',
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

  // ───────────────────────── frame ─────────────────────────
  _tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;
    this._movePlayer(dt, t);
    this._moveBots(dt, t);
    this._moveAmbient(dt, t);
    this._movePeers(dt, t);
    this._agentsLook(t);
    this._tokens(t);
    this._proximity();
    this._camera(dt);
    this._sky(dt);
    this.city.update(t, this.daylight, this._reel);
    if (this.navMarker.visible) this.navMarker.material.opacity = 0.5 + Math.sin(t * 5) * 0.35;
    this.post.render(this.scene, this.camera);
    this.hud.frame(t);
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
    const { ix, iz, run } = this._input();
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
      const vx = wp.x - pos.x;
      const vz = wp.z - pos.z;
      const d = Math.hypot(vx, vz);
      if (d < 0.6) {
        this.nav.i += 1;
        if (this.nav.i >= this.nav.path.length) {
          const label = this.nav.label;
          this.cancelNav();
          if (label) this.hud.toast(`Arrived at ${label}`, '📍');
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
      const res = this._collide(nx, nz, pos.x, pos.z);
      pos.x = res.x;
      pos.z = res.z;
      const want = Math.atan2(dx, dz);
      let diff = want - this.player.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.player.rotation.y += diff * Math.min(1, dt * 12);
    }
    animateAvatar(this.player, t, this.speed / 6, this.emote);
    const zone = zoneAt(pos.x, pos.z);
    if (zone && zone.id !== this.zoneId) {
      this.zoneId = zone.id;
      this.hud.setZone(zone.name);
      this.api.gamification.track(EV.ENTERED_DISTRICT, { districtId: zone.id }).then((r) => this.hud.showProgress(r)).catch(() => {});
    }
  }

  _collide(nx, nz, ox, oz) {
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

  _moveBots(dt, t) {
    for (const b of this.bots.values()) {
      const pos = b.avatar.position;
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
        const dx = wp.x - pos.x;
        const dz = wp.z - pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.4) {
          b.path.i += 1;
          if (b.path.i >= b.path.pts.length) b.path = null;
        } else {
          b.speed = 1.4;
          pos.x += (dx / d) * b.speed * dt;
          pos.z += (dz / d) * b.speed * dt;
          b.avatar.rotation.y = Math.atan2(dx, dz);
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
      step(w, (x, z, ry) => {
        w.av.position.set(x, 0.2, z);
        w.av.rotation.y = ry;
      });
      w.av.visible = Math.hypot(w.av.position.x - ppos.x, w.av.position.z - ppos.z) < 70;
      if (w.av.visible) animateAvatar(w.av, t, w.speed / 6);
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
      it.av.visible = d < 70;
      if (it.av.visible) animateAvatar(it.av, t, 0, it.emote);
    }
    for (const c of this.cars) {
      // Yield to the player if they're in the lane ahead.
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(c.g.quaternion);
      const toP = new THREE.Vector3(ppos.x - c.g.position.x, 0, ppos.z - c.g.position.z);
      const ahead = toP.dot(fwd);
      const lateral = toP.clone().sub(fwd.clone().multiplyScalar(ahead)).length();
      const blocked = ahead > 0 && ahead < 9 && lateral < 2.2;
      c.v = (c.v ?? c.speed) + ((blocked ? 0 : c.speed) - (c.v ?? c.speed)) * Math.min(1, dt * 3);
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
      animateAvatar(e.avatar, t, e.speed / 6, p.emote);
    }
  }

  _agentsLook(t) {
    const pp = this.player.position;
    for (const a of this.agents) {
      const d = Math.hypot(pp.x - a.x, pp.z - a.z);
      if (d < 10) a.avatar.rotation.y = Math.atan2(pp.x - a.x, pp.z - a.z);
      animateAvatar(a.avatar, t, 0, d < 5 && Math.sin(t * 0.8) > 0.6 ? 'wave' : null);
    }
  }

  _tokens(t) {
    const active = new Map(this.state.tokens.map((x) => [x.id, x]));
    for (const [id, m] of this.tokenMeshes) {
      const tok = active.get(id);
      m.visible = !!tok && tok.active && !tok.collected;
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
      for (const p of PARCELS) this._grid.upsert(`parcel:${p.id}`, p.x, p.z - p.d / 2 - 1, { ref: { type: 'parcel', id: p.id }, label: p.name, r: 8 });
      if (this.flags.WORLD_ADS_ENABLED) for (const b of BILLBOARDS) this._grid.upsert(`bb:${b.id}`, b.x, b.z, { ref: { type: 'billboard', id: b.id }, label: 'Billboard', r: 9 });
      for (const a of AGENTS) this._grid.upsert(`agent:${a.id}`, a.x, a.z, { ref: { type: 'agent', id: a.id }, label: `${a.name} · ${a.role}`, r: 4.5 });
      this._grid.upsert('plaza', 0, 0, { ref: { type: 'plaza', id: PLAZA.id }, label: 'Central Plaza fountain', r: 8.5 });
    }
    for (const p of this.people()) this._grid.upsert(`player:${p.id}`, p.x, p.z, { ref: { type: 'player', id: p.id }, label: `@${p.name}`, r: PROX.approachRadius, person: p });
    for (const id of [...this._grid.items.keys()]) {
      if (id.startsWith('player:') && !this.bots.has(id.slice(7)) && !this.peers.has(id.slice(7))) this._grid.remove(id);
    }
    const near = this._grid.query(pp.x, pp.z, 10, (it) => Math.hypot(it.x - pp.x, it.z - pp.z) <= it.data.r);
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
    c.target.lerp(new THREE.Vector3(this.player.position.x, 1.6, this.player.position.z), k);
    const dir = new THREE.Vector3(Math.sin(c.yaw) * Math.cos(c.pitch), Math.sin(c.pitch), Math.cos(c.yaw) * Math.cos(c.pitch));
    // Pull the camera in front of any building between it and the player.
    let dist = c.dist;
    for (let s = 0.5; s <= c.dist; s += 0.5) {
      const p = c.target.clone().addScaledVector(dir, s);
      if (this.city.colliders.some((b) => !b.round && b.x1 - b.x0 < 400 && p.x > b.x0 - 0.3 && p.x < b.x1 + 0.3 && p.z > b.z0 - 0.3 && p.z < b.z1 + 0.3)) {
        dist = Math.max(1.5, s - 0.6);
        break;
      }
    }
    c.curDist = c.curDist === undefined ? dist : c.curDist + (dist - c.curDist) * Math.min(1, dt * (dist < c.curDist ? 14 : 3));
    this.camera.position.copy(c.target).addScaledVector(dir, c.curDist);
    if (this.camera.position.y < 0.6) this.camera.position.y = 0.6;
    // Look slightly above the player so the skyline fills the frame when close.
    const lift = c.lookUp * Math.max(0, 1 - c.pitch / 0.7) * Math.min(1, c.curDist / 7);
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
    for (const b of BILLBOARDS) {
      this.api.ads.getCreative(b.placementId).then((c) => {
        if (!c) return;
        this.city.setBillboardCreative(b.id, c);
        // Impression: within 45 m and roughly in view.
        const dist = Math.hypot(pp.x - b.x, pp.z - b.z);
        if (dist < 45) {
          const v = new THREE.Vector3(b.x, b.y + b.pole + b.h / 2, b.z).project(this.camera);
          if (Math.abs(v.x) < 1 && Math.abs(v.y) < 1 && v.z < 1) this.api.ads.trackImpression(b.placementId, c.id);
        }
      });
    }
    this.api.world.listReels().then((r) => (this._reel = r[Math.floor(Date.now() / 12000) % r.length]));
  }
}

function frame() {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

export { footprint, facingVector };
