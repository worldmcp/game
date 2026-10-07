// Demo records standing in for EXISTING Pludor systems (businesses, catalog,
// UGC/work items, courses, Ads Manager campaigns, events, users). The real
// adapter reads these from Pludor; World never owns them.

export const SKILLS = {
  communication: { label: 'Communication', family: 'Communication' },
  'customer-service': { label: 'Customer Service', family: 'Customer Service' },
  video: { label: 'Video Editing', family: 'Video' },
  photography: { label: 'Photography', family: 'Photography' },
  design: { label: 'Design', family: 'Design' },
  driving: { label: 'Driving', family: 'Driving' },
  marketing: { label: 'Marketing', family: 'Marketing' },
  construction: { label: 'Construction', family: 'Construction' },
  sales: { label: 'Sales', family: 'Sales' },
};

export const STARTING_SKILLS = { communication: 1, driving: 1 };

export const RESIDENTS = [
  { id: 'u_maya', handle: 'maya', displayName: 'Maya', color: '#ff8a5b', skin: '#8d5524', presence: 'Available for Work', roles: ['Creator', 'Photographer'], bio: 'UGC creator · product photos · 4.9★ on 38 gigs', skills: { photography: 4, video: 3 }, walk: 'plaza', person: 'female_adult_05' },
  { id: 'u_jay', handle: 'jay', displayName: 'Jay', color: '#8f7ce0', skin: '#c68642', presence: 'Hiring', roles: ['Agency Owner'], bio: 'Runs a small creator agency. Always hiring editors.', skills: { marketing: 4, video: 2 }, walk: 'creator', person: 'male_adult_04' },
  { id: 'u_ayo', handle: 'ayo', displayName: 'Ayo', color: '#36d399', skin: '#5c3a21', presence: 'Shopping', roles: ['Buyer', 'Gamer'], bio: 'Arcade regular. Sneakerhead.', skills: {}, walk: 'market', person: 'male_adult_11' },
  { id: 'u_marcus', handle: 'marcus', displayName: 'Marcus', color: '#ff5c5c', skin: '#3b2219', presence: 'Working', roles: ['Business Owner'], bio: 'Owner, Ember Grill. Looking for a video creator.', skills: { sales: 3 }, walk: 'grill', owns: 'biz_ember_grill', person: 'male_adult_15' },
  { id: 'u_lena', handle: 'lena', displayName: 'Lena', color: '#ffd166', skin: '#f1c27d', presence: 'Working', roles: ['Business Owner'], bio: 'Owner, Daily Grind café.', skills: { 'customer-service': 4 }, walk: 'grind', owns: 'biz_daily_grind', person: 'chef_female_01' },
  { id: 'u_kemi', handle: 'kemi', displayName: 'Kemi', color: '#ffb703', skin: '#a0663b', presence: 'Online', roles: ['Merchant', 'Advertiser'], bio: 'Founder, Kicks & Co.', skills: { sales: 4, marketing: 3 }, walk: 'kicks', owns: 'biz_kicks_co', person: 'female_adult_15' },
];

export const BOT_REPLIES = {
  u_maya: ['Hey! 👋 Are you new to Nova City?', 'If you need product photos, ping me — I do quick turnarounds.', 'The Creator Hub has a bunch of new gigs today.'],
  u_jay: ['Yo! I need short-form editors, got Video Editing L2?', 'The Academy video course is fast. Worth it.', "Send me your portfolio when you're ready."],
  u_ayo: ['The Kicks drop is 🔥', 'Wanna run Reaction Rush at the arcade?', 'Tournament on Friday night!'],
  u_marcus: ['Welcome to Ember Grill! The suya platter is the move.', "I'm looking for someone to shoot a short video for us — gig's on the board.", 'We take reservations too.'],
  u_lena: ['Coffee? First tasting is on the house.', "We're hiring weekend help if you're interested."],
  u_kemi: ['Spring Drop is live in store 👟', "Find all three Kicks tokens around the city for a coupon."],
};

