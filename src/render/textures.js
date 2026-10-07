// Procedural canvas textures. Everything visual in the city is generated
// here or from geometry, so there are no third-party art assets to license.

import * as THREE from 'three';

const cache = new Map();

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, { repeat = false, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function rand(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// Facade with a window grid. Returns { map, emissive } sharing layout so lit
// windows glow at night.
export function facadeTextures(seed, base = '#3a4a5c', style = 'grid') {
  const key = `facade:${seed}:${base}:${style}`;
  if (cache.has(key)) return cache.get(key);
  const W = 128;
  const H = 128;
  const [c, g] = canvas(W, H);
  const [e, ge] = canvas(W, H);
  const r = rand(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  // subtle vertical panel shading
  for (let x = 0; x < W; x += 32) {
    g.fillStyle = 'rgba(255,255,255,0.035)';
    g.fillRect(x, 0, 2, H);
  }
  ge.fillStyle = '#000';
  ge.fillRect(0, 0, W, H);
  const cols = style === 'tall' ? 4 : 4;
  const rows = style === 'tall' ? 4 : 4;
  const cw = W / cols;
  const rh = H / rows;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const x = i * cw + cw * 0.18;
      const y = j * rh + rh * 0.2;
      const w = cw * 0.64;
      const h = rh * (style === 'tall' ? 0.62 : 0.55);
      const grad = g.createLinearGradient(x, y, x + w, y + h);
      grad.addColorStop(0, '#9fc6dd');
      grad.addColorStop(1, '#3c5f7a');
      g.fillStyle = grad;
      g.fillRect(x, y, w, h);
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(x, y, w * 0.35, h * 0.18);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(x, y + h, w, 2);
      if (r() < 0.55) {
        const warm = r() < 0.8;
        ge.fillStyle = warm ? `rgba(255,${200 + Math.floor(r() * 40)},${130 + Math.floor(r() * 50)},1)` : 'rgba(170,210,255,1)';
        ge.fillRect(x, y, w, h);
      }
    }
  }
  const out = { map: tex(c, { repeat: true }), emissive: tex(e, { repeat: true }) };
  cache.set(key, out);
  return out;
}

export function signTexture(text, { bg = '#111827', fg = '#ffffff', accent = '#7c5cff', sub = '', w = 512, h = 128, font = 'Inter, system-ui, sans-serif' } = {}) {
  const [c, g] = canvas(w, h);
  const grad = g.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, bg);
  grad.addColorStop(1, shade(bg, -25));
  g.fillStyle = grad;
  roundRect(g, 0, 0, w, h, 18);
  g.fill();
  g.fillStyle = accent;
  g.fillRect(0, h - 8, w, 8);
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let size = sub ? h * 0.42 : h * 0.52;
  g.font = `800 ${size}px ${font}`;
  while (g.measureText(text).width > w * 0.9 && size > 12) {
    size -= 2;
    g.font = `800 ${size}px ${font}`;
  }
  g.fillText(text, w / 2, sub ? h * 0.4 : h * 0.48);
  if (sub) {
    g.globalAlpha = 0.75;
    g.font = `600 ${h * 0.2}px ${font}`;
    g.fillText(sub, w / 2, h * 0.76);
    g.globalAlpha = 1;
  }
  return tex(c);
}

// Billboard creative rendered from an Ads Manager campaign.
export function adTexture(creative, w = 1024, h = 512) {
  const [c, g] = canvas(w, h);
  const grad = g.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, creative.bg?.[0] || '#7c5cff');
  grad.addColorStop(1, creative.bg?.[1] || '#22d3ee');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  // decorative rings
  g.strokeStyle = 'rgba(255,255,255,0.12)';
  g.lineWidth = 28;
  for (let i = 0; i < 3; i++) {
    g.beginPath();
    g.arc(w * 0.86, h * 0.2, 120 + i * 90, 0, Math.PI * 2);
    g.stroke();
  }
  g.fillStyle = '#fff';
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  let size = 124;
  g.font = `900 ${size}px Inter, system-ui, sans-serif`;
  while (g.measureText(creative.headline).width > w * 0.86 && size > 40) {
    size -= 4;
    g.font = `900 ${size}px Inter, system-ui, sans-serif`;
  }
  g.shadowColor = 'rgba(0,0,0,0.25)';
  g.shadowBlur = 18;
  g.fillText(creative.headline, 60, h * 0.45);
  g.shadowBlur = 0;
  g.font = '600 44px Inter, system-ui, sans-serif';
  g.globalAlpha = 0.92;
  g.fillText(creative.sub, 62, h * 0.6);
  g.globalAlpha = 1;
  // CTA pill
  g.font = '800 40px Inter, system-ui, sans-serif';
  const cta = `${creative.cta}  →`;
  const cw = g.measureText(cta).width + 70;
  g.fillStyle = '#ffffff';
  roundRect(g, 60, h * 0.7, cw, 84, 42);
  g.fill();
  g.fillStyle = creative.bg?.[1] || '#111';
  g.fillText(cta, 95, h * 0.7 + 56);
  g.font = '700 26px Inter, system-ui, sans-serif';
  g.fillStyle = 'rgba(255,255,255,0.8)';
  g.textAlign = 'right';
  g.fillText(`Sponsored · ${creative.advertiserName}`, w - 40, h - 34);
  return tex(c);
}

