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
  finance: { label: 'Bookkeeping & Finance', family: 'Finance' },
  ai: { label: 'AI Tools', family: 'Technology' },
  'food-safety': { label: 'Food Safety', family: 'Hospitality' },
  'home-services': { label: 'Home Services', family: 'Trades' },
  leadership: { label: 'Leadership', family: 'Business' },
};

// Pludor University schools. Every course belongs to one.
export const FACULTIES = [
  { id: 'business', name: 'School of Business', icon: '📈', color: '#ffd166' },
  { id: 'creative', name: 'School of Creative Media', icon: '🎬', color: '#b794ff' },
  { id: 'tech', name: 'School of Technology', icon: '🤖', color: '#4cc9f0' },
  { id: 'hospitality', name: 'School of Hospitality', icon: '🍽️', color: '#ff8a5b' },
  { id: 'trades', name: 'School of Trades & Services', icon: '🧰', color: '#7ee8a2' },
];

export const STARTING_SKILLS = { communication: 1, driving: 1 };

export const RESIDENTS = [
  { id: 'u_maya', handle: 'maya', displayName: 'Maya', color: '#ff8a5b', skin: '#8d5524', presence: 'Available for Work', roles: ['Creator', 'Photographer'], bio: 'UGC creator · product photos · 4.9★ on 38 gigs', skills: { photography: 4, video: 3 }, walk: 'plaza', person: 'female_adult_05', age: 26, dating: true, vibe: 'friendly, hustling' },
  { id: 'u_jay', handle: 'jay', displayName: 'Jay', color: '#8f7ce0', skin: '#c68642', presence: 'Hiring', roles: ['Agency Owner'], bio: 'Runs a small creator agency. Always hiring editors.', skills: { marketing: 4, video: 2 }, walk: 'creator', person: 'male_adult_04' },
  { id: 'u_ayo', handle: 'ayo', displayName: 'Ayo', color: '#36d399', skin: '#5c3a21', presence: 'Shopping', roles: ['Buyer', 'Gamer'], bio: 'Arcade regular. Sneakerhead.', skills: {}, walk: 'market', person: 'male_adult_11' },
  { id: 'u_marcus', handle: 'marcus', displayName: 'Marcus', color: '#ff5c5c', skin: '#3b2219', presence: 'Working', roles: ['Business Owner'], bio: 'Owner, Ember Grill. Looking for a video creator.', skills: { sales: 3 }, walk: 'grill', owns: 'biz_ember_grill', person: 'male_adult_15' },
  { id: 'u_lena', handle: 'lena', displayName: 'Lena', color: '#ffd166', skin: '#f1c27d', presence: 'Working', roles: ['Business Owner'], bio: 'Owner, Daily Grind café.', skills: { 'customer-service': 4 }, walk: 'grind', owns: 'biz_daily_grind', person: 'chef_female_01' },
  { id: 'u_kemi', handle: 'kemi', displayName: 'Kemi', color: '#ffb703', skin: '#a0663b', presence: 'Online', roles: ['Merchant', 'Advertiser'], bio: 'Founder, Kicks & Co.', skills: { sales: 4, marketing: 3 }, walk: 'kicks', owns: 'biz_kicks_co', person: 'female_adult_15' },
];

