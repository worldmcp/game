// Avatar "look": the customisation layered on a base person (skin tone, hair
// colour, outfit colour, height, build, accessories). Shared by client and
// server so every peer renders the same, validated look.

const HEX = /^#[0-9a-f]{6}$/i;

export const LOOK_OPTIONS = {
  skin: ['#f6d7c3', '#eac3a3', '#d9a47f', '#c68642', '#a8693f', '#8d5524', '#6b3e26', '#4a2a1a'],
  hair: ['#0f0d0c', '#2e1f17', '#4a2f1d', '#6e4a2c', '#a5763f', '#d4b26a', '#e8d7a8', '#b33a2e', '#8a8f99', '#e7e9ec', '#7c5cff', '#22b8cf', '#ff5ca8'],
  outfit: ['#1d3557', '#e63946', '#2a9d8f', '#f4a261', '#264653', '#8338ec', '#ffbe0b', '#3a5a40', '#111111', '#f1f1f1', '#ff70a6', '#4cc9f0'],
  cap: ['#111111', '#e63946', '#1d3557', '#ffbe0b', '#2a9d8f', '#f1f1f1'],
  backpack: ['#222222', '#e76f51', '#457b9d', '#8ab17d', '#ffb703'],
};

// Look options that are virtual goods (bought with Points + money).
export const LOCKED = {
  cap: 'acc-cap',
  headphones: 'acc-headphones',
  backpack: 'acc-backpack',
  hair: { '#7c5cff': 'hair-fantasy', '#22b8cf': 'hair-fantasy', '#ff5ca8': 'hair-fantasy' },
  top: { '#ff70a6': 'outfit-neon', '#4cc9f0': 'outfit-neon', '#8338ec': 'outfit-neon' },
};

export function requiredItem(key, value) {
  const l = LOCKED[key];
  if (!l || !value) return null;
  return typeof l === 'string' ? l : l[value] || null;
}

// Strip anything the player doesn't own (server-side enforcement).
export function enforceOwnership(look, owned) {
  if (!look) return look;
  const out = { ...look };
  for (const k of Object.keys(LOCKED)) {
    const need = requiredItem(k, out[k]);
    if (need && !owned.includes(need)) out[k] = typeof out[k] === 'boolean' ? false : null;
  }
  return out;
}

export const DEFAULT_LOOK = { skin: null, hair: null, top: null, height: 1, build: 1, glasses: false, cap: null, headphones: false, backpack: null };

const hex = (v) => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : null);
const num = (v, lo, hi) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(Math.min(hi, Math.max(lo, n)) * 100) / 100 : 1;
};

export function sanitizeLook(look) {
  if (!look || typeof look !== 'object') return null;
  return {
    skin: hex(look.skin),
    hair: hex(look.hair),
    top: hex(look.top),
    height: num(look.height ?? 1, 0.9, 1.1),
    build: num(look.build ?? 1, 0.88, 1.15),
    glasses: !!look.glasses,
    cap: hex(look.cap),
    headphones: !!look.headphones,
    backpack: hex(look.backpack),
  };
}

export function lookKey(look) {
  return look ? JSON.stringify(sanitizeLook(look)) : '';
}
