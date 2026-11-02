// Bob's brain: runs a conversation turn, picks the right model, announces swaps,
// calls tools, asks the user for approval when needed, and keeps a logbook.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Ollama } from './ollama.js';
import { LlamaCpp } from './llamacpp.js';
import { buildTools, today, loadReminders, saveReminders } from './tools.js';
import { systemPrompt, HATS } from './persona.js';
import { paint, paintingAvailable } from './painter.js';
import { maestroMake } from './maestro.js';
import { capabilities } from './capabilities.js';
import { cloudHelpers } from './cloud.js';
import { copyName } from './clan.js';
import { RefShelf } from './refs.js';
import { makeAudio } from './audio.js';
import { runWorkflow } from './workshop.js';
import { currentSession, modelFor, laneOf, suggestSession, SESSIONS } from './sessions.js';

const MAX_STEPS = 8;
const MAX_HISTORY = 40;
const APPROVAL_TIMEOUT_MS = 10 * 60 * 1000;

// Plain names for the app's screens. Bob's own names for his hats (persona.js) stay as they are.
const PLAIN_HATS = { tinker: 'Coding', ledger: 'Spreadsheets', scout: 'Research', painter: 'Images & video', reviewer: 'Review' };
const BRAIN_NAMES = { bob: 'main', tinker: 'workbench', ledger: 'ledger', scout: 'scouting', painter: "painter's", reviewer: 'second-look', eyes: 'eyes' };

export class Brain {
  constructor(cfg, broadcast) {
    this.cfg = cfg;
    this.broadcast = broadcast;
    this.engine = cfg.engine === 'llamacpp' ? new LlamaCpp(cfg) : new Ollama(cfg);
    this.engineName = cfg.engine === 'llamacpp' ? 'llama.cpp' : 'Ollama';
    this.tools = buildTools(cfg);
    this.refs = new RefShelf(cfg);
    this.sessions = new Map();
    this.approvals = new Map();
    this.state = { state: 'idle', model: null, detail: '' };
    this.turns = new Map(); // lane -> running job. One lane normally; an Art session adds a picture lane.
    this.suggested = null;
    this.lastActivity = Date.now(); // for /api/idle
    this.queue = this.loadQueue();
    setTimeout(() => this.pump(), 1500); // pick up anything left waiting when Bob was last closed
    this.sessionDir = path.join(cfg.dataDir, 'sessions');
    fs.mkdirSync(this.sessionDir, { recursive: true });
    this.reminderTimer = setInterval(() => this.checkReminders(), 15000);
    this.reminderTimer.unref?.();
  }

  checkReminders() {
    const list = loadReminders(this.cfg);
    const due = list.filter((r) => r.at <= Date.now());
    if (!due.length) return;
    saveReminders(this.cfg, list.filter((r) => r.at > Date.now()));
    for (const r of due) {
      this.broadcast({ type: 'reminder', text: r.text, local: r.local });
      this.log('reminder', r.text);
    }
  }