// Passers-by you can stop and talk to (AI-driven when an AI provider is
// available, scripted otherwise). `dating` marks adults open to flirting.
export const NPC_PERSONAS = [
  { id: 'npc-01', name: 'Tomi', age: 27, job: 'Fintech product designer', vibe: 'witty, curious', bio: 'Loves rooftop bars and street food.', dating: true, lines: ['Have you tried the suya at the food court? Life-changing.', 'I design apps by day. By night? Skybar.'] },
  { id: 'npc-02', name: 'Grace', age: 34, job: 'Nurse at Nova General', vibe: 'calm, caring', bio: 'Night shifts, early yoga.', dating: false, lines: ['Long shift, needed this walk.', 'Drink water and take breaks — nurse’s orders!'] },
  { id: 'npc-03', name: 'Kwame', age: 23, job: 'Courier and part-time DJ', vibe: 'energetic, funny', bio: 'Delivers by day, spins at Pulse on Fridays.', dating: true, lines: ['Courier life keeps me fit!', 'Pulse Nightclub on Friday — I’m on the decks.'] },
  { id: 'npc-04', name: 'Sofia', age: 29, job: 'Real-estate agent', vibe: 'confident, sharp', bio: 'Knows every lot in the city.', dating: true, lines: ['Riverside lots are going fast.', 'Nova Heights penthouse? Gorgeous views.'] },
  { id: 'npc-05', name: 'Ibrahim', age: 41, job: 'Taxi and ride-share driver', vibe: 'chatty, wise', bio: 'Drives 12 hours a day, knows every shortcut.', dating: false, lines: ['Need a ride? I’m on the Wayfare app.', 'Traffic’s calm today, thank God.'] },
  { id: 'npc-06', name: 'Mei', age: 25, job: 'UGC creator', vibe: 'bubbly, creative', bio: 'Films product reels at Hive Cowork.', dating: true, lines: ['Brands are paying for 15-second reels right now!', 'The green screen at Hive is free for members.'] },
  { id: 'npc-07', name: 'Daniel', age: 31, job: 'Software engineer', vibe: 'dry humour, nerdy', bio: 'Building an AI startup in a cowork desk.', dating: true, lines: ['Shipping a feature, then tacos.', 'Have you used the AI Studio? Wild.'] },
  { id: 'npc-08', name: 'Amara', age: 22, job: 'University student (Business)', vibe: 'ambitious, upbeat', bio: 'Studying bookkeeping at Pludor University.', dating: true, lines: ['Just finished my bookkeeping course!', 'Credibility score goes up with every course.'] },
  { id: 'npc-09', name: 'Luis', age: 37, job: 'Chef', vibe: 'passionate, loud', bio: 'Thinking of renting a food-court stall.', dating: false, lines: ['A stall at the food court is cheaper than a restaurant.', 'Smell that? Ember Grill is firing up.'] },
  { id: 'npc-10', name: 'Zainab', age: 26, job: 'Hair stylist', vibe: 'warm, gossip-loving', bio: 'Braids at Lumi Salon.', dating: true, lines: ['Book me at Lumi — knotless braids are my thing.', 'Your hair would look amazing with a fade.'] },
  { id: 'npc-11', name: 'Chris', age: 45, job: 'Car dealer', vibe: 'smooth talker', bio: 'Runs the floor at Nova Motors.', dating: false, lines: ['The Nova GT is a beast. Come test drive it.', 'There’s a car for every budget.'] },
  { id: 'npc-12', name: 'Ana', age: 30, job: 'Event promoter', vibe: 'social butterfly', bio: 'Throws the best parties in the city.', dating: true, lines: ['Big night at Pulse this weekend!', 'Want on the guest list?'] },
  { id: 'npc-13', name: 'Femi', age: 33, job: 'Barber', vibe: 'laid-back, funny', bio: 'Owns a chair at Fade Lab.', dating: true, lines: ['Fresh fade? Fade Lab, ask for me.', 'Clean cut, clean mind.'] },
  { id: 'npc-14', name: 'Priya', age: 28, job: 'Accountant (ACCA)', vibe: 'precise, kind', bio: 'Teaches a finance class on weekends.', dating: true, lines: ['Separate business and personal money!', 'The ACCA courses here are legit.'] },
  { id: 'npc-15', name: 'Marco', age: 52, job: 'Retired footballer, café regular', vibe: 'storyteller', bio: 'Daily Grind every morning.', dating: false, lines: ['Back in my day this was all grass!', 'Best espresso is at Daily Grind.'] },
  { id: 'npc-16', name: 'Lola', age: 24, job: 'Fashion model', vibe: 'playful, stylish', bio: 'Shops at Kicks & Co.', dating: true, lines: ['Those sneakers at Kicks & Co though…', 'Have you tried the Avatar Studio? Cute caps.'] },
];

