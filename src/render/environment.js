// Physically based sky, image-based lighting, water and post-processing.
// The environment map is regenerated from the sky as world time moves, so
// glass, car paint and water reflect the actual sky (sunrise → night).

import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { Water } from 'three/addons/objects/Water.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { TEXTURES } from '../config/assets.js';

export class Environment {
  constructor(renderer, scene, quality) {
    this.renderer = renderer;
    this.scene = scene;
    this.quality = quality;
    this.sky = new Sky();
    this.sky.scale.setScalar(1500);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 2.4;
    u.rayleigh.value = 1.25;
    u.mieCoefficient.value = 0.003;
    u.mieDirectionalG.value = 0.72; // smaller forward-scatter halo round the sun
    // The sky shader outputs HDR values in the thousands at the sun disc,
    // which bloom smears across the screen whenever you face it. Clamp it so
    // the sun reads bright but never blinds.
    this.sky.material.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('gl_FragColor = vec4( retColor, 1.0 );', 'gl_FragColor = vec4( min( retColor, vec3( 0.95 ) ), 1.0 );');
    };
    scene.add(this.sky);
    this.sun = new THREE.Vector3();
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene();
    this.envSky = new Sky();
    this.envSky.scale.setScalar(1000);
    this.envScene.add(this.envSky);
    // Stars for night.
    const starGeo = new THREE.BufferGeometry();
    const pts = [];
    for (let i = 0; i < 1500; i++) {
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(Math.random() * 0.9 + 0.1);
      pts.push(Math.sin(ph) * Math.cos(th) * 800, Math.cos(ph) * 800, Math.sin(ph) * Math.sin(th) * 800);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#ffffff', size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    scene.add(this.stars);
    this.lastEnvKey = null;
  }

  // Water: the river along Riverside plus the plaza fountain basin.
  addWater({ width = 1400, depth = 34, x = 0, z = 134, fountain = null } = {}) {
    const normals = new THREE.TextureLoader().load(TEXTURES.waterNormals, (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
    });
    const mk = (geo, opts = {}) => {
      const w = new Water(geo, {
        textureWidth: this.quality === 'high' ? 512 : 256,
        textureHeight: this.quality === 'high' ? 512 : 256,
        waterNormals: normals,
        sunDirection: new THREE.Vector3(0.5, 0.7, 0.3),
        sunColor: 0xffffff,
        waterColor: 0x0e3b52,
        distortionScale: opts.distortion ?? 2.4,
        fog: true,
      });
      w.rotation.x = -Math.PI / 2;
      return w;
    };
    this.water = mk(new THREE.PlaneGeometry(width, depth));
    this.water.position.set(x, 0.05, z);
    this.scene.add(this.water);
    if (fountain) {
      this.fountainWater = mk(new THREE.CircleGeometry(fountain.r, 48), { distortion: 0.8 });
      this.fountainWater.material.uniforms.size.value = 4;
      this.fountainWater.position.set(fountain.x, 0.88, fountain.z);
      this.scene.add(this.fountainWater);
    }
  }

  // hoursF: world time. Returns lighting parameters for the caller's lights.
  update(hoursF, daylight, dt) {
    // Sun travels east→west; below horizon at night (moonlight takes over).
    const elevation = Math.sin(((hoursF - 6) / 12) * Math.PI) * 62; // degrees
    const azimuth = 110 + ((hoursF - 6) / 12) * 140;
    const phi = THREE.MathUtils.degToRad(90 - elevation);
    const theta = THREE.MathUtils.degToRad(azimuth);
    this.sun.setFromSphericalCoords(1, phi, theta);
    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(this.sun);
    this.envSky.material.uniforms.sunPosition.value.copy(this.sun);
    for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) this.envSky.material.uniforms[k].value = u[k].value;
    const night = 1 - daylight;
    this.stars.material.opacity = Math.max(0, night - 0.35) * 1.2;
    this.stars.rotation.y += dt * 0.002;
    if (this.water) {
      this.water.material.uniforms.time.value += dt * 0.6;
      this.water.material.uniforms.sunDirection.value.copy(this.sun).normalize();
    }
    if (this.fountainWater) this.fountainWater.material.uniforms.time.value += dt * 1.4;
    // Re-bake the environment map when the sky has changed enough.
    const key = Math.round(hoursF * 6);
    if (key !== this.lastEnvKey) {
      this.lastEnvKey = key;
      const rt = this.pmrem.fromScene(this.envScene, 0, 0.1, 2000);
      this.envRT?.dispose();
      this.envRT = rt;
      this.scene.environment = rt.texture;
    }
    // Night: the sky shader goes black, so fake a moonlit blue environment.
    this.scene.environmentIntensity = 0.25 + daylight * 0.85;
    return { sunDir: this.sun.clone(), elevation };
  }
}

export class PostFX {
  constructor(renderer, scene, camera, quality) {
    this.enabled = quality === 'high';
    this.renderer = renderer;
    if (!this.enabled) return;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.renderPass = new RenderPass(scene, camera);
    // Small radius: lamps and neon get a tight glow instead of a screen-wide
    // flare when seen from far away.
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.3, 0.25, 0.9);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  setSize(w, h) {
    if (!this.enabled) return;
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
  }

  setNight(night) {
    if (!this.enabled) return;
    // Gentle at night: neon should glow, not blind.
    this.bloom.strength = 0.12 + night * 0.2;
    this.bloom.threshold = 0.96 - night * 0.08;
  }

  // Interiors: bright walls under bloom read as haze, so only true
  // light sources (screens, neon) may glow.
  setIndoor() {
    if (!this.enabled) return;
    this.bloom.strength = 0.12;
    this.bloom.threshold = 1.05;
  }

  render(scene, camera) {
    if (this.enabled) this.composer.render();
    else this.renderer.render(scene, camera);
  }
}