export const BUSINESSES = {
  biz_daily_grind: {
    id: 'biz_daily_grind', name: 'Daily Grind', category: 'Café', ownerId: 'u_lena', claimed: true, verified: true,
    rating: 4.7, reviewCount: 212, blurb: 'Neighbourhood coffee, pastries and quick breakfasts.',
    fulfillment: ['pickup', 'delivery'], prepMinutes: 10,
    catalog: [
      { sku: 'dg-latte', name: 'Oat Latte', price: 4.5, icon: '☕', desc: 'Double shot, oat milk.' },
      { sku: 'dg-coldbrew', name: 'Cold Brew', price: 4, icon: '🧊', desc: '18-hour steep.' },
      { sku: 'dg-water', name: 'Spring Water', price: 2, icon: '💧', desc: 'Chilled, from the fridge.', model: 'bottle' },
      { sku: 'dg-avotoast', name: 'Avocado Toast', price: 8.5, icon: '🥑', desc: 'Sourdough, smashed avocado, chilli.', model: 'avocado' },
      { sku: 'dg-croissant', name: 'Butter Croissant', price: 3.25, icon: '🥐', desc: 'Baked this morning.' },
      { sku: 'dg-bowl', name: 'Breakfast Bowl', price: 9.5, icon: '🥣', desc: 'Granola, yoghurt, fruit.' },
    ],
  },
  biz_ember_grill: {
    id: 'biz_ember_grill', name: 'Ember Grill', category: 'Restaurant', ownerId: 'u_marcus', claimed: true, verified: true,
    rating: 4.6, reviewCount: 138, blurb: 'West African grill — suya, jollof, plantain.',
    fulfillment: ['pickup', 'delivery', 'dine-in'], prepMinutes: 25, reservations: true,
    catalog: [
      { sku: 'eg-suya', name: 'Suya Platter', price: 16, icon: '🍢', desc: 'Spiced beef skewers, onions, yaji.' },
      { sku: 'eg-jollof', name: 'Smoky Jollof', price: 12, icon: '🍛', desc: 'Party-style, with chicken.' },
      { sku: 'eg-plantain', name: 'Dodo (Plantain)', price: 5, icon: '🍌', desc: 'Sweet fried plantain.' },
      { sku: 'eg-zobo', name: 'Zobo', price: 3.5, icon: '🍹', desc: 'Hibiscus, ginger, pineapple.' },
      { sku: 'eg-olives', name: 'Marinated Olive Plate', price: 6, icon: '🫒', desc: 'Served on an iridescent dish.', model: 'olives' },
    ],
    services: [{ id: 'table-2', name: 'Table for 2', price: 0, durationMin: 90, icon: '🍽️' }, { id: 'table-4', name: 'Table for 4', price: 0, durationMin: 90, icon: '🍽️' }],
  },
  biz_kicks_co: {
    id: 'biz_kicks_co', name: 'Kicks & Co', category: 'Sneaker Store', ownerId: 'u_kemi', claimed: true, verified: true,
    rating: 4.8, reviewCount: 96, blurb: 'Limited sneakers and streetwear.', fulfillment: ['pickup', 'delivery'], prepMinutes: 0,
    catalog: [
      { sku: 'kc-runner2', name: 'Nova Runner 2', price: 120, icon: '👟', desc: 'Spring Drop colourway.', model: 'shoe' },
      { sku: 'kc-chrono', name: 'Nova Chrono Watch', price: 180, icon: '⌚', desc: 'Steel chronograph, sapphire glass.', model: 'watch' },
      { sku: 'kc-socks', name: 'Crew Socks (3-pack)', price: 14, icon: '🧦', desc: 'Cushioned.' },
      { sku: 'kc-cap', name: 'Nova Cap', price: 28, icon: '🧢', desc: 'Embroidered logo.' },
      { sku: 'kc-clean', name: 'Sneaker Clean Kit', price: 18, icon: '🧽', desc: 'Brush, foam, cloth.' },
    ],
    affiliate: { commissionPct: 8 },
  },
  biz_nova_grand: {
    id: 'biz_nova_grand', name: 'Nova Grand Hotel', category: 'Hotel', ownerId: 'u_jay', claimed: true, verified: true,
    rating: 4.8, reviewCount: 311, blurb: 'Skyline rooms, rooftop pool and a lobby full of local businesses.', fulfillment: [], reservations: true,
    services: [
      { id: 'svc-room', name: 'City Room · 1 night', price: 89, durationMin: 1440, icon: '🛏️' },
      { id: 'svc-suite', name: 'Skyline Suite · 1 night', price: 189, durationMin: 1440, icon: '🌆' },
      { id: 'svc-day', name: 'Day Pass · pool & gym', price: 25, durationMin: 480, icon: '🏊' },
    ],
  },
  biz_freshmart: {
    id: 'biz_freshmart', name: 'FreshMart Supermarket', category: 'Supermarket', ownerId: 'u_ayo', claimed: true, verified: true,
    rating: 4.5, reviewCount: 189, blurb: 'Fresh produce, pantry staples and drinks — delivered by local couriers.', fulfillment: ['delivery', 'pickup'], prepMinutes: 5,
    catalog: [
      { sku: 'fm-avocado', name: 'Avocados (4)', price: 4.5, icon: '🥑', desc: 'Ripe and ready.', model: 'avocado' },
      { sku: 'fm-water', name: 'Spring Water (6 pack)', price: 3, icon: '💧', desc: '6 × 500 ml.', model: 'bottle' },
      { sku: 'fm-olives', name: 'Marinated Olives', price: 5, icon: '🫒', desc: 'Garlic and herbs.', model: 'olives' },
      { sku: 'fm-rice', name: 'Long-grain Rice 5 kg', price: 9, icon: '🍚', desc: 'Pantry staple.' },
      { sku: 'fm-eggs', name: 'Free-range Eggs (12)', price: 3.5, icon: '🥚', desc: 'Local farm.' },
      { sku: 'fm-bread', name: 'Sourdough Loaf', price: 4, icon: '🍞', desc: 'Baked this morning.' },
      { sku: 'fm-fruit', name: 'Fruit Box', price: 12, icon: '🍎', desc: 'Seasonal mix, 3 kg.' },
    ],
  },
  biz_lumi_salon: {
    id: 'biz_lumi_salon', name: 'Lumi Salon', category: 'Hair & Beauty', ownerId: 'u_lena', claimed: true, verified: true,
    rating: 4.9, reviewCount: 74, blurb: 'Braids, cuts, colour and nails.', fulfillment: [],
    services: [
      { id: 'svc-cut', name: 'Cut & Style', price: 35, durationMin: 45, icon: '✂️' },
      { id: 'svc-braids', name: 'Knotless Braids', price: 140, durationMin: 240, icon: '💇' },
      { id: 'svc-nails', name: 'Gel Manicure', price: 30, durationMin: 40, icon: '💅' },
    ],
  },
  biz_casa_nova: {
    id: 'biz_casa_nova', name: 'Casa Nova Home', category: 'Furniture & Decor', ownerId: 'u_kemi', claimed: true, verified: true,
    rating: 4.7, reviewCount: 58, blurb: 'Statement sofas, sculptural chairs and finishing touches.', fulfillment: ['delivery', 'pickup'], prepMinutes: 0,
    catalog: [
      { sku: 'cn-sofa', name: 'Glam Velvet Sofa', price: 220, icon: '🛋️', desc: 'Three-seat, deep velvet.', model: 'sofa' },
      { sku: 'cn-chair', name: 'Sheen Lounge Chair', price: 95, icon: '🪑', desc: 'Soft sheen fabric, oak legs.', model: 'chair' },
      { sku: 'cn-pouf', name: 'Silk Pouf', price: 45, icon: '🟣', desc: 'Specular silk cover.', model: 'pouf' },
      { sku: 'cn-plant', name: 'Potted Plant', price: 28, icon: '🪴', desc: 'Low-maintenance, big leaves.', model: 'plant' },
      { sku: 'cn-vase', name: 'Glass Vase & Flowers', price: 32, icon: '💐', desc: 'Hand-blown glass.', model: 'vase' },
    ],
  },
  lb_fixit_repair: {
    id: 'lb_fixit_repair', name: 'Fix-It Repair', category: 'Phone & Electronics Repair', ownerId: null, claimed: false, verified: false,
    source: 'local_business_dataset', datasetStatus: 'unverified', rating: 4.1, reviewCount: 19,
    blurb: 'Listed from public local-business data. Not yet on Pludor.',
    gaps: ['photos', 'claimed_profile', 'product_data'],
  },
};