export function roadTexture() {
  if (cache.has('road')) return cache.get('road');
  const [c, g] = canvas(64, 256);
  g.fillStyle = '#2b3138';
  g.fillRect(0, 0, 64, 256);
  const r = rand(7);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(255,255,255,${r() * 0.04})`;
    g.fillRect(r() * 64, r() * 256, 1.5, 1.5);
  }
  g.fillStyle = '#e8c547';
  g.fillRect(30, 0, 4, 120);
  g.fillStyle = 'rgba(255,255,255,0.5)';
  g.fillRect(2, 0, 2, 256);
  g.fillRect(60, 0, 2, 256);
  const t = tex(c, { repeat: true });
  cache.set('road', t);
  return t;
}

export function tileTexture(a = '#cfd6dc', b = '#bcc5cc', n = 8) {
  const key = `tile:${a}:${b}:${n}`;
  if (cache.has(key)) return cache.get(key);
  const S = 256;
  const [c, g] = canvas(S, S);
  const s = S / n;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      g.fillStyle = (i + j) % 2 ? a : b;
      g.fillRect(i * s, j * s, s, s);
    }
  g.strokeStyle = 'rgba(0,0,0,0.08)';
  for (let i = 0; i <= n; i++) {
    g.beginPath();
    g.moveTo(i * s, 0);
    g.lineTo(i * s, S);
    g.moveTo(0, i * s);
    g.lineTo(S, i * s);
    g.stroke();
  }
  const t = tex(c, { repeat: true });
  cache.set(key, t);
  return t;
}

export function grassTexture() {
  if (cache.has('grass')) return cache.get('grass');
  const S = 256;
  const [c, g] = canvas(S, S);
  g.fillStyle = '#4f8a4b';
  g.fillRect(0, 0, S, S);
  const r = rand(3);
  for (let i = 0; i < 2500; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(120,180,90,0.25)' : 'rgba(30,70,40,0.2)';
    g.fillRect(r() * S, r() * S, 2, 2);
  }
  const t = tex(c, { repeat: true });
  cache.set('grass', t);
  return t;
}

export function screenTexture() {
  const [c, g] = canvas(512, 256);
  const t = tex(c);
  t.userData = { canvas: c, ctx: g };
  return t;
}

export function drawCinemaFrame(t, time, reel) {
  const { canvas: c, ctx: g } = t.userData;
  const w = c.width;
  const h = c.height;
  const hue = (time * 20) % 360;
  const grad = g.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, `hsl(${hue},80%,45%)`);
  grad.addColorStop(1, `hsl(${(hue + 80) % 360},80%,30%)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 6; i++) {
    g.fillStyle = `rgba(255,255,255,${0.06 + 0.04 * Math.sin(time + i)})`;
    g.beginPath();
    g.arc(((i * 97 + time * 40) % (w + 100)) - 50, h * (0.3 + 0.1 * Math.sin(time * 0.7 + i)), 40 + i * 6, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#fff';
  g.font = '800 34px Inter, system-ui, sans-serif';
  g.textAlign = 'left';
  g.fillText('FLIKA', 24, 48);
  g.font = '700 26px Inter, system-ui, sans-serif';
  g.fillText(reel?.title || 'Now playing', 24, h - 46);
  g.font = '600 18px Inter, system-ui, sans-serif';
  g.globalAlpha = 0.8;
  g.fillText(`▶ ${reel?.views || ''} views`, 24, h - 20);
  g.globalAlpha = 1;
  t.needsUpdate = true;
}

export function shade(hex, pct) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + (pct / 100) * 255)));
  const r = f(n >> 16);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// ───────────────────────── PBR procedural materials ─────────────────────────
