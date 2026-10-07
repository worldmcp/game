// Event-driven quest engine. A quest is a list of steps; each step advances
// when a matching gamification event is reported. Gigs, courses, purchases,
// games and exploration all feed the same engine.

export function initQuestProgress(defs) {
  const p = {};
  for (const q of defs) p[q.id] = { steps: q.steps.map(() => 0), done: false, active: !!q.autoStart };
  return p;
}

function matches(step, eventName, payload) {
  if (step.event !== eventName && step.alt !== eventName) return false;
  if (!step.match) return true;
  return Object.entries(step.match).every(([k, v]) => (Array.isArray(v) ? v.includes(payload?.[k]) : payload?.[k] === v));
}

// Returns { progress, completed: questIds[] }. Does not mutate input.
export function advanceQuests(defs, progress, eventName, payload) {
  const next = structuredClone(progress);
  const completed = [];
  for (const q of defs) {
    const st = next[q.id];
    if (!st || st.done || !st.active) continue;
    let changed = false;
    q.steps.forEach((step, i) => {
      if (st.steps[i] < step.count && matches(step, eventName, payload)) {
        st.steps[i] += 1;
        changed = true;
      }
    });
    if (changed && q.steps.every((s, i) => st.steps[i] >= s.count)) {
      st.done = true;
      completed.push(q.id);
    }
  }
  return { progress: next, completed };
}

export function activeQuest(defs, progress) {
  return defs.find((q) => progress[q.id]?.active && !progress[q.id]?.done) || null;
}

export function currentStep(def, st) {
  const i = def.steps.findIndex((s, idx) => st.steps[idx] < s.count);
  return i === -1 ? null : { index: i, step: def.steps[i], have: st.steps[i] };
}