export const MARKET_LISTINGS = [
  { id: 'ml-boombox', title: 'Retro BoomBox', price: 60, sellerId: 'u_ayo', condition: 'Used · works great', icon: '📻', model: 'boombox' },
  { id: 'ml-toycar', title: 'Wooden Toy Car', price: 18, sellerId: 'u_lena', condition: 'Like new', icon: '🚗', model: 'toycar' },
  { id: 'ml-camera', title: 'Vintage Folding Camera', price: 140, sellerId: 'u_maya', condition: 'Used · collector grade', icon: '📷', model: 'camera' },
  { id: 'ml-lamp', title: 'Brass Lantern', price: 24, sellerId: 'u_lena', condition: 'Used · fair', icon: '🏮', model: 'lantern' },
  { id: 'ml-ring-light', title: 'Ring Light Kit', price: 38, sellerId: 'u_jay', condition: 'New', icon: '⭕' },
];

// Generalised Work Engine items. `legacy` keeps existing UGC jobs addressable
// by their original id/URL; UGC is one category among many.
export const GIGS = [
  {
    id: 'g_ember_video', title: 'Short-form video for Ember Grill', category: 'ugc', requesterId: 'u_marcus', placeId: 'ember-grill',
    description: 'One 30-second vertical video showing the suya platter being served. Raw footage + edited cut.',
    skills: [{ skill: 'video', level: 2 }], mode: 'physical', compensation: { amount: 75, type: 'fixed' }, deadlineDays: 5,
    deliverables: ['30s vertical edit', 'Raw clips'], courseId: 'c_video_editing', legacy: { system: 'ugc', jobId: 'ugc-1042' },
  },
  {
    id: 'g_kicks_photos', title: 'Product photos — Spring Drop', category: 'photography', requesterId: 'u_kemi', placeId: 'kicks-co',
    description: '8 clean product shots of the Nova Runner 2 on white + 2 lifestyle shots.',
    skills: [{ skill: 'photography', level: 1 }], mode: 'physical', compensation: { amount: 60, type: 'fixed' }, deadlineDays: 3,
    deliverables: ['10 edited photos'], courseId: 'c_product_photo',
  },
  {
    id: 'g_grind_helper', title: 'Help wanted: weekend café shift', category: 'local-service', requesterId: 'u_lena', placeId: 'daily-grind',
    description: 'Greet customers and run orders for a 3-hour Saturday shift.',
    skills: [{ skill: 'communication', level: 1 }], mode: 'physical', compensation: { amount: 54, type: 'fixed', note: '3-hour shift' }, deadlineDays: 2,
    deliverables: ['Shift completed'], activity: 'workShift',
  },
  {
    id: 'g_courier_run', title: 'Courier run — 3 local parcels', category: 'delivery', requesterId: 'u_jay', placeId: 'wayfare-hub',
    description: 'Pick up three parcels at Wayfare Hub and deliver within Central.',
    skills: [{ skill: 'driving', level: 1 }], mode: 'physical', compensation: { amount: 25, type: 'fixed' }, deadlineDays: 1,
    deliverables: ['Proof of delivery ×3'], activity: 'workShift',
  },
  {
    id: 'g_fixit_listing', title: 'Photograph & list Fix-It Repair', category: 'business-services', requesterId: 'pludor_growth', placeId: 'fixit-repair',
    description: 'This business has no photos on Pludor. Shoot the storefront and services so the owner can claim a ready-made profile.',
    skills: [{ skill: 'photography', level: 1 }], mode: 'physical', compensation: { amount: 35, type: 'fixed' }, deadlineDays: 7,
    deliverables: ['6 photos', 'Service list'], courseId: 'c_product_photo', source: 'business-graph',
  },
  {
    id: 'g_billboard_art', title: 'Billboard creative — Kicks Spring Drop', category: 'design', requesterId: 'u_kemi', placeId: 'kicks-co',
    description: 'Design a 16:9 billboard creative for the Spring Drop World campaign.',
    skills: [{ skill: 'design', level: 1 }], mode: 'remote', compensation: { amount: 90, type: 'fixed' }, deadlineDays: 4,
    deliverables: ['1920×1080 creative', 'Source file'], courseId: 'c_design_basics', source: 'ads-campaign', campaignId: 'ad_kicks_spring',
  },
];

