// Bob's own engine: runs llama.cpp's llama-server.exe himself, one model at a time.
// Same interface as the Ollama client, so the brain doesn't care which engine is in use.
// Models are found by Ollama name in Ollama's model folder (no duplicate downloads), or set by path in config.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';

// How long a brain may sit unused in memory: the shared setting ollamaKeepAlive ("10m", "30m", "1h", or "-1" for never).
// Both engines use it: Ollama through keep_alive, Bob's own engine through the idle check below (1.5.2).
export function keepAliveMs(cfg) {
  const k = String(cfg?.ollamaKeepAlive ?? '5m');
  if (k === '-1') return Infinity;
  const m = k.match(/^(\d+)([smh])$/);
  return m ? Number(m[1]) * { s: 1000, m: 60000, h: 3600000 }[m[2]] : 300000;
}

export class LlamaCpp {
  // Read fresh each time, so speed settings changed in the app apply to the next brain load.
  get lc() { return this.cfg.llamacpp || {}; }

  constructor(cfg) {
    this.cfg = cfg;
    this.port = this.lc.port || 8091;
    this.url = `http://127.0.0.1:${this.port}`;
    this.child = null;
    this.current = null;
    this.now = () => Date.now();
    this.lastUse = this.now();
    this.active = 0; // chats running right now
    this.isBusy = () => false; // the brain sets this: a turn or a queued job that is working
    this.holdModel = () => null; // the brain sets this: the model "Always on" keeps loaded (never idle-unloaded)
    // Unload the brain once it has been idle longer than the keep-alive, so a quiet Bob gives the graphics card back.
    this.idleTimer = setInterval(() => { this.idleTick().catch(() => {}); }, 60_000);
    this.idleTimer.unref?.();
    this.timesFile = path.join(cfg.dataDir, 'load-times-llamacpp.json');
    try { this.loadTimes = JSON.parse(fs.readFileSync(this.timesFile, 'utf8')); } catch { this.loadTimes = {}; }
    const stop = () => { try { this.child && this.child.kill(); } catch {} };
    process.on('exit', stop);
    for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { stop(); process.exit(0); });
  }

  // Ollama name -> GGUF file (+ vision projector), by reading Ollama's manifest.
  resolve(model) {
    const override = this.lc.models?.[model];
    if (override) return typeof override === 'string' ? { gguf: override } : override;
    const dir = this.lc.ollamaModelsDir || path.join(this.cfg.agentDir, 'models');
    let [name, tag = 'latest'] = model.split(':');
    const parts = name.includes('/') ? name.split('/') : ['library', name];
    const manifest = path.join(dir, 'manifests', 'registry.ollama.ai', ...parts, tag);
    let m;
    try { m = JSON.parse(fs.readFileSync(manifest, 'utf8')); } catch { throw new Error(`I can't find the model files for ${model} (looked in ${manifest}).`); }
    const blob = (type) => {
      const layer = (m.layers || []).find((l) => l.mediaType === `application/vnd.ollama.image.${type}`);
      return layer ? path.join(dir, 'blobs', layer.digest.replace(':', '-')) : null;
    };
    const gguf = blob('model');
    if (!gguf) throw new Error(`${model} has no model file in its manifest.`);
    return { gguf, mmproj: blob('projector') };
  }

  async health() {
    try { return (await fetch(this.url + '/health', { signal: AbortSignal.timeout(2000) })).ok; } catch { return false; }
  }

  async loaded() {
    if (!(this.current && this.child && this.child.exitCode === null)) return [];
    let size = 0;
    try { size = fs.statSync(this.resolve(this.current).gguf).size; } catch {}
    return [{ name: this.current, size, vram: await this.vramOf(this.child.pid) }];
  }

  // Graphics memory llama-server holds, in bytes, from nvidia-smi (ships with the NVIDIA driver). 0 when unknown.
  vramOf(pid) {
    return new Promise((resolve) => {
      try {
        execFile('nvidia-smi', ['--query-compute-apps=pid,used_memory', '--format=csv,noheader,nounits'], { timeout: 3000, windowsHide: true }, (err, out) => {
          if (err) return resolve(0);
          const row = String(out).split(/\r?\n/).map((l) => l.split(',').map((x) => x.trim())).find(([p]) => Number(p) === pid);
          resolve(row && Number(row[1]) > 0 ? Number(row[1]) * 1048576 : 0);
        });
      } catch { resolve(0); }
    });
  }

  // Called every minute: stop llama-server once nothing has used it for longer than the keep-alive.
  // The next chat loads the brain again, as after a restart. Returns true when it unloaded.
  async idleTick() {
    if (!this.child || this.child.exitCode !== null || this.active > 0) return false;
    let busy = false;
    try { busy = Boolean(this.isBusy()); } catch {}
    if (busy) { this.lastUse = this.now(); return false; }
    let hold = null;
    try { hold = this.holdModel(); } catch {}
    if (hold && hold === this.current) { this.lastUse = this.now(); return false; }
    if (this.now() - this.lastUse <= keepAliveMs(this.cfg)) return false;
    this.idleUnloaded = this.current;
    await this.stopServer();
    return true;
  }

  // ctx: the session's context size. A different size means restarting llama-server with it.
  async isLoaded(model, { ctx } = {}) {
    return this.current === model && (!ctx || this.currentCtx === ctx) && this.child && this.child.exitCode === null && (await this.health());
  }

  // --fit came in with newer llama.cpp builds; older ones would refuse to start with it.
  fitOn() {
    if (typeof this.lc.fit === 'boolean') return this.lc.fit;
    try {
      const v = JSON.parse(fs.readFileSync(path.join(this.cfg.agentDir, 'llama.cpp', 'bob-llamacpp.json'), 'utf8')).version;
      return Number(String(v).replace(/^b/, '')) >= 12000;
    } catch { return false; }
  }

  // A model can see pictures when it has a vision projector (mmproj) and vision isn't switched off.
  async hasVision(model) {
    try { return Boolean(this.resolve(model).mmproj) && this.lc.vision !== false; } catch { return false; }
  }

  // Everything llama-server is started with, in one place so it can be tested.
  buildArgs(model, { ctx } = {}) {
    const lc = this.lc;
    const { gguf, mmproj, args: modelArgs } = this.resolve(model);
    const num = (v, flag) => (Number.isInteger(v) && v > 0 ? [flag, String(v)] : []);
    const args = [
      ...(lc.preArgs || []),
      '-m', gguf, '--host', '127.0.0.1', '--port', String(this.port),
      '-c', String(ctx || lc.ctx || 131072), '-ngl', String(lc.gpuLayers ?? 999), '--jinja',
      ...(mmproj && lc.vision !== false ? ['--mmproj', mmproj] : []),
      ...(lc.args || ['-fa', 'on', '-ctk', 'q8_0', '-ctv', 'q8_0']),
      ...num(lc.threads, '-t'), ...num(lc.batch, '-b'), ...num(lc.ubatch, '-ub'),
      ...(modelArgs || lc.modelArgs?.[model] || []),
      // Mixture-of-experts models: keep this many layers' experts in system RAM so the rest fits the card.
      ...(Number.isInteger(lc.nCpuMoe?.[model]) ? ['--n-cpu-moe', String(lc.nCpuMoe[model])] : [])
    ];
    // --fit: llama.cpp places layers to fit the card's free memory right now (other apps included), which
    // beat a fixed --n-cpu-moe on a 16 GB card. Used unless a placement is pinned by hand or fit is off.
    const pinned = args.some((a) => ['--n-cpu-moe', '-ncmoe', '--cpu-moe', '-ot', '--override-tensor', '--fit'].includes(a));
    if (!pinned && this.fitOn()) args.push('--fit', 'on');
    // Speculative decoding: a small "draft" model guesses ahead and the big one checks, often 1.5-2x faster.
    const d = lc.draft;
    if (d?.model && d.model !== model && d.enabled !== false) {
      // A file path (a .gguf, or a draft blob inside Ollama's models folder) or an Ollama model name.
      const draft = path.isAbsolute(d.model) || /\.gguf$/i.test(d.model) ? d.model : this.resolve(d.model).gguf;
      args.push('-md', draft, ...num(d.max ?? 16, '--draft-max'), ...num(d.min ?? 1, '--draft-min'), '-ngld', String(d.ngld ?? 99));
    }
    return args;
  }

  async estimateLoad(model) {
    if (this.loadTimes[model]) return Math.round(this.loadTimes[model]);
    try {
      const gb = fs.statSync(this.resolve(model).gguf).size / 1e9;
      return Math.max(5, Math.round(gb * 0.9));
    } catch { return 15; }
  }

  // Lets go of one brain (Bob's own engine holds one at a time). Returns the names unloaded.
  async unload(model) {
    if (!this.current || this.current !== model) return [];
    await this.stopServer();
    return [model];
  }

  // Counts as use, so the idle clock starts again (someone is typing).
  touch() { this.lastUse = this.now(); }

  async unloadAll() {
    const was = this.current;
    await this.stopServer();
    return was ? [was] : [];
  }

  async stopServer() {
    const c = this.child;
    this.child = null;
    this.current = null;
    this.currentCtx = null;
    if (!c || c.exitCode !== null) return;
    await new Promise((r) => { c.once('exit', r); c.kill(); setTimeout(r, 5000); });
  }

  async preload(model, signal, { ctx } = {}) {
    const t0 = Date.now();
    this.lastUse = this.now();
    const args = this.buildArgs(model, { ctx });
    await this.stopServer();
    // A llama-server left over from a crash would hold the port: stop it first.
    const pidFile = path.join(this.cfg.dataDir, 'llama-server.pid');
    try { process.kill(Number(fs.readFileSync(pidFile, 'utf8')), 'SIGTERM'); await new Promise((r) => setTimeout(r, 800)); } catch {}
    const exe = this.lc.exe || path.join(this.cfg.agentDir, 'llama.cpp', 'llama-server.exe');
    // The exact command, so speed settings can be checked (e.g. that the draft model really went in).
    try { fs.writeFileSync(path.join(this.cfg.dataDir, 'llama-server-args.txt'), [exe, ...args].map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ') + '\n'); } catch {}
    let log = '';
    const child = spawn(exe, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (d) => { log = (log + d).slice(-4000); });
    child.stderr.on('data', (d) => { log = (log + d).slice(-4000); });
    const started = new Promise((_, reject) => {
      child.once('error', (e) => reject(new Error(`Couldn't start llama-server (${e.message}). Check llamacpp.exe in config.json.`)));
      child.once('exit', (code) => reject(new Error(`llama-server stopped while loading ${model} (code ${code}). Last output: ${log.slice(-600)}`)));
    });
    this.child = child;
    this.current = model;
    this.currentCtx = ctx || null;
    try { fs.writeFileSync(pidFile, String(child.pid)); } catch {}
    const deadline = Date.now() + (this.lc.loadTimeoutSeconds || 300) * 1000;
    const ready = (async () => {
      while (Date.now() < deadline) {
        if (signal?.aborted) throw new Error('Stopped.');
        if (await this.health()) return;
        await new Promise((r) => setTimeout(r, 500));
      }
      throw new Error(`${model} took too long to load.`);
    })();
    try {
      await Promise.race([ready, started]);
    } catch (e) {
      await this.stopServer();
      throw e;
    }
    started.catch(() => {}); // later exits are handled by isLoaded()
    const secs = (Date.now() - t0) / 1000;
    this.loadTimes[model] = secs;
    try { fs.writeFileSync(this.timesFile, JSON.stringify(this.loadTimes, null, 2)); } catch {}
    return secs;
  }

  // Bob's history uses Ollama's message shape; llama-server speaks the OpenAI shape.
  static toOpenAI(messages) {
    const out = [];
    let pending = [];
    let n = 0;
    for (const m of messages) {
      if (m.role === 'assistant' && m.tool_calls?.length) {
        pending = m.tool_calls.map((c) => ({ id: `call_${++n}`, name: c.function?.name }));
        out.push({
          role: 'assistant', content: m.content || '',
          tool_calls: m.tool_calls.map((c, i) => ({
            id: pending[i].id, type: 'function',
            function: { name: c.function?.name, arguments: typeof c.function?.arguments === 'string' ? c.function.arguments : JSON.stringify(c.function?.arguments || {}) }
          }))
        });
      } else if (m.role === 'tool') {
        const i = pending.findIndex((p) => p.name === m.tool_name);
        const id = i >= 0 ? pending.splice(i, 1)[0].id : `call_${++n}`;
        out.push({ role: 'tool', tool_call_id: id, content: m.content });
      } else {
        // Pictures go as OpenAI image parts (llama-server needs the model's mmproj file for these).
        out.push(m.images?.length
          ? { role: m.role, content: [{ type: 'text', text: m.content || '' }, ...m.images.map((b) => ({ type: 'image_url', image_url: { url: `data:image/${b.startsWith('iVBOR') ? 'png' : b.startsWith('/9j') ? 'jpeg' : 'webp'};base64,${b}` } }))] }
          : { role: m.role, content: m.content || '' });
      }
    }
    return out;
  }

  async chat(opts) {
    this.active++;
    this.lastUse = this.now();
    try { return await this.chatOnce(opts); } finally { this.active--; this.lastUse = this.now(); }
  }

  async chatOnce({ model, messages, tools, signal, onToken }) {
    const res = await fetch(this.url + '/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages: LlamaCpp.toOpenAI(messages), tools: tools && tools.length ? tools : undefined, stream: true }),
      signal
    });
    if (!res.ok) throw new Error(`llama-server returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
    let content = '';
    const calls = [];
    let buf = '';
    const decoder = new TextDecoder();
    for await (const chunk of res.body) {
      buf += decoder.decode(chunk, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        const ev = JSON.parse(data);
        if (ev.error) throw new Error('llama-server: ' + (ev.error.message || JSON.stringify(ev.error)));
        const d = ev.choices?.[0]?.delta || {};
        if (d.content) { content += d.content; onToken && onToken(d.content); }
        for (const tc of d.tool_calls || []) {
          const i = tc.index ?? calls.length;
          calls[i] = calls[i] || { name: '', args: '' };
          if (tc.function?.name) calls[i].name += tc.function.name;
          if (tc.function?.arguments) calls[i].args += tc.function.arguments;
        }
      }
    }
    const tool_calls = calls.filter(Boolean).map((c) => {
      let args = {};
      try { args = c.args ? JSON.parse(c.args) : {}; } catch { args = {}; }
      return { function: { name: c.name, arguments: args } };
    });
    return { role: 'assistant', content, tool_calls: tool_calls.length ? tool_calls : undefined };
  }
}
