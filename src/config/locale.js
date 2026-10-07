// Localization of the world: the city is a futuristic version of the main
// city in the player's country (Neo Lagos, Nova York, Neo London …), so local
// businesses recognise "their" city and rent lots, stalls and booths in it.
//
// Resolution order: explicit override (deployment env WORLD_COUNTRY on the
// server, ?country=XX or a saved choice in the browser) → time zone →
// browser language region → default.

import { WORLD } from './nova-city.js';

export const CITY_BY_COUNTRY = {
  NG: 'Neo Lagos', GH: 'Nova Accra', KE: 'Nairobi Prime', ZA: 'Joburg Nova', EG: 'Neo Cairo', MA: 'Neo Casablanca',
  RW: 'Kigali Nova', SN: 'Neo Dakar', CI: 'Neo Abidjan', CM: 'Neo Douala', ET: 'Neo Addis', UG: 'Kampala Nova', TZ: 'Neo Dar',
  US: 'Nova York', CA: 'Toronto Nova', MX: 'Nova CDMX', BR: 'Neo São Paulo', AR: 'Neo Buenos Aires', CO: 'Neo Bogotá', JM: 'Neo Kingston',
  GB: 'Neo London', IE: 'Neo Dublin', FR: 'Neo Paris', DE: 'Berlin Nova', ES: 'Neo Madrid', IT: 'Neo Milano', NL: 'Neo Amsterdam', PT: 'Neo Lisboa', SE: 'Neo Stockholm', PL: 'Neo Warsaw', TR: 'Neo Istanbul',
  AE: 'Dubai Nova', SA: 'Riyadh Nova', QA: 'Doha Nova', IN: 'Neo Mumbai', PK: 'Neo Karachi', BD: 'Neo Dhaka',
  JP: 'Neo Tokyo', KR: 'Neo Seoul', CN: 'Neo Shanghai', SG: 'Neo Singapore', PH: 'Neo Manila', ID: 'Neo Jakarta', MY: 'Neo Kuala Lumpur', TH: 'Neo Bangkok', VN: 'Neo Saigon',
  AU: 'Sydney Nova', NZ: 'Auckland Nova',
};

const TZ_COUNTRY = {
  'Africa/Lagos': 'NG', 'Africa/Accra': 'GH', 'Africa/Nairobi': 'KE', 'Africa/Johannesburg': 'ZA', 'Africa/Cairo': 'EG', 'Africa/Casablanca': 'MA',
  'Africa/Kigali': 'RW', 'Africa/Dakar': 'SN', 'Africa/Abidjan': 'CI', 'Africa/Douala': 'CM', 'Africa/Addis_Ababa': 'ET', 'Africa/Kampala': 'UG', 'Africa/Dar_es_Salaam': 'TZ',
  'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US', 'America/Los_Angeles': 'US', 'America/Phoenix': 'US', 'America/Detroit': 'US', 'America/Anchorage': 'US', 'Pacific/Honolulu': 'US',
  'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Edmonton': 'CA', 'America/Winnipeg': 'CA', 'America/Halifax': 'CA', 'America/Mexico_City': 'MX', 'America/Sao_Paulo': 'BR',
  'America/Argentina/Buenos_Aires': 'AR', 'America/Bogota': 'CO', 'America/Jamaica': 'JM',
  'Europe/London': 'GB', 'Europe/Dublin': 'IE', 'Europe/Paris': 'FR', 'Europe/Berlin': 'DE', 'Europe/Madrid': 'ES', 'Europe/Rome': 'IT', 'Europe/Amsterdam': 'NL', 'Europe/Lisbon': 'PT', 'Europe/Stockholm': 'SE', 'Europe/Warsaw': 'PL', 'Europe/Istanbul': 'TR',
  'Asia/Dubai': 'AE', 'Asia/Riyadh': 'SA', 'Asia/Qatar': 'QA', 'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN', 'Asia/Karachi': 'PK', 'Asia/Dhaka': 'BD',
  'Asia/Tokyo': 'JP', 'Asia/Seoul': 'KR', 'Asia/Shanghai': 'CN', 'Asia/Singapore': 'SG', 'Asia/Manila': 'PH', 'Asia/Jakarta': 'ID', 'Asia/Kuala_Lumpur': 'MY', 'Asia/Bangkok': 'TH', 'Asia/Ho_Chi_Minh': 'VN',
  'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Brisbane': 'AU', 'Australia/Perth': 'AU', 'Pacific/Auckland': 'NZ',
};

export function detectCountry({ override = null, timeZone = null, language = null } = {}) {
  const ok = (c) => (c && CITY_BY_COUNTRY[String(c).toUpperCase()] ? String(c).toUpperCase() : null);
  if (ok(override)) return ok(override);
  let tz = timeZone;
  try {
    tz ||= Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    /* no Intl */
  }
  if (TZ_COUNTRY[tz]) return TZ_COUNTRY[tz];
  const region = String(language || globalThis.navigator?.language || '').split('-')[1];
  return ok(region) || null;
}

// Replace the default city name inside demo copy (quests, bot lines …).
function relabel(obj, from, to, depth = 0) {
  if (!obj || depth > 6) return;
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (typeof v === 'string' && v.includes(from)) obj[k] = v.split(from).join(to);
    else if (v && typeof v === 'object') relabel(v, from, to, depth + 1);
  }
}

// Mutates WORLD (and any demo copy passed in) to the localized city.
export function localizeWorld({ country = null, name = null, copy = [] } = {}) {
  const prev = WORLD.name;
  const code = country ? country.toUpperCase() : null;
  WORLD.country = code;
  WORLD.name = name || (code && CITY_BY_COUNTRY[code]) || WORLD.defaultName || prev;
  WORLD.defaultName ||= 'Nova City';
  if (WORLD.name !== prev) for (const c of copy) relabel(c, prev, WORLD.name);
  return WORLD;
}