export const COURSES = [
  {
    id: 'c_video_editing', title: 'Short-form Video Editing', provider: 'ACCA', minutes: 12, grants: { skill: 'video', level: 2 },
    lessons: ['Hook in the first 2 seconds', 'Cutting on action', 'Captions & safe zones'],
    challenge: [
      { q: 'Where should the hook of a short-form video land?', options: ['In the first 2 seconds', 'After 10 seconds', 'At the end'], answer: 0 },
      { q: 'Vertical short-form video aspect ratio is…', options: ['16:9', '9:16', '4:3'], answer: 1 },
    ],
  },
  {
    id: 'c_product_photo', title: 'Product Photography Basics', provider: 'Creator Academy', minutes: 8, grants: { skill: 'photography', level: 1 },
    lessons: ['Light from the side', 'Clean backgrounds', 'Consistent angles'],
    challenge: [
      { q: 'For crisp product shots on white, you want…', options: ['Soft, even light', 'One harsh flash', 'Mixed colour lights'], answer: 0 },
      { q: 'A product set should keep…', options: ['Random angles', 'Consistent angles', 'Only close-ups'], answer: 1 },
    ],
  },
  {
    id: 'c_design_basics', title: 'Design for Billboards', provider: 'ACCA', minutes: 10, grants: { skill: 'design', level: 1 },
    lessons: ['Seven words or fewer', 'High contrast', 'One clear call to action'],
    challenge: [
      { q: 'A billboard headline should be…', options: ['A paragraph', 'Seven words or fewer', 'All in script fonts'], answer: 1 },
      { q: 'How many calls to action?', options: ['One', 'Three', 'As many as fit'], answer: 0 },
    ],
  },
  {
    id: 'c_customer_service', title: 'Customer Service Essentials', provider: 'Pludor Academy', minutes: 6, grants: { skill: 'customer-service', level: 2 },
    lessons: ['Greet within 10 seconds', 'Listen, then solve', 'Close the loop'],
    challenge: [
      { q: 'First thing when a customer walks in?', options: ['Greet them', 'Wait for them to speak', 'Ignore until they queue'], answer: 0 },
    ],
  },
];

