// XP, levels, achievements and rank ladder. Pure functions used by the
// server-side adapter; the client only renders the results.

export function xpForLevel(level, curve) {
  if (level <= 1) return 0;
  return Math.round(curve.base * (level - 1) ** curve.exponent);
}

export function levelForXp(xp, curve) {
  let level = 1;
  while (xpForLevel(level + 1, curve) <= xp) level++;
  const floor = xpForLevel(level, curve);
  const next = xpForLevel(level + 1, curve);
  return { level, floor, next, progress: (xp - floor) / (next - floor) };
}

export function rankFor(achievementIds, ranks) {
  const held = new Set(achievementIds);
  let best = ranks[0];
  for (const r of ranks) if (r.requires.every((a) => held.has(a))) best = r;
  return best;
}

export function nextRank(achievementIds, ranks) {
  const current = rankFor(achievementIds, ranks);
  const idx = ranks.indexOf(current);
  const held = new Set(achievementIds);
  for (let i = idx + 1; i < ranks.length; i++) {
    const missing = ranks[i].requires.filter((a) => !held.has(a));
    if (missing.length) return { rank: ranks[i], missing };
  }
  return null;
}

function dayKey(day) {
  return `d${day}`;
}

// Decide how much XP an event earns given the rule and the player's history.
// history: { onceKeys: Set<string>, dailyCounts: { [ruleDayKey]: n } } (mutated)
export function awardXp(eventName, payload, rule, history, worldDay) {
  if (!rule) return 0;
  const dk = dayKey(worldDay);
  if (rule.once) {
    const k = `${eventName}|${rule.key ? payload?.[rule.key] : ''}|${rule.once === 'day' ? dk : 'ever'}`;
    if (history.onceKeys.has(k)) return 0;
    history.onceKeys.add(k);
  }
  if (rule.dailyCap) {
    const k = `${eventName}|${dk}`;
    const n = history.dailyCounts[k] || 0;
    if (n >= rule.dailyCap) return 0;
    history.dailyCounts[k] = n + 1;
  }
  return rule.xp;
}

// Returns ids of achievements newly unlocked by this event.
export function checkAchievements(eventName, defs, held, eventCounts) {
  const unlocked = [];
  for (const [id, def] of Object.entries(defs)) {
    if (held.has(id) || def.event !== eventName) continue;
    if ((eventCounts[eventName] || 0) >= (def.count || 1)) unlocked.push(id);
  }
  return unlocked;
}
