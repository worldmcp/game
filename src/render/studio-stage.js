// Avatar Studio stage: while the studio is open the player's avatar steps
// out of the city onto a lit turntable (key, rim and fill lights, soft
// contact shadow, studio reflections) in front of a backdrop the player
// picks. Looks the same at noon or midnight, and costs far less GPU than
// drawing the city behind a full-screen panel.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export const BACKDROPS = {
  aurora: { label: 'Aurora', top: '#2b1b5a', bottom: '#0b1430', accent: '#7c5cff', glow: '#22b8cf' },
  sunset: { label: 'Sunset', top: '#ff7a59', bottom: '#5b1f4f', accent: '#ffd166', glow: '#ff5ca8' },
  mint: { label: 'Mint', top: '#c9f7e8', bottom: '#6cc7b0', accent: '#1b9c85', glow: '#ffffff' },
  city: { label: 'Night city', top: '#0d1b3d', bottom: '#05070f', accent: '#4cc9f0', glow: '#ffbe0b', bokeh: true },
  white: { label: 'White studio', top: '#f4f5f8', bottom: '#d9dce4', accent: '#7c5cff', glow: '#9aa3b5' },
};

function backdropTexture(th) {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 512;
  if (th.bokeh) c.width = 512;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, c.height);
  grd.addColorStop(0, th.top);
  grd.addColorStop(1, th.bottom);
  g.fillStyle = grd;
  g.fillRect(0, 0, c.width, c.height);
  if (th.bokeh) {
    for (let i = 0; i < 90; i++) {
      const x = Math.random() * c.width;
      const y = c.height * (0.25 + Math.random() * 0.5);
      const r = 4 + Math.random() * 16;
      const col = [th.accent, th.glow, '#ff5ca8', '#ffffff'][i % 4];
      const rg = g.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, `${col}aa`);
      rg.addColorStop(1, `${col}00`);
      g.fillStyle = rg;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class StudioStage {
  constructor(renderer) {
    this.renderer = renderer;
    const scene = (this.scene = new THREE.Scene());
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.05, 60);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.55;
    this.rig = new THREE.Group();
    scene.add(this.rig);
    this.hemi = new THREE.HemisphereLight('#ffffff', '#3a3550', 1.1);
    const key = (this.key = new THREE.DirectionalLight('#fff1e0', 2.6));
    key.position.set(1.6, 3.2, 2.6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = key.shadow.camera.bottom = -1.6;
    key.shadow.camera.right = key.shadow.camera.top = 1.6;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 8;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    const rim = (this.rimLight = new THREE.DirectionalLight('#9fd8ff', 2.2));
    rim.position.set(-1.8, 2.4, -2.6);
    const fill = new THREE.PointLight('#ffe2c4', 1.4, 7, 1.6);
    fill.position.set(-1.6, 1.4, 2.2);
    this.rig.add(this.hemi, key, key.target, rim, rim.target, fill);
    // Turntable platform with a glowing rim and a soft contact shadow.
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.12, 0.1, 64), new THREE.MeshStandardMaterial({ color: '#15151d', metalness: 0.4, roughness: 0.35 }));
    plat.position.y = -0.05;
    plat.receiveShadow = true;
    this.rimMat = new THREE.MeshBasicMaterial({ color: '#7c5cff' });
    const glow = new THREE.Mesh(new THREE.TorusGeometry(1.085, 0.012, 8, 96), this.rimMat);
    glow.rotation.x = Math.PI / 2;
    glow.position.y = 0.0;
    const shadowCatcher = new THREE.Mesh(new THREE.CircleGeometry(1.04, 48), new THREE.ShadowMaterial({ opacity: 0.35 }));
    shadowCatcher.rotation.x = -Math.PI / 2;
    shadowCatcher.position.y = 0.002;
    shadowCatcher.receiveShadow = true;
    // Curved backdrop (cyclorama) behind the turntable.
    this.cycMat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false });
    const cyc = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 9, 48, 1, true, Math.PI * 0.5, Math.PI), this.cycMat);
    cyc.position.set(0, 3.2, 0);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(7, 48), (this.floorMat = new THREE.MeshStandardMaterial({ color: '#202030', roughness: 0.9 })));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.1;
    floor.receiveShadow = true;
    this.rig.add(plat, glow, shadowCatcher, cyc, floor);
    this.view = { zoom: 0, z: 0 };
    this.setTheme('aurora');
  }

  setTheme(name) {
    const th = BACKDROPS[name] || BACKDROPS.aurora;
    this.theme = BACKDROPS[name] ? name : 'aurora';
    this.cycMat.map?.dispose();
    this.cycMat.map = backdropTexture(th);
    this.cycMat.needsUpdate = true;
    this.scene.background = new THREE.Color(th.bottom);
    this.floorMat.color.set(th.bottom).multiplyScalar(0.8);
    this.rimMat.color.set(th.accent);
    this.rimLight.color.set(th.glow);
    this.hemi.color.set(th.top).lerp(new THREE.Color('#ffffff'), 0.7);
  }

  // Take the avatar onto the stage (returns its previous parent + pose).
  attach(avatar) {
    this.saved = { parent: avatar.parent, pos: avatar.position.clone(), ry: avatar.rotation.y, ring: avatar.userData.ring?.visible };
    this.rig.position.copy(avatar.position);
    this.rig.position.y = avatar.position.y;
    this.scene.add(avatar);
    avatar.rotation.y = 0;
    if (avatar.userData.ring) avatar.userData.ring.visible = false;
    this.avatar = avatar;
  }

  detach() {
    const av = this.avatar;
    if (!av || !this.saved) return;
    this.saved.parent?.add(av);
    av.position.copy(this.saved.pos);
    av.rotation.y = this.saved.ry;
    if (av.userData.ring) av.userData.ring.visible = this.saved.ring !== false;
    this.avatar = null;
  }

  // inset: { top, right, bottom } px covered by UI, so the avatar centres
  // in the free part of the screen.
  render(dt, inset = { top: 0, right: 0, bottom: 0 }) {
    const top = inset.top || 0;
    const r = this.renderer;
    const size = r.getSize(new THREE.Vector2());
    const W = size.x;
    const H = size.y;
    const v = this.view;
    v.z += ((v.zoom || 0) - v.z) * Math.min(1, dt * 6);
    const freeW = Math.max(200, W - inset.right);
    const freeH = Math.max(160, H - inset.bottom - top);
    const cam = this.camera;
    cam.aspect = W / H;
    const h = this.avatar?.userData.look?.height || 1;
    const base = this.rig.position;
    const ty = base.y + (0.92 + v.z * 0.66) * h;
    // Distance that fits the full body in the free height (or the face).
    const fitDist = (1.15 * h) / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * (H / freeH) * Math.max(1, (freeH / freeW) * 0.75);
    const close = Math.max(1.05, 0.82 * (H / freeH));
    const dist = THREE.MathUtils.lerp(Math.max(3.2, fitDist), close, v.z);
    cam.position.set(base.x, ty + 0.08 - v.z * 0.04, base.z + dist);
    cam.lookAt(base.x, ty, base.z);
    cam.setViewOffset(W, H, inset.right / 2, (inset.bottom - top) / 2, W, H);
    cam.updateProjectionMatrix();
    const exp = r.toneMappingExposure;
    r.toneMappingExposure = 1.0;
    r.render(this.scene, cam);
    r.toneMappingExposure = exp;
  }
}
