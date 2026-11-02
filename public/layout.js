// Bob's layout: a menu on the left that folds to an icon strip (Ctrl+B), chat in the middle, and a
// "Now running" panel on the right (Ctrl+J) with tasks, downloads and graphics card memory.
// Both remember how you left them. In a narrow window the right panel slides over the chat.
import { makeSortable, neighbour, taskRow, downloadRow } from './lists.js';
import { currentStyle } from './themes.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} }
};
const narrow = () => window.innerWidth <= 900;

export function createLayout({ post, openTasks, openDownloads }) {
  const body = document.body;
  let jobs = [], dls = [], needsYou = false, model = '';
  const tl = $('nowTasks'), dl = $('nowDl');
  let gpuTimer = null;

  // ---- folding ----
  const leftFolded = () => body.classList.contains('left-folded');
  function setLeft(folded, remember = true) {
    body.classList.toggle('left-folded', folded);
    $('foldLeft').setAttribute('aria-expanded', String(!folded));
    $('foldLeft').title = folded ? 'Open the menu (Ctrl+B)' : 'Fold the menu (Ctrl+B)';
    if (remember) store.set('bob-left', folded ? 'folded' : 'open');
  }
  function setRight(hidden, remember = true) {
    body.classList.toggle('right-hidden', hidden);
    $('foldRight').setAttribute('aria-expanded', String(!hidden));
    if (remember && !narrow()) store.set('bob-right', hidden ? 'hidden' : 'open');
    if (!hidden) { draw(); pollGpu(); }
  }
  setLeft(store.get('bob-left', window.innerWidth < 700 ? 'folded' : 'open') === 'folded', false);
  // A narrow window starts with the panel tucked away, whatever was remembered, so it never covers the chat by surprise.
  setRight(narrow() || store.get('bob-right', window.innerWidth < 1100 ? 'hidden' : 'open') === 'hidden', false);
  const w = Number(store.get('bob-now-w', '300'));
  if (w >= 220 && w <= 560) body.style.setProperty('--now-w', `${w}px`);

  $('foldLeft').onclick = () => setLeft(!leftFolded());
  $('foldRight').onclick = () => setRight(!body.classList.contains('right-hidden'));
  $('hideRight').onclick = () => setRight(true);
  $('chatBtn').onclick = () => { if (narrow()) setRight(true); if (window.innerWidth <= 560) setLeft(true); $('input').focus(); };
  window.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
    const k = e.key.toLowerCase();
    if (k === 'b') { e.preventDefault(); setLeft(!leftFolded()); }
    if (k === 'j') { e.preventDefault(); setRight(!body.classList.contains('right-hidden')); }
  });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && narrow() && !body.classList.contains('right-hidden') && !document.querySelector('dialog[open]')) setRight(true); });

  // ---- resizing the right panel ----
  const grab = $('grab');
  grab.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    grab.setPointerCapture(e.pointerId);
    grab.classList.add('dragging');
    const move = (ev) => { const width = Math.max(220, Math.min(560, window.innerWidth - ev.clientX)); body.style.setProperty('--now-w', `${width}px`); };
    const up = () => {
      grab.classList.remove('dragging');
      grab.removeEventListener('pointermove', move);
      store.set('bob-now-w', String(parseInt(getComputedStyle(body).getPropertyValue('--now-w'), 10) || 300));
    };
    grab.addEventListener('pointermove', move);
    grab.addEventListener('pointerup', up, { once: true });
  });
  grab.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const cur = parseInt(getComputedStyle(body).getPropertyValue('--now-w'), 10) || 300;
    const width = Math.max(220, Math.min(560, cur + (e.key === 'ArrowLeft' ? 20 : -20)));
    body.style.setProperty('--now-w', `${width}px`);
    store.set('bob-now-w', String(width));
  });

  // ---- the panel's lists ----
  function draw() {
    if (body.classList.contains('right-hidden')) return badgeOnly();
    const open = jobs.filter((j) => j.state === 'waiting' || j.state === 'working');
    const shownJobs = open.map((j) => (j.state === 'working' && needsYou ? { ...j, status: 'needs you' } : j));
    const recent = jobs.filter((j) => (j.state === 'failed' || j.state === 'interrupted') && Date.now() - (j.doneAt || j.at) < 3600e3);
    tl.innerHTML = [...shownJobs, ...recent].map((j) => taskRow(j, { movable: j.state === 'waiting', full: false })).join('') || '<li class="muted">Nothing running. Ask Bob for something.</li>';
    const live = dls.filter((d) => ['downloading', 'queued', 'paused', 'failed'].includes(d.state));
    if (!dl.querySelector('.dragging')) dl.innerHTML = live.slice(0, 6).map(downloadRow).join('') + (live.length > 6 ? `<li class="muted">and ${live.length - 6} more</li>` : '') || '<li class="muted">No downloads.</li>';
    badgeOnly();
  }
  function badgeOnly() {
    const n = jobs.filter((j) => j.state === 'waiting' || j.state === 'working').length + dls.filter((d) => ['downloading', 'queued'].includes(d.state)).length;
    const b = $('foldRight').querySelector('.badge');
    b.hidden = !n; b.textContent = String(n);
  }
  tl.addEventListener('click', (e) => {
    const b = e.target.closest('button'); const id = b?.closest('[data-id]')?.dataset.id;
    if (!b || !id || !b.dataset.t) return;
    if (b.dataset.t === 'up' || b.dataset.t === 'down') {
      const before = neighbour(jobs.filter((j) => j.state === 'waiting').map((j) => j.id), id, b.dataset.t === 'up' ? -1 : 1);
      if (before !== undefined) post('/api/queue/move', { id, before });
    } else post(`/api/queue/${b.dataset.t}`, { id });
  });
  dl.addEventListener('click', (e) => {
    const b = e.target.closest('button'); const id = b?.closest('[data-id]')?.dataset.id;
    if (b && id && b.dataset.d && !['up', 'down'].includes(b.dataset.d)) post(`/api/models/${b.dataset.d}`, { id });
  });
  makeSortable(tl, (id, before) => post('/api/queue/move', { id, before }));
  makeSortable(dl, (id, before) => post('/api/models/move', { id, before }));
  $('now').addEventListener('click', (e) => {
    if (e.target.closest('[data-alltasks]')) openTasks();
    if (e.target.closest('[data-alldl]')) openDownloads();
  });

  // ---- graphics card ----
  async function pollGpu() {
    clearTimeout(gpuTimer);
    if (body.classList.contains('right-hidden') || document.hidden) return;
    try {
      const { gpu, ram, brain } = await (await fetch('/api/gpu')).json();
      const el = $('nowGpu');
      // 1.5.3: graphics card and system memory (RAM), each with a meter; the brain by its friendly name.
      const row = (label, m) => {
        const pct = Math.min(100, Math.round((m.usedGB / m.totalGB) * 100));
        return `<div class="mem-row"><span class="mem-label"></span><div class="meter"><i style="width:${pct}%"></i></div><span class="mem-text"></span></div>`;
      };
      el.innerHTML = `${gpu ? row('Graphics card', gpu) : '<div class="mem-row"><span class="mem-label"></span><span class="mem-text"></span></div>'}${ram?.totalGB ? row('RAM', ram) : ''}${brain ? '<div class="mem-brain"></div>' : ''}`;
      const rows = el.querySelectorAll('.mem-row');
      rows[0].querySelector('.mem-label').textContent = 'Graphics card';
      rows[0].querySelector('.mem-text').textContent = gpu ? `${gpu.usedGB} of ${gpu.totalGB} GB in use` : 'not detected';
      if (rows[1]) { rows[1].querySelector('.mem-label').textContent = 'RAM'; rows[1].querySelector('.mem-text').textContent = `${ram.usedGB} of ${ram.totalGB} GB in use`; }
      if (brain) el.querySelector('.mem-brain').textContent = `Brain: ${brain}`;
    } catch {}
    gpuTimer = setTimeout(pollGpu, 5000);
  }
  document.addEventListener('visibilitychange', pollGpu);

  return {
    jobs(list) { jobs = list; draw(); },
    downloads(list) { dls = list; draw(); },
    tick(ev) { const d = dls.find((x) => x.id === ev.id); if (d) { Object.assign(d, { done: ev.done, total: ev.total || d.total, rate: ev.rate, eta: ev.eta }); if (!dl.querySelector('.dragging')) draw(); } },
    status(s) {
      if (s.model) model = s.model;
      const was = needsYou;
      needsYou = s.state === 'waiting';
      if (needsYou !== was) draw();
      if (needsYou && !was) this.needsYou();
    },
    // "Open Now running when a task needs me" (Style page): off by default.
    needsYou() { if (currentStyle()?.openNowOnNeed === true && body.classList.contains('right-hidden')) setRight(false, false); },
    showRight() { setRight(false); }
  };
}