// Ads Manager campaigns that bought WORLD placements.
export const CAMPAIGNS = [
  { id: 'ad_kicks_spring', advertiserId: 'biz_kicks_co', headline: 'SPRING DROP', sub: 'Nova Runner 2 · in store now', cta: 'Shop the drop', bg: ['#ff7a18', '#af002d'], target: { type: 'place', id: 'kicks-co' }, placements: ['*'] },
  { id: 'ad_ember', advertiserId: 'biz_ember_grill', headline: 'SUYA NIGHTS', sub: 'Ember Grill · order or reserve', cta: 'See the menu', bg: ['#f12711', '#f5af19'], target: { type: 'place', id: 'ember-grill' }, placements: ['*'] },
  { id: 'ad_academy', advertiserId: 'pludor_academy', headline: 'LEARN → EARN', sub: 'Video Editing in 12 minutes', cta: 'Start course', bg: ['#11998e', '#38ef7d'], target: { type: 'course', id: 'c_video_editing' }, placements: ['*'] },
  { id: 'ad_creators', advertiserId: 'creator_hub', headline: 'CREATORS WANTED', sub: 'UGC & photo gigs from $35', cta: 'Find gigs', bg: ['#7f00ff', '#e100ff'], target: { type: 'place', id: 'creator-hub' }, placements: ['*'] },
  { id: 'ad_tourney', advertiserId: 'arcade', headline: 'TOURNAMENT NIGHT', sub: 'Neon Arcade · 7–9 PM daily', cta: 'Play now', bg: ['#4776e6', '#8e54e9'], target: { type: 'place', id: 'arcade' }, placements: ['*'] },
];

export const EVENTS = [
  { id: 'ev_masterclass', title: 'Morning Masterclass: Pricing your work', placeId: 'academy', hours: [8, 10], ticket: null, kind: 'class' },
  { id: 'ev_lunch_live', title: 'Live cook-along with Marcus', placeId: 'ember-grill', hours: [12, 14], ticket: null, kind: 'live-selling' },
  { id: 'ev_night_market', title: 'Night Market', placeId: 'nova-market', hours: [18, 23], ticket: null, kind: 'market' },
  { id: 'ev_tourney', title: 'Arcade Tournament', placeId: 'arcade', hours: [19, 21], ticket: null, kind: 'tournament' },
  { id: 'ev_concert', title: 'Plaza Concert: Nova Sound', placeId: 'central-plaza', hours: [20, 22.5], ticket: { price: 4 }, kind: 'concert' },
];