// Pludor Radio station rotation (generated live by the radio engine).
export const RADIO_TRACKS = [
  { id: 'rt-1', title: 'Lagoon Lights', artist: 'DJ Kwame', genre: 'afrobeats', seed: 'lagoon' },
  { id: 'rt-2', title: 'Log Drum Sunday', artist: 'Ama Keys', genre: 'amapiano', seed: 'sunday' },
  { id: 'rt-3', title: 'Rooftop Study', artist: 'nova.lofi', genre: 'lofi', seed: 'rooftop' },
  { id: 'rt-4', title: 'Skybar 2AM', artist: 'Pulse Residents', genre: 'house', seed: 'skybar' },
  { id: 'rt-5', title: 'Palm Wine Morning', artist: 'The Highlife Co.', genre: 'highlife', seed: 'palmwine' },
  { id: 'rt-6', title: 'Market Day Bounce', artist: 'Tunde B', genre: 'afrobeats', seed: 'market' },
  { id: 'rt-7', title: 'Quiet Courier', artist: 'nova.lofi', genre: 'lofi', seed: 'courier' },
  { id: 'rt-8', title: 'Private School Piano', artist: 'Ama Keys', genre: 'amapiano', seed: 'piano' },
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
  biz_fade_lab: {
    id: 'biz_fade_lab', name: 'Fade Lab Barbershop', category: 'Barbershop', ownerId: 'u_marcus', claimed: true, verified: true,
    rating: 4.9, reviewCount: 263, blurb: 'Skin fades, beard sculpting and hot-towel shaves. Book a real chair.', fulfillment: [],
    services: [
      { id: 'svc-fade', name: 'Skin Fade', price: 25, durationMin: 40, icon: '💈' },
      { id: 'svc-beard', name: 'Beard Sculpt', price: 15, durationMin: 25, icon: '🧔' },
      { id: 'svc-shave', name: 'Hot-towel Shave', price: 20, durationMin: 30, icon: '🪒' },
      { id: 'svc-kids', name: 'Kids Cut', price: 15, durationMin: 25, icon: '👦' },
    ],
  },
  biz_pulse: {
    id: 'biz_pulse', name: 'Pulse Nightclub & Skybar', category: 'Nightclub & Bar', ownerId: 'u_jay', claimed: true, verified: true, ageRestricted: true,
    rating: 4.6, reviewCount: 402, blurb: '18+. House, afrobeats and amapiano every weekend. Rooftop Skybar for cocktails and views.', fulfillment: ['pickup'], prepMinutes: 3, reservations: true,
    catalog: [
      { sku: 'pl-chapman', name: 'Chapman (mocktail)', price: 6, icon: '🍹', desc: 'Fruity, fizzy, no alcohol.' },
      { sku: 'pl-mojito', name: 'Mojito', price: 9, icon: '🍸', desc: 'Rum, lime, mint. 18+.' },
      { sku: 'pl-lager', name: 'Craft Lager', price: 7, icon: '🍺', desc: 'Local brewery. 18+.' },
      { sku: 'pl-wings', name: 'Party Wings', price: 10, icon: '🍗', desc: 'Peri-peri, 8 pieces.' },
    ],
    services: [
      { id: 'svc-vip', name: 'VIP Table (4 guests)', price: 120, durationMin: 240, icon: '🥂' },
      { id: 'svc-entry', name: 'Guest List Entry', price: 10, durationMin: 240, icon: '🎟️' },
    ],
  },
  biz_nova_motors: {
    id: 'biz_nova_motors', name: 'Nova Motors', category: 'Car Dealership', ownerId: 'u_jay', claimed: true, verified: true,
    rating: 4.4, reviewCount: 88, blurb: 'Virtual cars for the World, and real cars from partner dealers: book a test drive or reserve with a deposit.', fulfillment: ['pickup'], prepMinutes: 0, reservations: true,
    catalog: [
      { sku: 'nm-deposit-ev', name: 'Reserve: City EV (real) · deposit', price: 100, icon: '🚙', desc: 'Refundable deposit. A partner dealer contacts you to complete the purchase.' },
      { sku: 'nm-deposit-suv', name: 'Reserve: Family SUV (real) · deposit', price: 150, icon: '🚐', desc: 'Refundable deposit with a partner dealer.' },
    ],
    services: [
      { id: 'svc-testdrive', name: 'Test Drive (real car)', price: 0, durationMin: 45, icon: '🔑' },
      { id: 'svc-finance', name: 'Finance consultation', price: 0, durationMin: 30, icon: '📄' },
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
    id: 'c_video_editing', faculty: 'creative', title: 'Short-form Video Editing', provider: 'ACCA', minutes: 12, grants: { skill: 'video', level: 2 },
    lessons: ['Hook in the first 2 seconds', 'Cutting on action', 'Captions & safe zones'],
    challenge: [
      { q: 'Where should the hook of a short-form video land?', options: ['In the first 2 seconds', 'After 10 seconds', 'At the end'], answer: 0 },
      { q: 'Vertical short-form video aspect ratio is…', options: ['16:9', '9:16', '4:3'], answer: 1 },
    ],
  },
  {
    id: 'c_product_photo', faculty: 'creative', title: 'Product Photography Basics', provider: 'Creator Academy', minutes: 8, grants: { skill: 'photography', level: 1 },
    lessons: ['Light from the side', 'Clean backgrounds', 'Consistent angles'],
    challenge: [
      { q: 'For crisp product shots on white, you want…', options: ['Soft, even light', 'One harsh flash', 'Mixed colour lights'], answer: 0 },
      { q: 'A product set should keep…', options: ['Random angles', 'Consistent angles', 'Only close-ups'], answer: 1 },
    ],
  },
  {
    id: 'c_design_basics', faculty: 'creative', title: 'Design for Billboards', provider: 'ACCA', minutes: 10, grants: { skill: 'design', level: 1 },
    lessons: ['Seven words or fewer', 'High contrast', 'One clear call to action'],
    challenge: [
      { q: 'A billboard headline should be…', options: ['A paragraph', 'Seven words or fewer', 'All in script fonts'], answer: 1 },
      { q: 'How many calls to action?', options: ['One', 'Three', 'As many as fit'], answer: 0 },
    ],
  },
  {
    id: 'c_customer_service', faculty: 'hospitality', title: 'Customer Service Essentials', provider: 'Pludor University', minutes: 6, grants: { skill: 'customer-service', level: 2 },
    lessons: ['Greet within 10 seconds', 'Listen, then solve', 'Close the loop'],
    challenge: [
      { q: 'First thing when a customer walks in?', options: ['Greet them', 'Wait for them to speak', 'Ignore until they queue'], answer: 0 },
    ],
  },
  {
    id: 'c_bookkeeping', faculty: 'business', title: 'Bookkeeping for Small Business', provider: 'ACCA', minutes: 15, grants: { skill: 'finance', level: 1 },
    lessons: ['Separate business and personal money', 'Record every sale and expense', 'Read a simple profit & loss'],
    challenge: [
      { q: 'Profit is…', options: ['Revenue minus expenses', 'Total sales', 'Cash in your wallet'], answer: 0 },
      { q: 'Business and personal spending should be…', options: ['Mixed together', 'Kept separate', 'Only tracked yearly'], answer: 1 },
    ],
  },
  {
    id: 'c_sales_101', faculty: 'business', title: 'Selling with Confidence', provider: 'Pludor University', minutes: 9, grants: { skill: 'sales', level: 2 },
    lessons: ['Ask before you pitch', 'Benefits over features', 'Always ask for the sale'],
    challenge: [
      { q: 'Before pitching, you should…', options: ['Ask what the customer needs', 'List every feature', 'Offer a discount'], answer: 0 },
    ],
  },
  {
    id: 'c_ads_first', faculty: 'business', title: 'Your First Ad Campaign', provider: 'Pludor Ads', minutes: 10, grants: { skill: 'marketing', level: 2 },
    lessons: ['Pick one goal', 'Target where customers already are', 'Measure taps, not just views'],
    challenge: [
      { q: 'A good first campaign has…', options: ['One clear goal', 'Five goals', 'No budget'], answer: 0 },
      { q: 'Which metric shows real interest?', options: ['Impressions only', 'Taps / interactions', 'Billboard size'], answer: 1 },
    ],
  },
  {
    id: 'c_leadership', faculty: 'business', title: 'Leading a Small Team', provider: 'Pludor University', minutes: 11, grants: { skill: 'leadership', level: 1 },
    lessons: ['Set clear expectations', 'Give feedback quickly', 'Celebrate wins'],
    challenge: [
      { q: 'Feedback works best when it is…', options: ['Saved for once a year', 'Specific and timely', 'Only negative'], answer: 1 },
    ],
  },
  {
    id: 'c_ai_prompting', faculty: 'tech', title: 'AI Prompting for Creators', provider: 'Pludor AI Studio', minutes: 8, grants: { skill: 'ai', level: 1 },
    lessons: ['Say who, what and style', 'Give an example', 'Iterate on the output'],
    challenge: [
      { q: 'A strong prompt includes…', options: ['Only one word', 'Subject, style and format', 'Random keywords'], answer: 1 },
    ],
  },
  {
    id: 'c_food_safety', faculty: 'hospitality', title: 'Food Safety & Hygiene', provider: 'Pludor University', minutes: 7, grants: { skill: 'food-safety', level: 1 },
    lessons: ['Wash hands, every time', 'Keep hot food hot, cold food cold', 'Separate raw and cooked'],
    challenge: [
      { q: 'Raw meat and cooked food should be…', options: ['Stored together', 'Kept separate', 'Served on one plate'], answer: 1 },
    ],
  },
  {
    id: 'c_safe_courier', faculty: 'trades', title: 'Safe Courier Riding', provider: 'Wayfare', minutes: 6, grants: { skill: 'driving', level: 2 },
    lessons: ['Check your route', 'Stay visible', 'Confirm drop-off with the customer'],
    challenge: [
      { q: 'At drop-off you should…', options: ['Leave it anywhere', 'Confirm with the customer', 'Skip the address check'], answer: 1 },
    ],
  },
  {
    id: 'c_home_services', faculty: 'trades', title: 'Professional Cleaning & Lawn Care', provider: 'Pludor University', minutes: 9, grants: { skill: 'home-services', level: 1 },
    lessons: ['Quote before you start', 'Top to bottom, dry to wet', 'Photo proof when done'],
    challenge: [
      { q: 'When cleaning a room, work…', options: ['Bottom to top', 'Top to bottom', 'Floor first'], answer: 1 },
    ],
  },
];

// Ads Manager campaigns that bought WORLD placements.
export const CAMPAIGNS = [
  { id: 'ad_pulse', advertiserId: 'biz_pulse', headline: 'FRIDAY AT PULSE', sub: '18+ · DJ Kwame · Skybar cocktails', cta: 'Get on the list', bg: ['#ff2bd6', '#2d0b59'], target: { type: 'place', id: 'pulse-club' }, placements: ['*'], ageRestricted: true },
  { id: 'ad_motors', advertiserId: 'biz_nova_motors', headline: 'DRIVE THE CITY', sub: 'Scooters to hypercars · Nova Motors', cta: 'See the cars', bg: ['#0f2027', '#4cc9f0'], target: { type: 'place', id: 'nova-motors' }, placements: ['*'] },
  { id: 'ad_fade', advertiserId: 'biz_fade_lab', headline: 'FRESH FADE, REAL CHAIR', sub: 'Book Fade Lab in two taps', cta: 'Book now', bg: ['#1d3557', '#e63946'], target: { type: 'place', id: 'fade-lab' }, placements: ['*'] },
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
  { id: 'ev_clubnight', title: 'Friday Club Night · DJ Kwame', placeId: 'pulse-club', hours: [22, 27], ticket: { price: 10 }, kind: 'party', ageRestricted: true },
  { id: 'ev_summit', title: 'Pludor Summit: Building a business in the World', placeId: 'summit-center', hours: [10, 12], ticket: null, kind: 'conference' },
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
  { q: 'Where do you take courses?', options: ['Neon Arcade', 'Pludor University', 'Wayfare Hub'], answer: 1 },
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
