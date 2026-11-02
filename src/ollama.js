// Talks to the local Ollama server: chat streaming, what's loaded, loading and unloading.
import fs from 'node:fs';
import path from 'node:path';

export class Ollama {
  constructor(cfg) {
    this.cfg = cfg;
    this.url = cfg.ollamaUrl.replace(/\/$/, '');
    this.timesFile = path.join(cfg.dataDir, 'load-times.json');
    try { this.loadTimes = JSON.parse(fs.readFileSync(this.timesFile, 'utf8')); } catch { this.loadTimes = {}; }
    this.sizes = {};
  }

  async json(p, body, signal) {
    const res = await fetch(this.url + p, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal
    });
    if (!res.ok) throw new Error(`Ollama ${p} returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return res.json();
  }

  async loaded() {
    const r = await this.json('/api/ps');
    return (r.models || []).map((m) => ({ name: m.name || m.model, size: m.size, vram: m.size_vram }));
  }

  // cpu: the model must be running on the processor only (Art session), so the painter keeps the card.
  async isLoaded(model, { cpu = false, ctx } = {}) {
    if (ctx && this.ctxOf?.[model] !== ctx) return false; // a different context size means a reload
    return (await this.loaded()).some((m) => (m.name === model || m.name === model + ':latest') && (!cpu || !m.vram));
  }

  // The longest context a model was made for (from /api/show), so a session never asks for more.
  async maxCtx(model) {
    (this.ctxMax ||= {});
    if (model in this.ctxMax) return this.ctxMax[model];
    try {
      const info = (await this.json('/api/show', { model })).model_info || {};
      const k = Object.keys(info).find((x) => x.endsWith('.context_length'));
      this.ctxMax[model] = k ? Number(info[k]) || null : null;
    } catch { this.ctxMax[model] = null; }
    return this.ctxMax[model];
  }

  // Whether a model can look at pictures (Ollama lists "vision" in its capabilities).
  async hasVision(model) {
    (this.vision ||= {});
    if (!(model in this.vision)) {
      try { this.vision[model] = ((await this.json('/api/show', { model })).capabilities || []).includes('vision'); } catch { return false; }
    }
    return this.vision[model];
  }

  // Options for a request: num_gpu 0 keeps a model entirely off the graphics card.
  opts(cpu, ctx) { const o = { ...(cpu ? { num_gpu: 0 } : {}), ...(ctx ? { num_ctx: ctx } : {}) }; return Object.keys(o).length ? o : undefined; }

  async modelSize(model) {
    if (this.sizes[model]) return this.sizes[model];
    try {
      const r = await this.json('/api/tags');
      for (const m of r.models || []) this.sizes[m.name] = m.size;
    } catch { /* fall through */ }
    return this.sizes[model] || 0;
  }

  // Seconds Bob expects a load to take: the last measured time, else a guess from file size.
  async estimateLoad(model) {
    if (this.loadTimes[model]) return Math.round(this.loadTimes[model]);
    const gb = (await this.modelSize(model)) / 1e9;
    return gb ? Math.max(5, Math.round(gb * 0.9)) : 15;
  }

  async preload(model, signal, { cpu = false, ctx } = {}) {
    (this.ctxOf ||= {})[model] = ctx || null;
    const t0 = Date.now();
    await this.json('/api/generate', { model, prompt: '', keep_alive: this.keepAlive(), options: this.opts(cpu, ctx) }, signal);
    const secs = (Date.now() - t0) / 1000;
    if (!cpu) this.loadTimes[model] = secs;
    try { fs.writeFileSync(this.timesFile, JSON.stringify(this.loadTimes, null, 2)); } catch { /* not fatal */ }
    return secs;
  }

  async unloadAll() {
    const models = await this.loaded();
    for (const m of models) {
      await this.json('/api/generate', { model: m.name, prompt: '', keep_alive: 0 }).catch(() => {});
    }
    return models.map((m) => m.name);
  }

  // Lets go of everything on the graphics card; models running on the processor stay.
  async unloadGpu() {
    const models = (await this.loaded()).filter((m) => m.vram > 0);
    for (const m of models) await this.json('/api/generate', { model: m.name, prompt: '', keep_alive: 0 }).catch(() => {});
    return models.map((m) => m.name);
  }

  // How long Ollama keeps a model in memory after use (setting ollamaKeepAlive, default 10 minutes).
  keepAlive() { const k = String(this.cfg?.ollamaKeepAlive ?? '10m'); return /^\d+[smh]$|^-1$/.test(k) ? (k === '-1' ? -1 : k) : '10m'; }

  // Embeddings for topic matching (housekeeping). Never downloads: a model that isn't on this PC is an error,
  // and the housekeeper then matches topics by name and words instead.
  async embed(model, input) {
    const r = await this.json('/api/embed', { model, input, keep_alive: '2m' });
    if (!Array.isArray(r?.embeddings)) throw new Error('no embeddings');
    return r.embeddings;
  }

  // Streams a chat. Calls onToken(text) for visible text. Returns the final assistant message.
  async chat({ model, messages, tools, signal, onToken, cpu = false, think, ctx }) {
    const res = await fetch(this.url + '/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages, tools: tools && tools.length ? tools : undefined, stream: true, keep_alive: this.keepAlive(), options: this.opts(cpu, ctx),
        // Deep thought: gpt-oss takes a reasoning level; other models don't all understand "think", so it's only sent to gpt-oss.
        think: think && /gpt-oss/.test(model) ? think : undefined }),
      signal
    });
    if (!res.ok) throw new Error(`Ollama chat returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
    let content = '';
    const toolCalls = [];
    let buf = '';
    const decoder = new TextDecoder();
    for await (const chunk of res.body) {
      buf += decoder.decode(chunk, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        const ev = JSON.parse(line);
        if (ev.error) throw new Error('Ollama: ' + ev.error);
        const msg = ev.message || {};
        if (msg.content) { content += msg.content; onToken && onToken(msg.content); }
        if (msg.tool_calls) toolCalls.push(...msg.tool_calls);
      }
    }
    return { role: 'assistant', content, tool_calls: toolCalls.length ? toolCalls : undefined };
  }
}