// Each generator paints colour, a packed roughness(G)/metalness(B) map, a
// height map (converted to a normal map) and an emissive map for night.

function valueNoise(seed) {
  const r = rand(seed);
  const N = 64;
  const grid = Array.from({ length: N * N }, () => r());
  const at = (x, y) => grid[((y % N) + N) % N * N + (((x % N) + N) % N)];
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * u;
    const b = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * u;
    return a + (b - a) * v;
  };
}

function fbmCanvas(g, w, h, seed, scale, alpha, color) {
  const n = valueNoise(seed);
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const [cr, cg, cb] = color;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let v = 0;
      let amp = 0.5;
      let f = scale;
      for (let o = 0; o < 4; o++) {
        v += n((x / w) * f * 8, (y / h) * f * 8) * amp;
        amp *= 0.5;
        f *= 2;
      }
      const i = (y * w + x) * 4;
      const k = (v - 0.5) * alpha;
      d[i] = Math.max(0, Math.min(255, d[i] + k * cr));
      d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + k * cg));
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + k * cb));
    }
  g.putImageData(img, 0, 0);
}

function heightToNormal(hc, strength = 2) {
  const w = hc.width;
  const h = hc.height;
  const src = hc.getContext('2d').getImageData(0, 0, w, h).data;
  const [c, g] = canvas(w, h);
  const out = g.createImageData(w, h);
  const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      out.data[i] = ((-dx / l) * 0.5 + 0.5) * 255;
      out.data[i + 1] = ((dy / l) * 0.5 + 0.5) * 255;
      out.data[i + 2] = (1 / l) * 0.5 * 255 + 127;
      out.data[i + 3] = 255;
    }
  g.putImageData(out, 0, 0);
  return c;
}

function hexRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

function finish(maps, repeat = true) {
  const out = {};
  for (const [k, c] of Object.entries(maps)) out[k] = tex(c, { repeat, srgb: k === 'map' || k === 'emissiveMap' });
  return out;
}

