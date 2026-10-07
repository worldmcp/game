// Nova City · Central District.
// This file describes WHERE things exist in the world. Every `link` points at
// a record in an existing Pludor system (business, community, course, ad
// placement …) that describes WHAT it is and HOW it works. In production this
// data comes from the world_* tables / Super Admin, not from a static file.

export const WORLD = { id: 'nova-city', name: 'Nova City' };

export const DISTRICT = {
  id: 'central',
  name: 'Central',
  half: 110, // district spans [-half, half] on x and z
  roads: [-75, -25, 25, 75],
  roadWidth: 10,
  // Cell edges between roads; cell index -2..2 on each axis.
  edges: [-110, -80, -70, -30, -20, 20, 30, 70, 80, 110],
  spawn: { x: 0, z: 25 },
};

export function cellBounds(ix, iz) {
  const e = DISTRICT.edges;
  const i = ix + 2;
  const j = iz + 2;
  return { x0: e[i * 2], x1: e[i * 2 + 1], z0: e[j * 2], z1: e[j * 2 + 1] };
}

// facing: side of the building that has the entrance. s = +z, n = -z, e = +x, w = -x
// kind drives HUD/AI category; template drives the renderer.
export const PLACES = [
  {
    id: 'daily-grind', name: 'Daily Grind', kind: 'cafe', template: 'storefront',
    x: -42, z: -10, w: 16, d: 16, h: 10, facing: 'e', color: '#a0674b', accent: '#ffcf8a',
    tags: ['coffee', 'cafe', 'breakfast', 'food', 'drinks'], hours: [6, 22],
    link: { type: 'business', id: 'biz_daily_grind' }, activity: 'snack',
    display: [{ model: 'fridge', size: 1.9, spin: false }, { model: 'bottle', size: 0.4 }],
  },
  {
    id: 'ember-grill', name: 'Ember Grill', kind: 'restaurant', template: 'storefront',
    x: -42, z: 10, w: 16, d: 16, h: 8, facing: 'e', color: '#7a3b3b', accent: '#ff7a59',
    tags: ['food', 'restaurant', 'dinner', 'lunch', 'grill', 'eat'], hours: [11, 23],
    link: { type: 'business', id: 'biz_ember_grill' },
    display: [{ model: 'olives', size: 0.45 }, { model: 'lantern', size: 0.9, spin: false }],
  },
  {
    id: 'nova-market', name: 'Nova Market', kind: 'market', template: 'market',
    x: 50, z: 0, w: 36, d: 34, h: 6, facing: 'w', color: '#3c4a63', accent: '#ffd166',
    tags: ['market', 'marketplace', 'classifieds', 'stalls', 'shop', 'buy', 'sell', 'secondhand'],
    hours: [7, 24], walkable: true,
    link: { type: 'marketplace', id: 'mkt_nova_central' },
  },
  {
    id: 'creator-hub', name: 'Creator Hub', kind: 'creator', template: 'hall',
    x: 0, z: -50, w: 34, d: 28, h: 18, facing: 's', color: '#4b3f72', accent: '#b794ff',
    tags: ['creator', 'ugc', 'work', 'gigs', 'jobs', 'affiliate', 'campaigns', 'hiring'],
    link: { type: 'creator_hub', id: 'creator_hub' },
    led: [{ lines: ['SHOP.', 'PLAY.', 'CONNECT.', 'EARN.'], tag: 'P  PLUDOR', bg: ['#1e3cff', '#00c2ff'] }, { lines: ['CREATORS', 'WANTED'], tag: 'UGC gigs from 35', bg: ['#7f00ff', '#e100ff'] }]
  },
  {
    id: 'signals-hall', name: 'Signals Hall', kind: 'community', template: 'hall',
    x: 0, z: 50, w: 34, d: 26, h: 14, facing: 'n', color: '#24506b', accent: '#5ce1e6',
    tags: ['community', 'signals', 'social', 'club', 'people', 'meet'],
    link: { type: 'signals', id: 'signals_directory' }, activity: 'socialize',
    led: [{ lines: ['FIND', 'YOUR', 'PEOPLE'], tag: 'Signals communities', bg: ['#0f766e', '#22d3ee'] }],
  },
  {
    id: 'academy', name: 'Pludor University', kind: 'education', template: 'tower', subtitle: 'Five schools · ACCA & partners',
    x: 50, z: -50, w: 30, d: 28, h: 26, facing: 's', color: '#2f4f4f', accent: '#7ee8a2',
    tags: ['learn', 'course', 'courses', 'acca', 'academy', 'university', 'degree', 'certificate', 'education', 'skills', 'school', 'study', 'challenge', 'credibility'],
    link: { type: 'academy', id: 'academy' }, activity: 'study',
  },
  {
    id: 'ai-studio', name: 'Pludor AI Studio', kind: 'ai', template: 'tower',
    x: -50, z: -50, w: 28, d: 28, h: 32, facing: 's', color: '#1f2a4d', accent: '#8b7dff',
    tags: ['ai', 'studio', 'image', 'video', 'voice', 'design', 'avatar', 'branding', 'create'],
    link: { type: 'ai_studio', id: 'ai_studio' },
  },
  {
    id: 'arcade', name: 'Neon Arcade', kind: 'games', template: 'hall',
    x: 50, z: 50, w: 32, d: 26, h: 12, facing: 'n', color: '#3a1f4d', accent: '#ff5ce1',
    tags: ['games', 'arcade', 'play', 'fun', 'trivia', 'tournament', 'bored'],
    link: { type: 'games', id: 'arcade' }, activity: 'play',
    led: [{ lines: ['GAME', 'ON'], tag: 'Tournament 7-9 PM', bg: ['#4776e6', '#8e54e9'] }],
  },
  {
    id: 'wayfare-hub', name: 'Wayfare Hub', kind: 'transit', template: 'hall',
    x: -50, z: 50, w: 34, d: 24, h: 10, facing: 'n', color: '#20434a', accent: '#36d399',
    tags: ['ride', 'rides', 'transit', 'courier', 'delivery', 'rental', 'travel', 'package', 'wayfare'],
    link: { type: 'wayfare', id: 'wayfare' },
  },
  {
    id: 'flika-cinema', name: 'Flika Cinema', kind: 'media', template: 'cinema',
    x: 95, z: -50, w: 34, d: 24, h: 16, facing: 'w', color: '#2a2233', accent: '#ff4d6d',
    tags: ['flika', 'video', 'watch', 'cinema', 'media', 'reels', 'content', 'live', 'concert'],
    link: { type: 'flika', id: 'flika' },
  },
  {
    id: 'kicks-co', name: 'Kicks & Co', kind: 'store', template: 'storefront',
    x: 95, z: 0, w: 32, d: 22, h: 12, facing: 'w', color: '#30343f', accent: '#ffb703',
    tags: ['sneakers', 'shoes', 'fashion', 'store', 'shop', 'clothes', 'buy'], hours: [9, 21],
    link: { type: 'business', id: 'biz_kicks_co' },
    display: [{ model: 'shoe', size: 0.55 }, { model: 'watch', size: 0.3 }, { model: 'shoe', size: 0.55 }, { model: 'watch', size: 0.3 }],
    rooftop: { model: 'shoe', size: 7 },
  },
  {
    id: 'lumi-salon', name: 'Lumi Salon', kind: 'service', template: 'storefront',
    x: -95, z: -9, w: 16, d: 22, h: 7, facing: 'e', color: '#6b4a5e', accent: '#ff9ecf',
    tags: ['salon', 'hair', 'beauty', 'appointment', 'book', 'nails', 'service'], hours: [9, 19],
    link: { type: 'business', id: 'biz_lumi_salon' }, activity: 'shower',
    display: [{ model: 'vase', size: 0.8, spin: false }, { model: 'vase', size: 0.8, spin: false }],
  },
  {
    id: 'fixit-repair', name: 'Fix-It Repair', kind: 'service', template: 'storefront',
    x: -95, z: 10, w: 16, d: 18, h: 6, facing: 'e', color: '#4f5b4a', accent: '#c3e88d',
    tags: ['repair', 'phone', 'fix', 'electronics', 'service'], hours: [8, 18],
    // Sourced from the local-business dataset, not yet claimed on Pludor.
    link: { type: 'business', id: 'lb_fixit_repair' },
    display: [{ model: 'camera', size: 0.5 }, { model: 'boombox', size: 0.6 }],
  },
  {
    id: 'casa-nova', name: 'Casa Nova Home', kind: 'store', template: 'storefront',
    x: 95, z: 95, w: 26, d: 22, h: 11, facing: 'w', color: '#5d5148', accent: '#e9c46a',
    tags: ['furniture', 'home', 'sofa', 'chair', 'decor', 'interior', 'store', 'shop', 'buy'], hours: [9, 20],
    link: { type: 'business', id: 'biz_casa_nova' },
    display: [{ model: 'sofa', size: 2.2, spin: false }, { model: 'chair', size: 1, spin: false }, { model: 'pouf', size: 0.7, spin: false }],
  },
  // ── Venue high-rises: businesses rent spots inside (see UNITS below) ──
  {
    id: 'food-court', name: 'Skyline Food Court', kind: 'foodcourt', template: 'tower',
    x: -50, z: -95, w: 34, d: 24, h: 46, facing: 's', color: '#3a2f4d', accent: '#ff9f43',
    tags: ['food', 'food court', 'eat', 'lunch', 'dinner', 'stall', 'kiosk', 'hungry', 'suya', 'snack'], hours: [8, 24],
    link: { type: 'venue', id: 'food-court' }, activity: 'snack',
  },
  {
    id: 'summit-center', name: 'Summit Conference Center', kind: 'conference', template: 'hall',
    x: 0, z: -95, w: 36, d: 24, h: 22, facing: 's', color: '#1f3a5a', accent: '#4cc9f0',
    tags: ['conference', 'expo', 'live', 'stream', 'keynote', 'booth', 'event', 'summit', 'talk'],
    link: { type: 'venue', id: 'summit-center' },
    led: [{ lines: ['LIVE', 'ON 12', 'SCREENS'], tag: 'Pludor Summit', bg: ['#0f2027', '#2c5364'] }],
  },
  {
    id: 'grand-hotel', name: 'Nova Grand Hotel', kind: 'hotel', template: 'tower',
    x: 50, z: -95, w: 34, d: 24, h: 64, facing: 's', color: '#2d3b4f', accent: '#e9c46a',
    tags: ['hotel', 'stay', 'room', 'suite', 'booking', 'booth', 'travel', 'sleep', 'night'],
    link: { type: 'business', id: 'biz_nova_grand' }, activity: 'rest',
  },
  {
    id: 'hive-cowork', name: 'Hive Cowork', kind: 'cowork', template: 'hall',
    x: -95, z: 50, w: 34, d: 24, h: 16, facing: 'e', color: '#3b4a3f', accent: '#c3e88d',
    tags: ['cowork', 'desk', 'office', 'gigs', 'ugc', 'freelance', 'work', 'studio', 'meeting'],
    link: { type: 'venue', id: 'hive-cowork' }, activity: 'workShift',
  },
  {
    id: 'fresh-mart', name: 'FreshMart Supermarket', kind: 'supermarket', template: 'storefront',
    x: -95, z: 95, w: 26, d: 24, h: 10, facing: 'e', color: '#2f5d3a', accent: '#7bd389',
    tags: ['supermarket', 'groceries', 'grocery', 'food', 'shop', 'buy', 'essentials', 'drinks', 'fruit'], hours: [7, 23],
    link: { type: 'business', id: 'biz_freshmart' },
    display: [{ model: 'avocado', size: 0.3 }, { model: 'bottle', size: 0.4 }, { model: 'olives', size: 0.35 }],
  },
  {
    id: 'nova-heights', name: 'Nova Heights Apartments', kind: 'apartments', template: 'tower',
    x: -95, z: -50, w: 34, d: 24, h: 72, facing: 'e', color: '#3d4a5c', accent: '#9bdcff',
    tags: ['apartment', 'apartments', 'flat', 'home', 'rent', 'live', 'residence', 'sleep', 'housing'],
    link: { type: 'venue', id: 'nova-heights' }, activity: 'rest',
  },
  {
    id: 'pulse-club', name: 'Pulse Nightclub & Skybar', kind: 'nightclub', template: 'hall', ageRestricted: true,
    x: -95, z: -95, w: 26, d: 24, h: 18, facing: 's', color: '#1b1030', accent: '#ff2bd6', subtitle: '18+ · club · bar · VIP',
    tags: ['club', 'nightclub', 'party', 'parties', 'bar', 'drinks', 'dance', 'dj', 'night', 'vip', 'skybar', 'cocktail'], hours: [18, 28],
    link: { type: 'business', id: 'biz_pulse' }, activity: 'play',
    led: [{ lines: ['PULSE', 'FRI · SAT'], tag: '18+ · DJ Kwame', bg: ['#ff2bd6', '#5b21b6'] }],
  },
  {
    id: 'fade-lab', name: 'Fade Lab Barbershop', kind: 'service', template: 'storefront',
    x: 87.5, z: -95, w: 13, d: 22, h: 8, facing: 's', color: '#24323f', accent: '#e63946',
    tags: ['barber', 'barbershop', 'haircut', 'fade', 'beard', 'shave', 'appointment', 'book', 'grooming'], hours: [8, 21],
    link: { type: 'business', id: 'biz_fade_lab' },
    display: [{ model: 'vase', size: 0.6, spin: false }],
  },
  {
    id: 'nova-motors', name: 'Nova Motors', kind: 'dealer', template: 'storefront',
    x: 102.5, z: -95, w: 13, d: 26, h: 12, facing: 's', color: '#1f2933', accent: '#4cc9f0',
    tags: ['car', 'cars', 'dealer', 'dealership', 'buy car', 'vehicle', 'test drive', 'suv', 'sports car', 'scooter', 'bike', 'transport'], hours: [9, 20],
    link: { type: 'business', id: 'biz_nova_motors' },
    display: [{ model: 'toycar', size: 0.6 }],
  },
  {
    id: 'tool-district', name: 'Tool District', kind: 'tools', template: 'kiosks',
    x: 95, z: 50, w: 36, d: 26, h: 4, facing: 'w', color: '#28323f', accent: '#4cc9f0',
    tags: ['tools', 'qr', 'invoice', 'logo', 'calculator', 'utilities', 'free tools'], walkable: true,
    link: { type: 'tools', id: 'free_tools' },
  },
];

