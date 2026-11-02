// 1.5.7: the Effort control above the chat box. Low (quick, the default), High (Bob calls a moot: a big brain drafts
// and his reviewer copy checks it), Extreme (the reviewer also checks each code change; slowest).
// It goes back to Low each time Bob starts, so the big brains never load because of a choice made last week.
const $ = (id) => document.getElementById(id);
const KEY = 'bob-effort';
export const HINTS = {
  low: 'Quick answer from one brain. Nothing extra loads.',
  high: 'A big brain drafts the answer, then the Review brain checks it. Slower. Big brains are freed afterwards.',
  extreme: 'Like High, and the Review brain also checks each code change as it\'s made. Slowest: every check swaps brains (about 20 seconds each).'
};
const LEVELS = Object.keys(HINTS);

export function createEffort() {
  const box = $('effort');
  const btns = [...box.querySelectorAll('[data-effort]')];
  let level = 'low';
  try { const v = sessionStorage.getItem(KEY); if (LEVELS.includes(v)) level = v; } catch {}
  function draw() {
    for (const b of btns) { const on = b.dataset.effort === level; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; }
    $('effortHint').textContent = HINTS[level];
    box.dataset.level = level;
  }
  function set(v, focus = false) {
    if (!LEVELS.includes(v)) return;
    level = v;
    try { sessionStorage.setItem(KEY, v); } catch {}
    draw();
    if (focus) btns.find((b) => b.dataset.effort === v)?.focus();
  }
  for (const b of btns) b.onclick = () => set(b.dataset.effort);
  box.addEventListener('keydown', (e) => {
    const i = LEVELS.indexOf(level);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); set(LEVELS[Math.min(LEVELS.length - 1, i + 1)], true); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); set(LEVELS[Math.max(0, i - 1)], true); }
  });
  draw();
  return { get: () => level, set };
}
