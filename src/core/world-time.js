// Persistent, shared world clock. Derived purely from wall-clock time so every
// client (and the server) agrees on the in-world time without syncing state.

export function worldTimeAt(nowMs, cfg) {
  const dayMs = cfg.realMinutesPerDay * 60000;
  const elapsed = nowMs - cfg.epochMs + ((cfg.epochHour || 0) / 24) * dayMs;
  const day = Math.floor(elapsed / dayMs);
  const intoDay = ((elapsed % dayMs) + dayMs) % dayMs;
  const hoursF = (intoDay / dayMs) * 24;
  const hour = Math.floor(hoursF);
  const minute = Math.floor((hoursF - hour) * 60);
  return { day: day + 1, hour, minute, hoursF, phase: phaseOf(hoursF), daylight: daylight(hoursF) };
}

export function phaseOf(h) {
  if (h >= 5 && h < 7) return 'dawn';
  if (h >= 7 && h < 17.5) return 'day';
  if (h >= 17.5 && h < 20) return 'dusk';
  return 'night';
}

// 0 at night, 1 at noon, smooth ramps at dawn/dusk.
export function daylight(h) {
  const v = Math.sin(((h - 5.5) / 14) * Math.PI);
  return Math.max(0, Math.min(1, v * 1.25));
}

// hours: [open, close] in world hours; close may exceed 24 or wrap past midnight.
export function isOpen(hours, hoursF) {
  if (!hours) return true;
  const [open, close] = hours;
  if (close >= 24 && open === 0) return true;
  const c = close % 24;
  if (open < c) return hoursF >= open && hoursF < c;
  return hoursF >= open || hoursF < c;
}

export function formatClock(t) {
  const h12 = ((t.hour + 11) % 12) + 1;
  const ampm = t.hour < 12 ? 'AM' : 'PM';
  return `${h12}:${String(t.minute).padStart(2, '0')} ${ampm}`;
}

// Real milliseconds per in-world hour.
export function msPerWorldHour(cfg) {
  return (cfg.realMinutesPerDay * 60000) / 24;
}
