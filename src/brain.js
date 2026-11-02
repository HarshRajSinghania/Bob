// Bob's brain: runs a conversation turn, picks the right model, announces swaps,
// calls tools, asks the user for approval when needed, and keeps a logbook.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { Ollama } from './ollama.js';
import { LlamaCpp } from './llamacpp.js';
import { buildTools, today, loadReminders, saveReminders } from './tools.js';
import { systemPrompt, HATS } from './persona.js';
import { lookPrompt } from './look.js';
import { personalityPrompt, cleanPersonality } from '../public/personality.js';
import { catPrompt, catMoment } from '../public/patches.js';
import { cleanEffort, careful, bigThinker, draftBrain, hatBrain, effortPrompt, mootOpening, runMoot, phasedWork } from './moot.js';
import { saveSettings } from './config.js';
import { paint, paintingAvailable } from './painter.js';
import { PainterServer } from './painter-server.js';
import { maestroMake } from './maestro.js';
import { capabilities } from './capabilities.js';
import { cloudHelpers } from './cloud.js';
import { copyName } from './clan.js';
import { RefShelf } from './refs.js';
import { makeAudio } from './audio.js';
import { runWorkflow } from './workshop.js';
import { currentSession, modelFor, laneOf, suggestSession, SESSIONS, sessionBrains } from './sessions.js';
import { stampMessages, keepOlder, readSummary } from './chats.js';
import { Housekeeper, hkSettings, forgetTopicTool } from './housekeeping.js';
import { handsTools, handsPrompt } from './hands.js';
import { Made, madePaths, showMadeTool } from './made.js';
import { scheduleTools } from './hands-schedules.js';
import { toolsOff, HANDS, handOn, handOffWhy, freeOn } from './hands-settings.js';
import { gate as qGate, after as qAfter, maybeAsk as qAsk, noteStrike, copyHeld } from './quarantine.js';
import { CORE, groupsFor, groupOf, guessGroups, allToolsOn, useToolsTool, fillUseTools, STICKY_TURNS, toolboxPrompt, saysCant } from './toolbox.js';
import { Gate, Ledger, safeToResume, interruptedNote, withRetry } from './handoff.js';
import { expectFrom, verifyOutput, afterTool, afterTurn } from './verify.js';
import { brainMode, chatBrain, holdsChatBrain, bigSession, isBobs, sameModel, sleepAfterText, bigGraceMs, msText } from './brain-mode.js';

const MAX_STEPS = 8;