// One tile = 2 bays × 2 floors. kind: 'glass' | 'brick' | 'concrete'
export function facadePBR(kind, seed, base) {
  const key = `pbr:${kind}:${seed % 4}:${base}`;
  if (cache.has(key)) return cache.get(key);
  const S = 512;
  const [mc, m] = canvas(S, S);
  const [rc, r] = canvas(S, S);
  const [hc, hg] = canvas(S, S);
  const [ec, e] = canvas(S, S);
  const R = rand(seed * 7 + kind.length);
  e.fillStyle = '#000';
  e.fillRect(0, 0, S, S);
  hg.fillStyle = '#808080';
  hg.fillRect(0, 0, S, S);
  const rough = (x, y, w, h, ro, me) => {
    r.fillStyle = `rgb(0,${Math.round(ro * 255)},${Math.round(me * 255)})`;
    r.fillRect(x, y, w, h);
  };
  const height = (x, y, w, h, v) => {
    hg.fillStyle = `rgb(${v},${v},${v})`;
    hg.fillRect(x, y, w, h);
  };
  const light = (x, y, w, h) => {
    if (R() < 0.42) {
      const warm = R() < 0.8;
      const grd = e.createLinearGradient(x, y, x, y + h);
      grd.addColorStop(0, warm ? '#ffd9a0' : '#cfe3ff');
      grd.addColorStop(1, warm ? '#c98a4a' : '#7d9cc8');
      e.fillStyle = grd;
      e.fillRect(x, y, w, h);
      // blinds / silhouettes
      e.fillStyle = 'rgba(0,0,0,0.35)';
      if (R() < 0.5) e.fillRect(x, y, w, h * (0.15 + R() * 0.35));
    }
  };
  if (kind === 'glass') {
    const [br, bg, bb] = hexRgb(base);
    m.fillStyle = `rgb(${br * 0.35 + 20},${bg * 0.4 + 35},${bb * 0.45 + 50})`;
    m.fillRect(0, 0, S, S);
    rough(0, 0, S, S, 0.06, 0.85);
    const cols = 4;
    const rows = 4;
    const cw = S / cols;
    const rh = S / rows;
    for (let i = 0; i < cols; i++)
      for (let j = 0; j < rows; j++) {
        const x = i * cw;
        const y = j * rh;
        const tint = (R() - 0.5) * 18;
        m.fillStyle = `rgba(${120 + tint},${150 + tint},${170 + tint},0.08)`;
        m.fillRect(x, y, cw, rh);
        light(x + 4, y + rh * 0.12, cw - 8, rh * 0.8);
      }
    // mullions + floor slabs
    m.fillStyle = '#9aa5ae';
    for (let i = 0; i <= cols; i++) {
      m.fillRect(i * cw - 3, 0, 6, S);
      rough(i * cw - 3, 0, 6, S, 0.35, 1);
      height(i * cw - 3, 0, 6, S, 170);
    }
    for (let j = 0; j <= rows; j++) {
      m.fillStyle = '#6f7a84';
      m.fillRect(0, j * rh - 7, S, 14);
      rough(0, j * rh - 7, S, 14, 0.6, 0.2);
      height(0, j * rh - 7, S, 14, 190);
      e.fillStyle = '#000';
      e.fillRect(0, j * rh - 7, S, 14);
    }
  } else {
    const isBrick = kind === 'brick';
    const [br, bg, bb] = hexRgb(base);
    if (isBrick) {
      m.fillStyle = '#b9b0a6';
      m.fillRect(0, 0, S, S);
      const bh = 12;
      const bw = 36;
      for (let y = 0; y < S; y += bh) {
        const off = (y / bh) % 2 ? bw / 2 : 0;
        for (let x = -bw; x < S; x += bw) {
          const k = (R() - 0.5) * 40;
          m.fillStyle = `rgb(${Math.max(0, br + k)},${Math.max(0, bg + k * 0.6)},${Math.max(0, bb + k * 0.5)})`;
          m.fillRect(x + off + 1, y + 1, bw - 2, bh - 2);
          height(x + off + 1, y + 1, bw - 2, bh - 2, 150);
        }
      }
      rough(0, 0, S, S, 0.92, 0);
      fbmCanvas(m, S, S, seed, 2, 50, [1, 1, 1]);
    } else {
      m.fillStyle = `rgb(${br},${bg},${bb})`;
      m.fillRect(0, 0, S, S);
      fbmCanvas(m, S, S, seed, 1.5, 40, [1, 1, 1]);
      rough(0, 0, S, S, 0.85, 0);
      // panel joints
      hg.fillStyle = '#5a5a5a';
      for (let x = 0; x <= S; x += S / 2) hg.fillRect(x - 2, 0, 4, S);
      for (let y = 0; y <= S; y += S / 4) hg.fillRect(0, y - 2, S, 4);
    }
    // windows: 2 bays × 2 floors
    for (let i = 0; i < 2; i++)
      for (let j = 0; j < 2; j++) {
        const x = i * (S / 2) + S * 0.09;
        const y = j * (S / 2) + S * 0.1;
        const w = S * 0.32;
        const h = S * 0.3;
        // frame
        m.fillStyle = isBrick ? '#ece8e1' : '#3b4148';
        m.fillRect(x - 8, y - 8, w + 16, h + 16);
        rough(x - 8, y - 8, w + 16, h + 16, 0.45, isBrick ? 0 : 0.8);
        height(x - 8, y - 8, w + 16, h + 16, 120);
        // glass
        const grd = m.createLinearGradient(x, y, x + w, y + h);
        grd.addColorStop(0, '#2c3e4f');
        grd.addColorStop(1, '#16222e');
        m.fillStyle = grd;
        m.fillRect(x, y, w, h);
        rough(x, y, w, h, 0.04, 0.7);
        height(x, y, w, h, 70);
        // mullion
        m.fillStyle = isBrick ? '#ece8e1' : '#3b4148';
        m.fillRect(x + w / 2 - 3, y, 6, h);
        height(x + w / 2 - 3, y, 6, h, 120);
        // sill
        m.fillStyle = '#d8d2c8';
        m.fillRect(x - 12, y + h + 8, w + 24, 8);
        height(x - 12, y + h + 8, w + 24, 8, 200);
        light(x, y, w / 2 - 3, h);
        light(x + w / 2 + 3, y, w / 2 - 3, h);
      }
  }
  const out = finish({ map: mc, roughnessMap: rc, normalMap: heightToNormal(hc, 3), emissiveMap: ec });
  out.metalnessMap = out.roughnessMap;
  cache.set(key, out);
  return out;
}