export const PLAZA = {
  id: 'central-plaza', name: 'Central Plaza', x: 0, z: 0, size: 60,
  fountain: { x: 0, z: 0, r: 5.5 }, activity: 'fountain',
};

// Persistent land parcels (database-backed in production: world_parcels).
export const PARCELS = [
  { id: 'p-riverside-1', name: 'Riverside Lot 1', x: -60, z: 95, w: 18, d: 24, zoning: 'commercial', rentPerWeek: 30, price: 900, facing: 'n' },
  { id: 'p-riverside-2', name: 'Riverside Lot 2', x: -40, z: 95, w: 18, d: 24, zoning: 'mixed-use', rentPerWeek: 22, price: 700, facing: 'n' },
  { id: 'p-riverside-3', name: 'Riverside Lot 3', x: -10, z: 95, w: 18, d: 24, zoning: 'residential', rentPerWeek: 15, price: 500, facing: 'n' },
  { id: 'p-riverside-4', name: 'Riverside Lot 4', x: 10, z: 95, w: 18, d: 24, zoning: 'residential', rentPerWeek: 15, price: 500, facing: 'n' },
  { id: 'p-riverside-5', name: 'Riverside Lot 5', x: 40, z: 95, w: 18, d: 24, zoning: 'commercial', rentPerWeek: 28, price: 850, facing: 'n' },
  { id: 'p-riverside-6', name: 'Riverside Lot 6', x: 60, z: 95, w: 18, d: 24, zoning: 'premium', rentPerWeek: 45, price: 1400, facing: 'n' },
];

