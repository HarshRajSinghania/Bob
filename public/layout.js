// Bob's layout: a menu on the left that folds to an icon strip (Ctrl+B), chat in the middle, and a
// "Now running" panel on the right (Ctrl+J) with tasks, downloads and graphics card memory.
// Both remember how you left them. In a narrow window the right panel slides over the chat.
import { makeSortable, neighbour, taskRow, downloadRow } from './lists.js';
import { currentStyle } from './themes.js';
import { catMoment } from './patches.js';

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} }
};
const narrow = () => window.innerWidth <= 900;

export function createLayout({ post, openTasks, openDownloads }) {
  const body = document.body;
  let jobs = [], dls = [], needsYou = false, model = '', cat = 'Patches';
  // The cat's name from Settings, for the little moments in the empty Tasks list (they change every 10 minutes).
  fetch('/api/settings').then((r) => r.json()).then((st) => { if (st.catName) { cat = st.catName; draw(); } }).catch(() => {});
  setInterval(() => { if (!jobs.some((j) => j.state === 'waiting' || j.state === 'working')) draw(); }, 600000).unref?.();
  const tl = $('nowTasks'), dl = $('nowDl');
  let gpuTimer = null;
  let gpuAt = 0, brainSt = null; // 1.5.26: up here, because pollGpu() can run before the graphics-card section below

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
    tl.innerHTML = [...shownJobs, ...recent].map((j) => taskRow(j, { movable: j.state === 'waiting', full: false })).join('') || `<li class="muted">Nothing running. Ask Bob for something.</li><li class="muted cat-moment">🐈 ${esc(catMoment(cat))}.</li>`;
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
  // 1.5.26: two readings, kept apart and labelled. The meters are the whole graphics card and RAM as Windows sees
  // them (every app, from nvidia-smi). "Bob's brain" is only Bob's chat brain, the same reading as the label at
  // the top of the chat (it arrives from there as bob-brain-status), so the two always show the same number.
  const brainLine = () => {
    const el = $('nowGpu').querySelector('.mem-brain');
    if (!el) return;
    const st = brainSt;
    if (!st) { el.textContent = ''; return; }
    if (!st.engineOk) { el.textContent = 'Bob\'s brain: engine not answering'; return; }
    const pic = st.picture ? `Picture model: ${st.picture.gb != null ? `${st.picture.gb} GB on the card` : st.picture.state === 'loading' ? 'loading...' : 'on the card (Windows doesn\'t say how much)'}` : '';
    if (!st.models?.length && !pic) { el.textContent = st.state === 'waking' ? 'Bob\'s brain: loading...' : 'Bob has nothing on the card right now.'; return; }
    const one = (m) => {
      const parts = [];
      if (m.ramGB == null) parts.push(`${m.estimate ? 'about ' : ''}${m.gb} GB${m.onCard ? '' : ' in RAM'}`);
      else { if (m.gb > 0) parts.push(`${m.gb} GB on the card`); if (m.ramGB > 0) parts.push(`${m.ramGB} GB in RAM`); }
      return `${m.label || m.name}, ${parts.join(' + ') || '0 GB'}`;
    };
    // One line per thing of Bob's on the card, so they add up to his share of the meter above.
    const lines = [st.models?.length ? `Bob's brain: ${st.models.map(one).join('; ')}` : st.state === 'waking' ? 'Bob\'s brain: loading...' : 'Bob\'s brain: not loaded', pic].filter(Boolean);
    el.replaceChildren(...lines.map((t) => Object.assign(document.createElement('div'), { textContent: t })));
    el.title = 'What Bob has on the card. "Bob\'s brain" is the same reading as the label at the top of the chat. The Graphics card meter above counts everything on the card: Windows, other apps and Bob\'s picture model.';
  };
  async function pollGpu() {
    clearTimeout(gpuTimer);
    if (body.classList.contains('right-hidden') || document.hidden) return;
    gpuAt = Date.now();
    try {
      const { gpu, ram } = await (await fetch('/api/gpu')).json();
      const el = $('nowGpu');
      // 1.5.3: graphics card and system memory (RAM), each with a meter.
      const row = (label, m) => {
        const pct = Math.min(100, Math.round((m.usedGB / m.totalGB) * 100));
        return `<div class="mem-row"><span class="mem-text"></span><div class="meter"><i style="width:${pct}%"></i></div></div>`;
      };
      el.innerHTML = `${gpu ? row('Graphics card', gpu) : '<div class="mem-row"><span class="mem-text"></span></div>'}${ram?.totalGB ? row('RAM', ram) : ''}<div class="mem-brain"></div>`;
      // 1.5.26: each meter names itself on its own line: "Graphics card · 9.1 of 15.9 GB in use (all apps)".
      const rows = el.querySelectorAll('.mem-row');
      rows[0].querySelector('.mem-text').textContent = gpu ? `Graphics card · ${gpu.usedGB} of ${gpu.totalGB} GB in use (all apps)` : 'Graphics card · not detected';
      rows[0].title = 'Everything using the graphics card right now: Windows, games, other apps and all of Bob.';
      if (rows[1]) rows[1].querySelector('.mem-text').textContent = `RAM · ${ram.usedGB} of ${ram.totalGB} GB in use (all apps)`;
      brainLine();
    } catch {}
    gpuTimer = setTimeout(pollGpu, 5000);
  }
  // A fresh brain reading also refreshes the meters, so both are read at the same moment.
  window.addEventListener('bob-brain-status', (e) => { brainSt = e.detail; if (Date.now() - gpuAt > 1500) pollGpu(); else brainLine(); });
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