export const QUESTS = [
  {
    id: 'q-welcome', title: 'Welcome to Nova City', type: 'exploration', autoStart: true, rewardXp: 100,
    desc: 'Meet the guide, look around and say hi to someone.',
    steps: [
      { label: 'Talk to Pip, the City Guide', event: 'PLAYER_USED_AI', match: { agent: 'guide' }, count: 1 },
      { label: 'Visit 3 places', event: 'PLAYER_ENTERED_BUSINESS', count: 3 },
      { label: 'Talk to or wave at a player', event: 'PLAYER_WAVED', count: 1, alt: 'PLAYER_TALKED_TO_PLAYER' },
    ],
    unlocks: ['q-local-hero', 'q-kicks-hunt', 'q-roots'],
  },
  {
    id: 'q-local-hero', title: 'Local Hero', type: 'work', rewardXp: 200,
    desc: 'Learn a skill, earn your first pay and support a local business.',
    steps: [
      { label: 'Complete a course at the Academy', event: 'PLAYER_COMPLETED_COURSE', count: 1 },
      { label: 'Complete a gig', event: 'PLAYER_COMPLETED_GIG', count: 1 },
      { label: 'Order or book from a local business', event: 'PLAYER_PURCHASED', count: 1, alt: 'PLAYER_BOOKED' },
    ],
  },
  {
    id: 'q-kicks-hunt', title: 'Kicks Token Hunt', type: 'sponsored', sponsor: 'Kicks & Co', rewardXp: 75,
    rewardCoupon: { code: 'NOVAHUNT10', businessId: 'biz_kicks_co', percentOff: 10 },
    desc: 'Find 3 glowing Kicks tokens hidden around Central.',
    steps: [{ label: 'Collect Kicks tokens', event: 'PLAYER_COLLECTED_TOKEN', count: 3 }],
  },
  {
    id: 'q-roots', title: 'Put Down Roots', type: 'land', rewardXp: 250,
    desc: 'Rent a parcel, build on it and open for business.',
    steps: [
      { label: 'Rent a parcel', event: 'PLAYER_RENTED_LAND', count: 1 },
      { label: 'Open a business on it', event: 'PLAYER_OPENED_BUSINESS', count: 1 },
      { label: 'Post a gig to hire help', event: 'PLAYER_CREATED_GIG', count: 1 },
    ],
  },
];

export const TRIVIA = [
  { q: 'What does Pludor World use for messaging?', options: ['A new chat system', 'Existing Pludor messaging', 'Email'], answer: 1 },
  { q: 'Which district hosts the Kicks & Co store?', options: ['Market Row', 'Riverside Lots', 'Creator Quarter'], answer: 0 },
  { q: 'Game XP can be withdrawn as cash.', options: ['True', 'False'], answer: 1 },
  { q: 'Where do you take courses?', options: ['Neon Arcade', 'Pludor Academy', 'Wayfare Hub'], answer: 1 },
  { q: 'Gig payments are held in…', options: ['Escrow until approval', 'Your XP bar', 'A billboard'], answer: 0 },
  { q: 'Who owns Ember Grill?', options: ['Maya', 'Marcus', 'Theo'], answer: 1 },
];

export const TOOLS = [
  { id: 'tool-qr', name: 'QR Generator', icon: '🔳', route: 'tools.qr' },
  { id: 'tool-invoice', name: 'Invoice Maker', icon: '🧾', route: 'tools.invoice' },
  { id: 'tool-logo', name: 'Logo Maker', icon: '🎨', route: 'tools.logo' },
  { id: 'tool-photo', name: 'Product Photo Studio', icon: '📸', route: 'tools.productPhoto' },
  { id: 'tool-calc', name: 'Profit Calculator', icon: '🧮', route: 'tools.calculator' },
  { id: 'tool-ai', name: 'AI Terminal', icon: '🤖', route: 'ai.assistant' },
];

export const COMMUNITIES = [
  { id: 'sig_gaming', name: 'Gaming Club', members: 1840, icon: '🎮' },
  { id: 'sig_creators', name: 'Creator Hub', members: 3120, icon: '🎬' },
  { id: 'sig_founders', name: 'Entrepreneur Center', members: 960, icon: '🚀' },
  { id: 'sig_foodies', name: 'Foodies Club', members: 2210, icon: '🍲' },
  { id: 'sig_ai', name: 'AI Lab', members: 1405, icon: '🤖' },
  { id: 'sig_local', name: 'Nova Locals', members: 4390, icon: '📍' },
];

export const FLIKA_REELS = [
  { id: 'fk_1', title: 'Suya Nights at Ember Grill', creator: 'u_marcus', views: '12.4k', productSku: 'eg-suya', businessId: 'biz_ember_grill' },
  { id: 'fk_2', title: 'Unboxing the Nova Runner 2', creator: 'u_maya', views: '48.1k', productSku: 'kc-runner2', businessId: 'biz_kicks_co' },
  { id: 'fk_3', title: 'How I made $400 in gigs this week', creator: 'u_jay', views: '22.9k' },
];
