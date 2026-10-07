// Pludor Radio: a compact player under the minimap (never wider than it).
// Play/pause, skip, volume, and a video view that plays inside the minimap's
// footprint. Artists pay per day to put their track into rotation.

import { MusicEngine, GENRES } from '../render/music.js';
import { html } from './dom.js';

const GENRE_COLORS = { afrobeats: ['#ff7a18', '#af002d'], amapiano: ['#11998e', '#38ef7d'], lofi: ['#4b6cb7', '#182848'], house: ['#7f00ff', '#e100ff'], highlife: ['#f7971e', '#ffd200'] };

export class Radio {
  constructor(hud, app) {
    this.hud = hud;
    this.app = app;
    this.engine = new MusicEngine();
    this.engine.onEnded = () => this.next();
    this.queue = [];
    this.i = 0;
    this.video = false;
    this.local = null; // the player's own uploaded track (this device only)
    try {
      this.engine.volume = Number(localStorage.getItem('pw-radio-vol') ?? 0.6);
    } catch {
      /* storage blocked */
    }
    const el = document.createElement('div');
    el.className = 'pw-radio';
    el.innerHTML = html`<div class="pw-radio-row"><canvas class="pw-radio-cover" width="88" height="88"></canvas><div class="pw-radio-meta"><small>📻 PLUDOR RADIO</small><b class="pw-radio-title">Tap play</b><span class="pw-radio-artist">Live mixes · promoted tracks</span></div></div>
      <div class="pw-radio-ctl"><button data-r="prev" aria-label="Previous">⏮</button><button data-r="play" class="pw-radio-play" aria-label="Play">▶</button><button data-r="next" aria-label="Next">⏭</button><input type="range" min="0" max="1" step="0.05" value="${this.engine.volume}" aria-label="Volume"><button data-r="video" aria-label="Video">📺</button><button data-r="promote" aria-label="Promote your music" title="Promote your music">📣</button></div>`.s;
    hud.root.appendChild(el);
    this.el = el;
    this.cover = el.querySelector('.pw-radio-cover');
    const vid = document.createElement('div');
    vid.className = 'pw-radio-video';
    vid.hidden = true;
    vid.innerHTML = '<canvas width="460" height="400"></canvas><button aria-label="Close video">✕</button>';
    hud.root.appendChild(vid);
    this.vidEl = vid;
    this.vidCanvas = vid.querySelector('canvas');
    vid.querySelector('button').onclick = () => this.toggleVideo(false);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-r]');
      if (!b) return;
      ({ prev: () => this.prev(), play: () => this.toggle(), next: () => this.next(), video: () => this.toggleVideo(), promote: () => app.sheets.open('radio') })[b.dataset.r]();
    });
    el.querySelector('input').addEventListener('input', (e) => {
      this.engine.setVolume(Number(e.target.value));
      try {
        localStorage.setItem('pw-radio-vol', e.target.value);
      } catch {
        /* storage blocked */
      }
    });
    this.load();
  }

  async load() {
    try {
      const pl = await this.app.api.radio.playlist();
      this.pricePerDay = pl.pricePerDay;
      this.symbol = pl.symbol;
      // Promoted tracks take every other slot.
      const q = [];
      const st = [...pl.station];
      const pr = [...pl.promoted];
      while (st.length || pr.length) {
        if (pr.length) q.push(pr.shift());
        if (st.length) q.push(st.shift());
      }
      const cur = this.queue[this.i]?.id;
      this.queue = this.local ? [this.local, ...q] : q;
      const at = this.queue.findIndex((t) => t.id === cur);
      this.i = at >= 0 ? at : 0;
      if (!this.engine.track) this._show(this.queue[this.i]);
    } catch {
      /* radio unavailable */
    }
  }

  playLocal(file, meta = {}) {
    const src = URL.createObjectURL(file);
    this.local = { id: 'local', title: meta.title || file.name.replace(/\.[^.]+$/, ''), artist: meta.artist || 'You', genre: meta.genre || 'afrobeats', src, video: file.type.startsWith('video/') ? src : null, local: true };
    this.queue = [this.local, ...this.queue.filter((t) => t.id !== 'local')];
    this.i = 0;
    this.play();
  }

  play() {
    const t = this.queue[this.i];
    if (!t) return;
    if (!this.engine.play(t)) return this.hud.toast('Tap again to start audio', '🔈');
    this._show(t);
    if (this.video) this._syncVideoEl();
  }

  toggle() {
    if (this.engine.playing) this.engine.pause();
    else if (this.engine.track && this.engine.track === this.queue[this.i]) this.engine.resume();
    else this.play();
    this._show(this.queue[this.i]);
  }

  next() {
    if (!this.queue.length) return;
    this.i = (this.i + 1) % this.queue.length;
    this.play();
  }

  prev() {
    if (!this.queue.length) return;
    this.i = (this.i - 1 + this.queue.length) % this.queue.length;
    this.play();
  }

  playIndex(i) {
    this.i = i;
    this.play();
  }

  toggleVideo(on = !this.video) {
    this.video = on;
    this.vidEl.hidden = !on;
    this._syncVideoEl();
    if (on && !this.engine.playing) this.play();
  }

  _syncVideoEl() {
    const t = this.queue[this.i];
    let v = this.vidEl.querySelector('video');
    if (this.video && t?.video) {
      if (!v) {
        v = document.createElement('video');
        v.muted = true; // audio comes from the radio output
        v.loop = true;
        v.playsInline = true;
        this.vidEl.prepend(v);
      }
      if (v.src !== t.video) v.src = t.video;
      v.play().catch(() => {});
    } else v?.remove();
  }

  _show(t) {
    if (!t) return;
    this.el.querySelector('.pw-radio-title').textContent = t.title;
    this.el.querySelector('.pw-radio-artist').textContent = `${t.artist}${t.promoted ? ' · Promoted' : t.local ? ' · your track' : ` · ${GENRES[t.genre]?.label || ''}`}`;
    this.el.querySelector('.pw-radio-play').textContent = this.engine.playing ? '⏸' : '▶';
    this.el.classList.toggle('on', this.engine.playing);
  }

  // Animated cover + video visualiser, drawn from the live audio.
  frame(time) {
    const t = this.queue[this.i];
    if (!t) return;
    const lv = this.engine.level();
    const [c1, c2] = GENRE_COLORS[t.genre] || GENRE_COLORS.afrobeats;
    const draw = (cv, big) => {
      const g = cv.getContext('2d');
      const W = cv.width;
      const H = cv.height;
      const grd = g.createLinearGradient(0, 0, W, H);
      grd.addColorStop(0, c1);
      grd.addColorStop(1, c2);
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);
      const n = big ? 40 : 10;
      for (let k = 0; k < n; k++) {
        const v = (lv[k + 2] || 0) / 255;
        const bh = Math.max(2, v * H * (big ? 0.55 : 0.7));
        g.fillStyle = `rgba(255,255,255,${0.35 + v * 0.5})`;
        g.fillRect((k / n) * W + 1, H - bh - (big ? 40 : 6), W / n - 3, bh);
      }
      if (big) {
        // Orbiting shapes keep the "video" alive between beats.
        for (let k = 0; k < 6; k++) {
          const a = time * (0.3 + k * 0.07) + k;
          g.fillStyle = `rgba(255,255,255,${0.08 + ((lv[8] || 0) / 255) * 0.15})`;
          g.beginPath();
          g.arc(W / 2 + Math.cos(a) * W * 0.3, H * 0.38 + Math.sin(a * 1.3) * H * 0.15, 20 + k * 9, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = '#fff';
        g.font = '800 30px Inter, system-ui, sans-serif';
        g.fillText(t.title, 18, H - 54 > 60 ? 48 : 40);
        g.font = '600 20px Inter, system-ui, sans-serif';
        g.globalAlpha = 0.85;
        g.fillText(`${t.artist}${t.promoted ? ' · PROMOTED' : ''}`, 18, 78);
        g.globalAlpha = 1;
        g.font = '800 16px Inter, system-ui, sans-serif';
        g.fillText('📻 PLUDOR RADIO', 18, H - 14);
      }
    };
    if (!this._lastCover || time - this._lastCover > 0.06) {
      this._lastCover = time;
      draw(this.cover, false);
      if (this.video && !this.vidEl.querySelector('video')) draw(this.vidCanvas, true);
    }
  }
}
