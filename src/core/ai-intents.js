// Spatial intent router for "Ask Pludor AI". This is the local fallback /
// fast path: it understands world context (where you are, what's near, what
// you're looking at) and returns a reply plus proposed actions.
//
// Rules:
//  - Navigation and opening panels may run immediately.
//  - Economic actions (order, book, apply, rent, pay) are only ever PROPOSED;
//    the user confirms them in the normal UI, which calls the adapter, which
//    enforces permissions server-side.
// In production the same context is sent to Pludor AI / MCP, which can call
// real Pludor actions; this router stays as the offline/latency fallback.
import { WORLD } from '../config/nova-city.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9&' ]+/g, ' ').replace(/\s+/g, ' ').trim();
const STOP = new Set(['the', 'a', 'an', 'me', 'to', 'take', 'go', 'bring', 'find', 'show', 'where', 'is', 'nearest', 'closest', 'near', 'nearby', 'some', 'any', 'i', 'want', 'need', 'please', 'can', 'you', 'get', 'for', 'of', 'my', 'walk', 'navigate', 'guide', 'there', 'here', 'cheap', 'good', 'place', 'look', 'looking']);

function tokens(s) {
  return norm(s).split(' ').filter((t) => t && !STOP.has(t));
}

// Generic words count less than specific ones ("coffee" beats "shop").
const GENERIC = new Set(['shop', 'store', 'buy', 'service', 'food', 'place', 'stuff']);

export function scorePlace(place, words) {
  const name = norm(place.name);
  const hay = new Set([...name.split(' '), place.kind, ...(place.tags || []).flatMap((t) => norm(t).split(' '))]);
  let score = 0;
  for (const w of words) {
    if (name.includes(w) && w.length > 2) score += 3;
    if (hay.has(w)) score += GENERIC.has(w) ? 1 : 2;
    else if (w.length > 3 && [...hay].some((h) => h.startsWith(w) || w.startsWith(h))) score += 1;
  }
  return score;
}

function nav(target, label) {
  return { type: 'navigate', x: target.x, z: target.z, label };
}

function open(type, id) {
  return { type: 'open', ref: { type, id } };
}

function km(d) {
  return `${Math.round(d)} m`;
}

