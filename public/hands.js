// Hands in the window: the approval cards with rows to tick or the exact command, live output with Stop,
// the "Stop everything" button, and the Hands section in Settings. Big buttons on purpose (remote desktop).
import { esc } from './rich.js';

const OPS = { move: 'Move', copy: 'Copy', zip: 'Zip', unzip: 'Unzip', recycle: 'Recycle Bin' };
const when = (t) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const post = async (url, data) => {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify(data || {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
  return j;
};

// ---- Approval cards (from the brain's 'approval' event when it has a plan or a command) ----
// Returns the card, or null if this isn't a Hands card (then the ordinary card is used).
export function handsApproval(ev, { add, answer }) {
  if (!ev.plan && !ev.command) return null;
  const all = ev.allowAll ? '<button type="button" class="all big">Allow the rest of this job</button>' : '';
  let body = '';
  if (ev.plan) {
    const ok = ev.plan.filter((r) => !r.blocked);
    body = `<div class="hands-plan"><table><thead><tr><th><input type="checkbox" class="tick-all" aria-label="Tick all" ${ok.length ? 'checked' : 'disabled'}></th><th>What</th><th>From</th><th>To</th></tr></thead><tbody>
      ${ev.plan.map((r) => `<tr class="${r.blocked ? 'blocked' : ''}"><td><input type="checkbox" data-row="${esc(r.id)}" ${r.blocked ? 'disabled' : 'checked'} aria-label="Row ${esc(r.id)}"></td>
        <td>${esc(OPS[r.op] || r.op)}${r.note ? `<br><span class="muted">${esc(r.note)}</span>` : ''}</td><td class="path">${esc(r.from)}</td>
        <td class="path">${esc(r.to)}${r.blocked ? `<br><span class="why">✗ ${esc(r.blocked)}</span>` : ''}</td></tr>`).join('')}
      </tbody></table></div>`;
  } else {
    body = `<pre class="cmd"><code>${esc(ev.command)}</code></pre><p class="muted">In ${esc(ev.cwd || '')}</p>`;
  }
  const card = add('approval hands-card', `<p><strong>Bob wants to:</strong> ${esc(ev.text)}</p>${body}
    <div class="row"><button type="button" class="yes big">${ev.plan ? 'Allow ticked' : 'Run it'}</button>${all}<button type="button" class="no big">Deny</button></div>`);
  const rows = () => [...card.querySelectorAll('input[data-row]')].filter((i) => i.checked).map((i) => i.dataset.row);
  const tickAll = card.querySelector('.tick-all');
  if (tickAll) {
    tickAll.onchange = () => { for (const i of card.querySelectorAll('input[data-row]:not(:disabled)')) i.checked = tickAll.checked; count(); };
    card.querySelector('tbody').onchange = () => count();
  }
  const yes = card.querySelector('.yes');
  function count() { if (ev.plan) { const n = rows().length; yes.textContent = n ? `Allow ticked (${n})` : 'Nothing ticked'; yes.disabled = !n; } }
  count();
  const go = (allow) => {
    const picked = ev.plan ? rows() : undefined;
    card.querySelector('.row').outerHTML = `<div class="done">${allow === 'all' ? 'Allowed for the rest of this job' : allow ? (ev.plan ? `Allowed ${picked.length} of ${ev.plan.length}` : 'Allowed') : 'Denied'}</div>`;
    for (const i of card.querySelectorAll('input')) i.disabled = true;
    answer(allow, picked);
  };
  yes.onclick = () => go(true);
  card.querySelector('.no').onclick = () => go(false);
  if (ev.allowAll) card.querySelector('.all').onclick = () => go('all');
  return card;
}

// ---- Live output, Stop, files done ----
const runs = new Map(); // runId -> card
export function onHandsEvent(ev, { add, scrollDown, note }) {
  if (ev.type === 'run-start') {
    const card = add('hands-run', `<div class="head"><strong>${ev.recipe ? `Recipe: ${esc(ev.recipe)}` : 'Running'}</strong> <code>${esc(ev.line)}</code></div>
      <pre class="out" aria-live="polite"></pre><div class="row"><button type="button" class="stop big">Stop</button><span class="state muted">Running…</span></div>`);
    card.querySelector('.stop').onclick = async (e) => { e.target.disabled = true; e.target.textContent = 'Stopping…'; try { await post('/api/hands/stop', { runId: ev.runId }); } catch {} };
    runs.set(ev.runId, card);
    showStopAll(true);
    return true;
  }
  if (ev.type === 'run-output') {
    const out = runs.get(ev.runId)?.querySelector('.out');
    if (out) {
      const near = out.scrollHeight - out.scrollTop - out.clientHeight < 40;
      out.textContent = (out.textContent + ev.text).slice(-60000);
      if (near) out.scrollTop = out.scrollHeight;
      scrollDown?.();
    }
    return true;
  }
  if (ev.type === 'run-end') {
    const card = runs.get(ev.runId);
    runs.delete(ev.runId);
    if (card) {
      const ok = ev.code === 0 && !ev.killed;
      card.classList.add(ok ? 'ok' : 'bad');
      card.querySelector('.stop')?.remove();
      card.querySelector('.state').textContent = ev.why ? `Didn't start: ${ev.why}` : ev.killed === 'stopped' ? 'Stopped.' : ev.killed === 'timeout' ? 'Stopped: it ran past the time limit.' : `Finished${ok ? ' ✓' : ` with exit code ${ev.code}`}`;
    }
    return true;
  }
  if (ev.type === 'files-done') {
    if (!ev.job) return true;
    const el = add('hands-done', `<span>${esc(ev.job.label)}: ${ev.done} done${ev.failed?.length ? `, ${ev.failed.length} not done` : ''}.</span><button type="button" class="big">Undo</button>`);
    el.querySelector('button').onclick = async (e) => {
      e.target.disabled = true;
      try { const r = await post('/api/hands/undo', { id: ev.job.id }); e.target.outerHTML = `<span class="muted">Undone.${r.manual?.length ? ` ${r.manual.length} thing${r.manual.length === 1 ? ' is' : 's are'} in the Recycle Bin: restore from there.` : ''}${r.failed?.length ? ` Couldn't undo: ${esc(r.failed.join('; '))}` : ''}</span>`; }
      catch (err) { e.target.disabled = false; note?.(err.message, 'error'); }
    };
    return true;
  }
  if (ev.type === 'hands') { showStopAll(ev.settings?.enabled); return true; }
  return false;
}

// ---- Stop everything (top of the window, shown while Hands are on) ----
let stopAllBtn = null;
export function setupStopAll(btn, { note } = {}) {
  stopAllBtn = btn;
  btn.onclick = async () => {
    btn.disabled = true;
    try { const r = await post('/api/hands/stop-all'); note?.(`Stopped ${r.stopped} thing${r.stopped === 1 ? '' : 's'}. All Hands are off now; turn them back on in Settings.`); showStopAll(false); }
    catch (e) { note?.(e.message, 'error'); }
    btn.disabled = false;
  };
  fetch('/api/hands').then((r) => r.json()).then((v) => showStopAll(v.settings?.enabled || v.running?.length)).catch(() => {});
}
function showStopAll(on) { if (stopAllBtn) stopAllBtn.hidden = !on && !runs.size; }

// ---- Settings: the Hands section ----
// Schedules: what's set up, a switch each, Remove, and the separate opt-in Windows task.
function schedHtml(sched, s) {
  if (!sched) return '';
  const live = s.enabled && s.schedules?.on;
  return `<div class="hands-sched"><strong>Schedules</strong>${live ? '' : ' <span class="muted">(the Schedules hand is off, so none of these run)</span>'}
    ${sched.list.length ? `<ul>${sched.list.map((e) => `<li><label class="switch small"><input type="checkbox" data-hsched="${esc(e.id)}" ${e.enabled ? 'checked' : ''}><span><strong>${esc(e.name)}</strong> <span class="muted">${esc(e.says)}${e.enabled && e.nextDue ? ` · next ${esc(new Date(e.nextDue).toLocaleString())}` : ''}${e.lastResult ? ` · last run ${e.lastResult.ok ? 'started' : 'did not run'}` : ''}</span><br><span class="muted">${esc(e.job?.task || '')}</span></span></label> <button type="button" class="link" data-hscheddel="${esc(e.id)}">Remove</button></li>`).join('')}</ul>` : '<p class="muted">None yet. Ask Bob, for example "every Monday at 9, tidy my Downloads". He shows you the schedule first.</p>'}
    ${sched.platform === 'win32' ? `<label class="switch small"><input type="checkbox" data-hschedtask ${sched.windowsTask ? 'checked' : ''}><span>Wake Bob for schedules when he's closed <span class="muted">(adds a "Bob schedules" task to Windows Task Scheduler, just for you, no admin. Off by default.)</span></span></label>` : ''}
  </div>`;
}

export function handsSettingsHtml() {
  return '<div class="hands-box"><strong>Hands</strong> <span class="tag">off unless you turn them on</span><p class="muted">Loading…</p></div>';
}

export async function mountHandsSettings(box) {
  if (!box) return;
  let v;
  const draw = () => {
    const s = v.settings;
    const folders = [...new Set([...(v.candidates || []), ...s.folders])];
    box.innerHTML = `<strong>Hands</strong> <span class="tag">off unless you turn them on</span>
      <p class="muted">Hands let Bob do things on this PC, not just talk about them. Each one is off until you switch it on. Even then he shows you exactly what he'll do (every file, or the exact command) and waits for your click every time. "Allow the rest of this job" only covers the same kind of thing until that job ends. He never runs as administrator, never handles passwords, and never touches secret files, read-only projects or his own settings. Everything goes in the logbook.</p>
      <button type="button" class="stop-all big" data-hstopall>✋ Stop everything</button>
      <label class="switch"><input type="checkbox" data-hmaster ${s.enabled ? 'checked' : ''}><span><strong>Let Bob use Hands</strong><br><span class="muted">The master switch. Off = every Hand below is off.</span></span></label>
      ${v.hands.map((h) => `<label class="switch${s.enabled ? '' : ' dim'}"><input type="checkbox" data-hand="${esc(h.id)}" ${s[h.id]?.on ? 'checked' : ''} ${s.enabled ? '' : 'disabled'}><span><strong>${esc(h.label)}</strong><br><span class="muted">${esc(h.what)}</span></span></label>`).join('')}
      <div class="hands-folders"><strong>Folders the Files Hand may work in</strong>
        ${folders.length ? folders.map((f) => `<label class="switch small"><input type="checkbox" data-hfolder="${esc(f)}" ${s.folders.includes(f) ? 'checked' : ''}><span>${esc(f)}</span></label>`).join('') : '<p class="muted">No folders yet.</p>'}
        <div class="row"><input type="text" data-hnewfolder placeholder="Add a folder: C:\\Users\\you\\Pictures" aria-label="Add a folder" style="flex:1"><button type="button" data-haddfolder>Add</button></div>
        <p class="muted">Read-only projects, Bob's own folders and files with keys or passwords stay off-limits even inside these.</p></div>
      <label class="pick"><strong>Stop a command after</strong><select data-htimeout>${[1, 5, 15, 30, 60, 120].map((m) => `<option value="${m}" ${m === s.timeoutMin ? 'selected' : ''}>${m < 60 ? `${m} minute${m === 1 ? '' : 's'}` : `${m / 60} hour${m === 60 ? '' : 's'}`}</option>`).join('')}</select></label>
      <div class="hands-recipes"><strong>Recipes</strong> <span class="muted">Saved commands you can run in one click, or ask Bob for by name ("run my build recipe"). He still asks before each run.</span>
        ${v.recipes.length ? `<ul>${v.recipes.map((r) => `<li><button type="button" class="big" data-hrun="${esc(r.name)}" ${s.enabled && s.run?.on ? '' : 'disabled'}>▶ ${esc(r.name)}</button> <code>${esc([r.cmd, ...(r.args || [])].join(' '))}</code> <span class="muted">in ${esc(r.cwd)}</span> <button type="button" class="link" data-hdelrecipe="${esc(r.name)}">Remove</button></li>`).join('')}</ul>` : ''}
        <details><summary>Add a recipe</summary><div class="hands-newrecipe">
          <label class="pick"><span>Name</span><input data-hr="name" placeholder="Build my app"></label>
          <label class="pick"><span>Program</span><input data-hr="cmd" placeholder="gradlew.bat"></label>
          <label class="pick"><span>Arguments (one per line)</span><textarea data-hr="args" rows="2" placeholder="assembleDebug"></textarea></label>
          <label class="pick"><span>In folder</span><input data-hr="cwd" placeholder="C:\\Users\\you\\Projects\\app"></label>
          <button type="button" data-hsaverecipe>Save recipe</button><span class="muted hr-out"></span></div></details></div>
      ${schedHtml(sched, s)}
      <div class="hands-journal"><strong>Recent file jobs</strong>
        ${v.journal.length ? `<ul>${v.journal.map((j) => `<li>${esc(when(j.at))}: ${esc(j.label)} ${j.undone ? '<span class="muted">(undone)</span>' : `<button type="button" data-hundo="${esc(j.id)}">Undo</button>`}</li>`).join('')}</ul>` : '<p class="muted">None yet.</p>'}
        <strong>Recent commands</strong>
        ${v.runs.length ? `<ul>${v.runs.map((r) => `<li>${esc(when(r.at))}: <code>${esc(r.line)}</code> <span class="muted">${r.why ? "didn't start" : r.killed ? esc(r.killed) : `exit ${r.code}`}</span></li>`).join('')}</ul>` : '<p class="muted">None yet.</p>'}
        <p class="muted">Every action is also in the logbook (inn\\logbook.md).</p></div>
      <p class="muted hands-out" role="status"></p>`;
  };
  const say = (t) => { const o = box.querySelector('.hands-out'); if (o) o.textContent = t; };
  const set = async (patch, msg) => { v = await post('/api/hands/settings', patch); draw(); say(msg || 'Saved.'); showStopAll(v.settings.enabled); };
  let sched = null;
  const loadSched = async () => { try { sched = await (await fetch('/api/hands/schedules')).json(); } catch { sched = null; } };
  await loadSched();
  try { v = await (await fetch('/api/hands')).json(); draw(); } catch (e) { box.innerHTML = `<strong>Hands</strong><p class="muted">Couldn't load: ${esc(e.message)}</p>`; return; }

  box.addEventListener('change', async (e) => {
    const el = e.target;
    e.stopPropagation();
    try {
      if ('hmaster' in el.dataset) return await set({ enabled: el.checked }, el.checked ? 'Hands on. Now switch on the ones you want; he still asks every time.' : 'All Hands off.');
      if (el.dataset.hand) return await set({ [el.dataset.hand]: { on: el.checked } }, el.checked ? 'On. Bob still asks before every action.' : 'Off.');
      if (el.dataset.hfolder) { const f = el.dataset.hfolder; return await set({ folders: el.checked ? [...v.settings.folders, f] : v.settings.folders.filter((x) => x !== f) }); }
      if ('htimeout' in el.dataset) return await set({ timeoutMin: Number(el.value) });
      if (el.dataset.hsched) { sched = await post('/api/hands/schedules', { id: el.dataset.hsched, on: el.checked }); draw(); return say(el.checked ? 'Schedule on.' : 'Schedule off.'); }
      if ('hschedtask' in el.dataset) { try { sched = await post('/api/hands/schedules', { windowsTask: el.checked }); draw(); say(el.checked ? 'Added the "Bob schedules" task: Windows wakes Bob (hidden) when a schedule is due. Remove Bob takes it away too.' : 'Removed the Windows task.'); } catch (err) { el.checked = !el.checked; say(err.message); } return; }
    } catch (err) { say(err.message); }
  });
  box.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    e.stopPropagation();
    try {
      if ('hstopall' in b.dataset) { const r = await post('/api/hands/stop-all'); v = r; draw(); say(`Stopped ${r.stopped} thing${r.stopped === 1 ? '' : 's'}. All Hands are off.`); showStopAll(false); return; }
      if ('haddfolder' in b.dataset) {
        const f = box.querySelector('[data-hnewfolder]').value.trim();
        if (!f) return;
        const before = v.settings.folders.length;
        await set({ folders: [...v.settings.folders, f] });
        say(v.settings.folders.length > before ? 'Added.' : 'That isn\'t a full folder path (like C:\\Users\\you\\Pictures).');
        return;
      }
      if (b.dataset.hscheddel) { sched = await post('/api/hands/schedules', { remove: b.dataset.hscheddel }); draw(); say('Schedule removed.'); return; }
      if (b.dataset.hundo) { const r = await post('/api/hands/undo', { id: b.dataset.hundo }); v = r; draw(); say(`Undone.${r.manual?.length ? ` ${r.manual.length} thing(s) are in the Recycle Bin: restore from there.` : ''}${r.failed?.length ? ` Couldn't undo: ${r.failed.join('; ')}` : ''}`); return; }
      if (b.dataset.hrun) { await post('/api/hands/run-recipe', { name: b.dataset.hrun }); say('Running. The output is in the chat.'); return; }
      if (b.dataset.hdelrecipe) { const r = await post('/api/hands/recipes', { remove: b.dataset.hdelrecipe }); v.recipes = r.recipes; draw(); say('Removed.'); return; }
      if ('hsaverecipe' in b.dataset) {
        const g = (k) => box.querySelector(`[data-hr="${k}"]`).value.trim();
        const r = await post('/api/hands/recipes', { save: { name: g('name'), cmd: g('cmd'), args: g('args') ? g('args').split(/\r?\n/).map((x) => x.trim()).filter(Boolean) : [], cwd: g('cwd') } });
        v.recipes = r.recipes; draw(); say('Recipe saved.');
      }
    } catch (err) { say(err.message); }
  });
}
