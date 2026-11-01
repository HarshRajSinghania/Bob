// Sessions: sets of brains that fit in the graphics card together, so Bob never swaps brains mid-session.
// "Normal" is the old behaviour (each job uses the brain picked for it in Model roles).
// Bob may suggest a session from what's waiting in his queue, but he never switches without the user's click.

export const SESSIONS = {
  normal: { label: 'Normal', icon: '☕', what: 'Each job uses the brain picked for it in Model roles. Bob swaps brains when a job needs another one.' },
  art: { label: 'Art', icon: '🎨', what: 'The graphics card is kept for pictures, video and sound. Bob chats on his small brain on the processor, so he keeps talking while a picture paints.', brain: 'small', cpu: true, parallel: true },
  coding: { label: 'Coding', icon: '🛠', what: 'The coding brain does everything, with its full memory for long files. Small side jobs run on the processor.', brain: 'coding' },
  office: { label: 'Office', icon: '📊', what: 'One all-rounder brain for writing, spreadsheets, research and planning. No swaps.', brain: 'office' },
  deep: { label: 'Deep thought', icon: '🧠', what: 'The strongest thinker, thinking hard, with nothing else loaded. Slower, more careful answers.', brain: 'deep', think: 'high' },
  light: { label: 'Light / gaming', icon: '🎮', what: 'Only the small brain (about 5 GB), so games keep the graphics card.', brain: 'small' }
};

// Which model each session's brain is. the user can change these on the Sessions tab; the defaults come
// from the models already picked in Model roles.
export function sessionBrains(cfg) {
  const m = cfg.models || {};
  const s = cfg.sessionBrains || {};
  return {
    small: s.small || 'gemma4:e4b',
    coding: s.coding || m.tinker || m.bob,
    office: s.office || m.ledger || m.bob,
    deep: s.deep || m.reviewer || m.bob
  };
}

export function currentSession(cfg) {
  const id = SESSIONS[cfg.session] ? cfg.session : 'normal';
  // The old "One brain" switch is Normal with every hat on the main brain.
  return { id, ...SESSIONS[id] };
}

// How much a brain can keep in mind (context, in tokens) per session. Empty means the engine's default.
export const CTX_CHOICES = [8192, 16384, 32768, 65536, 131072, 262144];
// Measured on a 16 GB RTX card (gemma4:26b, llama.cpp b12032): 32K is about 15% faster than 128K for chat.
// Coding and Deep thought keep the engine's full default; 256K is for one-off whole-project reads (slow).
export const DEFAULT_CTX = { normal: 32768, light: 32768, art: 32768, office: 65536 };
export function sessionCtx(cfg, id, hat) {
  const v = cfg.sessionCtx?.[id];
  if (CTX_CHOICES.includes(v)) return v;
  // In a Normal session the coding and review copies still get the long default, for big files.
  if (id === 'normal' && ['tinker', 'reviewer'].includes(hat)) return null;
  return DEFAULT_CTX[id] || null;
}

// The model a hat runs on right now, and whether it must stay off the graphics card.
export function modelFor(cfg, hat) {
  const s = currentSession(cfg);
  const ctx = sessionCtx(cfg, s.id, hat);
  if (s.id === 'normal') return { model: cfg.oneBrain ? cfg.models.bob : (cfg.models[hat] || cfg.models.bob), cpu: false, ctx };
  const model = sessionBrains(cfg)[s.brain] || cfg.models.bob;
  return { model, cpu: Boolean(s.cpu), think: s.think, ctx };
}

// Pictures, video and sound go in their own lane during an Art session, so chat doesn't wait for them.
export function laneOf(cfg, job) {
  const s = currentSession(cfg);
  // Only with Ollama: Bob's own engine (llama.cpp) holds one brain at a time.
  return s.parallel && cfg.engine !== 'llamacpp' && ['picture', 'video'].includes(job.kind) ? 'art' : 'talk';
}

// A gentle suggestion from what's waiting: never a switch.
export function suggestSession(cfg, jobs) {
  const s = currentSession(cfg).id;
  const waiting = jobs.filter((j) => j.state === 'waiting' || j.state === 'working');
  const count = (k) => waiting.filter((j) => j.kind === k).length;
  let want = null;
  if (count('picture') + count('video') >= 2) want = 'art';
  else if (count('code') >= 2) want = 'coding';
  else if (count('data') + count('research') >= 2) want = 'office';
  if (!want || want === s) return null;
  return { id: want, label: SESSIONS[want].label, why: want === 'art' ? 'Several pictures or clips are waiting. In an Art session I can keep chatting while they paint.' : want === 'coding' ? 'Several coding jobs are waiting. A Coding session keeps the coding brain loaded.' : 'Several spreadsheet and research jobs are waiting. An Office session does them all without swapping brains.' };
}
