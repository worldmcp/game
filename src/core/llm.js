// Conversational AI for people in the World (residents, passers-by, agents).
//
// One tiny interface — llm(turns, { onText, signal }) → text — with
// providers chosen at boot:
//   · inside Pludor: the host passes Pludor AI (mountPludorWorld({ llm }))
//   · published as a Claude artifact: the viewer's Claude via `sample`
//   · World sandbox server: /api/ai/chat when it has an API key
//   · none: callers fall back to scripted lines.
// Characters never take economic actions through chat; they talk.

export function samplingLlm(samplePromise) {
  return async (turns, { onText, signal } = {}) => {
    const sample = await samplePromise;
    if (!sample) throw Object.assign(new Error('No AI available'), { code: 'unavailable' });
    const { text } = await sample(turns, { cache: false, modelTier: 'quick', onText, signal });
    return text.trim();
  };
}

export function serverLlm(base = '', getToken = () => null) {
  return async (turns, { signal } = {}) => {
    const r = await fetch(`${base}/api/ai/chat`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${getToken() || ''}` }, body: JSON.stringify({ turns }), signal });
    if (!r.ok) throw Object.assign(new Error('AI unavailable'), { code: 'unavailable' });
    return (await r.json()).text;
  };
}

// The standing instructions for a character, sent as the first user turn.
export function personaBrief(p, world) {
  return [
    `You are role-playing ${p.name}, a person living in ${world.city}, a futuristic city inside the Pludor World game.`,
    `About you: ${p.age ? `${p.age} years old. ` : ''}${p.job}. ${p.bio || ''} Personality: ${p.vibe || 'friendly'}.`,
    p.business ? `You run ${p.business}.` : '',
    `Right now you are at ${world.where} and it is ${world.time}.`,
    `Things in the city you can mention: ${world.places}.`,
    p.dating ? 'You are open to light, respectful flirting with adults who have dating turned on; never explicit, always kind, and you can say no.' : 'You are not here to date; politely deflect flirting.',
    'Talk like a real person in a game: 1–3 short sentences, casual, warm, specific to the city. Ask the player questions back. Never mention being an AI or a language model unless sincerely asked. Never ask for or share real personal data, money transfers, or off-platform contact details. If the player wants to buy, book, hire or travel, suggest the place in the city and tell them to tap it (you cannot do it for them).',
  ].filter(Boolean).join('\n');
}

export async function chatAs(llm, persona, world, history, playerText, opts = {}) {
  const turns = [{ role: 'user', content: `${personaBrief(persona, world)}\n\nStay in character for the rest of this conversation.` }];
  for (const m of history.slice(-10)) turns.push({ role: m.me ? 'user' : 'assistant', content: m.text });
  turns.push({ role: 'user', content: playerText });
  // The API wants alternating turns that end on the user; merge as needed.
  const merged = [];
  for (const t of turns) {
    const last = merged[merged.length - 1];
    if (last && last.role === t.role) last.content += `\n${t.content}`;
    else merged.push({ ...t });
  }
  return llm(merged, opts);
}
