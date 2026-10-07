// THE INTEGRATION BOUNDARY between Pludor World and the existing Pludor
// platform. World UI talks only to an object implementing this contract.
//
//   DemoPludorAdapter  – in-browser stand-in used by this prototype.
//   (production)       – thin client over the EXISTING Pludor APIs / MCP
//                        actions (auth, gamification, messaging, voice,
//                        commerce, UGC/work, academy, ads, wallet …).
//
// Rules every implementation must keep:
//  1. Server-authoritative: balances, XP, ownership, inventory, rewards and
//     payouts are computed by Pludor, never accepted from the client.
//  2. No parallel systems: each namespace maps to an existing Pludor system
//     (see docs/IMPLEMENTATION_MAP.md). World adds only WHERE (placement)
//     data: districts, parcels, buildings, world objects, presence.
//  3. Game rewards (XP, badges, cosmetic items) never convert into money.
//  4. Economic actions require an explicit user confirmation in UI; AI may
//     only propose them.

export const CONTRACT = {
  identity: ['getCurrentUser', 'updateProfile', 'getUser'],
  gamification: ['getProgress', 'track'],
  needs: ['getNeeds', 'performActivity'],
  wallet: ['getWallet'],
  social: ['getRelationship', 'addFriend', 'follow', 'block', 'mute', 'report'],
  messaging: ['getConversation', 'listConversations', 'send'],
  voice: ['requestCall', 'respondCall', 'endCall'],
  commerce: ['getBusiness', 'checkout', 'book', 'getOrders', 'buyListing', 'listListings', 'createListing'],
  business: ['claim', 'feedback', 'addProduct', 'removeProduct', 'mine'],
  orders: ['incoming', 'accept', 'reject', 'ready', 'cancel', 'collect', 'track'],
  delivery: ['jobs', 'accept', 'pickup', 'dropoff'],
  economy: ['treasury', 'fees', 'serviceCategories'],
  work: ['listGigs', 'getGig', 'apply', 'submit', 'createGig', 'hire', 'approve', 'myWork'],
  learning: ['listCourses', 'getCourse', 'completeCourse', 'getSkills'],
  land: ['listParcels', 'rent', 'openBusiness'],
  shop: ['listVirtual', 'buyVirtual', 'owned'],
  games: ['startGame', 'submitGame'],
  ads: ['getCreative', 'trackImpression', 'trackInteraction', 'getStats'],
  events: ['listEvents', 'buyTicket', 'attend'],
  world: ['collectToken', 'listTokens', 'worldRide', 'listCommunities', 'joinCommunity', 'listReels', 'listTools', 'useTool'],
  ai: ['ask', 'askAgent'],
  links: ['open'],
  analytics: ['track'],
};

export function assertAdapter(adapter) {
  const missing = [];
  for (const [ns, methods] of Object.entries(CONTRACT)) {
    for (const m of methods) if (typeof adapter?.[ns]?.[m] !== 'function') missing.push(`${ns}.${m}`);
  }
  if (typeof adapter?.subscribe !== 'function') missing.push('subscribe');
  if (missing.length) throw new Error(`Pludor adapter is missing: ${missing.join(', ')}`);
  return true;
}

// Events the CLIENT may report. Everything else (purchases, gig completion,
// land, courses, quests …) is emitted by the server as a side effect of the
// authoritative action, so a modified client cannot farm rewards with them.
export const CLIENT_REPORTABLE_EVENTS = new Set([
  'PLAYER_ENTERED_WORLD',
  'PLAYER_ENTERED_DISTRICT',
  'PLAYER_ENTERED_BUSINESS',
  'PLAYER_TALKED_TO_PLAYER',
  'PLAYER_WAVED',
  'PLAYER_INTERACTED_AD',
  'PLAYER_USED_TOOL',
]);

export class PludorError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