export function asphaltPBR() {
  if (cache.has('asphalt')) return cache.get('asphalt');
  const S = 256;
  const [mc, m] = canvas(S, S);
  m.fillStyle = '#34393f';
  m.fillRect(0, 0, S, S);
  fbmCanvas(m, S, S, 11, 3, 60, [1, 1, 1.05]);
  const R = rand(5);
  for (let i = 0; i < 3500; i++) {
    const v = 90 + R() * 80;
    m.fillStyle = `rgba(${v},${v},${v},${0.25 + R() * 0.3})`;
    m.fillRect(R() * S, R() * S, 1 + R(), 1 + R());
  }
  const [hc, hg] = canvas(S, S);
  hg.drawImage(mc, 0, 0);
  const [rc, r] = canvas(S, S);
  r.fillStyle = 'rgb(0,225,0)';
  r.fillRect(0, 0, S, S);
  const out = finish({ map: mc, normalMap: heightToNormal(hc, 1.2), roughnessMap: rc });
  cache.set('asphalt', out);
  return out;
}

export function paversPBR(a = '#c4c0b8', seed = 3) {
  const key = `pavers:${a}`;
  if (cache.has(key)) return cache.get(key);
  const S = 256;
  const [mc, m] = canvas(S, S);
  const [hc, hg] = canvas(S, S);
  const [rc, r] = canvas(S, S);
  const R = rand(seed);
  const [cr, cg, cb] = hexRgb(a);
  hg.fillStyle = '#404040';
  hg.fillRect(0, 0, S, S);
  m.fillStyle = '#8d8a84';
  m.fillRect(0, 0, S, S);
  const n = 4;
  const s = S / n;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const k = (R() - 0.5) * 22;
      m.fillStyle = `rgb(${cr + k},${cg + k},${cb + k})`;
      m.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
      hg.fillStyle = '#b0b0b0';
      hg.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
    }
  fbmCanvas(m, S, S, seed + 4, 2, 26, [1, 1, 1]);
  r.fillStyle = 'rgb(0,215,0)';
  r.fillRect(0, 0, S, S);
  const out = finish({ map: mc, normalMap: heightToNormal(hc, 2.5), roughnessMap: rc });
  cache.set(key, out);
  return out;
}

export function grassPBR() {
  if (cache.has('grassPBR')) return cache.get('grassPBR');
  const S = 256;
  const [mc, m] = canvas(S, S);
  m.fillStyle = '#4c7a3c';
  m.fillRect(0, 0, S, S);
  fbmCanvas(m, S, S, 21, 2, 70, [0.6, 1, 0.4]);
  const R = rand(9);
  for (let i = 0; i < 5000; i++) {
    m.strokeStyle = R() < 0.5 ? 'rgba(140,190,90,0.35)' : 'rgba(30,70,30,0.35)';
    const x = R() * S;
    const y = R() * S;
    m.beginPath();
    m.moveTo(x, y);
    m.lineTo(x + (R() - 0.5) * 3, y - 3 - R() * 3);
    m.stroke();
  }
  const [hc, hg] = canvas(S, S);
  hg.drawImage(mc, 0, 0);
  const out = finish({ map: mc, normalMap: heightToNormal(hc, 1.5) });
  cache.set('grassPBR', out);
  return out;
}

// Alpha-cut foliage card for instanced trees.
export function leafCardTexture(seed = 1) {
  const key = `leaf:${seed}`;
  if (cache.has(key)) return cache.get(key);
  const S = 256;
  const [c, g] = canvas(S, S);
  const R = rand(seed);
  for (let i = 0; i < 900; i++) {
    const a = R() * Math.PI * 2;
    const d = Math.sqrt(R()) * S * 0.46;
    const x = S / 2 + Math.cos(a) * d;
    const y = S / 2 + Math.sin(a) * d * 0.92;
    const shade = 0.55 + (1 - d / (S * 0.46)) * 0.35 + R() * 0.15;
    g.fillStyle = `rgb(${Math.round(60 * shade)},${Math.round(125 * shade)},${Math.round(50 * shade)})`;
    g.beginPath();
    g.ellipse(x, y, 5 + R() * 4, 2.5 + R() * 2, R() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  const t = tex(c);
  cache.set(key, t);
  return t;
}