// World ad inventory. `placementId` references an Ads Manager placement.
export const BILLBOARDS = [
  { id: 'bb-plaza-ne', placementId: 'world.central.plaza-ne', x: 16, z: -16, y: 0, w: 9, h: 5, lookAt: [0, 0], pole: 5 },
  { id: 'bb-plaza-sw', placementId: 'world.central.plaza-sw', x: -16, z: 16, y: 0, w: 9, h: 5, lookAt: [0, 0], pole: 5 },
  { id: 'bb-wayfare-roof', placementId: 'world.central.wayfare-roof', x: -50, z: 41, y: 10, w: 16, h: 6, lookAt: [-50, 0], pole: 1 },
  { id: 'bb-market-gate', placementId: 'world.central.market-gate', x: 31.5, z: -19, y: 0, w: 8, h: 4.5, lookAt: [0, -19], pole: 4 },
];

// AI agents placed in the world. `agent` selects the capability set.
export const AGENTS = [
  { id: 'npc-pip', name: 'Pip', role: 'City Guide', agent: 'guide', x: 6, z: 6, color: '#ffd166', icon: '🧭', person: 'male_adult_08' },
  { id: 'npc-nia', name: 'Nia', role: 'Realtor', agent: 'realtor', x: 0, z: 81.5, color: '#36d399', icon: '🔑', person: 'business_female_02' },
  { id: 'npc-theo', name: 'Theo', role: 'Recruiter', agent: 'recruiter', x: 6, z: -31.5, color: '#b794ff', icon: '💼', person: 'business_male_02' },
  { id: 'npc-ada', name: 'Ada', role: 'Career Coach', agent: 'coach', x: 44, z: -31.5, color: '#7ee8a2', icon: '🎓', person: 'female_adult_12' },
  { id: 'npc-remy', name: 'Remy', role: 'Business Advisor', agent: 'advisor', x: -31.5, z: 0, color: '#ff8a5b', icon: '📈', person: 'male_adult_19' },
];

