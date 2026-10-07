// Feature flags for staged rollout of World systems.
// Defaults live here; production should source them from Pludor's existing
// remote-config / Super Admin settings. Locally they can be overridden with
// a query string, e.g. ?flags=-WORLD_ADS_ENABLED,-WORLD_VOICE_ENABLED

export const DEFAULT_FLAGS = Object.freeze({
  WORLD_ENABLED: true,
  WORLD_MULTIPLAYER_ENABLED: true,
  WORLD_VOICE_ENABLED: true,
  WORLD_LAND_ENABLED: true,
  WORLD_GAMES_ENABLED: true,
  WORLD_ADS_ENABLED: true,
  WORLD_AI_ENABLED: true,
  WORLD_GIGS_ENABLED: true,
  WORLD_COMMERCE_ENABLED: true,
  WORLD_EVENTS_ENABLED: true,
  WORLD_NEEDS_ENABLED: true,
});

export function resolveFlags(search = '', remote = {}) {
  const flags = { ...DEFAULT_FLAGS, ...remote };
  const raw = new URLSearchParams(search).get('flags');
  if (!raw) return flags;
  for (const token of raw.split(',').map((t) => t.trim()).filter(Boolean)) {
    const off = token.startsWith('-');
    const name = token.replace(/^[-+]/, '');
    if (name in flags) flags[name] = !off;
  }
  return flags;
}
