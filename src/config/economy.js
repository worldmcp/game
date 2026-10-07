// Economy, time, needs and reward rules. Nothing economic is hardcoded in UI
// code: every number a Super Admin may want to tune lives here and is read by
// the (server-side) adapter. Game rewards (XP, badges) and real money are kept
// in separate sections on purpose: no rule here can turn XP into currency.

export const ECONOMY = {
  currency: { code: 'USD', symbol: '$', demoStartingBalance: 250 },

  // Platform revenue: a cut of every player-to-player transaction.
  fees: { commerce: 0.05, delivery: 0.15, gigs: 0.08, marketplace: 0.05 },
  deliveryFee: 4,
  // Demo residents fill roles (merchant kitchens, back-up couriers) so the
  // chain completes even when few real players are online. Disable in prod.
  demo: { botCouriers: true, botCourierDelayMs: 45000, botTravelMs: 15000, botPrepMs: 8000 },

  time: {
    // One in-world day lasts this many real minutes. Shared by all players.
    realMinutesPerDay: 48,
    epochMs: Date.UTC(2026, 9, 1, 0, 0, 0),
    // Offset so the epoch lands mid-morning.
    epochHour: 9,
  },

  needs: {
    energy: { label: 'Energy', decayPerGameHour: 2.5, start: 85, color: '#ffd166' },
    hunger: { label: 'Hunger', decayPerGameHour: 3.5, start: 70, color: '#ff8a5b' },
    social: { label: 'Social', decayPerGameHour: 2, start: 55, color: '#7c9cff' },
    fun: { label: 'Fun', decayPerGameHour: 2, start: 60, color: '#e879f9' },
    hygiene: { label: 'Hygiene', decayPerGameHour: 1.2, start: 90, color: '#5eead4' },
  },

  // Free, game-state-only activities. They never touch the wallet.
  activities: {
    rest: { label: 'Rest on a bench', effects: { energy: 15 } },
    snack: { label: 'Free tasting', effects: { hunger: 20, fun: 3 } },
    socialize: { label: 'Mingle', effects: { social: 18, energy: -3 } },
    play: { label: 'Free play', effects: { fun: 20, energy: -4 } },
    sleep: { label: 'Sleep at home', effects: { energy: 60, hygiene: 10 } },
    shower: { label: 'Freshen up', effects: { hygiene: 50 } },
    fountain: { label: 'Toss a coin in the fountain', effects: { fun: 6, social: 4 } },
    workShift: { label: 'Work effort', effects: { energy: -12, hunger: -6 } },
    study: { label: 'Study effort', effects: { energy: -8, fun: -2 } },
  },

  // XP rules per gamification event. `once` dedupes per payload key: 'ever'
  // or 'day'. `dailyCap` limits how many times a rule pays per world day.
  xpRules: {
    PLAYER_ENTERED_WORLD: { xp: 15, once: 'day' },
    PLAYER_ENTERED_DISTRICT: { xp: 5, once: 'day', key: 'districtId' },
    PLAYER_ENTERED_BUSINESS: { xp: 6, once: 'day', key: 'placeId' },
    PLAYER_TALKED_TO_PLAYER: { xp: 10, once: 'day', key: 'userId' },
    PLAYER_SENT_MESSAGE: { xp: 2, dailyCap: 10 },
    PLAYER_WAVED: { xp: 1, dailyCap: 10 },
    PLAYER_ADDED_FRIEND: { xp: 15, once: 'ever', key: 'userId' },
    PLAYER_FOLLOWED: { xp: 5, once: 'ever', key: 'userId' },
    PLAYER_PURCHASED: { xp: 25, dailyCap: 5 },
    PLAYER_SOLD: { xp: 20, dailyCap: 20 },
    PLAYER_BOOKED: { xp: 25, dailyCap: 5 },
    PLAYER_COMPLETED_GIG: { xp: 120 },
    PLAYER_APPLIED_GIG: { xp: 10, once: 'ever', key: 'gigId' },
    PLAYER_CREATED_GIG: { xp: 30, dailyCap: 3 },
    PLAYER_COMPLETED_COURSE: { xp: 60, once: 'ever', key: 'courseId' },
    PLAYER_COMPLETED_GAME: { xp: 20, dailyCap: 15 },
    PLAYER_COMPLETED_QUEST: { xp: 0 }, // quest-specific reward is applied instead
    PLAYER_RENTED_LAND: { xp: 50, once: 'ever', key: 'parcelId' },
    PLAYER_BUILT: { xp: 40, once: 'ever', key: 'parcelId' },
    PLAYER_OPENED_BUSINESS: { xp: 80, once: 'ever', key: 'parcelId' },
    PLAYER_JOINED_COMMUNITY: { xp: 15, once: 'ever', key: 'communityId' },
    PLAYER_ATTENDED_EVENT: { xp: 30, once: 'ever', key: 'eventId' },
    PLAYER_CLAIMED_BUSINESS: { xp: 50, once: 'ever', key: 'businessId' },
    PLAYER_GAVE_FEEDBACK: { xp: 8, once: 'ever', key: 'businessId' },
    PLAYER_INTERACTED_AD: { xp: 3, dailyCap: 5 },
    PLAYER_COLLECTED_TOKEN: { xp: 10, once: 'ever', key: 'tokenId' },
    PLAYER_USED_AI: { xp: 2, dailyCap: 10 },
    PLAYER_USED_TOOL: { xp: 4, once: 'day', key: 'toolId' },
    PLAYER_CREATED_CONTENT: { xp: 20, dailyCap: 3 },
    PLAYER_RODE_TRANSIT: { xp: 3, dailyCap: 5 },
  },

  // First-occurrence achievements (mapped onto existing Pludor achievements
  // in production) plus count-based ones.
  achievements: {
    FIRST_STEPS: { title: 'First Steps', icon: '👣', event: 'PLAYER_ENTERED_WORLD' },
    EXPLORER: { title: 'Explorer', icon: '🧭', event: 'PLAYER_ENTERED_BUSINESS', count: 5 },
    FIRST_FRIEND: { title: 'First Friend', icon: '🤝', event: 'PLAYER_ADDED_FRIEND' },
    FIRST_CONVERSATION: { title: 'Ice Breaker', icon: '💬', event: 'PLAYER_TALKED_TO_PLAYER' },
    FIRST_REAL_WORLD_ORDER: { title: 'First Real-World Order', icon: '🛍️', event: 'PLAYER_PURCHASED' },
    FIRST_BOOKING: { title: 'First Booking', icon: '📅', event: 'PLAYER_BOOKED' },
    FIRST_GIG: { title: 'First Gig', icon: '💼', event: 'PLAYER_COMPLETED_GIG' },
    FIRST_COURSE: { title: 'First Course', icon: '🎓', event: 'PLAYER_COMPLETED_COURSE' },
    FIRST_GAME: { title: 'First Game', icon: '🎮', event: 'PLAYER_COMPLETED_GAME' },
    FIRST_PROPERTY: { title: 'First Property', icon: '🔑', event: 'PLAYER_RENTED_LAND' },
    FIRST_BUSINESS: { title: 'First Business', icon: '🏪', event: 'PLAYER_OPENED_BUSINESS' },
    FIRST_JOB_POSTED: { title: 'First Job Posted', icon: '📌', event: 'PLAYER_CREATED_GIG' },
    FIRST_EVENT: { title: 'First Event', icon: '🎟️', event: 'PLAYER_ATTENDED_EVENT' },
    FIRST_CREATION: { title: 'First Creation', icon: '✨', event: 'PLAYER_CREATED_CONTENT' },
    COMMUNITY_MEMBER: { title: 'Community Member', icon: '📡', event: 'PLAYER_JOINED_COMMUNITY' },
    CITY_HELPER: { title: 'City Helper', icon: '🗺️', event: 'PLAYER_GAVE_FEEDBACK' },
    QUESTER: { title: 'Quester', icon: '⭐', event: 'PLAYER_COMPLETED_QUEST', count: 2 },
  },

  // Rank ladder (Visitor → World Builder). A rank is earned when all of its
  // required achievements are held. Maps onto existing Pludor progression.
  ranks: [
    { id: 'visitor', title: 'Visitor', requires: [] },
    { id: 'player', title: 'Player', requires: ['FIRST_STEPS'] },
    { id: 'explorer', title: 'Explorer', requires: ['FIRST_STEPS', 'EXPLORER'] },
    { id: 'worker', title: 'Worker', requires: ['FIRST_GIG'] },
    { id: 'creator', title: 'Creator', requires: ['FIRST_GIG', 'FIRST_CREATION'] },
    { id: 'professional', title: 'Professional', requires: ['FIRST_GIG', 'FIRST_COURSE'] },
    { id: 'trader', title: 'Trader', requires: ['FIRST_GIG', 'FIRST_REAL_WORLD_ORDER'] },
    { id: 'renter', title: 'Renter', requires: ['FIRST_PROPERTY'] },
    { id: 'business-owner', title: 'Business Owner', requires: ['FIRST_BUSINESS'] },
    { id: 'entrepreneur', title: 'Entrepreneur', requires: ['FIRST_BUSINESS', 'FIRST_JOB_POSTED'] },
    { id: 'world-builder', title: 'World Builder', requires: ['FIRST_BUSINESS', 'FIRST_JOB_POSTED', 'FIRST_EVENT', 'QUESTER'] },
  ],

  levelCurve: { base: 100, exponent: 1.55 },

  games: {
    'reaction-rush': { title: 'Reaction Rush', maxRewardXp: 40, rounds: 5 },
    'nova-trivia': { title: 'Nova Trivia', maxRewardXp: 45 },
  },

  land: {
    rentPeriodLabel: 'week',
    templates: {
      storefront: { label: 'Storefront', icon: '🏪', buildCost: 0, height: 9 },
      studio: { label: 'Creator Studio', icon: '🎬', buildCost: 0, height: 11 },
      home: { label: 'Home', icon: '🏠', buildCost: 0, height: 7 },
      stall: { label: 'Food stall', icon: '🍜', buildCost: 0, unit: true },
      booth: { label: 'Business booth', icon: '🛎️', buildCost: 0, unit: true },
      desk: { label: 'Cowork desk', icon: '💻', buildCost: 0, unit: true },
      apartment: { label: 'Apartment', icon: '🏢', buildCost: 0, unit: true },
    },
  },

  transit: { worldRideFee: 0 },

  // Pludor Points: earned with XP (pointsPerXp), spent — alone or together
  // with Wallet money — on VIRTUAL game assets. Points never convert to money.
  points: { start: 100, perXp: 0.5 },
  virtualItems: [
    { id: 'acc-cap', name: 'Snapback caps', icon: '🧢', kind: 'look', points: 80, money: 0, desc: 'Six colours of cap for your avatar.' },
    { id: 'acc-headphones', name: 'Studio headphones', icon: '🎧', kind: 'look', points: 120, money: 0, desc: 'Over-ear cans, always in style.' },
    { id: 'acc-backpack', name: 'City backpack', icon: '🎒', kind: 'look', points: 150, money: 0, desc: 'Five colourways.' },
    { id: 'hair-fantasy', name: 'Fantasy hair colours', icon: '💜', kind: 'look', points: 150, money: 0, desc: 'Violet, cyan and pink hair.' },
    { id: 'outfit-neon', name: 'Neon outfit pack', icon: '🌈', kind: 'look', points: 200, money: 2, desc: 'Neon pink, ice blue and electric violet outfits.' },
    { id: 'car-city', name: 'City EV', icon: '🚙', kind: 'car', points: 400, money: 15, color: '#4cc9f0', desc: 'Parks outside your home. Tap it to drive anywhere in the city.' },
    { id: 'car-gt', name: 'Nova GT', icon: '🏎️', kind: 'car', points: 800, money: 40, color: '#e63946', desc: 'The fastest way to arrive in style.' },
    { id: 'decor-plants', name: 'Home plant pack', icon: '🪴', kind: 'decor', points: 60, money: 0, desc: 'Greenery for your apartment or home.' },
    { id: 'decor-art', name: 'Skyline art print', icon: '🖼️', kind: 'decor', points: 90, money: 1, desc: 'A framed print for your living room.' },
    { id: 'trim-neon', name: 'Neon storefront trim', icon: '✨', kind: 'building', points: 300, money: 5, desc: 'Glowing trim for your shop or stall sign.' },
  ],

  proximity: { nearbyRadius: 34, approachRadius: 6, interactRadius: 7 },
};