  now() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: this.cfg.timeZone, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit'
    }).format(new Date());
  }

  setState(state, detail = '', model = this.state.model) {
    this.state = { state, detail, model };
    this.broadcast({ type: 'status', ...this.state });
  }

  log(kind, text) {
    const stamp = new Intl.DateTimeFormat('en-CA', { timeZone: this.cfg.timeZone, dateStyle: 'short', timeStyle: 'short', hour12: false }).format(new Date());
    const line = `- ${stamp} | ${kind} | ${String(text).replace(/\s+/g, ' ').slice(0, 200)}\n`;
    try {
      if (!fs.existsSync(this.cfg.logbook)) fs.writeFileSync(this.cfg.logbook, "# Bob's logbook\n\nEverything Bob did, newest at the bottom.\n\n");
      fs.appendFileSync(this.cfg.logbook, line);
    } catch { /* logging must never break a turn */ }
  }

  memory() {
    try {
      const m = fs.readFileSync(this.cfg.memoryFile, 'utf8');
      return m.length > 4000 ? m.slice(-4000) : m;
    } catch { return ''; }
  }

  session(id) {
    if (!this.sessions.has(id)) {
      let msgs = [];
      try { msgs = JSON.parse(fs.readFileSync(this.sessionFile(id), 'utf8')); } catch {}
      this.sessions.set(id, msgs);
    }
    return this.sessions.get(id);
  }

  sessionFile(id) { return path.join(this.sessionDir, id.replace(/[^a-zA-Z0-9-]/g, '') + '.json'); }

  saveSession(id) {
    const msgs = this.session(id);
    while (msgs.length > MAX_HISTORY) msgs.shift();
    while (msgs.length && msgs[0].role !== 'user') msgs.shift(); // never start mid tool-call
    for (const m of msgs) delete m.images; // pictures stay on the shelf; Bob keeps the description
    try { fs.writeFileSync(this.sessionFile(id), JSON.stringify(msgs)); } catch {}
  }

  history(id) {
    return this.session(id)
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && (m.content || m.media?.length))
      .map((m) => ({ role: m.role, content: m.role === 'user' && m.text != null ? m.text : (m.content || ''), ...(m.media?.length ? { media: m.media } : {}), pics: (m.refs || []).map((id) => this.refs.find(id)).filter(Boolean).map((r) => ({ name: r.name, url: `/refs/${r.file}` })) }));
  }

  // Makes sure a model is in memory, telling the user first if it means a wait.
  async ensureModel(model, emit, signal, who = 'bob', opts = {}) {
    let loaded = false;
    try { loaded = await this.engine.isLoaded(model, opts); } catch (e) { throw new Error(`I can't reach my engine, ${this.engineName} (${e.message}).`); }
    if (loaded) { this.state.model = model; return; }
    const secs = await this.engine.estimateLoad(model);
    const name = BRAIN_NAMES[who] || who;
    const text = `Switching to the ${name} brain (${model}). Back in about ${secs} seconds.`;
    emit({ type: 'announce', text, seconds: secs });
    this.setState('loading', text, model);
    const took = await this.engine.preload(model, signal, opts);
    this.log('model', `loaded ${model} in ${took.toFixed(1)} s`);
    this.setState('thinking', '', model);
  }

  async approve(need, emit, signal, group) {
    const id = crypto.randomUUID();
    const prev = this.state;
    const text = typeof need === 'string' ? need : need.text;
    this.setState('waiting', text);
    emit({ type: 'approval', id, text, diff: need.diff, allowAll: Boolean(group) });
    const allowed = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), APPROVAL_TIMEOUT_MS);
      const done = (v) => { clearTimeout(timer); this.approvals.delete(id); resolve(v); };
      this.approvals.set(id, done);
      signal.addEventListener('abort', () => done(false), { once: true });
    });
    emit({ type: 'approval-result', id, allowed: Boolean(allowed) });
    this.log('approval', `${allowed === 'all' ? 'allowed (rest of job)' : allowed ? 'allowed' : 'denied'}: ${text}`);
    this.setState(prev.state === 'waiting' ? 'thinking' : prev.state, '', prev.model);
    return allowed;
  }

  answerApproval(id, allow) {
    const done = this.approvals.get(id);
    if (!done) return false;
    done(allow === 'all' ? 'all' : Boolean(allow));
    return true;
  }

  // A session's context size, but never more than the model was made for.
  async fitCtx(model, want) {
    if (!want || !model) return want || null;
    const max = await this.engine.maxCtx?.(model).catch?.(() => null) ?? null;
    return max ? Math.min(max, want) : want;
  }

  get turn() { return this.turns.values().next().value || null; }

  // Stops one running job (by id), or everything running.
  stop(id) {
    let hit = false;
    for (const t of this.turns.values()) if (!id || t.turnId === id) { t.controller.abort(); hit = true; }
    return hit;
  }

  // Switch session (only ever from the user's click). Brains from the old session are let go so the new set fits.
  async setSession(id) {
    if (!SESSIONS[id]) throw new Error('Unknown session.');
    this.cfg.session = id;
    this.suggested = null;
    this.lastActivity = Date.now(); // for /api/idle
    if (!this.turns.size) await this.engine.unloadAll().catch(() => {});
    this.log('session', `now ${id}`);
    this.broadcast({ type: 'session', session: currentSession(this.cfg) });
    return currentSession(this.cfg);
  }

  // GPU-only models leave for the painter; in an Art session the chat brain on the processor stays.
  async clearGpu() {
    if (currentSession(this.cfg).cpu && this.engine.unloadGpu) return this.engine.unloadGpu();
    return this.engine.unloadAll();
  }

  async runTool(name, args, ctx) {
    const tool = this.tools[name];
    if (!tool) return { text: `Error: there is no tool called ${name}.` };
    if (typeof args === 'string') { try { args = JSON.parse(args); } catch { args = {}; } }
    args = args || {};
    ctx.emit({ type: 'tool', name, summary: tool.summary ? tool.summary(args) : name });
    try {
      if (tool.check) {
        const need = tool.check(args);
        const group = tool.approvalGroup;
        if (need && !(group && ctx.allowAll.has(group))) {
          const answer = await this.approve(need, ctx.emit, ctx.signal, group);
          if (!answer) return { text: 'The user said no. Do not try again; say it is fine and ask what to do instead.' };
          if (answer === 'all' && group) ctx.allowAll.add(group);
        }
      }
      const out = await tool.run(args, ctx);
      this.log('tool', tool.summary ? tool.summary(args) : name);
      return { text: String(out), endsTurn: tool.endsTurn };
    } catch (e) {
      if (ctx.signal.aborted) throw e;
      this.log('error', `${name}: ${e.message}`);
      return { text: `Error: ${e.message}` };
    }
  }

  // A personal backstory (inn\bob\backstory.md) replaces the generic one; it isn't part of the shared install.
  // Things about the user Bob should always know (their projects, how they like to work). Kept on this PC
  // only: settings "aboutUser" and/or inn\bob\about-me.md. The shipped prompts stay generic.
  about() {
    let file = '';
    try { file = fs.readFileSync(path.join(this.cfg.dataDir, 'about-me.md'), 'utf8').slice(0, 4000).trim(); } catch {}
    return [String(this.cfg.aboutUser || '').trim(), file].filter(Boolean).join('\n');
  }

  backstory() {
    try { return fs.readFileSync(path.join(this.cfg.dataDir, 'backstory.md'), 'utf8').slice(0, 4000); } catch { return ''; }
  }

  // Tell Bob plainly what this PC can't do yet, so he offers the prompt and points to the cellar instead.
  withLimits(prompt) {
    const can = capabilities(this.cfg);
    const missing = [!can.pictures && 'make pictures', !can.video && 'make video clips', !can.music && 'make music', !can.sfx && 'make sound effects', !can.hearing && 'hear voice input'].filter(Boolean);
    const helpers = cloudHelpers(this.cfg);
    if (helpers.length) prompt += `\n\nCloud copies of you that ${this.cfg.userName || 'the user'} switched on (use ask_cloud only for jobs too big for you, or when asked; each use is approved and costs money): ${helpers.map((h) => `${h.id} = ${copyName(this.cfg, 'cloud:' + h.id, 'cloud helper')}, running on ${h.name} ${h.model}`).join('; ')}.`;
    const shelf = this.refs.describe();
    if (shelf) prompt += `\n\n${shelf}`;
    if (can.pictures && !can.edits) prompt += '\n\nYour picture model can start from a reference picture but can\'t hold a character\'s exact look across new poses. If keeping a look matters, say a picture-edit model in Models and settings (left menu, Pictures) does that better.';
    return missing.length ? `${prompt}\n\nOn this PC you can't ${missing.join(', ')} yet. If asked, say so in one line, offer to write the prompt or plan instead, and mention Models and settings (left menu) where the right model can be added.` : prompt;
  }

  toolSchemas(names) {
    const who = this.cfg.userName || 'the user';
    const can = capabilities(this.cfg);
    const off = new Set([!can.pictures && 'make_image', !can.video && 'make_video', !can.music && 'make_music', !can.sfx && 'make_sound', !can.workshop && 'workshop_list', !can.workshop && 'workshop_run', !cloudHelpers(this.cfg).length && 'ask_cloud'].filter(Boolean));
    return names.filter((n) => this.tools[n] && !off.has(n)).map((n) => JSON.parse(JSON.stringify(this.tools[n].schema).replaceAll('{{USER}}', who)));
  }

  // ---- The queue: every message is its own job, run in the order sent. Nothing is dropped or cut off. ----
  // One job runs at a time (they share one graphics card); the rest wait in inn\bob\queue.json,
  // so they survive Bob being closed. Stop ends only the job that's running; a waiting job can be cancelled.
  get queueFile() { return path.join(this.cfg.dataDir, 'queue.json'); }

  loadQueue() {
    let q = [];
    try { q = JSON.parse(fs.readFileSync(this.queueFile, 'utf8')); } catch {}
    // A job that was running when Bob closed may have half-finished: don't redo it blindly, offer a retry.
    for (const j of q) if (j.state === 'working') { j.state = 'interrupted'; j.error = 'Bob was closed while this was running.'; }
    return q.filter((j) => j && j.id && j.text);
  }

  saveQueue() {
    // The list's order is the order jobs run in (the user can drag them). Finished jobs stay for a week
    // (at most 200) so the Tasks panel can show what's been completed.
    const keep = Date.now() - 7 * 864e5;
    const finished = this.queue.filter((j) => !(j.state === 'waiting' || j.state === 'working'));
    const drop = new Set(finished.filter((j) => (j.doneAt || j.at) < keep).map((j) => j.id));
    for (const j of finished.slice(0, Math.max(0, finished.length - 200))) drop.add(j.id);
    this.queue = this.queue.filter((j) => !drop.has(j.id));
    try { fs.writeFileSync(this.queueFile, JSON.stringify(this.queue, null, 1)); } catch {}
    this.broadcast({ type: 'queue', jobs: this.queueView() });
  }

  queueView() {
    return this.queue.map(({ id, sessionId, text, state, at, error, refs, kind, startedAt, doneAt, steps }) => {
      const out = (steps || []).find((x) => x.state === 'in progress');
      // Plain status for the Tasks panel: Queued, In progress, Delegated (to which copy), Completed...
      const status = state === 'waiting' ? 'queued' : state === 'working' ? (out ? 'delegated' : 'in progress') : state === 'done' ? 'completed' : state;
      return { id, sessionId, kind, text: text.slice(0, 140), state, status, at, startedAt, doneAt, error, pics: (refs || []).length,
        delegatedTo: out ? { hat: out.hat, label: out.label, copy: out.copy } : null, steps: (steps || []).slice(-8) };
    });
  }

  // Drag and drop: move a waiting job in front of another waiting job (or to the end of the line).
  // The running job stays where it is.
  moveJob(id, before) {
    const from = this.queue.findIndex((j) => j.id === id && j.state === 'waiting');
    if (from < 0 || id === before) return false;
    const [job] = this.queue.splice(from, 1);
    let at = before ? this.queue.findIndex((j) => j.id === before && j.state === 'waiting') : -1;
    if (at < 0) { at = this.queue.length; } // to the back of the line
    this.queue.splice(at, 0, job);
    this.log('queue', `moved: ${job.text.slice(0, 60)}`);
    this.saveQueue();
    return true;
  }

  // Take a finished job off the list, or clear every completed one.
  removeJob(id) {
    const n = this.queue.length;
    this.queue = this.queue.filter((j) => !(j.id === id && !['waiting', 'working'].includes(j.state)));
    if (n === this.queue.length) return false;
    this.saveQueue();
    return true;
  }

  clearCompleted() {
    this.queue = this.queue.filter((j) => !['done', 'cancelled'].includes(j.state));
    this.saveQueue();
    return true;
  }

  // A rough label so the list says what each job is about.
  static guessKind(text, hasPics = false) {
    const t = text.toLowerCase();
    // A question about a picture the user attached is a chat, not a painting job.
    if ((hasPics || /\b(this|the|that|attached|my) (picture|image|photo|pic|screenshot)\b/.test(t)) && (/\?\s*$/.test(t) || /^(what|who|where|which|how|why|is|are|can|does|do|describe|tell me)\b/.test(t))) return 'chat';
    if (/\b(video|clip|film|animate)\b/.test(t)) return 'video';
    if (/\b(paint|draw|picture|image|illustrat|render)\b/.test(t)) return 'picture';
    if (/\b(research|look up|find out|search|sources)\b/.test(t)) return 'research';
    if (/\b(code|bug|function|compile|script)\b/.test(t)) return 'code';
    if (/\b(spreadsheet|csv|table|data entry)\b/.test(t)) return 'data';
    return 'chat';
  }

  enqueue(sessionId, text, attach = []) {
    this.lastActivity = Date.now();
    const job = { id: crypto.randomUUID(), sessionId, text, refs: [].concat(attach || []).slice(0, 4), state: 'waiting', at: Date.now(), kind: Brain.guessKind(text, [].concat(attach || []).length > 0) };
    this.queue.push(job);
    this.saveQueue();
    this.log('queue', `${job.kind}: ${text}`);
    const ahead = this.queue.filter((j) => j.state === 'waiting' && j.id !== job.id).length + this.turns.size;
    queueMicrotask(() => this.pump());
    const tip = suggestSession(this.cfg, this.queue);
    if (tip && this.suggested !== tip.id) { this.suggested = tip.id; this.broadcast({ type: 'suggest', ...tip }); }
    return { jobId: job.id, turnId: job.id, ahead };
  }

  cancelJob(id) {
    const j = this.queue.find((x) => x.id === id);
    if (!j) return false;
    if (j.state === 'working') return this.stop(j.id);
    if (j.state !== 'waiting') return false;
    j.state = 'cancelled';
    this.saveQueue();
    return true;
  }

  retryJob(id) {
    const j = this.queue.find((x) => x.id === id);
    if (!j || !['interrupted', 'failed', 'cancelled'].includes(j.state)) return false;
    j.state = 'waiting'; j.error = undefined; j.at = Date.now(); j.doneAt = undefined; j.steps = [];
    this.queue = [...this.queue.filter((x) => x !== j), j]; // back of the line
    this.saveQueue();
    this.pump();
    return true;
  }

  // Starts the next waiting job in each free lane, oldest first.
  pump() {
    const seen = new Set();
    for (const job of this.queue) {
      if (job.state !== 'waiting') continue;
      const lane = laneOf(this.cfg, job);
      if (seen.has(lane)) continue;
      seen.add(lane);
      if (this.turns.has(lane)) continue;
      job.state = 'working'; job.startedAt = Date.now(); job.steps = [];
      this.saveQueue();
      this.startTurn(job.sessionId, job.text, job.refs, job, lane);
    }
  }

  // Runs one job. Progress goes out as events; when it ends, the next job starts.
  startTurn(sessionId, text, attach = [], job = null, lane = 'talk') {
    if (this.turns.has(lane)) throw new Error('busy');
    const turnId = job?.id || crypto.randomUUID();
    const controller = new AbortController();
    const emit = (ev) => this.broadcast({ ...ev, turnId, sessionId });
    this.turns.set(lane, { turnId, controller });
    emit({ type: 'start', text: text.slice(0, 140) });
    const pics = [].concat(attach || []).map((id) => this.refs.find(String(id))).filter(Boolean).slice(0, 4);
    this.run(sessionId, text, emit, controller.signal, pics, job)
      .then(() => { if (job) job.state = 'done'; })
      .catch((e) => {
        if (controller.signal.aborted) { emit({ type: 'token', text: '\n\n*(Stopped.)*' }); if (job) job.state = 'cancelled'; }
        else { emit({ type: 'error', text: e.message }); this.log('error', e.message); if (job) { job.state = 'failed'; job.error = e.message.slice(0, 200); } }
      })
      .finally(() => {
        this.saveSession(sessionId);
        this.turns.delete(lane);
        this.lastActivity = Date.now();
        emit({ type: 'done' });
        if (!this.turns.size) this.setState('idle', '');
        if (job) { job.doneAt = Date.now(); for (const st of job.steps || []) if (st.state === 'in progress') st.state = job.state === 'done' ? 'completed' : job.state; this.saveQueue(); }
        setTimeout(() => this.pump(), 0);
      });
    return turnId;
  }

  // Pictures the user attached: Bob's eyes (the "eyes" model) describe each one once, and the description
  // goes into the message, so even a text-only brain can work with them. With no eyes model set,
  // the picture goes straight to the main brain (it needs to be a vision model).
  async look(pics, emit, signal) {
    const eyes = this.cfg.models.eyes;
    const notes = [];
    let direct = [];
    for (const r of pics) {
      let seen = r.seen;
      if (!seen && eyes) {
        await this.ensureModel(eyes, emit, signal, 'eyes');
        this.setState('thinking', `Looking at ${r.name}`, eyes);
        const reply = await this.engine.chat({ model: eyes, signal, messages: [{ role: 'user', content: 'Describe this picture for an artist who has to draw it again: who or what is in it, their look (face, hair, build, clothes, colours), the setting, the lighting and the art style. Plain sentences, under 150 words.', images: [this.refs.base64(r)] }] });
        seen = (reply.content || '').trim();
        if (seen) this.refs.setSeen(r.id, seen);
      }
      if (!seen) direct.push(this.refs.base64(r));
      notes.push(`[Attached picture "${r.name}" (${r.kind}${r.kind === 'chat' ? ', not on the shelf' : ''}). It can be used as a reference by that name.${seen ? ` What it shows: ${seen}` : ''}]`);
    }
    return { note: notes.join('\n'), images: direct };
  }

  // Each job works on its own copy of the conversation and adds its messages when it ends, so two jobs
  // running side by side (Art session) never tangle each other's tool calls.
  async run(sessionId, text, emit, signal, pics = [], job = null) {
    const shared = this.session(sessionId);
    const msgs = shared.slice();
    const base = msgs.length;
    // Pictures, clips and sounds Bob makes are kept with his reply, so they're still in the chat after a
    // reload, a restart or a missed live event (they used to exist only as a live event).
    const media = [];
    const keep = (ev) => {
      if (['image', 'video', 'audio'].includes(ev.type) && typeof ev.url === 'string' && ev.url.startsWith('/images/')) media.push({ type: ev.type, url: ev.url, name: path.basename(decodeURIComponent(ev.url.slice(8))) });
      return emit(ev);
    };
    try { return await this.runOn(msgs, text, keep, signal, pics, job); }
    finally {
      if (media.length) {
        const added = msgs.slice(base);
        let reply = [...added].reverse().find((m) => m.role === 'assistant' && !m.tool_calls);
        if (!reply) { reply = { role: 'assistant', content: '' }; msgs.push(reply); }
        reply.media = [...(reply.media || []), ...media].slice(0, 24);
      }
      shared.push(...msgs.slice(base));
    }
  }

  async runOn(msgs, text, emit, signal, pics, job = null) {
    const user = { role: 'user', content: text };
    let picNote = '';
    if (pics.length) {
      const { note, images } = await this.look(pics, emit, signal);
      picNote = note;
      user.content = `${text}\n\n${note}`;
      user.refs = pics.map((r) => r.id);
      user.text = text;
      if (images.length) user.images = images;
    }
    msgs.push(user);
    this.log('chat', `${this.cfg.userName || 'User'}: ${text}`);
    // The turn's pictures travel with it, so a hat Bob hands the job to can see them too.
    const ctx = { emit, signal, brain: this, cfg: this.cfg, allowAll: new Set(), pics, picNote, msgs, turnText: text, job };
    const tools = this.toolSchemas(Object.keys(this.tools));
    const { model, cpu, think, ctx: wantCtx } = modelFor(this.cfg, 'bob');
    const brainCtx = await this.fitCtx(model, wantCtx);
    if (!model) throw new Error('I don\'t have a brain yet. Open Models and settings (in the menu on the left) and pick one; the first-time setup suggests the right one for this PC.');
    this.setState('thinking', '', this.state.model);

    for (let step = 0; step < MAX_STEPS; step++) {
      await this.ensureModel(model, emit, signal, 'bob', { cpu, ctx: brainCtx });
      this.setState('thinking', '', model);
      const sys = { role: 'system', content: this.withLimits(systemPrompt({ now: this.now(), memory: this.memory(), user: this.cfg.userName, backstory: this.backstory(), about: this.about(), cat: this.cfg.catName })) };
      const reply = await this.engine.chat({
        model, messages: [sys, ...msgs], tools, signal, cpu, think, ctx: brainCtx,
        onToken: (t) => emit({ type: 'token', text: t })
      });
      msgs.push(reply);
      if (!reply.tool_calls) return;
      let ended = false;
      for (const call of reply.tool_calls) {
        const name = call.function?.name;
        const res = await this.runTool(name, call.function?.arguments, ctx);
        msgs.push({ role: 'tool', tool_name: name, content: res.text });
        if (res.endsTurn) ended = true;
      }
      if (ended) {
        // The hat's answer was already shown to the user; keep it in the history as Bob's words.
        const last = msgs.at(-1);
        msgs.push({ role: 'assistant', content: last.content });
        if (ctx.hatNotes) { last.content = `${last.content}\n\n${ctx.hatNotes}`; ctx.hatNotes = ''; }
        return;
      }
      emit({ type: 'token', text: '\n\n' });
    }
    emit({ type: 'token', text: '\n\n(I went round in circles there. Could you say that another way?)' });
  }

  // What a hat gets besides the task: the conversation so far (newest kept whole, older trimmed to fit),
  // the user's words this turn verbatim, file paths and reference names that came up, what tools already ran
  // this turn, and the session. The front desk's small brain no longer has to copy all that into the task.
  handoff(ctx, hatCtx) {
    const msgs = ctx.msgs || [];
    if (!msgs.length) return '';
    const budget = Math.min(24000, Math.floor((hatCtx || 32768) * 3 * 0.35)); // about a third of the hat's memory
    const lastUser = msgs.map((m) => m.role).lastIndexOf('user');
    const line = (m) => {
      if (m.role === 'user') return `${this.cfg.userName || 'User'}: ${m.text ?? m.content}`;
      if (m.role === 'tool') return `(tool ${m.tool_name || ''} result: ${String(m.content).slice(0, 600)})`;
      if (m.role === 'assistant' && m.tool_calls?.length) return `(Bob used ${m.tool_calls.map((c) => c.function?.name).join(', ')})`;
      return m.role === 'assistant' && m.content ? `Bob: ${m.content}` : '';
    };
    const earlier = msgs.slice(0, Math.max(0, lastUser)).map(line).filter(Boolean);
    const thisTurn = msgs.slice(Math.max(0, lastUser) + 1).map(line).filter(Boolean);
    const kept = [];
    let used = 0;
    for (let i = earlier.length - 1; i >= 0; i--) {
      const t = earlier[i].length > 2000 && kept.length ? earlier[i].slice(0, 2000) + ' ...' : earlier[i];
      if (used + t.length > budget) break;
      kept.unshift(t); used += t.length;
    }
    const all = msgs.map((m) => String(m.text ?? m.content ?? '')).join('\n');
    const paths = [...new Set(all.match(/[A-Za-z]:\\(?:[^\\/:*?"<>|\r\n]+\\)*[^\\/:*?"<>|\s]+\.[A-Za-z0-9]{1,8}|(?<![\w.])\/(?:[^\s/"'<>|*?]+\/)+[^\s/"'<>|*?]+\.[A-Za-z0-9]{1,8}/g) || [])].slice(-12);
    const refs = [...new Set([...(ctx.pics || []).map((r) => r.name), ...msgs.flatMap((m) => (m.refs || []).map((id) => this.refs.find(id)?.name).filter(Boolean))])];
    // Files the main brain already read: passed whole (up to a limit) so the helper doesn't read them again.
    const files = [];
    msgs.forEach((m, i) => (m.tool_calls || []).forEach((c, k) => {
      if (c.function?.name !== 'read_file') return;
      let a = c.function.arguments; if (typeof a === 'string') { try { a = JSON.parse(a); } catch { a = {}; } }
      const res = msgs.slice(i + 1).filter((x) => x.role === 'tool')[k];
      if (a?.path && res && !/^Error/.test(res.content)) files.push({ path: a.path, text: String(res.content) });
    }));
    let fileRoom = Math.floor(budget / 2);
    const fileBlocks = [];
    for (const f of files.reverse()) {
      if (fileRoom < 500 || fileBlocks.some((b) => b.startsWith(`### ${f.path}\n`))) continue;
      const t = f.text.length > Math.min(6000, fileRoom) ? f.text.slice(0, Math.min(6000, fileRoom)) + '\n... (cut; read_file for the rest)' : f.text;
      fileBlocks.unshift(`### ${f.path}\n${t}`); fileRoom -= t.length;
    }
    const s = currentSession(this.cfg);
    return [
      '## Conversation so far (for context; the job is at the end)',
      kept.length ? kept.join('\n') : '(This is the start of the conversation.)',
      '',
      `## What ${this.cfg.userName || 'the user'} said this turn (verbatim)`,
      ctx.turnText || '',
      thisTurn.length ? `\n## Already done this turn\n${thisTurn.join('\n')}` : '',
      paths.length ? `\n## Files mentioned\n${paths.join('\n')}` : '',
      refs.length ? `\n## Reference pictures mentioned\n${refs.join(', ')}` : '',
      fileBlocks.length ? `\n## Files already read (no need to read them again)\n${fileBlocks.join('\n\n')}` : '',
      `\nSession: ${s.label}. ${this.cfg.userName || 'The user'} writes in ${this.cfg.language || 'English'}; answer in the same language.`,
      '', ''
    ].join('\n');
  }

  // Bob wearing a different hat: a different model and focus, same Bob.
  async runHat(hat, task, ctx) {
    if (!HATS[hat]) throw new Error(`Unknown hat ${hat}.`);
    // "One brain" mode: every hat runs on the main model, so there's no brain swap (about 20 s each) mid-chat.
    // Normal session: the hat's own brain (or the main one with "One brain"). Other sessions: the session's brain.
    const { model, cpu, think, ctx: wantCtx } = modelFor(this.cfg, hat);
    const brainCtx = await this.fitCtx(model, wantCtx);
    const copy = copyName(this.cfg, hat, HATS[hat].label);
    ctx.emit({ type: 'hat', hat, label: PLAIN_HATS[hat] || HATS[hat].label, copy });
    // The Tasks panel: this job is now delegated to a copy (in progress) until the copy hands back.
    const step = { hat, label: PLAIN_HATS[hat] || HATS[hat].label, copy, task: String(task).slice(0, 140), state: 'in progress', at: Date.now() };
    if (ctx.job) { (ctx.job.steps ||= []).push(step); this.saveQueue(); }
    try { return await this.wearHat(hat, task, ctx, { model, cpu, think, brainCtx, copy }); }
    catch (e) { step.state = ctx.signal?.aborted ? 'cancelled' : 'failed'; throw e; }
    finally {
      if (step.state === 'in progress') step.state = 'completed';
      step.doneAt = Date.now();
      if (ctx.job) this.saveQueue();
    }
  }

  async wearHat(hat, task, ctx, { model, cpu, think, brainCtx, copy }) {
    await this.ensureModel(model, ctx.emit, ctx.signal, hat, { cpu, ctx: brainCtx });
    this.setState('busy', `${copy} is on it (${PLAIN_HATS[hat] || HATS[hat].label})`, model);
    const hatTools = {
      ledger: ['save_spreadsheet', 'read_file', 'list_folder'],
      scout: ['web_search', 'fetch_page'],
      painter: ['make_image', 'make_video', 'save_reference', 'make_music', 'make_sound', 'workshop_list', 'workshop_run'],
      tinker: ['list_folder', 'read_file', 'search_files', 'edit_file', 'write_file', 'web_search', 'fetch_page'],
      reviewer: ['list_folder', 'read_file', 'search_files']
    }[hat] || [];
    const maxSteps = hat === 'tinker' ? 30 : hat === 'reviewer' ? 15 : MAX_STEPS;
    const packet = this.handoff(ctx, brainCtx);
    const userMsg = { role: 'user', content: `${packet}## The job\n${task}${ctx.picNote ? `\n\n${ctx.picNote}` : ''}` };
    // Raw pictures only go to a brain that can see; any brain still gets the Eyes descriptions above.
    if (ctx.pics?.length && await this.engine.hasVision?.(model).catch(() => false)) userMsg.images = ctx.pics.map((r) => this.refs.base64(r));
    const messages = [
      { role: 'system', content: this.withLimits(systemPrompt({ hat, now: this.now(), memory: this.memory(), user: this.cfg.userName, backstory: this.backstory(), about: this.about(), copy, cat: this.cfg.catName })) },
      userMsg
    ];
    let final = '';
    const did = []; // what this copy did, handed back to the main conversation afterwards
    for (let step = 0; step < maxSteps; step++) {
      const reply = await this.engine.chat({
        model, messages, tools: this.toolSchemas(hatTools), signal: ctx.signal, cpu, think, ctx: brainCtx,
        onToken: (t) => ctx.emit({ type: 'token', text: t })
      });
      messages.push(reply);
      final += reply.content;
      if (!reply.tool_calls) break;
      for (const call of reply.tool_calls) {
        const res = await this.runTool(call.function?.name, call.function?.arguments, ctx);
        messages.push({ role: 'tool', tool_name: call.function?.name, content: res.text });
        let a = call.function?.arguments; if (typeof a === 'string') { try { a = JSON.parse(a); } catch { a = {}; } }
        const where = a?.path || a?.url || a?.query || a?.name || '';
        did.push(`${call.function?.name}${where ? ` ${String(where).slice(0, 160)}` : ''}: ${String(res.text).replace(/\s+/g, ' ').slice(0, 240)}`);
      }
      ctx.emit({ type: 'token', text: '\n\n' });
    }
    // The return trip: the main conversation learns what the helper did, so the next turn (and the next
    // handoff) can build on it. Kept in the tool result, which the user's chat view doesn't show.
    ctx.hatNotes = did.length ? `[What ${copy} (${PLAIN_HATS[hat] || hat}) did: ${did.slice(-12).join(' | ')}]` : '';
    return final || '(No answer.)';
  }

  // Bob's own painter (stable-diffusion.cpp): no ComfyUI needed.
  async paintOwn(kind, args, ctx) {
    const video = kind === 'video';
    if (kind === 'edit' && !this.cfg.painter?.sdcpp?.exe) throw new Error('The painter (stable-diffusion.cpp) isn\'t installed yet.');
    ctx.emit({ type: 'announce', text: video
      ? 'Stepping out of the GPU so the painter can make a short clip. Video is slow: give it several minutes.'
      : 'Stepping out of the GPU so the painter can work. The picture takes about half a minute.' });
    const unloaded = await this.clearGpu();
    this.state.model = null;
    this.setState('painting', video ? 'Filming' : 'Painting', null);
    this.log(kind, `unloaded ${unloaded.join(', ') || 'nothing'}; painting with sd.cpp`);
    const { file, name } = await paint(this.cfg, kind, args, {
      signal: ctx.signal,
      onProgress: (n, total) => this.setState('painting', `${video ? 'Filming' : 'Painting'} ${n}/${total}`, null)
    });
    ctx.emit({ type: video ? 'video' : 'image', url: `/images/${encodeURIComponent(name)}`, file });
    this.setState('thinking', '', null);
    return `${video ? 'Made a clip' : 'Painted a picture'}, saved as ${file}. The user can see it in the chat.`;
  }

  // Maestro does the work in its own process; Bob steps out of the GPU first so they don't fight over memory.
  async viaMaestro(kind, args, ctx) {
    if (!this.cfg.maestro?.enabled) throw new Error('Maestro is switched off. I paint and film myself.');
    const video = kind === 'video';
    const modelType = this.cfg.maestro[kind];
    ctx.emit({ type: 'announce', text: `Stepping out of the GPU and handing this to Maestro (${modelType}). ${video ? 'Clips take a few minutes.' : 'Should be quick.'} If Maestro hasn't used this model before, it downloads it first.` });
    const unloaded = await this.clearGpu();
    this.state.model = null;
    this.setState('painting', video ? 'Maestro is filming' : 'Maestro is painting', null);
    this.log(kind, `unloaded ${unloaded.join(', ') || 'nothing'}; Maestro ${modelType}`);
    const made = await maestroMake(this.cfg, kind, { ...args, modelType }, {
      signal: ctx.signal,
      onProgress: (st) => this.setState('painting', `Maestro: ${st.phase || st.status || 'working'}${st.step && st.total_steps ? ` ${st.step}/${st.total_steps}` : st.progress != null ? ` ${Math.round(st.progress * (st.progress <= 1 ? 100 : 1))}%` : ''}`, null)
    });
    for (const m of made) ctx.emit({ type: m.video ? 'video' : 'image', url: `/images/${encodeURIComponent(m.name)}`, file: m.file });
    this.setState('thinking', '', null);
    return `Maestro made ${made.length} file(s), saved as ${made.map((m) => m.file).join(', ')}. The user can see it in the chat.`;
  }

  // Music and sound effects from the audio workshop. Same GPU manners as the painter.
  async makeSound(kind, args, ctx) {
    const music = kind === 'music';
    ctx.emit({ type: 'announce', text: music ? 'Stepping out of the GPU so the audio workshop can compose. Music takes a few minutes; the first time, it also fetches the music model.' : 'Stepping out of the GPU for a sound effect. About a minute; the first time, it also fetches the model.' });
    const unloaded = await this.clearGpu();
    this.state.model = null;
    this.setState('painting', music ? 'Composing' : 'Making a sound', null);
    this.log(kind, `unloaded ${unloaded.join(', ') || 'nothing'}; audio workshop`);
    const { file, name } = await makeAudio(this.cfg, kind, args, {
      signal: ctx.signal,
      onProgress: (n, total) => this.setState('painting', `${music ? 'Composing' : 'Making a sound'} ${Math.round((100 * n) / total)}%`, null)
    });
    ctx.emit({ type: 'audio', url: `/images/${encodeURIComponent(name)}`, file });
    this.setState('thinking', '', null);
    return `${music ? 'Made the music' : 'Made the sound'}, saved as ${file}. The user can play it in the chat.`;
  }

  // The advanced workshop: a ComfyUI workflow the user saved. ComfyUI does the work in its own process.
  async runWorkshop({ workflow, prompt, negative, reference }, ctx) {
    const refs = this.pickRefs(reference);
    ctx.emit({ type: 'announce', text: `Stepping out of the GPU and running the "${workflow}" workflow in ComfyUI.` });
    const unloaded = await this.clearGpu();
    this.state.model = null;
    this.setState('painting', `Workshop: ${workflow}`, null);
    this.log('workshop', `unloaded ${unloaded.join(', ') || 'nothing'}; ComfyUI ${workflow}`);
    const made = await runWorkflow(this.cfg, workflow, { prompt: prompt && this.withLooks(prompt, refs), negative, refs: refs.map((r) => this.refs.pathOf(r)) }, {
      signal: ctx.signal,
      onProgress: (secs) => this.setState('painting', `Workshop: ${workflow} (${secs} s)`, null)
    });
    for (const m of made) ctx.emit({ type: m.kind, url: `/images/${encodeURIComponent(m.name)}`, file: m.file });
    this.setState('thinking', '', null);
    return `The workshop made ${made.length} file(s): ${made.map((m) => m.file).join(', ')}. The user can see them in the chat.`;
  }

  // Reference names (from the shelf or this chat) to shelf entries. Unknown names are an error Bob can fix.
  pickRefs(reference) {
    const names = [].concat(reference || []).flatMap((x) => String(x).split(/\s*[,;]\s*/)).filter(Boolean).slice(0, 4);
    return names.map((n) => this.refs.find(n) || (() => { throw new Error(`There's no reference called "${n}". On the shelf: ${this.refs.list().filter((r) => r.kind !== 'chat').map((r) => r.name).join(', ') || 'nothing yet'}.`); })());
  }

  // The look of each reference, in words, added to the prompt: helps every model, even ones that can't see.
  withLooks(prompt, refs) {
    const looks = refs.filter((r) => r.seen).map((r) => `${r.name}: ${r.seen}`).join(' ');
    return looks ? `${prompt}\n\nReference look: ${looks}`.slice(0, 2000) : prompt;
  }

  async makeVideo({ reference, ...args }, ctx) {
    const refs = this.pickRefs(reference);
    if (this.cfg.maestro?.enabled && this.cfg.maestro?.video) return this.viaMaestro('video', args, ctx);
    if (!paintingAvailable(this.cfg, 'video')) throw new Error('Video isn\'t set up yet. Pick a video maker in Models and settings (left menu, Model roles). I can write the video prompt instead.');
    // The first reference becomes the opening frame; the clip moves on from there.
    if (refs.length) return this.paintOwn('video', { ...args, prompt: this.withLooks(args.prompt, refs), image: this.refs.pathOf(refs[0]) }, ctx);
    return this.paintOwn('video', args, ctx);
  }

  // mode keep_look: an edit model holds the reference's look (same character, new scene).
  // mode start_from: the reference is the starting picture and strength says how much may change.
  // A picture-edit model that's on this PC but not given the "Picture edits" job yet (its name, or '').
  async editModelWaiting() {
    if (capabilities(this.cfg).edits) return '';
    try { const r = await this.shop?.roles(); return (!r?.current?.edit && r?.options?.edit?.[0]?.label) || ''; } catch { return ''; }
  }

  // Why an edit can't be done faithfully, in words Bob passes on (instead of quietly painting something new).
  async noEditModel(what) {
    const waiting = await this.editModelWaiting();
    const fix = waiting
      ? `${waiting} is on this PC but isn't assigned to "Picture edits": Models and settings, Model roles, Picture edits (one click, or the "Use" button shown there).`
      : 'No picture-edit model is on this PC yet: Models and settings, Pictures, a picture-edit model (Qwen Image Edit), then Model roles, Picture edits.';
    return `Didn't paint anything. Editing ${what} and keeping it looking the same needs a picture-edit model. ${fix} Tell the user that plainly. Offer the alternative too: rework the picture from itself (make_image with mode start_from), where the look can drift.`;
  }

  async makeImage({ prompt, width, height, reference, mode, strength }, ctx) {
    const refs = this.pickRefs(reference);
    // A picture is attached but none was named: never paint something new by mistake when an edit was meant.
    if (!refs.length && ctx.pics?.length && mode !== 'new') {
      const names = ctx.pics.map((r) => `"${r.name}"`).join(', ');
      return `Didn't paint yet. A picture is attached to this message (${names}). To change or restyle it, call make_image again with reference [${ctx.pics.map((r) => `"${r.name}"`).join(', ')}]. To paint something new instead, call it with mode "new".`;
    }
    if (refs.length) {
      const can = capabilities(this.cfg);
      const files = refs.map((r) => this.refs.pathOf(r));
      if (can.edits && mode !== 'start_from') return this.paintOwn('edit', { prompt: this.withLooks(prompt, refs), width, height, refs: files }, ctx);
      if (!can.edits && mode !== 'start_from') return this.noEditModel(refs.map((r) => `"${r.name}"`).join(', '));
      if (!paintingAvailable(this.cfg, 'image')) throw new Error('Painting from a reference needs Bob\'s own painter (a picture model from Models and settings).');
      const out = await this.paintOwn('image', { prompt: this.withLooks(prompt, refs), width, height, image: files[0], strength: strength ?? (mode === 'start_from' ? 0.6 : 0.75) }, ctx);
      return can.edits ? out : `${out} (Reworked from ${refs[0].name} without a picture-edit model, so the look can drift.)`;
    }
    if (this.cfg.maestro?.enabled && this.cfg.painter?.engine === 'maestro' && this.cfg.maestro?.image) return this.viaMaestro('image', { prompt, width, height }, ctx);
    if (paintingAvailable(this.cfg, 'image')) return this.paintOwn('image', { prompt, width, height }, ctx);
    const c = this.cfg.comfy || {};
    if (!c.url || !c.workflowFile || !fs.existsSync(c.workflowFile)) {
      throw new Error('ComfyUI isn\'t hooked up yet (no workflow file). I can write the prompt instead.');
    }
    const wf = JSON.parse(fs.readFileSync(c.workflowFile, 'utf8'));
    const nodes = Object.entries(wf);
    const promptNode = c.promptNodeId ? wf[c.promptNodeId] : nodes.find(([, n]) => n.class_type === 'CLIPTextEncode')?.[1];
    if (!promptNode) throw new Error('The ComfyUI workflow has no prompt node I can find.');
    promptNode.inputs.text = prompt;
    for (const [, n] of nodes) {
      if (n.inputs && 'seed' in n.inputs && typeof n.inputs.seed === 'number') n.inputs.seed = Math.floor(Math.random() * 2 ** 31);
      if (n.inputs && 'noise_seed' in n.inputs && typeof n.inputs.noise_seed === 'number') n.inputs.noise_seed = Math.floor(Math.random() * 2 ** 31);
      if (/EmptyLatentImage|EmptySD3LatentImage|EmptyFlux/i.test(n.class_type || '')) {
        if (width) n.inputs.width = Math.min(2048, Math.max(256, Math.round(width / 64) * 64));
        if (height) n.inputs.height = Math.min(2048, Math.max(256, Math.round(height / 64) * 64));
      }
    }

    ctx.emit({ type: 'announce', text: 'Stepping out of the GPU so the painter can work. The picture takes about half a minute.' });
    const unloaded = await this.clearGpu();
    this.state.model = null;
    this.setState('painting', 'Painting', null);
    this.log('image', `unloaded ${unloaded.join(', ') || 'nothing'}; painting`);

    const base = c.url.replace(/\/$/, '');
    const q = await fetch(base + '/prompt', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: wf, client_id: 'bob' }), signal: ctx.signal
    });
    if (!q.ok) throw new Error(`ComfyUI refused the job (${q.status}): ${(await q.text()).slice(0, 300)}`);
    const { prompt_id } = await q.json();
    const deadline = Date.now() + (c.timeoutSeconds || 300) * 1000;
    let images = null;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1500));
      if (ctx.signal.aborted) throw new Error('Stopped.');
      const h = await (await fetch(`${base}/history/${prompt_id}`, { signal: ctx.signal })).json();
      const entry = h[prompt_id];
      if (entry?.status?.status_str === 'error') throw new Error('ComfyUI hit an error while painting.');
      if (entry?.outputs) {
        images = Object.values(entry.outputs).flatMap((o) => o.images || []);
        if (images.length) break;
      }
    }
    if (!images?.length) throw new Error('ComfyUI didn\'t finish in time.');
    const saved = [];
    for (const img of images) {
      const url = `${base}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || '')}&type=${encodeURIComponent(img.type || 'output')}`;
      const buf = Buffer.from(await (await fetch(url, { signal: ctx.signal })).arrayBuffer());
      const name = `${today(this.cfg)}-${crypto.randomUUID().slice(0, 8)}${path.extname(img.filename) || '.png'}`;
      fs.writeFileSync(path.join(this.cfg.painterDir, name), buf);
      saved.push(name);
      ctx.emit({ type: 'image', url: `/images/${encodeURIComponent(name)}`, file: path.join(this.cfg.painterDir, name) });
    }
    this.setState('thinking', '', null);
    return `Painted ${saved.length} picture(s), saved in ${this.cfg.painterDir}: ${saved.join(', ')}. The user can see it in the chat.`;
  }

  async status() {
    let loaded = [];
    let ollama = true;
    try { loaded = await this.engine.loaded(); } catch { ollama = false; }
    return { ...this.state, busy: this.turns.size > 0, session: currentSession(this.cfg), waiting: this.queue.filter((j) => j.state === 'waiting').length, ollama, engine: this.engineName, loaded, models: this.cfg.models, cloud: cloudHelpers(this.cfg).length > 0 };
  }
}
