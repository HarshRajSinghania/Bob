// Share brains between your Bobs (Settings, Connections). Both halves are off unless you turn them on.
//
// "Lend my brain": another Bob of yours (the PC, the laptop, the handheld, the phone) may ask this one to think a quick
// reply. Only through the door "Let my phone in" opens (Tailscale addresses, passcode cookie), and only for this:
// words in, words (and tool calls) out. Nothing runs here: the tools, the files and the OK cards stay with the Bob that
// asked. Nothing is kept: the lent reply isn't saved, logged with its text, or remembered. A lender that's gaming or
// busy with its own job says no, and the asking Bob thinks for itself. The lender uses its quick brain only, never a big one.
//
// "Borrow a brain": this Bob asks one of your other Bobs first, then thinks for itself if none answers in time.
// When: while Gaming (the owner's main reason: a phone thinking for the PC saves the processor for the game), when this
// Bob is busy, or always for quick replies. Only Low-effort front-desk replies with no pictures are borrowed
// (a quick chat beside a big job counts).
// Addresses must be Tailscale ones (100.64.0.0/10 or a *.ts.net name). Passcodes live in config.json only, like the
// phone door's, and are never sent back to the page.
import fs from 'node:fs';
import { isTailscaleIp } from './phone-access.js';

export const PROTOCOL = 1;
export const WHEN = ['gaming', 'busy', 'always'];
export const HELLO_MS = 2500; // "are you there?" gets this long
export const FIRST_WORD_MS = 12000; // a lender that hasn't started answering by then is dropped for this reply
export const QUIET_MS = 20000; // and one that goes quiet mid-answer
const GOOD_FOR = 30000, DOWN_FOR = 60000;
const MAX_BOBS = 6;
const TS_NAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.ts\.net$/;

// "100.101.102.103:7777", "http://phone.tail1234.ts.net:7777/" -> "100.101.102.103:7777". Tailscale only.
export function cleanAddress(a, defPort = 7777) {
  let s = String(a || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '').replace(/\.$/, '');
  if (!/:\d{1,5}$/.test(s)) s = `${s}:${defPort}`;
  const i = s.lastIndexOf(':');
  const name = s.slice(0, i).replace(/\.$/, ''), port = Number(s.slice(i + 1));
  if (!(port >= 1 && port <= 65535)) return null;
  return isTailscaleIp(name) || (name.length <= 253 && TS_NAME.test(name)) ? `${name}:${port}` : null;
}

const cleanName = (n) => String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40);

// ---------- Settings ----------
export function shareView(cfg) {
  const s = cfg.share || {};
  const b = s.borrow || {};
  return {
    lend: s.lend === true,
    doorOpen: doorOpen(cfg),
    borrow: { on: b.on === true, when: WHEN.includes(b.when) ? b.when : 'gaming', bobs: (b.bobs || []).map((x) => ({ name: x.name, address: x.address, passcodeSet: String(x.passcode || '').length >= 6 })) }
  };
}

export const doorOpen = (cfg) => Boolean(cfg.remote?.enabled && String(cfg.remote?.passcode || '').length >= 6);