// Honesty about Hands (1.5.4). A small brain saw an old Hands error in the chat and, instead of trying again,
// made up "the simulated OS won't let me" and even "I've opened Notepad" with no tool call at all.
const HAND_TOOLS = new Set(Object.values(HANDS).flatMap((h) => h.tools));
// Old Hands errors from earlier turns are shown to the brain as possibly out of date, so it tries again.
export function staleHandErrors(msgs, turnStart) {
  return msgs.map((m, i) => (i < turnStart && m.role === 'tool' && HAND_TOOLS.has(m.tool_name) && /^Error:/.test(String(m.content))
    ? { ...m, content: `(An earlier try failed: ${String(m.content).slice(7, 200)}. That may be out of date, because Bob's Hands can be fixed or switched on since. To do it now, call the tool again; don't repeat this.)` }
    : m));
}
// "I've opened Notepad" with no Hands tool done this turn.
export function claimsPcAction(text) {
  return /\bI(?:'ve| have|)\s+(?:just\s+|now\s+|already\s+|successfully\s+)?(?:opened|launched|started|typed|clicked|pressed|moved|copied|renamed|zipped|unzipped|ran|deleted|saved|closed)\b[^.!?\n]{0,60}\b(?:notepad|paint|app|application|window|program|file|folder|script|command|document|tab|\w+\.\w{2,4}|it for you)/i.test(String(text || ''));
}
// 1.5.11: "I was just observing a subtle loop in the file handle caching" with no tool run this turn: a made-up observation.
export function claimsObservation(text) {
  const t = String(text || '');
  if (/\b(?:earlier|last time|yesterday|before you asked)\b/i.test(t)) return false; // talking about a past turn, where a tool may have run
  return /\bI(?:'ve| have|'m| am| was|'d| had|)\s+(?:just\s+|been\s+|also\s+|quietly\s+)*(?:observ|notic|monitor|scout|measur|watch|analy[sz]|profil|scann|investigat|benchmark|keeping an eye|looking into|checking|checked|poking at|digging into)\w*\b[^.!?\n]{0,100}\b(?:system|cpu|gpu|vram|memory|ram|files?|cache|caching|loop|process(?:es)?|threads?|disk|network|logs?|queue|code|performance|utili[sz]ation|handles?|drivers?|registry|pc|computer|server|kernel|latency|throughput|background)\b/i.test(t)
    || /\b(?:CPU|GPU|VRAM|RAM|disk|network) (?:utili[sz]ation|usage|load|temperature|temps?) (?:is|are|looks?|has been|seems?)\b/i.test(t);
}
export const OBSERVE_CORRECTION = 'Nothing was actually checked in that reply. Bob said he checked, but no check ran.';
const OBSERVE_NUDGE = 'You described noticing, watching or checking something on the PC, but no tool ran this turn, so it was invented. Answer again in a line or two, using only the "Right now" line, the chat, or what {{USER}} said. No made-up system details, and no question unless you need the answer.';
// The only things he knows about the PC without a tool, so small talk has something true to stand on.
export function realState({ model, session, waiting = 0, cat, turn = 0, mem = { free: os.freemem(), total: os.totalmem() } }) {
  const gb = (b) => (b / 1e9).toFixed(1);
  return `Right now (real, from the app): you're thinking on ${model || 'no brain'}${session ? ` in the ${session} session` : ''}; ${waiting ? `${waiting} more message${waiting === 1 ? '' : 's'} waiting` : 'nothing else waiting'}; the PC's RAM is ${gb(mem.total - mem.free)} of ${gb(mem.total)} GB in use; ${catMoment(cat, turn)}.`;
}
export const CLAIM_CORRECTION = 'Nothing was actually done on the PC in that reply. Bob said he did, but no action ran.';
const CLAIM_NUDGE = 'You just said you did something on the PC, but no tool did it in this turn. Never claim that. If it should be done, call the right tool now; if you cannot, say plainly that you have not done it and why (the tool\'s own words if it gave an error).';
// Always in the front desk's prompt (slim tools or not): he lives on a real PC and, with the Apps hand on, drives it.
// The owner, 2026-11-02: "he should want to take control of the wheel". The model had said "I am the process inside
// the computer, not a remote driver... simulated environment" right after two errors.
export function realPcPrompt(cfg) {
  const who = cfg.userName || 'the user';
  const base = `You live on ${who}'s real Windows PC; the apps, windows and files are real, not a simulation (only your Idle Process workspace is make-believe). Never call the PC simulated or virtual.`;
  if (handOn(cfg, 'apps')) return `\n\n${base} Being inside the PC is exactly why you can drive it: with the Apps hand on you really do take the wheel. When ${who} says drive, take control, take the wheel, use my screen or do it in <an app>, be keen and start at once${freeOn(cfg) ? ' (you work without asking right now, so go ahead and do each step; each one is logged)' : " by showing the first step's card"}: open_app, then app_look, then app_act (add them with use_tools apps if they aren't here).${freeOn(cfg) ? '' : ` Nothing happens on the PC until ${who} clicks it.`} When the Apps hand is on, don't refuse to drive. If a step fails, tell ${who} exactly what failed and what to click, and never say a step worked unless its result says so.`;
  return `\n\n${base} Driving apps (open, click, type in them) needs the Apps hand, which is off: ${handOffWhy(cfg, 'apps')} If asked to drive, say that and offer to start as soon as it's on.`;
}
// After a doing-tool fails: one other route, then stop (asked for 2026-11-02).
export const ALT_ROUTE_NUDGE = (who) => ` (If another route could still do this, try ONE other way now: for example, if a file or command tool failed, do it in the app with the Apps hand; if the Apps hand failed, use write_file, the Files Hand or the Run Hand. Then tell ${who} which way worked, or say plainly that neither did.)`;
export const ALT_ROUTE_DONE = (who) => ` (You already tried another way this turn. Stop here and tell ${who} plainly what failed, in the tools' own words.)`;
const DOING_TOOLS = new Set(['write_file', 'edit_file', 'save_spreadsheet']);
const isLook = (name) => ['app_look', 'list_schedules'].includes(name);
const callKey = (name, args) => { let a = args; if (typeof a === 'string') { try { a = JSON.parse(a); } catch {} } return `${name}|${JSON.stringify(a ?? {})}`; };
const CANT_NUDGE = 'You now have every tool you can use on this PC. If one of them does what was asked, call it now. If none does, say so in one line; don\'t repeat yourself.';
const EMPTY_NUDGE = 'Your last reply was empty. You now have every tool you can use on this PC. Do what was asked: call the right tool now (for a picture, make_image), or answer in words.';
export const EMPTY_NOTE = 'Bob didn\'t answer that one. Send it again, or put it another way.';
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
    // Bob's own engine unloads its brain when idle; it asks here first so it never does that mid-job.
    if (this.engine instanceof LlamaCpp) this.engine.isBusy = () => this.turns.size > 0 || this.queue.some((j) => j.state === 'working');
    // The Brain toggle (1.5.2): "Always on" keeps the chat brain loaded; otherwise both engines let it go when idle.
    this.engine.holdModel = () => (holdsChatBrain(this.cfg) ? chatBrain(this.cfg).model : null);
    this.engine.keepFor = (model) => (holdsChatBrain(this.cfg) && sameModel(model, chatBrain(this.cfg).model) ? -1 : undefined);
    this.waking = null;
    this.graceTimer = null;
    this.engineName = cfg.engine === 'llamacpp' ? 'llama.cpp' : 'Ollama';
    this.tools = buildTools(cfg);
    this.refs = new RefShelf(cfg);
    this.sessions = new Map();
    this.approvals = new Map();
    this.state = { state: 'idle', model: null, detail: '' };
    this.turns = new Map(); // lane -> running job. One lane normally; an Art session adds a picture lane.
    // 1.5.12: handoffs between brains and engines go through the gate (handoff.js): one owner of the graphics card
    // at a time, actions held until their engine is really ready, failed loads retried, then a fallback.
    this.gate = new Gate(this);
    // The picture engine kept loaded between pictures (sd-server); it falls back to one-shot sd-cli by itself.
    this.painter = new PainterServer(cfg, { log: (k, m) => this.log(k, m) });
    this.suggested = null;
    this.lastActivity = Date.now(); // for /api/idle
    this.queue = this.loadQueue();
    setTimeout(() => this.pump(), 1500); // pick up anything left waiting when Bob was last closed
    this.sessionDir = path.join(cfg.dataDir, 'sessions');
    fs.mkdirSync(this.sessionDir, { recursive: true });
    this.reminderTimer = setInterval(() => this.checkReminders(), 15000);
    this.reminderTimer.unref?.();
    this.housekeeper = new Housekeeper(cfg, this);
    this.tools.forget_topic = forgetTopicTool(this);
    Object.assign(this.tools, handsTools(this), scheduleTools(this)); // Hands: off until the user turns them on (see hands-settings.js)
    this.tools.use_tools = useToolsTool(this); // the toolbox (toolbox.js): groups added only when a job needs them
    this.made = new Made(cfg); // Made by Bob (made.js): everything he made, for the side panel and show_made
    this.tools.show_made = showMadeTool(this);
    this.stickyGroups = new Map(); // chat id -> Map(group -> messages left)
    this.handApprovals = new Set(); // approvals waiting that came from a Hand, so Stop everything can deny them
    // Always on: load the small brain shortly after start-up. Wake when I type (the default) loads nothing.
    if (holdsChatBrain(cfg)) { const t = setTimeout(() => this.wake('always on').catch(() => {}), 4000); t.unref?.(); }
  }

  // ---------- Keep Bob light (1.5.2) ----------
  // Loads the chat brain ahead of a message: someone started typing, or "Always on" wants it back after a job.
  // Never during a job. Returns true when it loaded something.
  async wake(reason = 'typing') {
    if (this.waking) return this.waking;
    if (this.turns.size) return false;
    const { model, cpu, ctx: want } = chatBrain(this.cfg);
    if (!model) return false;
    clearTimeout(this.graceTimer);
    this.waking = (async () => {
      const ctx = await this.fitCtx(model, want);
      let loaded = false;
      try { loaded = await this.engine.isLoaded(model, { cpu, ctx }); } catch { return false; }
      if (loaded) { this.engine.touch?.(model, { cpu, ctx })?.catch?.(() => {}); return false; }
      this.setState('waking', 'Waking up...', model);
      this.broadcast({ type: 'brain' });
      const took = await this.engine.preload(model, undefined, { cpu, ctx });
      this.log('model', `woke ${model} in ${took.toFixed(1)} s (${reason})`);
      return true;
    })();
    try { return await this.waking; }
    catch (e) { this.log('model', `couldn't wake ${model}: ${e.message}`); return false; }
    finally {
      this.waking = null;
      if (!this.turns.size) this.setState('idle', '', this.state.model);
      this.broadcast({ type: 'brain' });
    }
  }

  // After a job: big brains go right away; the chat brain stays only if "Always on" holds it (and comes back
  // if a big brain pushed it out). Only Bob's own brains are touched, never another app's.
  async settle() {
    if (this.turns.size || this.waking || this.queue.some((j) => j.state === 'waiting')) return [];
    const chat = chatBrain(this.cfg).model;
    let loaded = [];
    try { loaded = await this.engine.loaded(); } catch { return []; }
    const gone = [];
    for (const m of loaded) {
      if (this.turns.size) break; // a new job started: leave the rest to it
      if (!isBobs(this.cfg, m.name) && !sameModel(m.name, chat)) continue;
      if (sameModel(m.name, chat)) continue; // the chat brain: held, or let go by the idle timer / grace below
      gone.push(...(await (this.engine.unload ? this.engine.unload(m.name) : this.engine.unloadAll()).catch(() => [])));
    }
    if (gone.length) this.log('model', `let go of ${gone.join(', ')} after the job`);
    clearTimeout(this.graceTimer);
    // Coding and Deep thought: the chat brain is a big one. A short grace for a follow-up question, then it goes.
    if (bigSession(this.cfg) && loaded.some((m) => sameModel(m.name, chat))) {
      this.graceTimer = setTimeout(async () => {
        if (this.turns.size || this.waking) return;
        const g = await (this.engine.unload ? this.engine.unload(chat) : this.engine.unloadAll()).catch(() => []);
        if (g.length) { this.log('model', `let go of ${g.join(', ')} (big brain, idle)`); this.broadcast({ type: 'brain' }); }
      }, bigGraceMs(this.cfg));
      this.graceTimer.unref?.();
    }
    if (holdsChatBrain(this.cfg) && !this.turns.size) await this.wake('always on');
    this.broadcast({ type: 'brain' });
    return gone;
  }

  // The toggle changed: Always on loads the chat brain now; Wake when I type starts the idle clock on it.
  async applyBrainMode() {
    if (holdsChatBrain(this.cfg)) return this.wake('always on');
    const { model, cpu, ctx: want } = chatBrain(this.cfg);
    if (model && !this.turns.size) { const ctx = await this.fitCtx(model, want); await this.engine.touch?.(model, { cpu, ctx })?.catch?.(() => {}); }
    this.broadcast({ type: 'brain' });
    return false;
  }

  // For the label on the chat page: asleep, waking, awake or working, and how much memory Bob's brains hold.
  async brainStatus() {
    let loaded = [], engineOk = true;
    try { loaded = await Promise.race([this.engine.loaded(), new Promise((r) => setTimeout(() => r([]), 3000))]); } catch { engineOk = false; }
    const chat = chatBrain(this.cfg);
    const mine = loaded.filter((m) => isBobs(this.cfg, m.name) || sameModel(m.name, chat.model));
    const gb = (b) => Math.round((b || 0) / 1e8) / 10;
    // gb: on the graphics card; ramGB: the part in system memory (RAM), when the engine says how it splits.
    const models = mine.map((m) => {
      const split = m.split !== false && m.size > 0;
      const ramGB = split ? gb(Math.max(0, m.size - (m.vram || 0))) : null;
      return { name: m.name, gb: split ? gb(m.vram || 0) : gb(m.vram || m.size), ramGB, onCard: m.vram > 0 || (!m.vram && !chat.cpu && !split), chat: sameModel(m.name, chat.model) };
    });
    const ramKnown = models.some((m) => m.ramGB != null);
    const state = this.waking ? 'waking' : this.turns.size ? 'working' : models.length ? 'awake' : 'asleep';
    let wakeSeconds = null;
    try { if (chat.model) wakeSeconds = await this.engine.estimateLoad(chat.model); } catch {}
    return {
      mode: brainMode(this.cfg), holds: holdsChatBrain(this.cfg), bigSession: bigSession(this.cfg), session: currentSession(this.cfg).label,
      state, models, gb: Math.round(models.reduce((a, m) => a + m.gb, 0) * 10) / 10, ramGB: ramKnown ? Math.round(models.reduce((a, m) => a + (m.ramGB || 0), 0) * 10) / 10 : null,
      chatBrain: chat.model || null, sleepAfter: sleepAfterText(this.cfg), bigGrace: msText(bigGraceMs(this.cfg)), wakeSeconds, engineOk,
      handoff: this.gate?.flags() || null // who has the graphics card, what's loading, how many wait (ready flags)
    };
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
    const msgs = stampMessages(this.session(id));
    // Bob reads the last 40 messages every turn. Older ones move to the chat's older file (word for word)
    // and the housekeeper sums them up when Bob is idle; they used to be dropped without a trace.
    const dropped = [];
    while (msgs.length > MAX_HISTORY) dropped.push(msgs.shift());
    while (msgs.length && msgs[0].role !== 'user') dropped.push(msgs.shift()); // never start mid tool-call
    if (dropped.length) { try { keepOlder(this.cfg, id, dropped); } catch {} }
    for (const m of msgs) delete m.images; // pictures stay on the shelf; Bob keeps the description
    try { fs.writeFileSync(this.sessionFile(id), JSON.stringify(msgs)); } catch {}
  }

  history(id) {
    return this.session(id)
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && (m.content || m.media?.length))
      .map((m) => ({ role: m.role, id: m.id, at: m.at, ...(m.forgotten ? { forgotten: true } : {}), content: m.role === 'user' && m.text != null ? m.text : (m.content || ''), ...(m.media?.length ? { media: m.media } : {}), ...(m.correction ? { correction: m.correction } : {}), pics: (m.refs || []).map((id) => this.refs.find(id)).filter(Boolean).map((r) => ({ name: r.name, url: `/refs/${r.file}` })) }));
  }

  // Makes sure a model is in memory, telling the user first if it means a wait. Goes through the gate: the action
  // waits for the card, the brain is checked ready after loading, a failed load is tried again, and a brain that
  // still won't load hands the job to the main brain. Returns the model that's really loaded (use that one).
  async ensureModel(model, emit, signal, who = 'bob', opts = {}) {
    if (this.waking) await this.waking.catch(() => {}); // typing already started loading it: don't load twice
    clearTimeout(this.graceTimer);
    if (!signal) { try { await this.engine.isLoaded(model, opts); } catch (e) { throw new Error(`I can't reach my engine, ${this.engineName} (${e.message}).`); } }
    const name = BRAIN_NAMES[who] || who;
    const used = await this.gate.need({ id: 'brain', model, opts }, {
      signal, emit, who,
      announce: async (m, attempt) => {
        const secs = await this.engine.estimateLoad(m).catch(() => 15);
        const text = attempt ? `That didn't load right. Trying the ${this.brainLabel(m, who)} again, about ${secs} seconds.` : `Switching to the ${name} brain (${m}). Back in about ${secs} seconds.`;
        emit({ type: 'announce', text, seconds: secs });
        this.setState('loading', text, m);
      }
    }).catch((e) => {
      if (/^Stopped\.$/.test(e.message)) throw e;
      if (/ECONNREFUSED|fetch failed|can't reach/i.test(e.message)) throw new Error(`I can't reach my engine, ${this.engineName} (${e.message}).`);
      throw e;
    });
    this.state.model = used;
    if (this.state.state === 'loading' || this.state.state === 'waiting') { this.log('model', `loaded ${used}`); this.setState('thinking', '', used); }
    return used;
  }

  // How a brain is named to the user: its Equip slot and its catalog name, never a model id.
  // "Coding brain (Qwen3 Coder 30B)", "Quick brain (Gemma 4 E4B)", "Brain (Gemma 4 26B)".
  brainLabel(model, who = 'bob') {
    const SLOT = { bob: 'Brain', small: 'Quick brain', deep: 'Deep thinking', tinker: 'Coding', reviewer: 'Review', eyes: 'Seeing pictures', ledger: 'Spreadsheets', scout: 'Research', painter: 'Prompt writer' };
    let slot = who;
    if (who === 'bob') slot = sameModel(model, this.cfg.models?.small) ? 'small' : sameModel(model, sessionBrains(this.cfg).deep) && !sameModel(model, this.cfg.models?.bob) ? 'deep' : 'bob';
    const s = SLOT[slot] || 'Brain';
    const phrase = /brain$/i.test(s) ? s : `${s} brain`;
    if (!this.catalogNames) {
      this.catalogNames = [];
      try { this.catalogNames = JSON.parse(fs.readFileSync(this.cfg.catalogFile || new URL('../catalog.json', import.meta.url), 'utf8')).models.filter((x) => x.ollama && x.name).map((x) => [x.ollama, x.name]); } catch {}
    }
    const nice = this.catalogNames.find(([id]) => sameModel(id, model))?.[1] || String(model || '').replace(/:latest$/, '');
    return `${phrase} (${nice})`;
  }

  // The brain a job falls back to when another brain won't load.
  fallbackBrain() { return chatBrain(this.cfg); }

  // A chat call that survives the engine dropping out mid-answer: the brain is loaded again and the call made once more.
  async chatSafe(opts, { emit, who = 'bob' } = {}) {
    try { return await this.engine.chat(opts); }
    catch (e) {
      if (opts.signal?.aborted) throw e;
      let alive = true;
      try { alive = await this.engine.isLoaded(opts.model, { cpu: opts.cpu, ctx: opts.ctx }); } catch { alive = false; }
      if (alive && !/ECONNRESET|socket hang up|fetch failed|terminated|ECONNREFUSED/i.test(e.message)) throw e;
      this.log('handoff', `${opts.model} dropped out mid-answer (${e.message}); loading it again`);
      this.gate.ledgerOf(opts.signal)?.step('retry', { what: opts.model, why: e.message }).done();
      emit?.({ type: 'token', text: '\n\nMy brain dropped out there. Loading it again and picking up where I left off.\n\n' });
      const model = (await this.ensureModel(opts.model, emit || (() => {}), opts.signal, who, { cpu: opts.cpu, ctx: opts.ctx })) || opts.model;
      return this.engine.chat({ ...opts, model });
    }
  }

  // Asks the user. need: a string, or { text, diff, plan, command, cwd } (plan = rows the user can tick one by one,
  // command = the exact command line). Resolves false, true or 'all'; when the card had rows, out.picked holds
  // the ids the user ticked (null = all of them).
  async approve(need, emit, signal, group, { hand = false, out = {} } = {}) {
    const id = crypto.randomUUID();
    const prev = this.state;
    const text = typeof need === 'string' ? need : need.text;
    this.setState('waiting', text);
    const card = { type: 'approval', id, text, diff: need.diff, allowAll: Boolean(group) };
    if (Array.isArray(need.plan)) card.plan = need.plan;
    if (need.command) { card.command = need.command; card.cwd = need.cwd || ''; if (need.button) card.button = String(need.button).slice(0, 30); }
    if (hand) card.hand = true;
    emit(card);
    if (hand) this.handApprovals.add(id);
    let picked = null;
    const allowed = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), APPROVAL_TIMEOUT_MS);
      const done = (v, rows) => { clearTimeout(timer); this.approvals.delete(id); this.handApprovals.delete(id); picked = rows ?? null; resolve(v); };
      this.approvals.set(id, done);
      signal.addEventListener('abort', () => done(false), { once: true });
    });
    if (Array.isArray(need.plan)) {
      const ok = new Set(need.plan.filter((r) => !r.blocked).map((r) => r.id));
      out.picked = Array.isArray(picked) ? picked.map(String).filter((x) => ok.has(x)) : null;
      if (allowed && out.picked && !out.picked.length) { emit({ type: 'approval-result', id, allowed: false }); this.log('approval', `nothing ticked: ${text}`); this.setState(prev.state === 'waiting' ? 'thinking' : prev.state, '', prev.model); return false; }
    }
    emit({ type: 'approval-result', id, allowed: Boolean(allowed) });
    const rowsNote = Array.isArray(need.plan) && out.picked ? ` (${out.picked.length} of ${need.plan.length} rows ticked)` : '';
    this.log('approval', `${allowed === 'all' ? 'allowed (rest of job)' : allowed ? 'allowed' : 'denied'}: ${text}${need.command ? ` [${need.command}]` : ''}${allowed ? rowsNote : ''}`);
    this.setState(prev.state === 'waiting' ? 'thinking' : prev.state, '', prev.model);
    return allowed;
  }

  // rows: for a card with a plan, the ids of the rows the user ticked.
  answerApproval(id, allow, rows) {
    const done = this.approvals.get(id);
    if (!done) return false;
    done(allow === 'all' ? 'all' : Boolean(allow), Array.isArray(rows) ? rows.slice(0, 1000).map(String) : null);
    return true;
  }

  // Stop everything: every Hand card that's waiting is answered No.
  denyHands() {
    let n = 0;
    for (const id of [...this.handApprovals]) { const done = this.approvals.get(id); if (done) { done(false); n++; } }
    this.handApprovals.clear();
    return n;
  }

  saveHands(next) {
    saveSettings(this.cfg, { hands: next });
    this.broadcast?.({ type: 'hands', settings: next });
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
    if (!this.turns.size) { await this.engine.unloadAll().catch(() => {}); await this.painter?.unload?.('session switch', { force: true }).catch?.(() => {}); }
    this.log('session', `now ${id}`);
    if (holdsChatBrain(this.cfg)) this.wake('always on').catch(() => {});
    this.broadcast({ type: 'session', session: currentSession(this.cfg) });
    return currentSession(this.cfg);
  }

  // GPU-only models leave for the painter; in an Art session the chat brain on the processor stays.
  async clearGpu() {
    if (currentSession(this.cfg).cpu && this.engine.unloadGpu) return this.engine.unloadGpu();
    return this.engine.unloadAll();
  }

  // Every tool call goes through here. Quarantine (quarantine.js, opt-in) watches before and after; it's a few counters.
  async runTool(name, args, ctx) {
    const tool = this.tools[name];
    if (typeof args === 'string') { try { args = JSON.parse(args); } catch { args = {}; } }
    args = args || {};
    const held = await qGate(this, name, args, ctx, tool);
    if (held) { qAfter(this, name, args, held.text, ctx, tool); return held; }
    const res = await this.runToolNow(name, args, ctx, tool);
    qAfter(this, name, args, res.text, ctx, tool);
    return res;
  }

  async runToolNow(name, args, ctx, tool) {
    if (!tool) return { text: `Error: there is no tool called ${name}.` };
    if (!this.usable(name)) {
      const hand = Object.entries(HANDS).find(([, h]) => h.tools.includes(name))?.[0];
      return { text: hand ? handOffWhy(this.cfg, hand) : `Error: ${name} can't be used on this PC right now.` };
    }
    ctx.emit({ type: 'tool', name, summary: tool.summary ? tool.summary(args) : name });
    try {
      ctx.picked = null;
      if (tool.check) {
        const need = await tool.check(args, ctx);
        const group = typeof tool.approvalGroup === 'function' ? tool.approvalGroup(args) : tool.approvalGroup;
        // "Let Bob work without asking" (Settings, Hands; off by default): no card, but the hard limits in check()
        // still apply, every action still goes in the logbook and the chat, and ✋ Hands turns it off at once.
        // Tools marked alwaysAsk (cloud helpers: they cost money) still show their card.
        if (need && !tool.alwaysAsk && freeOn(this.cfg)) {
          const text = typeof need === 'string' ? need : need.text;
          this.log('approval', `done without asking: ${text}${need.command ? ` [${need.command}]` : ''}`);
          ctx.emit({ type: 'auto-approved', text, command: need.command || '', rows: Array.isArray(need.plan) ? need.plan.filter((r) => !r.blocked).length : null });
        } else if (need && !(group && ctx.allowAll.has(group))) {
          const hand = Boolean(need && typeof need === 'object' && (need.plan || need.command));
          const out = {};
          const answer = await this.approve(need, ctx.emit, ctx.signal, group, { hand, out });
          if (!answer) { ctx.ledger?.action(name, args, true, 'declined'); return { text: 'The user said no. Do not try again; say it is fine and ask what to do instead.' }; }
          if (answer === 'all' && group) ctx.allowAll.add(group);
          if (Array.isArray(need.plan)) ctx.picked = out.picked ?? null;
        }
      }
      const startedAt = Date.now();
      ctx.currentTool = name;
      ctx.made = null;
      let text;
      try { text = String(await tool.run(args, ctx)); }
      catch (e) { if (ctx.signal.aborted) throw e; text = `Error: ${e.message}`; }
      // The system checks it really happened (verify.js): a missing or broken output, or an action that didn't take,
      // gets one more go before Bob is told it failed. Approvals aren't asked twice.
      if (ctx.ledger) ctx.ledger.toolStart = startedAt;
      let v = await this.checkTool(name, args, text, ctx);
      if (v.retry && !ctx.signal.aborted) {
        this.log('handoff', `${name} didn't take (${v.why || 'no proof'}); trying it once more`);
        ctx.ledger?.step('retry', { what: name, why: v.why || '' }).done();
        ctx.ledger?.action(name, args, false, text, startedAt, v);
        if (ctx.ledger) ctx.ledger.toolStart = Date.now();
        try { text = String(await tool.run(args, ctx)); }
        catch (e) { if (ctx.signal.aborted) throw e; text = `Error: ${e.message}`; }
        v = await this.checkTool(name, args, text, ctx);
        if (v.retry) v = { ...v, ok: false, text: v.text || `Error: ${name} was tried twice and still didn't take (${v.why || 'no proof it worked'}).` };
      }
      if (v.text) text = v.text;
      for (const o of v.show || []) if (o?.file) await this.deliver(ctx, o.type || 'image', o.file);
      ctx.currentTool = null;
      const ok = v.ok !== false && !/^Error:/.test(text);
      ctx.ledger?.action(name, args, ok || Boolean(v.declined), text, startedAt, v);
      this.log(ok ? 'tool' : 'error', ok ? (tool.summary ? tool.summary(args) : name) : `${name}: ${text.replace(/^Error:\s*/, '')}`);
      // Files the tool saved or made (write_file, spreadsheets, Hands copies and zips...): on the Made by Bob
      // list, and a card with a preview in the chat that opens in the side panel.
      const paths = ok ? [...new Set([...(ctx.made || []), ...madePaths(name, text)])].slice(0, 6) : [];
      ctx.made = null;
      if (paths.length) {
        const items = paths.map((p) => { try { return this.made.add(p, { tool: name, chat: ctx.sessionId }); } catch { return null; } }).filter(Boolean);
        if (items.length) ctx.emit({ type: 'made', items });
      }
      return { text, endsTurn: tool.endsTurn };
    } catch (e) {
      ctx.currentTool = null;
      if (ctx.signal.aborted) throw e;
      this.log('error', `${name}: ${e.message}`);
      return { text: `Error: ${e.message}` };
    }
  }

  // verify.js's check of one tool run; a check that itself breaks never breaks the turn.
  async checkTool(name, args, text, ctx) {
    try { return (await afterTool(name, args, text, ctx)) || { ok: true }; } catch (e) { this.log('handoff', `check of ${name} broke: ${e.message}`); return { ok: true }; }
  }

  // The end of a turn: the user asked for something (a picture, to see one, an app action). If it didn't happen,
  // Bob gets one more go (again = true) with the tools it needs; if it still didn't, the user is told plainly.
  // Returns true when the turn should go round once more.
  checkTurn(ctx, reply, again) {
    let v = null;
    try { v = afterTurn(ctx, reply?.content || ''); } catch (e) { this.log('handoff', `end-of-turn check broke: ${e.message}`); }
    if (!v) return false;
    if (v.strike) { try { noteStrike(this, ctx, v.strike === 'claim' ? 'claims' : v.strike, v.note || v.nudge || ''); } catch {} }
    if (v.nudge && again && !ctx.ledger.nudged) {
      ctx.ledger.nudged++;
      // A claim with nothing behind it is corrected at once, as well as the second go.
      if (v.note) { ctx.emit({ type: 'correction', text: v.note }); if (reply) reply.correction = reply.correction ? `${reply.correction} ${v.note}` : v.note; }
      for (const g of v.groups || []) if (groupsFor(this)[g]) ctx.loaded.add(g);
      ctx.msgs.push({ role: 'system', content: v.nudge, hidden: true });
      ctx.ledger.step('retry', { what: 'turn', why: v.nudge }).done();
      this.log('handoff', `asked for ${ctx.ledger.expect?.kind || 'something'} and it didn't happen; one more go`);
      ctx.emit({ type: 'token', text: '\n\n' });
      return true;
    }
    const note = v.note || ''; // a nudge with no second go left: the caller's own note (or the hat's answer) stands
    if (note) {
      ctx.emit({ type: 'correction', text: note });
      if (reply) reply.correction = reply.correction ? `${reply.correction} ${note}` : note;
      ctx.ledger.step('note', { what: note }).done();
      ctx.ledger.noted = true;
      this.log('handoff', note);
    }
    return false;
  }

  // Shows a file Bob made, once it's checked to be real. Returns false (and says why) when it isn't.
  async deliver(ctx, type, file) {
    const v = await verifyOutput(file, type).catch((e) => ({ ok: false, why: e.message }));
    if (!v.ok) { this.log('handoff', `${path.basename(file)} wasn't shown: ${v.why}`); return false; }
    const name = path.basename(file);
    // Only files in Bob's pictures folder have a link the chat can show.
    if (path.resolve(path.dirname(file)) !== path.resolve(this.cfg.painterDir)) return false;
    ctx.emit({ type, url: `/images/${encodeURIComponent(name)}`, file });
    return true;
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
  withLimits(prompt, loaded = null) {
    const can = capabilities(this.cfg);
    const missing = [!can.pictures && 'make pictures', !can.video && 'make video clips', !can.music && 'make music', !can.sfx && 'make sound effects', !can.hearing && 'hear voice input'].filter(Boolean);
    const helpers = cloudHelpers(this.cfg);
    // The Hands line only when a Hand group is added (or for hats and "all tools at once"); otherwise use_tools lists them.
    if (!loaded || allToolsOn(this.cfg) || Object.keys(HANDS).some((h) => loaded.has(h))) prompt += handsPrompt(this.cfg);
    if (loaded) prompt += realPcPrompt(this.cfg) + toolboxPrompt(this, loaded);
    // "Show me a picture of X" once got no answer at all (2026-11-02): say plainly that make_image is the way.
    if ((!loaded || allToolsOn(this.cfg) || loaded.has('pictures')) && this.usable('make_image')) prompt += `\n\nWhen ${this.cfg.userName || 'the user'} asks to see, show, make, draw or paint a picture, call make_image yourself straight away with a good prompt.`;
    if (helpers.length) prompt += `\n\nCloud copies of you that ${this.cfg.userName || 'the user'} switched on (use ask_cloud only for jobs too big for you, or when asked; each use is approved and costs money): ${helpers.map((h) => `${h.id} = ${copyName(this.cfg, 'cloud:' + h.id, 'cloud helper')}, running on ${h.name} ${h.model}`).join('; ')}.`;
    const shelf = this.refs.describe();
    if (shelf) prompt += `\n\n${shelf}`;
    if (can.pictures && !can.edits) prompt += '\n\nYour picture model can start from a reference picture but can\'t hold a character\'s exact look across new poses. If keeping a look matters, say a picture-edit model in Get models (left menu, Pictures & video) does that better.';
    return missing.length ? `${prompt}\n\nOn this PC you can't ${missing.join(', ')} yet. If asked, say so in one line, offer to write the prompt or plan instead, and mention Get models (left menu) where the right model can be added.` : prompt;
  }

  // Tools this PC can't use right now (no picture model, Hand switched off, no cloud helper...).
  offTools() {
    let can = {};
    try { can = capabilities(this.cfg); } catch {}
    return new Set([!can.pictures && 'make_image', !can.video && 'make_video', !can.music && 'make_music', !can.sfx && 'make_sound', !can.workshop && 'workshop_list', !can.workshop && 'workshop_run', !cloudHelpers(this.cfg).length && 'ask_cloud', ...toolsOff(this.cfg)].filter(Boolean));
  }
  usable(name, off = this.offTools()) { return Boolean(this.tools[name]) && !off.has(name); }

  toolSchemas(names) {
    const who = this.cfg.userName || 'the user';
    const off = this.offTools();
    return names.filter((n) => n !== 'use_tools' && this.usable(n, off)).map((n) => JSON.parse(JSON.stringify(this.tools[n].schema).replaceAll('{{USER}}', who)));
  }

  // The front desk's tools for this step: the core, plus the groups added so far this turn (toolbox.js).
  // With "Give Bob all his tools at once" on, every usable tool, the way it was before.
  frontDeskTools(loaded) {
    if (allToolsOn(this.cfg)) return this.toolSchemas(Object.keys(this.tools));
    const groups = groupsFor(this);
    const names = [...CORE, ...[...loaded].flatMap((g) => groups[g]?.tools || [])];
    const list = this.toolSchemas([...new Set(names)]);
    const use = fillUseTools(this.tools.use_tools.schema, groups, loaded);
    if (use) list.push(use);
    return list;
  }

  // Which groups start loaded this turn: the ones the user's words point at, plus ones this chat used lately.
  startGroups(sessionId, text) {
    const loaded = new Set(guessGroups(this, text));
    const sticky = this.stickyGroups.get(sessionId);
    if (sticky) for (const [g, left] of sticky) { if (left > 0) loaded.add(g); }
    return loaded;
  }

  // After a turn: groups used this turn stay for the next few messages; the rest count down.
  keepGroups(sessionId, used) {
    if (!sessionId) return;
    const sticky = this.stickyGroups.get(sessionId) || new Map();
    for (const [g, left] of sticky) { if (left <= 1) sticky.delete(g); else sticky.set(g, left - 1); }
    for (const g of used) sticky.set(g, STICKY_TURNS);
    this.stickyGroups.set(sessionId, sticky);
    if (this.stickyGroups.size > 50) this.stickyGroups.delete(this.stickyGroups.keys().next().value);
  }

  // ---- The queue: every message is its own job, run in the order sent. Nothing is dropped or cut off. ----
  // One job runs at a time (they share one graphics card); the rest wait in inn\bob\queue.json,
  // so they survive Bob being closed. Stop ends only the job that's running; a waiting job can be cancelled.
  get queueFile() { return path.join(this.cfg.dataDir, 'queue.json'); }

  loadQueue() {
    let q = [];
    try { q = JSON.parse(fs.readFileSync(this.queueFile, 'utf8')); } catch {}
    // A job that was running when Bob closed may have half-finished: don't redo it blindly. Its ledger says what it did.
    // With "Pick up unfinished jobs after a restart" on (off by default), one that changed nothing on the PC starts again.
    for (const j of q) if (j.state === 'working') {
      if (this.cfg?.resumeJobs === true && safeToResume(j) && !j.resumed) { j.state = 'waiting'; j.resumed = true; j.steps = []; j.at = Date.now(); }
      else { j.state = 'interrupted'; j.error = interruptedNote(j); }
    }
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
    return this.queue.map(({ id, sessionId, text, state, at, error, refs, kind, startedAt, doneAt, steps, effort }) => {
      const out = (steps || []).find((x) => x.state === 'in progress');
      // Plain status for the Tasks panel: Queued, In progress, Delegated (to which copy), Completed...
      const status = state === 'waiting' ? 'queued' : state === 'working' ? (out ? 'delegated' : 'in progress') : state === 'done' ? 'completed' : state;
      return { id, sessionId, kind, text: text.slice(0, 140), state, status, at, startedAt, doneAt, error, pics: (refs || []).length,
        delegatedTo: out ? { hat: out.hat, label: out.label, copy: out.copy } : null, steps: (steps || []).slice(-8), effort: effort || 'low' };
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

  enqueue(sessionId, text, attach = [], effort = 'low') {
    this.lastActivity = Date.now();
    this.housekeeper?.pause(); // anything the housekeeper was asking the brain gives way at once
    const job = { id: crypto.randomUUID(), sessionId, text, refs: [].concat(attach || []).slice(0, 4), state: 'waiting', at: Date.now(), kind: Brain.guessKind(text, [].concat(attach || []).length > 0), effort: cleanEffort(effort) };
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
        this.gate.done(controller.signal); // the graphics card goes to the next job waiting for it
        this.turns.delete(lane);
        this.lastActivity = Date.now();
        emit({ type: 'done' });
        if (!this.turns.size) this.setState('idle', '');
        if (job) { job.doneAt = Date.now(); for (const st of job.steps || []) if (st.state === 'in progress') st.state = job.state === 'done' ? 'completed' : job.state; this.saveQueue(); }
        setTimeout(() => this.pump(), 0);
        setTimeout(() => this.settle().catch(() => {}), 0); // after pump, so a waiting job keeps its brain
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
        const sees = (await this.ensureModel(eyes, emit, signal, 'eyes')) || eyes;
        this.setState('thinking', `Looking at ${r.name}`, sees);
        const reply = await this.chatSafe({ model: sees, signal, messages: [{ role: 'user', content: 'Describe this picture for an artist who has to draw it again: who or what is in it, their look (face, hair, build, clothes, colours), the setting, the lighting and the art style. Plain sentences, under 150 words.', images: [this.refs.base64(r)] }] }, { emit, who: 'eyes' });
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
    const out = {};
    const keep = (ev) => {
      if (['image', 'video', 'audio'].includes(ev.type) && typeof ev.url === 'string' && ev.url.startsWith('/images/')) {
        if (media.some((m) => m.url === ev.url)) return; // delivered once already
        media.push({ type: ev.type, url: ev.url, name: path.basename(decodeURIComponent(ev.url.slice(8))) });
        out.ctx?.ledger?.output(ev, out.ctx.currentTool || null);
      }
      // Saved files and things called up with show_made: kept as cards with the reply.
      if (ev.type === 'made') for (const x of ev.items || []) if (x?.url && !media.some((m) => m.url === x.url)) { media.push({ type: 'file', kind: x.kind, url: x.url, name: x.name, path: x.path }); out.ctx?.ledger?.output({ type: 'file', file: x.path, url: x.url }, out.ctx.currentTool || null); }
      return emit(ev);
    };
    try {
      // High and Extreme effort: Bob calls a moot. The draft comes first (runOn), then his reviewer copy checks it.
      if (careful(job)) emit({ type: 'announce', text: mootOpening(this.cfg, job.effort, base) });
      await this.runOn(msgs, text, keep, signal, pics, job, sessionId, out);
      if (careful(job) && out.ctx && !signal?.aborted) await runMoot(this, { msgs, base, emit: keep, signal, job, ctx: out.ctx });
    }
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

  // What Bob carries from earlier, instead of the whole old chat: the summary of this chat's older part,
  // and the topic notes closest to what the user just said.
  async recall(sessionId, text) {
    const parts = [];
    const sum = sessionId ? readSummary(this.cfg, sessionId)?.summary : '';
    if (sum) parts.push(`Earlier in this chat (summed up): ${sum}`);
    try {
      const hk = this.housekeeper;
      if (hk && hk.topics.load().topics.length) {
        let vec = null;
        if (hkSettings(this.cfg).enabled) vec = (await Promise.race([hk.embed([text]), new Promise((r) => setTimeout(() => r(null), 1500))]))?.[0] || null;
        const notes = hk.topics.relevant(text, { vec, k: 3 });
        if (notes.length) parts.push(`Notes from earlier talks (topics; the user can edit these):\n${notes.map((t) => `- ${t.project ? t.project + ' > ' : ''}${t.name}: ${(t.note || t.summary).slice(0, 600)}${t.open?.length ? ` Open: ${t.open.join('; ')}` : ''}`).join('\n')}`);
      }
    } catch {}
    return parts.join('\n\n');
  }

  async runOn(msgs, text, emit, signal, pics, job = null, sessionId = null, out = {}) {
    const user = { role: 'user', content: text, at: Date.now() };
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
    const turnStart = msgs.length - 1;
    this.log('chat', `${this.cfg.userName || 'User'}: ${text}`);
    // The turn's pictures travel with it, so a hat Bob hands the job to can see them too.
    // Every picture, clip or sound he makes goes on the Made by Bob list as it's announced.
    const emitMade = (ev) => {
      if (['image', 'video', 'audio'].includes(ev?.type) && ev.file) { try { this.made.add(ev.file, { tool: ev.type, chat: sessionId }); } catch {} }
      return emit(ev);
    };
    const ctx = { emit: emitMade, signal, brain: this, cfg: this.cfg, allowAll: new Set(), pics, picNote, msgs, turnText: text, job, sessionId };
    // The ledger (handoff.js): what was asked for, every load, tool and output this turn, kept by the system.
    ctx.ledger = new Ledger({ job, expect: expectFrom(text, { pics }), save: () => this.saveQueue() });
    this.gate.track(signal, ctx.ledger);
    ctx.loaded = this.startGroups(sessionId, text); // toolbox groups this turn (use_tools adds more)
    out.ctx = ctx;
    const used = new Set();
    // High and Extreme effort draft on the big brain; Low is the usual chat brain.
    let { model, cpu, think, ctx: wantCtx } = (bigThinker(job) && draftBrain(this.cfg, job.effort)) || modelFor(this.cfg, 'bob');
    // 1.5.16: a Low-effort chat reply doesn't think first (gemma4 and others think by default, which delays every reply).
    // Medium and up, and sessions that set a level (Deep thought), keep their thinking.
    if (think === undefined && !bigThinker(job)) think = false;
    // Small extras, only on some turns: the effort note (High/Extreme) and now and then a moment with the cat.
    const turnNo = msgs.filter((m) => m.role === 'user').length;
    const state = realState({ model, session: currentSession(this.cfg).label, waiting: this.queue.filter((j) => j.state === 'waiting').length, cat: this.cfg.catName, turn: turnNo });
    const extras = [state, effortPrompt(job?.effort), catPrompt({ cat: this.cfg.catName, turn: turnNo, dials: cleanPersonality(this.cfg.personality), user: this.cfg.userName || 'the user' })].filter(Boolean).map((x) => `\n\n${x.replaceAll('{{USER}}', this.cfg.userName || 'the user')}`).join('');
    const brainCtx = await this.fitCtx(model, wantCtx);
    if (!model) throw new Error('I don\'t have a brain yet. Open Get models (in the menu on the left) and pick one; the first-time setup suggests the right one for this PC.');
    this.setState('thinking', '', this.state.model);
    const earlier = await this.recall(sessionId, text);

    for (let step = 0; step < MAX_STEPS; step++) {
      model = (await this.ensureModel(model, emit, signal, 'bob', { cpu, ctx: brainCtx })) || model;
      this.setState('thinking', '', model);
      const tools = this.frontDeskTools(ctx.loaded);
      const sys = { role: 'system', content: this.withLimits(systemPrompt({ now: this.now(), memory: this.memory(), user: this.cfg.userName, backstory: this.backstory(), about: this.about(), cat: this.cfg.catName, look: lookPrompt(this.cfg), dials: personalityPrompt(this.cfg.personality, this.cfg.userName || 'the user') }), ctx.loaded) + extras + (earlier ? `\n\n${earlier}` : '') };
      const reply = await this.chatSafe({
        model, messages: [sys, ...staleHandErrors(msgs, turnStart)], tools, signal, cpu, think, ctx: brainCtx,
        onToken: (t) => emit({ type: 'token', text: t })
      }, { emit });
      // He's seen the new look once; that's enough.
      if (this.cfg.lookChange) { try { saveSettings(this.cfg, { lookChange: null }); } catch {} this.cfg.lookChange = null; }
      msgs.push(reply);
      if (!reply.tool_calls && !ctx.handsDid && !ctx.claimChecked && claimsPcAction(reply.content)) {
        // Said he did something on the PC that no tool did: say so to the user, and give him one go to really do it.
        ctx.claimChecked = true;
        // His retry needs the Hands that are switched on, so add their tool groups now (toolbox.js).
        for (const id of Object.keys(HANDS)) if (groupsFor(this)[id]) ctx.loaded.add(id);
        // Shown by the app as its own note line under the reply (not as Bob's words), and kept with the reply for reloads.
        emit({ type: 'correction', text: CLAIM_CORRECTION });
        reply.correction = CLAIM_CORRECTION;
        msgs.push({ role: 'system', content: CLAIM_NUDGE, hidden: true });
        this.log('honesty', 'Bob claimed a PC action with no tool result; corrected and asked to retry');
        noteStrike(this, ctx, 'claims', 'said he did something on the PC that no tool did');
        await qAsk(this, ctx);
        continue;
      }
      if (!reply.tool_calls && !ctx.observeChecked && !msgs.slice(turnStart).some((m) => m.role === 'tool') && claimsObservation(reply.content)) {
        // Said he noticed or checked something on the PC with no tool behind it: flag it, and one go to answer from real things.
        ctx.observeChecked = true;
        emit({ type: 'correction', text: OBSERVE_CORRECTION });
        reply.correction = OBSERVE_CORRECTION;
        msgs.push({ role: 'system', content: OBSERVE_NUDGE.replaceAll('{{USER}}', this.cfg.userName || 'the user'), hidden: true });
        this.log('honesty', 'Bob described an observation with no tool result; corrected and asked to answer again');
        noteStrike(this, ctx, 'claims', 'described something on the PC with no tool behind it');
        await qAsk(this, ctx);
        continue;
      }
      // "I can't..." with groups still not added: add them all and give him one more go (router test fix).
      const empty = !reply.tool_calls && !String(reply.content || '').trim();
      if (!reply.tool_calls && !ctx.cantRetried && saysCant(reply.content)) {
        const missing = allToolsOn(this.cfg) ? [] : Object.keys(groupsFor(this)).filter((g) => !ctx.loaded.has(g));
        // An empty reply always gets its one more go, even with every tool already there.
        if (missing.length || empty) {
          ctx.cantRetried = true;
          missing.forEach((g) => ctx.loaded.add(g));
          if (missing.length) emit({ type: 'tool', name: 'use_tools', summary: 'Trying again with all his tools' });
          if (empty) msgs.pop(); // an empty reply isn't worth keeping in the chat
          msgs.push({ role: 'system', content: empty ? EMPTY_NUDGE : CANT_NUDGE, hidden: true });
          this.log('toolbox', empty ? 'Bob gave an empty reply; added every tool group and asked again' : 'Bob said he could not; added every tool group and asked again');
          emit({ type: 'token', text: '\n\n' });
          continue;
        }
      }
      if (empty) {
        // Still nothing after the retry. The end-of-turn check says what was really done ("Done: ..."), or nothing
        // when a card in the chat is the answer; only with neither is it the plain app note. Never an empty bubble.
        this.checkTurn(ctx, reply, false);
        if (!ctx.ledger.noted && !ctx.ledger.outputs.length) {
          msgs.pop();
          emit({ type: 'correction', text: EMPTY_NOTE });
          msgs.push({ role: 'assistant', content: '', correction: EMPTY_NOTE });
        }
        this.log('toolbox', 'Bob gave an empty reply twice');
      } else if (!reply.tool_calls && this.checkTurn(ctx, reply, true)) continue; // asked for something that didn't happen: one more go
      if (!reply.tool_calls) { this.keepGroups(sessionId, used); return; }
      let ended = false;
      for (const call of reply.tool_calls) {
        const name = call.function?.name;
        // A tool from a group that isn't added yet: small brains sometimes call it straight away. Add its group and run it.
        const g = name === 'use_tools' ? null : groupOf(this, name);
        if (g) { ctx.loaded.add(g); used.add(g); }
        const key = callKey(name, call.function?.arguments);
        const doing = (HAND_TOOLS.has(name) || DOING_TOOLS.has(name)) && !isLook(name);
        let res;
        if (doing && ctx.lastDoing?.key === key) {
          // The same action twice in a row (small brains do this): don't do it again.
          res = { text: `(Not done again: that exact call just ran. Its result: ${String(ctx.lastDoing.text).slice(0, 300)}) Report that result; don't repeat the call.` };
          this.log('tool', `skipped a repeat of ${name}`);
        } else {
          res = await this.runTool(name, call.function?.arguments, ctx);
          if (doing) {
            const failed = /^Error:/.test(String(res.text));
            const who = this.cfg.userName || 'the user';
            // A failure after a success this turn: make him say both.
            if (failed && ctx.doneThisTurn?.length) res.text += ` (Earlier this turn this worked: ${ctx.doneThisTurn.slice(-2).map((x) => x.slice(0, 160)).join(' / ')}. Tell ${who} what really happened: what worked, then what failed.)`;
            if (failed) res.text += ctx.altTried ? ALT_ROUTE_DONE(who) : ALT_ROUTE_NUDGE(who);
            if (failed && !ctx.altTried) {
              ctx.altTried = true;
              // The other routes need their tools: add the switched-on Hands and the documents group.
              for (const id of [...Object.keys(HANDS), 'documents']) if (groupsFor(this)[id]) ctx.loaded.add(id);
              this.log('tool', `${name} failed; asked Bob to try one other way`);
            }
            if (!failed && !/said no/.test(String(res.text))) (ctx.doneThisTurn ||= []).push(`${name}: ${String(res.text)}`);
            ctx.lastDoing = { key, text: res.text };
          }
        }
        if (name === 'use_tools') { let a = call.function?.arguments; if (typeof a === 'string') { try { a = JSON.parse(a); } catch { a = {}; } } const id = String(a?.group || '').toLowerCase().trim(); if (ctx.loaded.has(id)) used.add(id); }
        msgs.push({ role: 'tool', tool_name: name, content: res.text });
        if (HAND_TOOLS.has(name) && !/^Error:|said no/.test(String(res.text))) ctx.handsDid = true;
        if (res.endsTurn) ended = true;
      }
      if (ended) {
        // The hat's answer was already shown to the user; keep it in the history as Bob's words.
        const last = msgs.at(-1);
        msgs.push({ role: 'assistant', content: last.content });
        if (ctx.hatNotes) { last.content = `${last.content}\n\n${ctx.hatNotes}`; ctx.hatNotes = ''; }
        this.checkTurn(ctx, msgs.at(-1), false); // a hat answered: no second go, but never a silent miss
        this.keepGroups(sessionId, used);
        return;
      }
      emit({ type: 'token', text: '\n\n' });
    }
    this.keepGroups(sessionId, used);
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
  async runHat(hat, task, ctx, force = null) {
    if (!HATS[hat]) throw new Error(`Unknown hat ${hat}.`);
    const heldCopy = copyHeld(this.cfg, hat);
    if (heldCopy) { this.log('quarantine', `didn't send ${hat}: in quarantine`); ctx.emit?.({ type: 'announce', text: heldCopy.split('. ')[0] + '.' }); return heldCopy; }
    // Extreme effort: coding goes research -> check -> plan -> check -> do it (moot.js).
    if (hat === 'tinker' && !ctx.phased && cleanEffort(ctx.job?.effort) === 'extreme') return phasedWork(this, hat, task, ctx);
    // "One brain" mode: every hat runs on the main model, so there's no brain swap (about 20 s each) mid-chat.
    // Normal session: the hat's own brain (or the main one with "One brain"). Other sessions: the session's brain.
    // A moot (High/Extreme effort) passes force: the reviewer always runs on the Review slot brain.
    const { model, cpu, think, ctx: wantCtx } = force || (bigThinker(ctx.job) && hat !== 'reviewer' && hatBrain(this.cfg, hat, ctx.job.effort)) || modelFor(this.cfg, hat);
    const brainCtx = await this.fitCtx(model, wantCtx);
    const copy = copyName(this.cfg, hat, HATS[hat].label);
    ctx.emit({ type: 'hat', hat, label: PLAIN_HATS[hat] || HATS[hat].label, copy });
    // The Tasks panel: this job is now delegated to a copy (in progress) until the copy hands back.
    const step = { hat, label: PLAIN_HATS[hat] || HATS[hat].label, copy, task: String(task).slice(0, 140), state: 'in progress', at: Date.now() };
    if (ctx.job) { (ctx.job.steps ||= []).push(step); this.saveQueue(); }
    const wasHat = ctx.hatNow;
    ctx.hatNow = hat; // so quarantine knows which copy did what
    try { return await this.wearHat(hat, task, ctx, { model, cpu, think, brainCtx, copy }); }
    catch (e) { step.state = ctx.signal?.aborted ? 'cancelled' : 'failed'; throw e; }
    finally {
      ctx.hatNow = wasHat;
      if (step.state === 'in progress') step.state = 'completed';
      step.doneAt = Date.now();
      if (ctx.job) this.saveQueue();
    }
  }

  async wearHat(hat, task, ctx, { model, cpu, think, brainCtx, copy }) {
    model = (await this.ensureModel(model, ctx.emit, ctx.signal, hat, { cpu, ctx: brainCtx })) || model;
    this.setState('busy', `${copy} is on it (${PLAIN_HATS[hat] || HATS[hat].label})`, model);
    const hatTools = {
      ledger: ['save_spreadsheet', 'read_file', 'list_folder'],
      scout: ['web_search', 'fetch_page'],
      painter: ['make_image', 'make_video', 'save_reference', 'make_music', 'make_sound', 'workshop_list', 'workshop_run'],
      // run_command / run_recipe only when the Run hand is on (toolSchemas leaves them out otherwise); each run is approved.
      tinker: ['list_folder', 'read_file', 'search_files', 'edit_file', 'write_file', 'web_search', 'fetch_page', 'run_command', 'run_recipe'],
      reviewer: ['list_folder', 'read_file', 'search_files']
    }[hat] || [];
    const maxSteps = hat === 'tinker' ? 30 : hat === 'reviewer' ? 15 : MAX_STEPS;
    const packet = this.handoff(ctx, brainCtx);
    const userMsg = { role: 'user', content: `${packet}## The job\n${task}${ctx.picNote ? `\n\n${ctx.picNote}` : ''}` };
    // Raw pictures only go to a brain that can see; any brain still gets the Eyes descriptions above.
    if (ctx.pics?.length && await this.engine.hasVision?.(model).catch(() => false)) userMsg.images = ctx.pics.map((r) => this.refs.base64(r));
    const messages = [
      { role: 'system', content: this.withLimits(systemPrompt({ hat, now: this.now(), memory: this.memory(), user: this.cfg.userName, backstory: this.backstory(), about: this.about(), copy, cat: this.cfg.catName, dials: personalityPrompt(this.cfg.personality, this.cfg.userName || 'the user') })) + (hat !== 'reviewer' && careful(ctx.job) ? `\n\n${effortPrompt(ctx.job.effort).replaceAll('{{USER}}', this.cfg.userName || 'the user')}` : '') },
      userMsg
    ];
    let final = '';
    const did = []; // what this copy did, handed back to the main conversation afterwards
    for (let step = 0; step < maxSteps; step++) {
      const reply = await this.chatSafe({
        model, messages, tools: this.toolSchemas(hatTools), signal: ctx.signal, cpu, think, ctx: brainCtx,
        onToken: (t) => ctx.emit({ type: 'token', text: t })
      }, { emit: ctx.emit, who: hat });
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
      ? 'Freeing the graphics card so the clip can be made. Video is slow: give it several minutes.'
      : 'Freeing the graphics card so the picture can be made. It takes about half a minute.' });
    // The gate: brains let go, the card really free, the picture engine ready. Then paint, check the file is a real
    // picture or clip, and try once more if it isn't (the card can take a moment to free up after a big brain).
    const unloaded = await this.gate.need({ id: 'painter', kind }, { signal: ctx.signal, emit: ctx.emit });
    this.setState('painting', video ? 'Filming' : 'Painting', null);
    this.log(kind, `unloaded ${unloaded.join(', ') || 'nothing'}; painting with ${this.painter?.paint ? 'the picture engine' : 'sd.cpp'}`);
    const onProgress = (n, total) => this.setState('painting', `${video ? 'Filming' : 'Painting'} ${n}/${total}`, null);
    const type = video ? 'video' : 'image';
    const { file, name } = await withRetry(async () => {
      const made = this.painter?.paint ? await this.painter.paint(kind, args, { signal: ctx.signal, onProgress }) : await paint(this.cfg, kind, args, { signal: ctx.signal, onProgress });
      if (!made.checked) { const v = await verifyOutput(made.file, type); if (!v.ok) throw new Error(`The painter finished but ${v.why}.`); }
      return made;
    }, {
      signal: ctx.signal, wait: 3000,
      onRetry: (e) => { this.log('handoff', `painting failed (${e.message.slice(0, 120)}); trying once more`); ctx.ledger?.step('retry', { what: 'painter', why: e.message }).done(); ctx.emit({ type: 'announce', text: `Making the ${video ? 'clip' : 'picture'} didn't work. Trying once more.` }); }
    });
    ctx.emit({ type, url: `/images/${encodeURIComponent(name)}`, file });
    this.setState('thinking', '', null);
    return `${video ? 'Made a clip' : 'Painted a picture'}, saved as ${file}. The user can see it in the chat.`;
  }

  // Maestro does the work in its own process; Bob steps out of the GPU first so they don't fight over memory.
  async viaMaestro(kind, args, ctx) {
    if (!this.cfg.maestro?.enabled) throw new Error('Maestro is switched off. I paint and film myself.');
    const video = kind === 'video';
    const modelType = this.cfg.maestro[kind];
    ctx.emit({ type: 'announce', text: `Stepping out of the GPU and handing this to Maestro (${modelType}). ${video ? 'Clips take a few minutes.' : 'Should be quick.'} If Maestro hasn't used this model before, it downloads it first.` });
    const unloaded = await this.gate.need({ id: 'card' }, { signal: ctx.signal, emit: ctx.emit }); // the gate: the card really free first
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
    const unloaded = await this.gate.need({ id: 'card' }, { signal: ctx.signal, emit: ctx.emit }); // the gate: the card really free first
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
    const unloaded = await this.gate.need({ id: 'card' }, { signal: ctx.signal, emit: ctx.emit }); // the gate: the card really free first
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
    if (!paintingAvailable(this.cfg, 'video')) throw new Error('Video isn\'t set up yet. Pick a video maker in Get models (left menu, Equip Bob, Video slot). I can write the video prompt instead.');
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
      ? `${waiting} is on this PC but isn't assigned to "Picture edits": Get models, Equip Bob, the Picture editor slot (one click).`
      : 'No picture-edit model is on this PC yet: Get models, Pictures & video, a picture-edit model (Qwen Image Edit), then Equip Bob, the Picture editor slot.';
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
      if (!paintingAvailable(this.cfg, 'image')) throw new Error('Painting from a reference needs Bob\'s own painter (a picture model from Get models).');
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

    ctx.emit({ type: 'announce', text: 'Freeing the graphics card so the picture can be made. It takes about half a minute.' });
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
