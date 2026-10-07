// Life-needs simulation (game state only; no health claims). Values are
// derived from a timestamped snapshot so the server can compute them lazily
// without ticking every player.

import { msPerWorldHour } from './world-time.js';

const clamp = (v) => Math.max(0, Math.min(100, v));

export function initialNeeds(needsCfg, nowMs) {
  const values = {};
  for (const [k, def] of Object.entries(needsCfg)) values[k] = def.start;
  return { values, updatedAt: nowMs };
}

export function needsAt(state, nowMs, needsCfg, timeCfg) {
  const hours = Math.max(0, nowMs - state.updatedAt) / msPerWorldHour(timeCfg);
  const values = {};
  for (const [k, def] of Object.entries(needsCfg)) {
    const base = state.values[k] ?? def.start;
    values[k] = clamp(base - def.decayPerGameHour * hours);
  }
  return values;
}

export function applyNeedEffects(state, effects, nowMs, needsCfg, timeCfg) {
  const values = needsAt(state, nowMs, needsCfg, timeCfg);
  for (const [k, delta] of Object.entries(effects || {})) {
    if (k in values) values[k] = clamp(values[k] + delta);
  }
  return { values, updatedAt: nowMs };
}

// Lowest need → contextual nudge for HUD / AI.
export function mostUrgentNeed(values, needsCfg, threshold = 35) {
  let worst = null;
  for (const [k, v] of Object.entries(values)) {
    if (v < threshold && (!worst || v < worst.value)) worst = { key: k, value: v, label: needsCfg[k]?.label || k };
  }
  return worst;
}