// A change from Settings, checked. Returns { share } to save, or { error }. A Bob without a new passcode keeps its old one.
export function cleanSharePatch(cfg, b) {
  const cur = cfg.share || {};
  const cb = cur.borrow || {};
  const next = { lend: cur.lend === true, borrow: { on: cb.on === true, when: WHEN.includes(cb.when) ? cb.when : 'gaming', bobs: (cb.bobs || []).slice() } };
  if ('lend' in b) next.lend = b.lend === true;
  if ('when' in b) { if (!WHEN.includes(b.when)) return { error: 'Pick when to borrow.' }; next.borrow.when = b.when; }
  if (b.addBob) {
    const address = cleanAddress(b.addBob.address);
    if (!address) return { error: 'That isn\'t a Tailscale address. It looks like 100.x.y.z:7777 or name.something.ts.net:7777.' };
    const passcode = String(b.addBob.passcode || '').trim();
    const old = next.borrow.bobs.find((x) => x.address === address);
    if (!old && passcode.length < 6) return { error: 'Type that Bob\'s passcode (at least 6 characters).' };
    if (passcode && passcode.length > 64) return { error: 'That passcode is too long.' };
    const entry = { name: cleanName(b.addBob.name) || address.split(':')[0].split('.')[0], address, passcode: passcode || old.passcode };
    next.borrow.bobs = [...next.borrow.bobs.filter((x) => x.address !== address), entry];
    if (next.borrow.bobs.length > MAX_BOBS) return { error: `Up to ${MAX_BOBS} Bobs.` };
  }
  if (b.removeBob) next.borrow.bobs = next.borrow.bobs.filter((x) => x.address !== cleanAddress(b.removeBob));
  if (Array.isArray(b.order)) { const at = (a) => { const i = b.order.map((x) => cleanAddress(x)).indexOf(a); return i < 0 ? 99 : i; }; next.borrow.bobs.sort((x, y) => at(x.address) - at(y.address)); }
  if ('borrow' in b) next.borrow.on = b.borrow === true;
  if (next.borrow.on && !next.borrow.bobs.length) return { error: 'Add one of your other Bobs first.' };
  return { share: next };
}

export function saveShare(cfg, share) {
  const raw = JSON.parse(fs.readFileSync(cfg.configFile, 'utf8'));
  raw.share = share;
  fs.writeFileSync(cfg.configFile, JSON.stringify(raw, null, 2));
  cfg.share = share;
}

// ---------- Lending (this Bob thinks for another) ----------
export const lendOn = (cfg) => cfg.share?.lend === true && doorOpen(cfg);

// Why this Bob won't lend right now, or '' when it will. Gaming: the processor and card belong to the game here too.
export function lendRefusal(brain, { currentSession, quickBrain }) {
  if (!lendOn(brain.cfg)) return 'off';
  if (currentSession(brain.cfg).id === 'light') return 'gaming';
  if (brain.lending) return 'busy';
  if (brain.turns?.size || brain.queue?.some?.((j) => j.state === 'working')) return 'busy';
  if (!quickBrain(brain)) return 'no brain';
  return '';
}

// What a lent request may carry: plain chat messages and tool definitions. Pictures never travel.
export function cleanLendRequest(b) {
  const roles = new Set(['system', 'user', 'assistant', 'tool']);
  const messages = [].concat(b?.messages || []).slice(-200).filter((m) => m && roles.has(m.role)).map((m) => {
    const o = { role: m.role, content: typeof m.content === 'string' ? m.content.slice(0, 60000) : '' };
    if (m.role === 'assistant' && Array.isArray(m.tool_calls)) o.tool_calls = m.tool_calls.slice(0, 16).map((c) => ({ function: { name: String(c?.function?.name || '').slice(0, 80), arguments: c?.function?.arguments && typeof c.function.arguments === 'object' ? c.function.arguments : {} } }));
    if (m.role === 'tool' && m.tool_name) o.tool_name = String(m.tool_name).slice(0, 80);
    return o;
  });
  const tools = [].concat(b?.tools || []).slice(0, 128).filter((t) => t?.type === 'function' && /^[\w.-]{1,80}$/.test(String(t.function?.name || '')));
  if (!messages.some((m) => m.role === 'user')) return { error: 'no question' };
  if (JSON.stringify({ messages, tools }).length > 900000) return { error: 'too big' };
  return { messages, tools };
}