// Sponsored collectible tokens for the sponsored quest.
export const TOKENS = [
  { id: 'tok-1', questId: 'q-kicks-hunt', x: -20.5, z: -40 },
  { id: 'tok-2', questId: 'q-kicks-hunt', x: 72, z: 27.5 },
  { id: 'tok-3', questId: 'q-kicks-hunt', x: -78, z: 62 },
];

// Cells without a hand-placed landmark get procedurally generated buildings.
export const FILLER_CELLS = [];

export const DISTRICT_ZONES = [
  { id: 'central', name: 'Central Plaza', x0: -20, x1: 20, z0: -20, z1: 20 },
  { id: 'market', name: 'Market Row', x0: 25, x1: 110, z0: -25, z1: 25 },
  { id: 'creator', name: 'Creator Quarter', x0: -75, x1: 75, z0: -110, z1: -25 },
  { id: 'riverside', name: 'Riverside Lots', x0: -110, x1: 75, z0: 75, z1: 110 },
  { id: 'home', name: 'Casa Nova Corner', x0: 75, x1: 110, z0: 75, z1: 110 },
  { id: 'community', name: 'Community Row', x0: -75, x1: 75, z0: 25, z1: 75 },
  { id: 'services', name: 'Service Lane', x0: -110, x1: -25, z0: -25, z1: 25 },
  { id: 'tools', name: 'Tool District', x0: 75, x1: 110, z0: 25, z1: 75 },
];

