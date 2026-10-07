// Small synthesized world sounds (no audio files to download). Browsers only
// allow audio after a user gesture, so the context is created on the first
// key press / tap and every call before that is a silent no-op.

let ctx = null;
let master = null;

function unlock() {
  if (ctx) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.7;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
}
for (const ev of ['pointerdown', 'keydown', 'touchstart']) addEventListener(ev, unlock, { once: true, capture: true });

export function setVolume(v) {
  if (master) master.gain.value = Math.max(0, Math.min(1, v));
}

// Two-tone car horn. volume 0..1, pan -1 (left) .. 1 (right).
export function honk(volume = 1, pan = 0, long = false) {
  if (!ctx || volume < 0.02) return;
  if (ctx.state === 'suspended') ctx.resume();
  const now = ctx.currentTime;
  const out = ctx.createGain();
  const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2200;
  out.connect(lp);
  if (p) {
    p.pan.value = Math.max(-1, Math.min(1, pan));
    lp.connect(p).connect(master);
  } else lp.connect(master);
  const beeps = long ? [[0, 0.7]] : [[0, 0.22], [0.3, 0.42]];
  for (const [t0, len] of beeps) {
    for (const f of [392, 494]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, now + t0);
      g.gain.linearRampToValueAtTime(0.16 * volume, now + t0 + 0.02);
      g.gain.setValueAtTime(0.16 * volume, now + t0 + len - 0.04);
      g.gain.linearRampToValueAtTime(0, now + t0 + len);
      o.connect(g).connect(out);
      o.start(now + t0);
      o.stop(now + t0 + len + 0.02);
    }
  }
}

// Soft door chime when entering a building.
export function chime(volume = 0.6) {
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();
  const now = ctx.currentTime;
  [[880, 0], [1318.5, 0.14]].forEach(([f, t0]) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now + t0);
    g.gain.linearRampToValueAtTime(0.12 * volume, now + t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + t0 + 0.9);
    o.connect(g).connect(master);
    o.start(now + t0);
    o.stop(now + t0 + 1);
  });
}

// Shared context for other sound sources (Pludor Radio). Creates it on
// demand, which browsers allow inside a click handler.
export function audioContext() {
  unlock();
  return ctx;
}
