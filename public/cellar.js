// The cellar: Bob's model shop and settings. Every download starts from a click here, with its size shown first.
import { setLook } from './bob-sprite.js';
import { progressHtml, animateWorkers } from './progress.js';
import { createStylePage } from './style-page.js';
import { createSampler, sampleButton, sampleHint } from './voice-samples.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const gb = (n) => (n >= 1 ? `${(+n).toFixed(n >= 10 ? 0 : 1)} GB` : `${Math.round(n * 1000)} MB`);

async function api(url, data) {
  const r = await fetch(url, data === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify(data) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
  return j;
}

export function createCellar() {
  const dlg = $('cellar');
  let speedModel = '';
  let data = null, hw = null, settings = null, roles = null, cloud = [], caps = {}, tab = 'roles', job = null, mode = 'shop', voices = [];
  const sampler = createSampler();
  const live = new Map(); // downloads running now (one or two), by id
  const stylePage = createStylePage({
    api,
    redraw: () => draw(),
    flash: (msg) => { const p = document.createElement('p'); p.className = 'have'; p.textContent = msg; $('cellar-body').prepend(p); setTimeout(() => p.remove(), 4000); }
  });

  // How well a model suits this PC: ok, slow (more than the card's memory), no (far too big), blocked (can't at all).
  function suit(m) {
    if (hw?.freeGB != null && m.status.state !== 'installed' && m.sizeGB > hw.freeGB) return { level: 'blocked', why: `Needs ${gb(m.sizeGB)} of disk space; ${hw.freeGB} GB free.` };
    if (m.needs && settings?.platform && settings.platform !== 'win32') return { level: 'blocked', why: `${m.needs} only runs on Windows here.` };
    const v = hw?.vramGB;
    if (!v || !m.vramGB) return { level: 'ok' };
    if (m.vramGB <= v) return { level: 'ok', tag: '<span class="tag good">Fits your card</span>' };
    if (m.vramGB <= v * 1.5) return { level: 'slow', why: `Wants ${m.vramGB} GB of graphics memory; your card has ${v} GB. It will run, but slowly.` };
    return { level: 'no', why: `Wants ${m.vramGB} GB of graphics memory; your card has ${v} GB. It probably won't run well.` };
  }

  // Jobs Bob can already do another way: the model is an optional upgrade, not something missing.
  function covered(m) {
    if (m.status.state === 'installed') return '';
    if (m.category === 'voice' && caps.hearing) return 'recommended: faster replies after voice notes. I already hear you, but through a model that pushes my brain out of the graphics card; this one listens on the processor';
    return '';
  }

  function action(m) {
    const s = m.status;
    if (live.has(m.id)) return progress(live.get(m.id));
    const waiting = (data.downloads || []).find((d) => d.id === m.id && ['queued', 'paused', 'failed'].includes(d.state));
    if (waiting) return `<div class="muted">${waiting.state === 'queued' ? 'Waiting its turn in Downloads.' : waiting.state === 'paused' ? 'Paused in Downloads.' : 'Failed: see Downloads.'}</div><button data-opendl>Open Downloads</button>`;
    if (s.state === 'installed') {
      const where = s.where.length ? `On this PC (${esc(s.where.join(', '))})` : 'On this PC';
      return `<div class="have">✓ ${where}</div>${m.use ? `<button data-use="${esc(m.id)}">Use this</button>` : ''}`;
    }
    if (!s.canDownload) return `<div class="muted">Needs Ollama running to download.</div>`;
    const part = s.state === 'partial' ? ' (some files are already here)' : '';
    const fit = suit(m);
    if (fit.level === 'blocked') return `<div class="muted">Can't install on this PC: ${esc(fit.why)}</div>`;
    if (fit.level !== 'ok') return `<div class="muted">${esc(fit.why)}</div><button class="link" data-anyway="${esc(m.id)}">Ignore recommendation and install anyway</button>`;
    return `<button class="get" data-get="${esc(m.id)}">Download ${gb(m.sizeGB)}${part}</button>`;
  }

  function progress(j = job) { animateWorkers(); return progressHtml(j); }

  function cardSample(m) {
    if (m.use?.tts?.provider === 'kokoro') return kokoroGrid(false);
    const v = voices.find((x) => x.catalogId === m.id);
    if (!v || v.have === 'none') return '';
    return `<p class="sample-row">${hear(v.engine, v.voice)}${v.have === 'online' ? ` <span class="muted">from ${esc(v.source)}</span>` : ''}</p>`;
  }

  function card(m) {
    const lic = m.commercial ? esc(m.license) : `${esc(m.license)} · personal use only`;
    const eng = m.needs && (data.engines || []).find((e) => e.name === m.needs);
    const needs = m.needs ? (eng && !eng.installed ? `<span class="tag warn">needs ${esc(m.needs)}: get it in Settings</span>` : `<span class="tag">uses ${esc(m.needs)}</span>`) : '';
    const pick = { best: 'Top pick', small: 'Light', tiny: 'Tiny', optional: 'Optional' }[m.pick] || '';
    const fit = suit(m);
    const badge = covered(m) ? '<span class="tag good">Faster replies after voice notes</span>' : fit.level === 'ok' ? (fit.tag || '') : fit.level === 'blocked' ? '<span class="tag bad">Not available on this PC</span>' : '<span class="tag warn">Not recommended</span>';
    const dim = fit.level !== 'ok' && m.status.state !== 'installed' ? ' dim' : '';
    return `<article class="model${dim}" id="m-${esc(m.id)}">
      <header><strong>${esc(m.name)}</strong>${pick ? `<span class="tag">${pick}</span>` : ''}</header>
      <p>${esc(m.what)}</p>
      <div class="facts"><span>${gb(m.sizeGB)} download</span>${m.vramGB ? `<span>wants ${m.vramGB} GB graphics memory</span>` : '<span>runs on the processor</span>'}<span>${lic}</span>${badge}${needs}</div>
      ${m.category === 'speech' ? cardSample(m) : ''}
      <div class="act">${action(m)}</div>
      <div class="confirm" hidden></div>
    </article>`;
  }

  function extrasHtml() {
    const ex = data.extras.filter((f) => tab === 'found' || f.kind === tab);
    if (!ex.length) return '';
    return `<h3>Also on this PC</h3><p class="muted">Bob found these in other apps. He can use the ones his painter understands; Maestro's own video models still need Maestro.</p>
      <ul class="found">${ex.map((f) => `<li><span>${esc(f.name)}</span><span class="muted">${esc(f.owner)} · ${gb(f.size / 1e9)}</span></li>`).join('')}</ul>`;
  }

  function shopHtml() {
    const tabs = [{ id: 'roles', label: 'Model roles', icon: '🧭' }, ...data.categories, { id: 'found', label: 'On this PC', icon: '🔎' }, { id: 'style', label: 'Style', icon: '🎨' }, { id: 'settings', label: 'Settings', icon: '⚙' }];
    const bar = `<nav class="tabs" role="tablist">${tabs.map((c) => `<button role="tab" aria-selected="${c.id === tab}" data-tab="${c.id}">${c.icon} ${esc(c.label)}</button>`).join('')}</nav>`;
    let body = '';
    if (tab === 'settings') body = settingsHtml();
    else if (tab === 'style') body = stylePage.html(settings);
    else if (tab === 'roles') body = rolesHtml();
    else if (tab === 'found') body = `<p class="muted">Scanned ${data.scannedAt ? new Date(data.scannedAt).toLocaleString() : 'never'}. <button data-scan>Look again</button></p>${extrasHtml() || '<p>Nothing extra found.</p>'}`;
    else {
      const cat = data.categories.find((c) => c.id === tab);
      body = `<p class="muted">${esc(cat?.what)}</p>${data.models.filter((m) => m.category === tab).map(card).join('')}${extrasHtml()}`;
    }
    return `${bar}<div class="pane">${body}</div>`;
  }

  function rolesHtml() {
    if (!roles) return '<p class="muted">Loading...</p>';
    const row = (j) => {
      const opts = roles.options[j.kind] || [];
      const cur = roles.current[j.id] || '';
      const list = opts.length ? opts : [{ value: '', label: 'Not available on this PC yet: hidden from Bob' }];
      const has = list.some((o) => o.value === cur);
      return `<tr class="${opts.length ? '' : 'dim'}"><th scope="row">${esc(j.label)}<span class="muted">${esc(j.what)}</span></th>
        <td><select data-role="${esc(j.id)}" aria-label="${esc(j.label)}" ${opts.length ? '' : 'disabled'}>
          ${has || !cur ? '' : `<option value="${esc(cur)}" selected>${esc(cur)} (not found)</option>`}
          ${cur ? '' : '<option value="" selected>Pick one</option>'}
          ${list.map((o) => `<option value="${esc(o.value)}" ${o.value === cur ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
        </select></td></tr>`;
    };
    const thinkers = roles.jobs.filter((j) => j.kind === 'llm');
    const makers = roles.jobs.filter((j) => j.kind !== 'llm');
    return `<p class="muted">Pick which brain thinks for each job, and which model makes the pictures, clips and hearing. Using one brain for several jobs is faster; a different brain means a short swap (the brain machine), usually 10 to 20 seconds.</p>
      <h3>Thinking (writes, plans, codes, writes prompts)</h3><table class="roles">${thinkers.map(row).join('')}</table>
      <h3>Making (does the actual work)</h3><table class="roles">${makers.map(row).join('')}</table>
      <h3>Session brains</h3><p class="muted">Pick a session from the menu next to Bob's name. Each one keeps a set of brains that fit in your graphics card together, so there are no swaps. Art runs the small brain on the processor so the painter keeps the card.</p>
      <table class="roles">${[['small', 'Small brain', 'Art and Light / gaming sessions'], ['coding', 'Coding session', 'Does everything in a Coding session'], ['office', 'Office session', 'Does everything in an Office session'], ['deep', 'Deep thought session', 'The strongest thinker (gpt-oss thinks hardest)']].map(([k, label, what]) => {
        const cur = settings.sessionBrains?.[k] || '';
        const list = roles.options.llm || [];
        return `<tr><th scope="row">${esc(label)}<span class="muted">${esc(what)}</span></th><td><select data-sbrain="${k}" aria-label="${esc(label)}">${list.some((o) => o.value === cur) || !cur ? '' : `<option value="${esc(cur)}" selected>${esc(cur)} (not found)</option>`}${list.map((o) => `<option value="${esc(o.value)}" ${o.value === cur ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select></td></tr>`;
      }).join('')}</table>
      <h3>How much each session keeps in mind</h3><p class="muted">Context size: more lets Bob read longer files and chats, but uses more graphics memory and loads slower. Default uses the engine's own setting.</p>
      <table class="roles">${(settings.sessions || []).map((x) => `<tr><th scope="row">${x.icon} ${esc(x.label)}</th><td><select data-sctx="${esc(x.id)}" aria-label="${esc(x.label)} context"><option value="">Default${({ normal: ' (32K)', light: ' (32K)', art: ' (32K)', office: ' (64K)' })[x.id] || ' (engine\'s own)'}</option>${[8192, 16384, 32768, 65536, 131072, 262144].map((v) => `<option value="${v}" ${settings.sessionCtx?.[x.id] === v ? 'selected' : ''}>${v / 1024}K${v === 262144 ? ' (slow: one-off whole-project reads)' : ''}</option>`).join('')}</select></td></tr>`).join('')}</table>
      <p class="muted">Missing something? Get it from its category tab first.</p>`;
  }

  // Bob's own voice: which Kokoro voice and how fast. Piper voices and Chatterbox are picked in Model roles.
  const voiceOf = (engine, voice) => voices.find((v) => v.engine === engine && v.voice === voice);
  const hear = (engine, voice, label) => sampleButton(engine, voice, label, sampleHint(voiceOf(engine, voice)));
  // Every Kokoro voice with a play button, so they can be compared without picking each one.
  function kokoroGrid(canUse) {
    const list = voices.filter((v) => v.engine === 'kokoro');
    if (!list.length) return '';
    const cur = settings.tts?.voice;
    return `<details class="voices"><summary>Hear all ${list.length} Kokoro voices</summary>
      ${list[0].installed ? '' : '<p class="muted">Kokoro isn\'t on this PC yet, so only the voices that come with Bob can play. The rest play after Kokoro is in.</p>'}
      <ul class="voice-grid">${list.map((v) => `<li class="sample-row"><span>${esc(v.label)}${canUse && v.voice === cur ? ' <span class="tag good">Bob\'s voice</span>' : ''}</span>${v.have === 'none' ? '<span class="muted">after Kokoro is in</span>' : hear('kokoro', v.voice, 'Play')}${canUse && v.voice !== cur ? `<button type="button" class="link" data-usevoice="${esc(v.voice)}">Use</button>` : ''}</li>`).join('')}</ul></details>`;
  }

  function voiceHtml() {
    const t = settings.tts || {};
    if (t.provider === 'kokoro') return `<div class="row"><label class="pick"><strong>Bob's voice (Kokoro)</strong><select data-tts="voice">${(settings.kokoroVoices || []).map(([id, label]) => `<option value="${esc(id)}" ${id === t.voice ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></label><span class="sample-row">${hear('kokoro', t.voice || 'am_michael')}</span>
      <label class="pick"><strong>Speed: <b data-speedlabel>${(t.speed || 1).toFixed(1)}×</b></strong><input type="range" min="0.6" max="1.6" step="0.1" data-tts="speed" value="${t.speed || 1}"></label></div>${kokoroGrid(true)}`;
    if (t.provider === 'chatterbox') return `<div><strong>Bob's voice (Chatterbox)</strong><p class="muted">To copy a voice, put a clear 10 to 20 second recording named bob.wav in ${esc(t.voicesFolder)}. Only use a voice you have the right to use (your own, or one you have permission for).</p>${voiceOf('chatterbox', 'bob')?.installed ? `<p class="sample-row">${hear('chatterbox', 'bob')}</p>` : ''}</div>`;
    return `<div><strong>Bob's voice (Windows)</strong><p class="sample-row">${sampleButton('windows', 'default', 'Hear a sample', 'The voice built into Windows.')}</p></div>`;
  }

  // Making Bob's own engine (llama.cpp) faster. Blank means llama.cpp's own default.
  function speedHtml() {
    const sp = settings.speed || {};
    const d = sp.draft || {};
    const llms = roles?.options?.llm || [];
    const n = (k, label, hint) => `<label class="pick"><span>${label}</span><input type="text" inputmode="numeric" data-speed="${k}" value="${esc(sp[k] ?? '')}" placeholder="${hint}" style="width:7em"></label>`;
    const models = [...new Set([...llms.map((o) => o.value), ...Object.keys(sp.modelArgs || {})])];
    return `<div><strong>Speed (Bob's own engine)</strong>${settings.engine === 'llamacpp' ? '' : ' <span class="tag">only used with Bob\'s own engine</span>'}
      <p class="muted">Changes apply the next time a brain loads. Leave a box empty for llama.cpp's default.</p>
      <div class="row">${n('threads', 'Threads', 'auto')}${n('batch', 'Batch', '2048')}${n('ubatch', 'Micro-batch', '512')}</div>
      <label class="switch"><input type="checkbox" data-fit ${sp.fit !== false ? 'checked' : ''}><span><strong>Fit to free graphics memory</strong> <span class="tag good">recommended</span><br><span class="muted">llama.cpp works out how much of each brain fits next to whatever else is using the card right now. Faster and steadier than a fixed split. Needs llama.cpp b12000 or newer.</span></span></label>
      <label class="switch"><input type="checkbox" data-draft="enabled" ${d.enabled && d.model ? 'checked' : ''}><span><strong>Speculative decoding</strong> <span class="tag warn">experimental</span><br><span class="muted">A small "draft" brain guesses a few words ahead and the big one checks them: often 1.5 to 2 times faster, same answers. The draft must be from the same family (for example a small Qwen for a big Qwen). Not every pair works: check that Bob got faster. The exact command is in inn\\bob\\llama-server-args.txt.</span></span></label>
      <div class="row"><label class="pick"><span>Draft brain</span><select data-draft="model"><option value="">Pick one</option>${llms.map((o) => `<option value="${esc(o.value)}" ${o.value === d.model ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}${d.model && !llms.some((o) => o.value === d.model) ? `<option selected value="${esc(d.model)}">${esc(d.model)}</option>` : ''}</select></label>
        <label class="pick"><span>Guess up to</span><input type="text" inputmode="numeric" data-draft="max" value="${esc(d.max ?? 16)}" style="width:5em"></label>
        <label class="pick"><span>At least</span><input type="text" inputmode="numeric" data-draft="min" value="${esc(d.min ?? 1)}" style="width:5em"></label></div>
      <div class="row"><label class="pick"><span>Extra settings for one brain</span><select data-margsmodel>${models.map((m) => `<option ${m === speedModel ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select></label>
        <label class="pick" style="flex:1"><span>llama.cpp flags (for example <code>--n-cpu-moe 8</code>)</span><input type="text" data-margs value="${esc((sp.modelArgs?.[speedModel || models[0]] || []).join(' '))}" placeholder="none"></label></div>
    </div>`;
  }

  function settingsHtml() {
    return `<section class="settings">
      <p class="muted">Bob's look and the colours are on the <button class="link" data-tab="style">🎨 Style</button> tab.</p>
      <div class="updates"><strong>Updates</strong><p class="muted">This is Bob ${esc(settings.version?.label || '')}. Updating tests the newest Bob from the folder he came from and puts him next to this one, in a window that shows every step, then asks before restarting him. Your chats, notes, models and settings stay as they are.</p>
        <div class="row"><button data-checkupdate>Check for a newer Bob</button><span class="update-out muted"></span></div>
        <div class="update-steps"></div>
        <label class="switch"><input type="checkbox" data-set="autoCheck" ${settings.updates?.autoCheck ? 'checked' : ''}><span><strong>Check when Bob starts</strong><br><span class="muted">Off unless you turn it on. Bob only tells you; updating always takes your click.</span></span></label></div>
      <div><strong>Downloads</strong><p class="muted">Downloads queue up, ${settings.downloads?.concurrent === 2 ? 'two' : 'one'} at a time, and can be paused, resumed, cancelled and reordered.</p><button data-opendl>Open Downloads</button></div>
      <label class="switch"><input type="checkbox" data-set="oneBrain" ${settings.oneBrain ? 'checked' : ''}>
        <span><strong>One brain (snappier)</strong><br><span class="muted">In the Normal session, all of Bob's copies use his main brain, so he never stops to swap brains (about 20 seconds each). Specialist brains are better for long coding or review jobs.</span></span></label>
      <label class="pick"><strong>Bob's cat</strong><input data-set="catName" maxlength="24" value="${esc(settings.catName || 'Patches')}" aria-label="Cat's name" style="width:12em"><span class="muted">The cat who ignores him in The Idle Process.</span></label>
      ${voiceHtml()}
      <label class="switch"><input type="checkbox" data-set="autostart" ${settings.autostart ? 'checked' : ''} ${settings.platform !== 'win32' ? 'disabled' : ''}>
        <span><strong>Launch Bob on start-up</strong><br><span class="muted">Off unless you turn it on. Bob then waits quietly in the background.</span></span></label>
      <label class="pick"><strong>Bob's engine</strong>
        <select data-set="engine"><option value="ollama" ${settings.engine === 'ollama' ? 'selected' : ''}>Ollama (if you already have it)</option><option value="llamacpp" ${settings.engine === 'llamacpp' ? 'selected' : ''}>Bob's own (llama.cpp, nothing else needed)</option></select>
        <span class="muted">Takes effect next time Bob starts.</span></label>
      <div><strong>Engines</strong><p class="muted">The programs that run the models. Each one comes from its official GitHub page, matched to your graphics card.</p>
        ${(data.engines || []).map((e) => `<article class="model" id="m-engine:${esc(e.id)}"><header><strong>${esc(e.name)}</strong></header><p>${esc(e.what)}</p>
          <div class="act">${live.has('engine:' + e.id) ? progress(live.get('engine:' + e.id)) : e.installed ? `<div class="have">✓ Installed${e.version ? ` (${esc(e.version)})` : ''}</div>${e.pinned || settings.platform !== 'win32' ? '' : `<button data-checkengine="${esc(e.id)}">Check for a newer build</button>`}` : settings.platform !== 'win32' ? '<div class="muted">Windows only</div>' : `<button class="get" data-engine="${esc(e.id)}">Get ${esc(e.name)}</button>`}</div><div class="confirm" hidden></div></article>`).join('')}</div>
      ${speedHtml()}
      <div><strong>ComfyUI workflows</strong> <span class="tag">off unless you turn it on</span>
        <p class="muted">For jobs Bob's own engines can't do (ComfyUI custom nodes, face fixers, IP-Adapter, long multi-step graphs). Bob drives ComfyUI for you; you never have to open it. ComfyUI must be running on this PC (for example from Pinokio). Put workflows in the workflows folder as Workflow > Export (API) files.</p>
        <label class="switch"><input type="checkbox" data-set="workshop" ${settings.workshop?.enabled ? 'checked' : ''}><span><strong>Let Bob use ComfyUI</strong><br><span class="muted">${settings.workshop?.enabled ? `Workflows folder: ${esc(settings.workshop.folder)} · ${settings.workshop.count} workflow${settings.workshop.count === 1 ? '' : 's'}` : 'Off.'}</span></span></label>
        <label class="pick"><strong>ComfyUI port</strong><input data-set="workshopPort" inputmode="numeric" value="${esc(settings.workshop?.port || 8188)}" aria-label="ComfyUI port" style="width:7em"></label></div>
      <div><strong>Cloud helpers</strong> <span class="tag">off unless you turn one on</span>
        <p class="muted">Paid cloud AIs Bob can hand one job to, as a helper copy. He asks you every time, shows the rough cost and exactly what text would leave your PC. Bob never stores or sees your keys: you add a key as a Windows environment variable yourself (Settings, System, About, Advanced system settings, Environment Variables, under "User variables").</p>
        ${cloud.map((c) => `<div class="cloud row${c.keyFound ? '' : ' dim'}">
          <label class="switch"><input type="checkbox" data-cloud="${esc(c.id)}" ${c.enabled ? 'checked' : ''} ${c.keyFound ? '' : 'disabled'}><span><strong>${esc(c.name)}</strong><br><span class="muted">${c.keyFound ? `Key found (${esc(c.apiKeyEnv)})` : `No key yet. Add a user variable named ${esc(c.apiKeyEnv)}.`}</span></span></label>
          ${c.models.length ? `<select data-cloudmodel="${esc(c.id)}" aria-label="${esc(c.name)} model" ${c.keyFound ? '' : 'disabled'}>${c.models.map((m) => `<option ${m === c.model ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>` : `<input data-cloudmodel="${esc(c.id)}" aria-label="${esc(c.name)} model" placeholder="model name" value="${esc(c.model)}" ${c.keyFound ? '' : 'disabled'}>`}
        </div>`).join('')}</div>
      <p class="muted">Graphics card: ${hw?.gpu ? `${esc(hw.gpu.name)}, ${hw.gpu.vramGB} GB` : 'not detected'} · Free disk: ${hw?.freeGB ?? '?'} GB</p>
      <p><button data-welcome>Run the first-time setup again</button></p>
      <p class="muted">Bob ${esc(settings.version?.label || '')}</p>
    </section>`;
  }

  function welcomeHtml() {
    const pack = data.packs.find((p) => p.id === hw.suggestedPack) || data.packs[0];
    const items = pack.models.map((id) => data.models.find((m) => m.id === id)).filter(Boolean);
    const needed = items.filter((m) => m.status.state !== 'installed' && !covered(m));
    const total = needed.reduce((t, m) => t + m.sizeGB, 0);
    return `<div class="welcome">
      <h2>Welcome to Bob</h2>
      <p>I'm Bob. Before I can help, I need a few models. Here's what I'd pick for this PC${hw.gpu ? ` (${esc(hw.gpu.name)}, ${hw.gpu.vramGB} GB)` : ''}:</p>
      <label class="pick"><strong>Setup</strong><select data-pack>${data.packs.map((p) => `<option value="${p.id}" ${p.id === pack.id ? 'selected' : ''}>${esc(p.label)}</option>`).join('')}</select></label>
      <ul class="packlist">${items.map((m) => { const extra = covered(m); return `<li><label><input type="checkbox" data-pick="${esc(m.id)}" ${m.status.state === 'installed' ? 'checked disabled' : extra ? '' : suit(m).level === 'ok' ? 'checked' : suit(m).level === 'blocked' ? 'disabled' : ''}> ${esc(m.name)} <span class="muted">· ${esc(data.categories.find((c) => c.id === m.category)?.label)} · ${m.status.state === 'installed' ? 'already here' : gb(m.sizeGB)}${extra ? ` · ${esc(extra)}` : m.status.state !== 'installed' && suit(m).level !== 'ok' ? ' · not recommended for this PC' : ''}</span></label></li>`; }).join('')}</ul>
      <p class="muted">${needed.length ? `About ${gb(total)} to download. Free disk: ${hw.freeGB ?? '?'} GB. You can change any of this later in Models and settings (left menu).` : items.some((m) => m.status.state !== 'installed') ? 'Everything you need is already here. The rest is optional: tick it if you want it.' : 'Everything is already on this PC.'}</p>
      ${job ? progress() : ''}
      <div class="row"><button class="get" data-getpack ${items.some((m) => m.status.state !== 'installed') ? '' : 'hidden'}>Download the checked ones</button><button data-skip>${needed.length ? 'Skip for now' : 'Done'}</button></div>
    </div>`;
  }

  function draw() {
    if (!data) { $('cellar-body').innerHTML = '<p class="muted">Loading...</p>'; return; }
    $('cellar-body').innerHTML = mode === 'welcome' ? welcomeHtml() : shopHtml();
    stylePage.paintPreviews(dlg);
  }

  async function load() {
    [data, hw, settings, roles, cloud, caps] = await Promise.all([api('/api/models'), api('/api/hardware'), api('/api/settings'), api('/api/roles'), api('/api/cloud'), api('/api/capabilities').catch(() => ({}))]);
    voices = (await api('/api/voice/samples').catch(() => ({}))).voices || [];
    job = data.job;
    live.clear();
    for (const d of data.downloads || []) if (d.state === 'downloading') live.set(d.id, { ...d, phase: d.phase === 'downloading' ? 'downloading' : d.phase });
    draw();
  }

  function confirmBox(el, m, anyway) {
    const box = el.querySelector('.confirm');
    const hosts = m.files.length ? 'Hugging Face' : 'Ollama';
    box.hidden = false;
    box.innerHTML = `${anyway ? `<p class="error">Not recommended: ${esc(suit(m).why)}</p>` : ''}<p>Download <strong>${esc(m.name)}</strong>: about ${gb(m.sizeGB)} from ${hosts}. Licence: ${esc(m.license)}${m.commercial ? '' : ' (personal use only)'}.</p><div class="row"><button class="get" data-yes="${esc(m.id)}">Yes, download</button><button data-no>Cancel</button></div>`;
  }

  dlg.addEventListener('click', async (e) => {
    const b = e.target.closest('button, input, select');
    if (!b) return;
    try {
      if (tab === 'style' && mode === 'shop' && await stylePage.onClick(b, settings)) return;
      if (b.dataset.sampleEngine) { sampler.play(b); return; }
      if (b.dataset.usevoice) { const r = await api('/api/settings', { tts: { voice: b.dataset.usevoice } }); settings.tts = { ...settings.tts, ...r.tts }; draw(); return; }
      if (b.dataset.tab) { sampler.stop(); tab = b.dataset.tab; draw(); }
      else if (b.dataset.get) confirmBox(b.closest('.model'), data.models.find((m) => m.id === b.dataset.get));
      else if (b.dataset.anyway) confirmBox(b.closest('.model'), data.models.find((m) => m.id === b.dataset.anyway), true);
      else if (b.dataset.look) { await api('/api/settings', { look: b.dataset.look }); setLook(b.dataset.look); draw(); }
      else if (b.dataset.engine) {
        const box = b.closest('.model').querySelector('.confirm');
        box.hidden = false;
        const eng = (data.engines || []).find((x) => x.id === b.dataset.engine);
        box.innerHTML = ['kokoro', 'chatterbox'].includes(b.dataset.engine)
          ? `<p>Set up ${esc(eng?.name)}: ${esc(eng?.what)} It goes in Bob's own folder; nothing else on your PC changes. If you don't have Python yet, get 3.12 from <a href="https://www.python.org/downloads/windows/" target="_blank" rel="noopener">python.org</a> first.</p>`
          : b.dataset.engine === 'audio'
          ? `<p>Set up the audio tools: ACE-Step 1.5 for music (MIT, a song in seconds) and AudioLDM 2 for sound effects (personal use only), each in its own folder only Bob uses. You need Python 3.12 from <a href="https://www.python.org/downloads/windows/" target="_blank" rel="noopener">python.org</a> installed first. About 6 GB now, plus about 6 GB of models the first time he makes each kind. Nothing else on your PC changes.</p>`
          : `<p>Download ${esc(({ llamacpp: 'llama.cpp', sdcpp: 'stable-diffusion.cpp', whispercpp: 'whisper.cpp', piper: 'Piper' })[b.dataset.engine] || b.dataset.engine)} from GitHub (usually 20 to 600 MB, more with NVIDIA runtime files).</p>`;
        box.innerHTML += `<div class="row"><button class="get" data-yes="engine:${esc(b.dataset.engine)}">Yes, download</button><button data-no>Cancel</button></div>`;
      }
      else if ('no' in b.dataset) b.closest('.confirm').hidden = true;
      else if (b.dataset.yes) { job = await api('/api/models/download', { id: b.dataset.yes }); draw(); }
      else if ('cancel' in b.dataset) await api('/api/models/cancel', b.dataset.cancel ? { id: b.dataset.cancel } : {});
      else if (b.dataset.pausedl) await api('/api/models/pause', { id: b.dataset.pausedl });
      else if ('checkupdate' in b.dataset) {
        const out = b.parentElement.querySelector('.update-out');
        out.textContent = 'Checking...';
        const c = await api('/api/update/check');
        if (c.newer && c.canRun) out.innerHTML = `Bob ${esc(c.available.label)} is ready to build. <button class="get" data-startupdate>Update Bob</button>`;
        else if (c.newer) out.textContent = `Bob ${c.available.label} is in the source folder, but: ${c.why}`;
        else out.textContent = c.source ? `Up to date (Bob ${c.current.label}).` : c.why;
      }
      else if ('startupdate' in b.dataset) {
        b.disabled = true;
        await api('/api/update/start', {});
        b.outerHTML = '<span class="have">The update window is open. The steps show here too.</span>';
        window.dispatchEvent(new Event('bob-update-started'));
        watchUpdate();
      }
      else if ('opendl' in b.dataset) { dlg.close(); window.dispatchEvent(new Event('bob-downloads')); }
      else if (b.dataset.use) { const r = await api('/api/models/use', { id: b.dataset.use }); const at = b.parentElement; b.outerHTML = `<span class="have">Saved.</span>`; if (r.needsEngine) askEngine(at); }
      else if (b.dataset.checkengine) {
        b.textContent = 'Checking...';
        const r = await api(`/api/engines/latest?id=${encodeURIComponent(b.dataset.checkengine)}`);
        b.outerHTML = r.newer ? `<button class="get" data-engine="${esc(r.id)}">Get newer build: ${esc(r.latest)}${r.installed ? ` (you have ${esc(r.installed)})` : ''}</button>` : `<span class="muted">Up to date (${esc(r.latest)}).</span>`;
      }
      else if (b.dataset.switchengine) { await api('/api/settings', { engine: b.dataset.switchengine }); settings.engine = b.dataset.switchengine; b.closest('.confirm').outerHTML = '<span class="have">Switched. Restart Bob to use his own engine.</span>'; }
      else if ('scan' in b.dataset) { b.textContent = 'Looking...'; await api('/api/models/scan', {}); await load(); }
      else if ('welcome' in b.dataset) { mode = 'welcome'; draw(); }
      else if ('getpack' in b.dataset) {
        const ids = [...dlg.querySelectorAll('[data-pick]:checked:not(:disabled)')].map((x) => x.dataset.pick);
        if (ids.length) { job = await api('/api/models/download', { ids }); draw(); }
      } else if ('skip' in b.dataset) { await api('/api/settings', { setupDone: true }); mode = 'shop'; dlg.close(); }
    } catch (err) { alertIn(b, err.message); }
  });

  dlg.addEventListener('input', (e) => { if (tab === 'style') stylePage.onInput(e.target); });

  dlg.addEventListener('change', async (e) => {
    const el = e.target;
    try {
      if (el.dataset.tts) { const v = el.dataset.tts === 'speed' ? Number(el.value) : el.value; const r = await api('/api/settings', { tts: { [el.dataset.tts]: v } }); settings.tts = { ...settings.tts, ...r.tts }; if (el.dataset.tts === 'voice') { const sb = el.closest('.row')?.querySelector('[data-sample-engine="kokoro"]'); if (sb) sb.dataset.sampleVoice = el.value; } flash(el, 'Saved. Press ▶ Hear a sample to hear it.'); return; }
      if (el.dataset.speed) { const v = el.value.trim() === '' ? null : Number(el.value); const r = await api('/api/settings', { speed: { [el.dataset.speed]: v } }); settings.speed = r.speed; el.value = r.speed[el.dataset.speed] ?? ''; flash(el, 'Saved.'); return; }
      if ('fit' in el.dataset) { const r = await api('/api/settings', { speed: { fit: el.checked } }); settings.speed = r.speed; flash(el, 'Saved.'); return; }
      if (el.dataset.draft) {
        const d = { ...(settings.speed?.draft || {}) };
        d[el.dataset.draft] = el.type === 'checkbox' ? el.checked : el.dataset.draft === 'model' ? el.value : Number(el.value);
        if (d.enabled && !d.model) { alertIn(el, 'Pick a draft brain first.'); el.checked = false; return; }
        const r = await api('/api/settings', { speed: { draft: d } }); settings.speed = r.speed; flash(el, 'Saved.'); return;
      }
      if ('margsmodel' in el.dataset) { speedModel = el.value; draw(); return; }
      if ('margs' in el.dataset) {
        const model = speedModel || dlg.querySelector('[data-margsmodel]')?.value;
        if (!model) return;
        const args = el.value.trim() ? el.value.trim().split(/\s+/) : null;
        const r = await api('/api/settings', { speed: { modelArgs: { [model]: args } } }); settings.speed = r.speed;
        const kept = r.speed.modelArgs?.[model] || [];
        if (args && kept.length !== args.length) alertIn(el, 'Some of that was left out: only flags and plain values are allowed, no file paths.');
        el.value = kept.join(' '); flash(el, 'Saved.'); return;
      }
      if (el.dataset.sctx) { const v = el.value ? Number(el.value) : null; const r = await api('/api/settings', { sessionCtx: { [el.dataset.sctx]: v } }); settings.sessionCtx = r.sessionCtx; flash(el, 'Saved. Applies when the brain next loads.'); return; }
      if (el.dataset.sbrain) { const r = await api('/api/settings', { sessionBrains: { [el.dataset.sbrain]: el.value } }); settings.sessionBrains = r.sessionBrains; flash(el, 'Saved.'); return; }
      if (el.dataset.set === 'oneBrain') { const r = await api('/api/settings', { oneBrain: el.checked }); settings.oneBrain = r.oneBrain; el.checked = r.oneBrain; return; }
      if (el.dataset.set === 'catName') { const r = await api('/api/settings', { catName: el.value }); settings.catName = r.catName; el.value = r.catName; return; }
      if (el.dataset.set === 'workshop') { const r = await api('/api/settings', { workshop: { enabled: el.checked } }); settings.workshop = r.workshop; draw(); return; }
      if (el.dataset.set === 'workshopPort') { const r = await api('/api/settings', { workshop: { port: Number(el.value) } }); settings.workshop = r.workshop; return; }
      if (el.dataset.set === 'autoCheck') { const r = await api('/api/settings', { updates: { autoCheck: el.checked } }); settings.updates = r.updates; el.checked = r.updates.autoCheck; return; }
      if (el.dataset.set === 'autostart') { const r = await api('/api/settings', { autostart: el.checked }); settings.autostart = r.autostart; el.checked = r.autostart; }
      else if (el.dataset.cloud) { const r = await api('/api/settings', { cloudHelpers: { [el.dataset.cloud]: { enabled: el.checked } } }); cloud = r.cloud || cloud; flash(el.closest('.cloud'), el.checked ? 'On. Bob still asks every time.' : 'Off.'); }
      else if (el.dataset.cloudmodel) { const r = await api('/api/settings', { cloudHelpers: { [el.dataset.cloudmodel]: { model: el.value.trim() } } }); cloud = r.cloud || cloud; flash(el, 'Saved.'); }
      else if (el.dataset.set === 'engine') { await api('/api/settings', { engine: el.value }); settings.engine = el.value; }
      else if ('pack' in el.dataset) { hw.suggestedPack = el.value; draw(); }
      else if (el.dataset.role && el.value) {
        const r = await api('/api/models/role', { job: el.dataset.role, value: el.value });
        roles.current[el.dataset.role] = el.value;
        flash(el, 'Saved.');
        if (r.needsEngine) askEngine(el.closest('td') || el.parentElement);
      }
    } catch (err) { alertIn(el, err.message); if (el.type === 'checkbox') el.checked = !el.checked; }
  });

  // The update's steps, read from the same status file the update window writes.
  let updTimer = null;
  function watchUpdate() {
    clearTimeout(updTimer);
    const box = dlg.querySelector('.update-steps');
    if (!box || !dlg.open) return;
    api('/api/update/status').then((st) => {
      if (st?.steps) {
        box.innerHTML = `<ol class="dl-steps">${st.steps.map((label, i) => { const n = i + 1; const mark = st.done || n < st.step ? '✓' : n === st.step ? (st.error ? '✗' : '●') : '○'; return `<li class="${mark === '✓' ? 'did' : mark === '○' ? '' : 'now'}">${mark} ${esc(label)}</li>`; }).join('')}</ol>
          ${st.log ? `<div class="muted mono">${esc(st.log)}</div>` : ''}${st.error ? `<p class="error">${esc(st.error)}</p>` : st.ready ? '<p class="have">Ready. Press "Restart Bob now" in the update window.</p>' : ''}`;
      }
      if (!st?.done && !st?.error) updTimer = setTimeout(watchUpdate, 1000);
    }).catch(() => { updTimer = setTimeout(watchUpdate, 2000); });
  }

  // Bob never changes engines by himself: when a model needs his own engine, ask first.
  function askEngine(where) {
    const box = document.createElement('div');
    box.className = 'confirm';
    box.innerHTML = `<p>That model is a loose file Ollama can't run. It needs Bob's own engine (llama.cpp). Switch engines? Everything else keeps working; it takes effect when Bob restarts.</p><div class="row"><button class="get" data-switchengine="llamacpp">Switch to Bob's own engine</button><button data-no>Keep Ollama</button></div>`;
    where.appendChild(box);
  }

  function flash(el, msg) {
    const s = document.createElement('span');
    s.className = 'have saved'; s.textContent = ' ' + msg;
    el.after(s); setTimeout(() => s.remove(), 3000);
  }

  function alertIn(el, msg) {
    const p = document.createElement('p');
    p.className = 'error'; p.textContent = msg;
    (el.closest('.model, .settings, .welcome, .pane') || $('cellar-body')).appendChild(p);
    setTimeout(() => p.remove(), 8000);
  }

  $('cellar-close').onclick = () => dlg.close();
  dlg.addEventListener('close', () => { sampler.stop(); stylePage.closing(settings); window.dispatchEvent(new Event('bob-caps')); });

  return {
    async open(which = 'shop', pickTab) { mode = which; if (pickTab) tab = pickTab; dlg.showModal(); draw(); await load().catch((e) => { $('cellar-body').innerHTML = `<p class="error">${esc(e.message)}</p>`; }); },
    async firstRun() {
      try { const s = await api('/api/settings'); if (!s.setupDone) this.open('welcome'); } catch {}
    },
    onDownload(ev) {
      const over = ['done', 'failed', 'cancelled', 'paused', 'retrying'].includes(ev.phase);
      if (over) live.delete(ev.id); else live.set(ev.id, ev);
      job = over ? (job?.id === ev.id ? null : job) : ev;
      if (!dlg.open) return;
      if (over && ev.queue?.length && ev.phase === 'done') return; // the next one in the queue starts by itself
      if (over) { load().then(() => { if (ev.error) alertIn($('cellar-body'), `${ev.name}: ${ev.error}`); }); return; }
      const slot = mode === 'shop' && dlg.querySelector(`#m-${CSS.escape(ev.id)} .act`);
      if (slot) slot.innerHTML = progress(ev);
      else if (mode === 'welcome') { const d = dlg.querySelector('.welcome .dl'); d ? (d.outerHTML = progress(ev)) : draw(); }
    }
  };
}