export function zoneAt(x, z) {
  return DISTRICT_ZONES.find((zn) => x >= zn.x0 && x <= zn.x1 && z >= zn.z0 && z <= zn.z1) || null;
}

const FACING_VEC = { s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] };

export function facingVector(facing) {
  return FACING_VEC[facing] || FACING_VEC.s;
}

// World-space footprint (accounts for rotation).
export function footprint(place) {
  const swap = place.facing === 'e' || place.facing === 'w';
  const fw = swap ? place.d : place.w;
  const fd = swap ? place.w : place.d;
  return { x0: place.x - fw / 2, x1: place.x + fw / 2, z0: place.z - fd / 2, z1: place.z + fd / 2 };
}

// Point just outside the entrance, where a player stands to interact.
export function entrancePoint(place, gap = 2.6) {
  const [fx, fz] = facingVector(place.facing);
  // Local depth always runs along the facing axis.
  return { x: place.x + fx * (place.d / 2 + gap), z: place.z + fz * (place.d / 2 + gap) };
}

// ───────── rentable units inside venues ─────────
// Units are parcels that live inside a venue (food-court stalls, hotel and
// expo booths, cowork desks). They reuse the land → business → orders →
// courier chain; their x/z is the spot inside the building, which the
// interior shares with the city, so pickups are position-verified as usual.
// lx/lz are local to the venue: x across the façade, z depth, door at +z.
const UNIT_DEFS = [
  ...[-12, -4, 4, 12].map((lx, i) => ({ id: `u-fc-${i + 1}`, venue: 'food-court', name: `Food Court Stall ${i + 1}`, lx, lz: -9, w: 7, d: 3, zoning: 'stall', rentPerWeek: 12, price: 400 })),
  ...[-5, 3].map((lz, i) => ({ id: `u-fc-${i + 5}`, venue: 'food-court', name: `Food Court Stall ${i + 5}`, lx: -14.8, lz, w: 3, d: 6, zoning: 'stall', rentPerWeek: 10, price: 350, side: 'l' })),
  ...[-6, -1.5, 3].map((lz, i) => ({ id: `u-hb-${i + 1}`, venue: 'grand-hotel', name: `Lobby Booth ${i + 1}`, lx: -14.8, lz, w: 3, d: 3.6, zoning: 'booth', rentPerWeek: 10, price: 350, side: 'l' })),
  ...[-6, -1.5, 3].map((lz, i) => ({ id: `u-cc-${i + 1}`, venue: 'summit-center', name: `Expo Booth ${i + 1}`, lx: 15.8, lz, w: 3, d: 3.6, zoning: 'booth', rentPerWeek: 14, price: 450, side: 'r' })),
  // Open-air stalls in Nova Market (same order the renderer builds them).
  ...[[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 0], [1, -1], [1, 0], [1, 1]].map(([i, j], k) => ({ id: `u-mk-${k + 1}`, venue: 'nova-market', outdoor: true, stallIndex: k, name: `Market Stall ${k + 1}`, lx: i * 10.5, lz: j * 10 + 1.2, w: 4.2, d: 1.4, zoning: 'mstall', rentPerWeek: 8, price: 250 })),
  // Apartment doors line the lobby's back wall; each opens onto a private home.
  ...[['Studio', 18], ['1-bed', 24], ['1-bed', 24], ['2-bed', 32], ['Studio', 18], ['1-bed', 24], ['2-bed', 32], ['Penthouse', 60]].map(([size, rent], i) => ({ id: `u-apt-${i + 1}`, venue: 'nova-heights', name: `Apt ${Math.floor(i / 2) + 2}0${(i % 2) + 1} · ${size}`, lx: -12.6 + i * 3.6, lz: -10.9, w: 2.4, d: 0.6, zoning: 'apartment', rentPerWeek: rent, price: rent * 30, aptSize: size })),
  ...[[-9, 1], [-3, 1], [3, 1], [9, 1], [-9, 5.5], [-3, 5.5]].map(([lx, lz], i) => ({ id: `u-cw-${i + 1}`, venue: 'hive-cowork', name: `Hot Desk ${i + 1}`, lx, lz, w: 2, d: 1.2, zoning: 'desk', rentPerWeek: 6, price: 200 })),
];

