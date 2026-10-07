// Pludor Radio engine: original music generated live with WebAudio (no
// files to download, nothing licensed). Each track is a seed + genre; the
// engine schedules drums, bass, chords and leads on a lookahead clock.
// Uploaded songs (a player's own file) play through the same output, so the
// visualiser and volume work for both.

import { audioContext } from './audio.js';

export const GENRES = {
  afrobeats: { label: 'Afrobeats', bpm: 104 },
  amapiano: { label: 'Amapiano', bpm: 112 },
  lofi: { label: 'Lo-fi', bpm: 80 },
  house: { label: 'House', bpm: 122 },
  highlife: { label: 'Highlife', bpm: 118 },
};

const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };
const PROGS = [[0, 5, 3, 4], [0, 3, 4, 3], [5, 3, 0, 4], [0, 4, 5, 3]];

function rng(seed) {
  let s = 0;
  for (const ch of String(seed)) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  s = s || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const midi = (n) => 440 * 2 ** ((n - 69) / 12);

export class MusicEngine {
  constructor() {
    this.ctx = null;
    this.volume = 0.6;
    this.playing = false;
    this.track = null;
    this.step = 0;
  }

  _ensure() {
    if (this.ctx) return true;
    const ctx = audioContext();
    if (!ctx) return false;
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = this.volume * 0.5;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 128;
    this.out.connect(this.analyser).connect(ctx.destination);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.out) this.out.gain.setTargetAtTime(this.volume * 0.5, this.ctx.currentTime, 0.05);
    if (this.audioEl) this.audioEl.volume = this.volume;
  }

  // track: { id, title, artist, genre, seed, src? }
  play(track) {
    if (!this._ensure()) return false;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.stop();
    this.track = track;
    this.playing = true;
    if (track.src) return this._playFile(track.src);
    const g = GENRES[track.genre] || GENRES.afrobeats;
    const r = rng(track.seed || track.id);
    this.spb = 60 / (g.bpm + Math.round((r() - 0.5) * 8)) / 4; // seconds per 16th
    this.root = 45 + Math.floor(r() * 8);
    this.scale = r() < 0.55 ? SCALES.minor : SCALES.major;
    this.prog = PROGS[Math.floor(r() * PROGS.length)];
    this.motif = Array.from({ length: 16 }, () => (r() < 0.45 ? Math.floor(r() * 7) : null));
    this.bassPat = Array.from({ length: 16 }, (_, i) => (i % 4 === 0 || r() < 0.22 ? 1 : 0));
    this.step = 0;
    this.next = this.ctx.currentTime + 0.08;
    this.timer = setInterval(() => this._schedule(), 25);
    return true;
  }

  _playFile(src) {
    this.audioEl = new Audio(src);
    this.audioEl.crossOrigin = 'anonymous';
    this.audioEl.volume = this.volume;
    try {
      this.mediaNode = this.ctx.createMediaElementSource(this.audioEl);
      this.mediaNode.connect(this.analyser);
    } catch {
      /* already connected / not allowed */
    }
    this.audioEl.onended = () => this.onEnded?.();
    this.audioEl.play().catch(() => (this.playing = false));
    return true;
  }

  pause() {
    this.playing = false;
    clearInterval(this.timer);
    this.audioEl?.pause();
  }

  resume() {
    if (!this.track) return;
    if (this.audioEl) {
      this.playing = true;
      return this.audioEl.play();
    }
    this.play(this.track);
  }

  stop() {
    clearInterval(this.timer);
    this.playing = false;
    if (this.audioEl) {
      this.audioEl.pause();
      this.audioEl = null;
      this.mediaNode?.disconnect();
      this.mediaNode = null;
    }
  }

  level() {
    if (!this.analyser) return new Uint8Array(32);
    const a = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(a);
    return a;
  }

  _schedule() {
    while (this.next < this.ctx.currentTime + 0.12) {
      this._stepAt(this.step, this.next);
      this.next += this.spb * (this.track.genre === 'lofi' && this.step % 2 ? 1.18 : this.track.genre === 'lofi' ? 0.82 : 1);
      this.step += 1;
    }
  }

  // ── instruments ──
  _env(node, t, a, peak, d) {
    node.gain.setValueAtTime(0.0001, t);
    node.gain.exponentialRampToValueAtTime(peak, t + a);
    node.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  _kick(t, v = 1) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    this._env(g, t, 0.003, 0.9 * v, 0.28);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.35);
  }

  _noise(t, { hp = 6000, dur = 0.04, vol = 0.2, bp = null } = {}) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = bp ? 'bandpass' : 'highpass';
    f.frequency.value = bp || hp;
    const g = this.ctx.createGain();
    this._env(g, t, 0.002, vol, dur);
    s.connect(f).connect(g).connect(this.out);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
  }

  _tone(t, freq, { type = 'triangle', dur = 0.2, vol = 0.12, cutoff = 2400, slide = 0 } = {}) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = this.ctx.createGain();
    this._env(g, t, 0.01, vol, dur);
    o.connect(f).connect(g).connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  _note(degree, octave = 0) {
    const n = this.scale.length;
    const d = ((degree % n) + n) % n;
    return this.root + this.scale[d] + 12 * (octave + Math.floor(degree / n));
  }

  _stepAt(i, t) {
    const s = i % 16;
    const bar = Math.floor(i / 16) % 4;
    const chordDeg = this.prog[bar];
    const genre = this.track.genre;
    // Drums per genre.
    if (genre === 'house') {
      if (s % 4 === 0) this._kick(t);
      if (s % 4 === 2) this._noise(t, { hp: 7000, dur: 0.05, vol: 0.18 });
      if (s === 4 || s === 12) this._noise(t, { bp: 1500, dur: 0.12, vol: 0.3 });
    } else if (genre === 'amapiano') {
      if (s % 4 === 0) this._kick(t, 0.7);
      this._noise(t, { hp: 8000, dur: 0.025, vol: s % 2 ? 0.07 : 0.12 });
      if ([3, 6, 10, 14].includes(s)) this._tone(t, midi(this._note(chordDeg, -1)), { type: 'sine', dur: 0.32, vol: 0.5, cutoff: 900, slide: 0.7 }); // log drum
    } else if (genre === 'lofi') {
      if (s === 0 || s === 10) this._kick(t, 0.8);
      if (s === 4 || s === 12) this._noise(t, { bp: 1800, dur: 0.1, vol: 0.18 });
      if (s % 2 === 0) this._noise(t, { hp: 9000, dur: 0.02, vol: 0.05 });
    } else {
      // afrobeats / highlife groove
      if (s === 0 || s === 7 || s === 10) this._kick(t, 0.9);
      if (s === 4 || s === 12) this._noise(t, { bp: 1400, dur: 0.1, vol: 0.28 });
      this._noise(t, { hp: 8500, dur: 0.02, vol: [0, 3, 6, 8, 11, 14].includes(s) ? 0.12 : 0.05 });
    }
    // Bass.
    if (this.bassPat[s] && genre !== 'amapiano') this._tone(t, midi(this._note(chordDeg, -1)), { type: 'sawtooth', dur: this.spb * 1.8, vol: 0.16, cutoff: 500 });
    // Chords on the bar start (pads) or stabs.
    if (s === 0 || (genre === 'house' && s % 8 === 6) || (genre === 'amapiano' && (s === 2 || s === 9))) {
      for (const off of [0, 2, 4]) this._tone(t, midi(this._note(chordDeg + off, 1)), { type: genre === 'lofi' ? 'sine' : 'triangle', dur: s === 0 && genre !== 'house' ? this.spb * 14 : this.spb * 1.5, vol: 0.05, cutoff: genre === 'lofi' ? 1200 : 2600 });
    }
    // Lead motif (guitar-like plucks for highlife).
    const m = this.motif[s];
    if (m !== null && (bar % 2 === 1 || genre === 'highlife')) this._tone(t, midi(this._note(chordDeg + m, 2)), { type: genre === 'highlife' ? 'square' : 'triangle', dur: this.spb * 1.4, vol: genre === 'highlife' ? 0.035 : 0.05, cutoff: 3200 });
  }
}
