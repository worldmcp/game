// Avatar "look": the customisation layered on a base person (skin, hair
// colour + style, top / bottoms / shoes with patterns, height, build, hats,
// eyewear, jewellery, bags and an aura). Shared by client and server so
// every peer renders the same, validated look. Premium options are virtual
// goods (Points, or Points + Wallet money) and are enforced server-side.

const HEX = /^#[0-9a-f]{6}$/i;

export const LOOK_OPTIONS = {
  skin: ['#f6d7c3', '#eac3a3', '#d9a47f', '#c68642', '#a8693f', '#8d5524', '#6b3e26', '#4a2a1a'],
  hair: ['#0f0d0c', '#2e1f17', '#4a2f1d', '#6e4a2c', '#a5763f', '#d4b26a', '#e8d7a8', '#b33a2e', '#8a8f99', '#e7e9ec', '#7c5cff', '#22b8cf', '#ff5ca8', '#3ddc84'],
  outfit: ['#1d3557', '#e63946', '#2a9d8f', '#f4a261', '#264653', '#8338ec', '#ffbe0b', '#3a5a40', '#111111', '#f1f1f1', '#ff70a6', '#4cc9f0', '#c9a227', '#7f5539'],
  bottom: ['#1f2a44', '#2b2b2b', '#3a5a40', '#7f5539', '#c2b280', '#e9e4d8', '#5c6b7a', '#8d0801', '#3d405b', '#ff70a6'],
  shoes: ['#111111', '#f5f5f5', '#e63946', '#1d3557', '#ffbe0b', '#7f5539', '#2a9d8f', '#ff5ca8'],
  cap: ['#111111', '#e63946', '#1d3557', '#ffbe0b', '#2a9d8f', '#f1f1f1', '#8338ec', '#7f5539'],
  backpack: ['#222222', '#e76f51', '#457b9d', '#8ab17d', '#ffb703', '#f1f1f1', '#ff5ca8'],
  aura: ['#7c5cff', '#22b8cf', '#ff5ca8', '#ffd166', '#3ddc84', '#ff7a18'],
};

// Choices for the style slots (value → label/icon), in display order.
export const STYLES = {
  hairStyle: [['natural', 'Natural', '💇'], ['buzz', 'Buzz cut', '🪒'], ['afro', 'Afro', '🌀'], ['puffs', 'Puffs', '🎀'], ['bun', 'Top bun', '🍙'], ['pony', 'Ponytail', '🐴']],
  pattern: [['solid', 'Solid', '⬛'], ['stripes', 'Stripes', '〰️'], ['dots', 'Dots', '⚪'], ['ombre', 'Ombré', '🌅'], ['camo', 'Camo', '🪖'], ['check', 'Check', '🏁'], ['tiedye', 'Tie-dye', '🌈']],
  hat: [[null, 'None', '∅'], ['cap', 'Snapback', '🧢'], ['beanie', 'Beanie', '🧶'], ['bucket', 'Bucket hat', '🪣'], ['fedora', 'Fedora', '🎩'], ['crown', 'Crown', '👑']],
  eyes: [[null, 'None', '∅'], ['glasses', 'Glasses', '👓'], ['shades', 'Shades', '🕶️'], ['visor', 'Neo visor', '🥽']],
  bag: [[null, 'None', '∅'], ['backpack', 'Backpack', '🎒'], ['crossbody', 'Crossbody', '👜']],
};

const FANTASY_HAIR = new Set(['#7c5cff', '#22b8cf', '#ff5ca8', '#3ddc84']);
const NEON_TOP = new Set(['#ff70a6', '#4cc9f0', '#8338ec']);