const ROT = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 };
export const UNITS = UNIT_DEFS.map((u) => {
  const v = PLACES.find((p) => p.id === u.venue);
  const th = ROT[v.facing];
  return { ...u, venueName: v.name, facing: v.facing, x: v.x + u.lx * Math.cos(th) + u.lz * Math.sin(th), z: v.z - u.lx * Math.sin(th) + u.lz * Math.cos(th) };
});
PARCELS.push(...UNITS);

// Demo residents already trading in some units, so venues feel alive.
export const UNIT_SEEDS = {
  'u-fc-1': { tenantId: 'u_marcus', tenantName: 'Marcus', template: 'stall', businessName: 'Suya Spot', category: 'restaurant', catalog: [
    { sku: 'ss-beef', name: 'Beef Suya', price: 7, icon: '🍢', desc: 'Spicy yaji, onions, tomato.' },
    { sku: 'ss-chicken', name: 'Chicken Suya', price: 6.5, icon: '🍗', desc: 'Grilled over open flame.' },
    { sku: 'ss-jollof', name: 'Smoky Jollof Bowl', price: 8, icon: '🍛', desc: 'Party-style, with plantain.' },
    { sku: 'ss-zobo', name: 'Zobo Drink', price: 2.5, icon: '🍹', desc: 'Hibiscus, ginger, pineapple.' },
  ] },
  'u-fc-2': { tenantId: 'u_lena', tenantName: 'Lena', template: 'stall', businessName: 'Crêpe Corner', category: 'restaurant', catalog: [
    { sku: 'cc-choc', name: 'Chocolate Crêpe', price: 5.5, icon: '🥞', desc: 'Hazelnut chocolate, banana.' },
    { sku: 'cc-ham', name: 'Ham & Cheese Crêpe', price: 6.5, icon: '🧀', desc: 'Buckwheat galette.' },
    { sku: 'cc-tea', name: 'Iced Tea', price: 2.5, icon: '🧋', desc: 'Peach, lightly sweet.' },
  ] },
  'u-fc-3': { tenantId: 'u_kemi', tenantName: 'Kemi', template: 'stall', businessName: 'Bao Bar', category: 'restaurant', catalog: [
    { sku: 'bb-pork', name: 'Pork Belly Bao', price: 6, icon: '🥟', desc: 'Pickles, hoisin, peanuts.' },
    { sku: 'bb-veg', name: 'Crispy Tofu Bao', price: 5.5, icon: '🥬', desc: 'Sriracha mayo.' },
    { sku: 'bb-boba', name: 'Bubble Tea', price: 4, icon: '🧋', desc: 'Brown sugar milk tea.' },
  ] },
  'u-mk-1': { tenantId: 'u_ayo', tenantName: 'Ayo', template: 'mstall', businessName: 'Thrift Kings', category: 'shop', brand: { logo: '👕', color: '#36d399', tagline: 'Vintage tees & sneakers' }, catalog: [
    { sku: 'tk-tee', name: 'Vintage Band Tee', price: 12, icon: '👕', desc: 'Pre-loved, washed.' },
    { sku: 'tk-cap', name: 'Retro Cap', price: 8, icon: '🧢', desc: 'Snapback, one size.' },
  ] },
  'u-mk-4': { tenantId: 'u_maya', tenantName: 'Maya', template: 'mstall', businessName: 'Maya Prints', category: 'shop', brand: { logo: '🖼️', color: '#ff8a5b', tagline: 'Photo prints of the city' }, catalog: [
    { sku: 'mp-a3', name: 'A3 City Print', price: 15, icon: '🖼️', desc: 'Signed photo print.' },
    { sku: 'mp-cards', name: 'Postcard Pack', price: 5, icon: '✉️', desc: '8 postcards.' },
  ] },
  'u-hb-1': { tenantId: 'u_jay', tenantName: 'Jay', template: 'booth', businessName: 'Jay City Tours', category: 'service', catalog: [
    { sku: 'jt-tour', name: 'City Tour (2 h)', price: 25, icon: '🗺️', desc: 'Guided tour of the city highlights.' },
    { sku: 'jt-airport', name: 'Airport Transfer', price: 30, icon: '🚐', desc: 'Door to terminal.' },
  ] },
  'u-cc-1': { tenantId: 'u_maya', tenantName: 'Maya', template: 'booth', businessName: 'Maya Studio', category: 'service', catalog: [
    { sku: 'ms-head', name: 'Headshot Session', price: 30, icon: '📸', desc: '15 minutes, 5 edited photos.' },
    { sku: 'ms-product', name: 'Product Shoot', price: 45, icon: '📦', desc: 'Up to 6 products, white background.' },
  ] },
};