const INTENTS = [
  { id: 'describe', re: /\b(what('s| is) (that|this)|where am i|what am i looking at|tell me about (this|that))\b/ },
  { id: 'act-order', re: /\b(order (this|that|food|it)|buy (this|that|it)|menu)\b/ },
  { id: 'act-book', re: /\b(book|appointment|reserve|reservation)\b/ },
  { id: 'act-message', re: /\b(message|text|dm|chat with|talk to) (the )?(owner|them|him|her|that person|this person)\b/ },
  { id: 'act-call', re: /\b(call|voice) (the )?(owner|them|him|her|that person|this person)\b/ },
  { id: 'go', re: /\b(take me|bring me|go to|walk to|navigate to|guide me to|head to)\b/ },
  { id: 'earn', re: /\b(earn|make money|income|hiring|hire me|gigs?|jobs?|work)\b/ },
  { id: 'capabilities', re: /\b(what can i do|what('s| is) there to do|help me|ideas|bored here|what now)\b/ },
  { id: 'learn', re: /\b(learn|course|qualif|skill|train|study|class)\b/ },
  { id: 'land', re: /\b(land|parcel|lot|storefront|property|rent|house|home|apartment|real estate)\b/ },
  { id: 'people', re: /\b(who('s| is) (here|around|nearby|online)|people|players?|friends?|someone)\b/ },
  { id: 'fun', re: /\b(fun|play|game|games|arcade|bored|event|events|concert|party)\b/ },
  { id: 'navigate', re: /\b(take me|bring me|go to|walk to|navigate|guide me|where is|find|nearest|closest|show me)\b/ },
];

export function classify(text, skip = []) {
  const t = norm(text);
  for (const it of INTENTS) if (!skip.includes(it.id) && it.re.test(t)) return it.id;
  return 'search';
}

export function route(text, ctx) {
  const intent = classify(text);
  const handler = HANDLERS[intent] || HANDLERS.search;
  return { intent, ...handler(text, ctx) };
}

function describeFocusOrNearest(ctx) {
  if (ctx.focus) return ctx.focus;
  const nearest = [...ctx.places].sort((a, b) => dist(a, ctx.player) - dist(b, ctx.player))[0];
  return nearest ? { type: 'place', id: nearest.id, name: nearest.name } : null;
}

function placeLine(p, ctx) {
  const bits = [p.kindLabel || p.kind];
  if (p.open !== undefined) bits.push(p.open ? 'open now' : 'closed now');
  if (p.rating) bits.push(`★ ${p.rating.toFixed(1)}`);
  bits.push(km(dist(p, ctx.player)));
  return bits.join(' · ');
}

const HANDLERS = {
  // Explicit "take me to X": a named place wins; otherwise resolve the
  // category (land, gigs, fun …) and walk to its best result.
  go(text, ctx) {
    const direct = HANDLERS.navigate(text, ctx);
    if (direct.autorun) return direct;
    const sub = classify(text, ['go', 'navigate']);
    const res = (HANDLERS[sub] || HANDLERS.search)(text, ctx);
    const first = res.results?.[0]?.actions?.find((a) => a.type === 'navigate');
    return first ? { ...res, autorun: first } : res;
  },

  describe(_text, ctx) {
    const f = describeFocusOrNearest(ctx);
    if (!f) return { reply: `You're in ${ctx.zoneName || WORLD.name}.`, results: [] };
    if (f.type === 'place') {
      const p = ctx.places.find((x) => x.id === f.id);
      const gigs = ctx.gigs.filter((g) => g.placeId === p.id);
      let reply = `That's ${p.name} — ${placeLine(p, ctx)}.`;
      if (p.blurb) reply += ` ${p.blurb}`;
      if (gigs.length) reply += ` They have ${gigs.length} open gig${gigs.length > 1 ? 's' : ''}.`;
      return { reply, results: [{ label: p.name, sub: placeLine(p, ctx), actions: [open('place', p.id), nav(p.entrance || p, 'Take me there')] }] };
    }
    if (f.type === 'player') return { reply: `That's @${f.name}. Walk up to them to talk, wave or add them as a friend.`, results: [{ label: `@${f.name}`, sub: 'Player', actions: [open('player', f.id)] }] };
    if (f.type === 'parcel') return { reply: `${f.name} is a land parcel. You can view terms and rent it.`, results: [{ label: f.name, sub: 'Parcel', actions: [open('parcel', f.id)] }] };
    return { reply: `That's ${f.name}.`, results: [{ label: f.name, sub: f.type, actions: [open(f.type, f.id)] }] };
  },

  'act-order'(_text, ctx) {
    const f = describeFocusOrNearest(ctx);
    const p = f?.type === 'place' ? ctx.places.find((x) => x.id === f.id) : null;
    const target = p && p.commerce ? p : ctx.places.filter((x) => x.commerce).sort((a, b) => dist(a, ctx.player) - dist(b, ctx.player))[0];
    if (!target) return { reply: "I couldn't find a store nearby.", results: [] };
    return {
      reply: `Opening ${target.name}'s catalog. You'll confirm the order at checkout — I won't pay without you.`,
      results: [{ label: target.name, sub: placeLine(target, ctx), actions: [open('place', target.id)] }],
      autorun: open('place', target.id),
    };
  },

  'act-book'(_text, ctx) {
    const services = ctx.places.filter((p) => p.bookable).sort((a, b) => dist(a, ctx.player) - dist(b, ctx.player));
    if (!services.length) return { reply: 'No bookable services nearby right now.', results: [] };
    return {
      reply: `These places take bookings. Pick a slot and confirm it yourself.`,
      results: services.map((p) => ({ label: p.name, sub: placeLine(p, ctx), actions: [open('place', p.id), nav(p.entrance || p, 'Go')] })),
    };
  },

  'act-message'(_text, ctx) {
    const f = describeFocusOrNearest(ctx);
    if (f?.type === 'player') return { reply: `Opening your conversation with @${f.name}.`, results: [], autorun: { type: 'message', userId: f.id } };
    const p = f?.type === 'place' ? ctx.places.find((x) => x.id === f.id) : null;
    if (p?.ownerId) return { reply: `Opening a message to ${p.name}'s owner.`, results: [], autorun: { type: 'message', userId: p.ownerId } };
    return { reply: 'Walk up to a person or a business first, then ask me again.', results: [] };
  },

  'act-call'(_text, ctx) {
    const f = describeFocusOrNearest(ctx);
    if (f?.type === 'player') return { reply: `Requesting a voice call with @${f.name}. They'll need to accept.`, results: [], autorun: { type: 'call', userId: f.id } };
    const p = f?.type === 'place' ? ctx.places.find((x) => x.id === f.id) : null;
    if (p?.ownerId) return { reply: `Calling ${p.name}.`, results: [], autorun: { type: 'call', userId: p.ownerId } };
    return { reply: 'Who should I call? Walk up to them first.', results: [] };
  },

  capabilities(_text, ctx) {
    const near = [...ctx.places].sort((a, b) => dist(a, ctx.player) - dist(b, ctx.player)).slice(0, 3);
    const gigs = ctx.gigs.filter((g) => g.eligible).length;
    const avail = ctx.parcels.filter((p) => p.status === 'available').length;
    const reply = `You're in ${ctx.zoneName || WORLD.name}. Nearby: ${near.map((p) => p.name).join(', ')}. ` +
      `${gigs} gig${gigs === 1 ? '' : 's'} you qualify for, ${avail} parcel${avail === 1 ? '' : 's'} for rent` +
      (ctx.liveEvents?.length ? `, and ${ctx.liveEvents[0].title} is on now.` : '.');
    return {
      reply,
      results: near.map((p) => ({ label: p.name, sub: placeLine(p, ctx), actions: [open('place', p.id), nav(p.entrance || p, 'Go')] })),
      suggestions: ['Who is hiring?', 'Find something fun', 'Find a cheap storefront'],
    };
  },

  earn(_text, ctx) {
    const gigs = [...ctx.gigs].sort((a, b) => (b.eligible - a.eligible) || dist(a, ctx.player) - dist(b, ctx.player));
    if (!gigs.length) return { reply: 'No open gigs right now. Check the Creator Hub later.', results: [] };
    const ok = gigs.filter((g) => g.eligible).length;
    return {
      reply: `${gigs.length} open gigs nearby — you qualify for ${ok}. Those you don't qualify for list the skill you need and a course to get it.`,
      results: gigs.slice(0, 5).map((g) => ({
        label: g.title,
        sub: `${g.payLabel} · ${g.eligible ? 'You qualify' : `Needs ${g.missing.join(', ')}`} · ${km(dist(g, ctx.player))}`,
        actions: [open('gig', g.id), nav(g, 'Go')],
      })),
    };
  },

  learn(_text, ctx) {
    const blocked = ctx.gigs.filter((g) => !g.eligible && g.courseId);
    const courses = ctx.courses || [];
    const ordered = [...courses].sort((a, b) => blocked.some((g) => g.courseId === b.id) - blocked.some((g) => g.courseId === a.id));
    return {
      reply: blocked.length
        ? `Finishing ${ordered[0].title} unlocks "${blocked.find((g) => g.courseId === ordered[0].id).title}". Courses run at Pludor University.`
        : 'Here are courses at Pludor University.',
      results: ordered.slice(0, 4).map((c) => ({ label: c.title, sub: `Unlocks ${c.skillLabel} L${c.grantsLevel}`, actions: [open('course', c.id)] })),
    };
  },

  land(_text, ctx) {
    const avail = ctx.parcels.filter((p) => p.status === 'available').sort((a, b) => a.rentPerWeek - b.rentPerWeek);
    if (!avail.length) return { reply: 'Every parcel in Central is taken right now.', results: [] };
    return {
      reply: `${avail.length} parcels available in Riverside Lots. Cheapest is ${avail[0].name} at ${avail[0].rentLabel}.`,
      results: avail.slice(0, 4).map((p) => ({ label: p.name, sub: `${p.zoning} · ${p.rentLabel}`, actions: [open('parcel', p.id), nav(p.entrance || p, 'Go')] })),
    };
  },

  people(_text, ctx) {
    const ps = [...ctx.players].sort((a, b) => dist(a, ctx.player) - dist(b, ctx.player));
    if (!ps.length) return { reply: "It's quiet — nobody else is around right now.", results: [] };
    return {
      reply: `${ps.length} people in the district. The closest is @${ps[0].name}.`,
      results: ps.slice(0, 5).map((p) => ({ label: `@${p.name}`, sub: `${p.presence} · ${km(dist(p, ctx.player))}`, actions: [nav(p, 'Walk over'), open('player', p.id)] })),
    };
  },

  fun(_text, ctx) {
    const fun = ctx.places.filter((p) => ['games', 'media', 'community'].includes(p.kind));
    const ev = (ctx.liveEvents || []).map((e) => ({ label: e.title, sub: `Live now at ${e.placeName}`, actions: [open('event', e.id)] }));
    return {
      reply: ev.length ? `${ctx.liveEvents[0].title} is live right now. The arcade is open too.` : 'The arcade is always open, and the Flika Cinema is screening.',
      results: [...ev, ...fun.map((p) => ({ label: p.name, sub: placeLine(p, ctx), actions: [open('place', p.id), nav(p.entrance || p, 'Go')] }))],
    };
  },

  navigate(text, ctx) {
    const words = tokens(text);
    const scored = ctx.places.map((p) => ({ p, s: scorePlace(p, words) })).filter((x) => x.s > 0);
    scored.sort((a, b) => b.s - a.s || dist(a.p, ctx.player) - dist(b.p, ctx.player));
    if (!scored.length) {
      const player = ctx.players.find((p) => words.some((w) => norm(p.name).includes(w)));
      if (player) return { reply: `Heading to @${player.name}.`, results: [], autorun: nav(player, player.name) };
      const sub = classify(text, ['go', 'navigate']);
      return (HANDLERS[sub] || HANDLERS.search)(text, ctx);
    }
    const best = scored[0].p;
    return {
      reply: `Taking you to ${best.name} (${placeLine(best, ctx)}).`,
      results: scored.slice(0, 3).map(({ p }) => ({ label: p.name, sub: placeLine(p, ctx), actions: [nav(p.entrance || p, 'Go'), open('place', p.id)] })),
      autorun: nav(best.entrance || best, best.name),
    };
  },

  search(text, ctx) {
    const words = tokens(text);
    const scored = ctx.places.map((p) => ({ p, s: scorePlace(p, words) })).filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || dist(a.p, ctx.player) - dist(b.p, ctx.player));
    if (scored.length) {
      return {
        reply: `Best match: ${scored[0].p.name}.`,
        results: scored.slice(0, 4).map(({ p }) => ({ label: p.name, sub: placeLine(p, ctx), actions: [nav(p.entrance || p, 'Go'), open('place', p.id)] })),
      };
    }
    return {
      reply: "I'm not sure yet. Try asking for a place, a gig, land, people or something fun.",
      results: [],
      suggestions: ['What can I do here?', 'Find me a coffee shop', 'Who is hiring nearby?', 'Find a cheap storefront'],
    };
  },
};
