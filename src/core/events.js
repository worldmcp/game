// Gamification / analytics event vocabulary emitted by World. These are the
// names the existing Pludor gamification engine should receive; World never
// awards anything itself, it only reports what happened.

export const EV = Object.freeze({
  ENTERED_WORLD: 'PLAYER_ENTERED_WORLD',
  ENTERED_DISTRICT: 'PLAYER_ENTERED_DISTRICT',
  ENTERED_BUSINESS: 'PLAYER_ENTERED_BUSINESS',
  TALKED_TO_PLAYER: 'PLAYER_TALKED_TO_PLAYER',
  SENT_MESSAGE: 'PLAYER_SENT_MESSAGE',
  WAVED: 'PLAYER_WAVED',
  ADDED_FRIEND: 'PLAYER_ADDED_FRIEND',
  FOLLOWED: 'PLAYER_FOLLOWED',
  PURCHASED: 'PLAYER_PURCHASED',
  BOOKED: 'PLAYER_BOOKED',
  APPLIED_GIG: 'PLAYER_APPLIED_GIG',
  COMPLETED_GIG: 'PLAYER_COMPLETED_GIG',
  CREATED_GIG: 'PLAYER_CREATED_GIG',
  COMPLETED_COURSE: 'PLAYER_COMPLETED_COURSE',
  COMPLETED_GAME: 'PLAYER_COMPLETED_GAME',
  COMPLETED_QUEST: 'PLAYER_COMPLETED_QUEST',
  RENTED_LAND: 'PLAYER_RENTED_LAND',
  BUILT: 'PLAYER_BUILT',
  OPENED_BUSINESS: 'PLAYER_OPENED_BUSINESS',
  JOINED_COMMUNITY: 'PLAYER_JOINED_COMMUNITY',
  ATTENDED_EVENT: 'PLAYER_ATTENDED_EVENT',
  CLAIMED_BUSINESS: 'PLAYER_CLAIMED_BUSINESS',
  GAVE_FEEDBACK: 'PLAYER_GAVE_FEEDBACK',
  INTERACTED_AD: 'PLAYER_INTERACTED_AD',
  COLLECTED_TOKEN: 'PLAYER_COLLECTED_TOKEN',
  USED_AI: 'PLAYER_USED_AI',
  USED_TOOL: 'PLAYER_USED_TOOL',
  CREATED_CONTENT: 'PLAYER_CREATED_CONTENT',
  RODE_TRANSIT: 'PLAYER_RODE_TRANSIT',
});

export class Emitter {
  constructor() {
    this.handlers = new Map();
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    return () => this.handlers.get(type)?.delete(fn);
  }

  emit(type, payload) {
    for (const fn of this.handlers.get(type) || []) fn(payload);
    for (const fn of this.handlers.get('*') || []) fn(type, payload);
  }
}