// POST /api/lend/chat: think one reply for another Bob, streaming it back as server-sent events:
//   { type: 'token', text }  ...  { type: 'done', reply: { content, tool_calls } }  or  { type: 'error', error }
export async function lendChat(brain, req, res, b, deps) {
  const why = lendRefusal(brain, deps);
  if (why) { res.writeHead(409, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ busy: why })); }
  const ask = cleanLendRequest(b);
  if (ask.error) { res.writeHead(400, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: ask.error })); }
  const stop = new AbortController();
  req.on('close', () => { if (!res.writableEnded) stop.abort(); });
  brain.lending = { since: Date.now(), for: cleanName(b.from) || 'another Bob' };
  brain.broadcast?.({ type: 'lending', on: true, for: brain.lending.for });
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' });
  const send = (ev) => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(ev)}\n\n`); };
  const t0 = Date.now();
  try {
    const { model, cpu, ctx } = deps.quickBrain(brain);
    const fit = await brain.fitCtx(model, ctx);
    const use = (await brain.ensureModel(model, () => {}, stop.signal, 'bob', { cpu, ctx: fit })) || model;
    send({ type: 'brain', label: brain.brainLabel?.(use) || use });
    const reply = await brain.chatSafe({ model: use, messages: ask.messages, tools: ask.tools.length ? ask.tools : undefined, signal: stop.signal, cpu, think: false, ctx: fit, onToken: (t) => send({ type: 'token', text: t }) });
    send({ type: 'done', reply: { content: reply.content || '', tool_calls: reply.tool_calls } });
    brain.log?.('lend', `thought a reply for ${brain.lending.for} in ${((Date.now() - t0) / 1000).toFixed(1)} s`); // never the words
  } catch (e) {
    send({ type: 'error', error: stop.signal.aborted ? 'stopped' : String(e.message || e).slice(0, 200) });
  } finally {
    const who = brain.lending?.for;
    brain.lending = null;
    brain.broadcast?.({ type: 'lending', on: false, for: who });
    res.end();
    setTimeout(() => brain.settle?.().catch?.(() => {}), 0); // back to light, same as after his own jobs
  }
}

// ---------- Borrowing (another Bob thinks for this one) ----------
// Should this reply be borrowed? Low effort, front desk, no pictures, and the owner's "when".
export function wantsBorrow(cfg, { session, busy, job, pics }) {
  const b = cfg.share?.borrow || {};
  if (b.on !== true || !(b.bobs || []).length) return false;
  if (pics?.length) return false; // a quick chat beside a big job (job.side) is the "busy" case itself
  if (job && job.effort && job.effort !== 'low') return false;
  const when = WHEN.includes(b.when) ? b.when : 'gaming';
  if (when === 'always') return true;
  if (session === 'light') return true; // Gaming counts for every choice
  return when === 'busy' && Boolean(busy);
}

export class Lenders {
  constructor(cfg, { fetchFn = globalThis.fetch, now = Date.now, firstWordMs = FIRST_WORD_MS, quietMs = QUIET_MS } = {}) {
    this.cfg = cfg; this.fetch = fetchFn; this.now = now; this.firstWordMs = firstWordMs; this.quietMs = quietMs;
    this.cookies = new Map(); // address -> bob_auth cookie (memory only)
    this.state = new Map(); // address -> { ok, at, brain, why }
  }
  bobs() { return (this.cfg.share?.borrow?.bobs || []).filter((x) => cleanAddress(x.address)); }

  async call(bob, path, { method = 'GET', body, signal, timeout = HELLO_MS } = {}) {
    // The timeout covers getting an answer started (headers). It is cleared then, so a long streamed reply isn't cut off:
    // after that only the caller's own signal (the first-word and quiet timers in chat()) can stop it.
    const go = async () => {
      const t = new AbortController();
      const timer = setTimeout(() => t.abort(new Error('timeout')), timeout);
      const sig = signal ? AbortSignal.any([signal, t.signal]) : t.signal;
      try { return await this.fetch(`http://${bob.address}${path}`, { method, redirect: 'manual', signal: sig, headers: { ...(body ? { 'content-type': 'application/json', 'x-bob': '1' } : {}), ...(this.cookies.has(bob.address) ? { cookie: this.cookies.get(bob.address) } : {}) }, body: body ? JSON.stringify(body) : undefined }); }
      finally { clearTimeout(timer); }
    };
    let r = await go();
    if (r.status === 401) { await this.login(bob, signal); r = await go(); }
    return r;
  }

  async login(bob, signal) {
    const t = AbortSignal.timeout(HELLO_MS);
    const r = await this.fetch(`http://${bob.address}/login`, { method: 'POST', redirect: 'manual', signal: signal ? AbortSignal.any([signal, t]) : t, headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code: String(bob.passcode || '') }).toString() });
    const set = String(r.headers.get('set-cookie') || '').match(/bob_auth=[0-9a-f]+/);
    if (r.status !== 303 || !set) throw new Error(r.status === 429 ? 'too many tries' : 'passcode not accepted');
    this.cookies.set(bob.address, set[0]);
  }

  // Is this Bob there and willing? Remembered for a short while, so a gaming PC doesn't knock on every reply.
  async hello(bob, { force = false } = {}) {
    const s = this.state.get(bob.address);
    if (!force && s && this.now() - s.at < (s.ok ? GOOD_FOR : DOWN_FOR)) return s;
    let out;
    try {
      const r = await this.call(bob, '/api/lend/hello');
      const j = await r.json().catch(() => ({}));
      out = r.ok && j.lend === true && !j.busy ? { ok: true, brain: String(j.brain || '').slice(0, 60), device: String(j.device || '').slice(0, 20) } : { ok: false, why: j.busy || (r.status === 401 ? 'passcode not accepted' : r.status === 403 ? 'door closed' : `answered ${r.status}`) };
    } catch (e) { out = { ok: false, why: /passcode|tries/.test(e.message) ? e.message : 'not reachable' }; }
    out.at = this.now();
    this.state.set(bob.address, out);
    return out;
  }

  markDown(bob, why) { this.state.set(bob.address, { ok: false, why, at: this.now() }); }

  // The first of your Bobs (in your order) that says yes, or null.
  async pick() {
    for (const bob of this.bobs()) { const s = await this.hello(bob); if (s.ok) return { ...bob, brain: s.brain, device: s.device }; }
    return null;
  }

  // Would a reply be borrowed right now, going by what we already know (no network)? wake() uses this, so a Bob
  // that's about to borrow doesn't load his own brain while someone types.
  likely() { return this.bobs().some((b) => this.state.get(b.address)?.ok && this.now() - this.state.get(b.address).at < GOOD_FOR); }

  // One reply from a lender, same shape as engine.chat's. Throws if it can't (the caller thinks for itself).
  async chat(bob, { messages, tools, signal, onToken, from }) {
    const quiet = new AbortController();
    const sig = signal ? AbortSignal.any([signal, quiet.signal]) : quiet.signal;
    let timer = setTimeout(() => quiet.abort(), this.firstWordMs);
    const kick = () => { clearTimeout(timer); timer = setTimeout(() => quiet.abort(), this.quietMs); };
    const plain = messages.map((m) => { const { images, hidden, correction, ...rest } = m; return rest; });
    try {
      const r = await this.call(bob, '/api/lend/chat', { method: 'POST', body: { protocol: PROTOCOL, from, messages: plain, tools: tools || [] }, signal: sig, timeout: this.firstWordMs });
      if (r.status === 409) { const j = await r.json().catch(() => ({})); throw Object.assign(new Error(`said no (${j.busy || 'busy'})`), { busy: true }); }
      if (!r.ok) throw new Error(`answered ${r.status}`);
      let buf = '', reply = null;
      const dec = new TextDecoder();
      for await (const chunk of r.body) {
        buf += dec.decode(chunk, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 2);
          if (!line.startsWith('data:')) continue;
          const ev = JSON.parse(line.slice(5));
          kick();
          // Any event counts as life, including a lender's { type: 'loading' } and { type: 'reading', done, of } while it starts.
          if (ev.type === 'token' && typeof ev.text === 'string') onToken?.(ev.text);
          else if (ev.type === 'error') throw new Error(String(ev.error || 'failed'));
          else if (ev.type === 'done') reply = ev.reply;
        }
      }
      if (!reply) throw new Error('stopped mid-answer');
      const calls = Array.isArray(reply.tool_calls) ? reply.tool_calls.filter((c) => c?.function?.name).map((c) => ({ function: { name: String(c.function.name), arguments: c.function.arguments && typeof c.function.arguments === 'object' ? c.function.arguments : {} } })) : [];
      return { role: 'assistant', content: String(reply.content || ''), tool_calls: calls.length ? calls : undefined };
    } catch (e) {
      if (signal?.aborted) throw e;
      this.markDown(bob, e.busy ? 'busy' : quiet.signal.aborted ? 'too slow' : 'not reachable');
      throw quiet.signal.aborted ? new Error('too slow') : e;
    } finally { clearTimeout(timer); }
  }
}