// Which virtual good unlocks a value (null = free).
const RULES = {
  hair: (v) => (FANTASY_HAIR.has(v) ? 'hair-fantasy' : null),
  hairStyle: (v) => (['afro', 'puffs', 'bun', 'pony'].includes(v) ? 'hair-styles' : null),
  top: (v) => (NEON_TOP.has(v) ? 'outfit-neon' : null),
  pattern: (v) => (['camo', 'check', 'tiedye', 'ombre'].includes(v) ? 'pattern-pack' : null),
  hat: (v) => ({ cap: 'acc-cap', beanie: 'hat-pack', bucket: 'hat-pack', fedora: 'hat-pack', crown: 'acc-crown' })[v] || null,
  eyes: (v) => (v === 'visor' ? 'acc-visor' : null),
  headphones: (v) => (v ? 'acc-headphones' : null),
  chain: (v) => (v ? 'jewel-pack' : null),
  earrings: (v) => (v ? 'jewel-pack' : null),
  watch: (v) => (v ? 'acc-watch' : null),
  bag: (v) => ({ backpack: 'acc-backpack', crossbody: 'acc-crossbody' })[v] || null,
  aura: (v) => (v ? 'aura-glow' : null),
};

export function requiredItem(key, value) {
  return RULES[key]?.(value) || null;
}

// Every virtual good this look uses.
export function itemsUsed(look) {
  const l = sanitizeLook(look);
  if (!l) return [];
  return [...new Set(Object.keys(RULES).map((k) => requiredItem(k, l[k])).filter(Boolean))];
}

export const DEFAULT_LOOK = {
  skin: null, hair: null, hairStyle: 'natural', top: null, pattern: 'solid', bottom: null, shoes: null, height: 1, build: 1,
  hat: null, hatColor: null, eyes: null, headphones: false, chain: false, earrings: false, watch: false, bag: null, bagColor: null, aura: null,
};

// Strip anything the player doesn't own (server-side enforcement).
export function enforceOwnership(look, owned) {
  if (!look) return look;
  const out = { ...look };
  for (const k of Object.keys(RULES)) {
    const need = requiredItem(k, out[k]);
    if (need && !owned.includes(need)) out[k] = DEFAULT_LOOK[k];
  }
  return out;
}

const hex = (v) => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : null);
const num = (v, lo, hi) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(Math.min(hi, Math.max(lo, n)) * 100) / 100 : 1;
};
const oneOf = (v, key) => (STYLES[key].some(([x]) => x === v) ? v : DEFAULT_LOOK[key]);

export function sanitizeLook(look) {
  if (!look || typeof look !== 'object') return null;
  // v1 looks: cap / glasses / backpack were single fields.
  const hat = look.hat !== undefined ? look.hat : hex(look.cap) ? 'cap' : null;
  const bag = look.bag !== undefined ? look.bag : hex(look.backpack) ? 'backpack' : null;
  return {
    skin: hex(look.skin),
    hair: hex(look.hair),
    hairStyle: oneOf(look.hairStyle ?? 'natural', 'hairStyle'),
    top: hex(look.top),
    pattern: oneOf(look.pattern ?? 'solid', 'pattern'),
    bottom: hex(look.bottom),
    shoes: hex(look.shoes),
    height: num(look.height ?? 1, 0.9, 1.1),
    build: num(look.build ?? 1, 0.88, 1.15),
    hat: oneOf(hat, 'hat'),
    hatColor: hex(look.hatColor ?? look.cap),
    eyes: oneOf(look.eyes !== undefined ? look.eyes : look.glasses ? 'glasses' : null, 'eyes'),
    headphones: !!look.headphones,
    chain: !!look.chain,
    earrings: !!look.earrings,
    watch: !!look.watch,
    bag: oneOf(bag, 'bag'),
    bagColor: hex(look.bagColor ?? look.backpack),
    aura: hex(look.aura),
  };
}

export function lookKey(look) {
  return look ? JSON.stringify(sanitizeLook(look)) : '';
}

// Saved outfits (up to 4 per player): { name, person, look }.
export function sanitizeOutfits(list, personIds = null) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 4).map((o, i) => ({
    name: String(o?.name || `Outfit ${i + 1}`).replace(/[<>]/g, '').slice(0, 20),
    person: typeof o?.person === 'string' && (!personIds || personIds.includes(o.person)) ? o.person : null,
    look: sanitizeLook(o?.look) || sanitizeLook({}),
  }));
}
