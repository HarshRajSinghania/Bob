// Tests the download manager: a queue you can reorder, pause and resume (HTTP Range), cancel,
// one or two at once, retries, and surviving a restart.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { ModelShop } from '../src/models.js';
import { mergeSettings } from '../src/config.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const until = async (fn, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await new Promise((r) => setTimeout(r, 15)); } return false; };

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-dl-'));
const dataDir = path.join(root, 'inn', 'bob');
fs.mkdirSync(dataDir, { recursive: true });
const cfg = { agentDir: root, dataDir, bobModelsDir: path.join(root, 'models', 'bob'), settingsFile: path.join(dataDir, 'settings.json'), modelSearchRoots: [], ollamaUrl: 'http://127.0.0.1:1', engine: 'ollama', models: {} };

// A fake Hugging Face that streams slowly (so there's time to pause) and honours Range requests.
const content = crypto.randomBytes(1_200_000);
const sha = crypto.createHash('sha256').update(content).digest('hex');
const gets = []; // [{ url, range }]
let mode = 'ok'; // 'ok' | 'norange' | 'neterr-once' | 'bad'
let neterrDone = false;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.includes('127.0.0.1:1')) throw new Error('ECONNREFUSED');
  if (opts.method === 'HEAD') return new Response(null, { status: 302, headers: { 'x-linked-etag': `"${sha}"`, 'x-linked-size': String(content.length) } });
  const range = opts.headers?.range || '';
  gets.push({ url: u, range });
  if (mode === 'neterr-once' && !neterrDone) { neterrDone = true; throw new Error('fetch failed (connection reset)'); }
  const from = mode !== 'norange' && range ? Number(/bytes=(\d+)-/.exec(range)[1]) : 0;
  let body = content.subarray(from);
  if (mode === 'bad') { body = Buffer.from(body); body[5] ^= 0xff; }
  const signal = opts.signal;
  const r = new Response(new ReadableStream({
    async start(c) {
      for (let i = 0; i < body.length; i += 40000) {
        if (signal?.aborted) { c.error(signal.reason); return; }
        c.enqueue(body.subarray(i, i + 40000));
        await new Promise((x) => setTimeout(x, 12));
      }
      c.close();
    }
  }), { status: from ? 206 : 200 });
  Object.defineProperty(r, 'url', { value: u });
  return r;
};

const events = [];
let shop = new ModelShop(cfg, (e) => events.push(e));
const item = (id) => shop.dl.find((d) => d.id === id);
const A = 'whisper-base-en', B = 'whisper-large-v3-turbo', C = 'qwen3-4b';
const fileOf = (id) => { const e = shop.catalog.models.find((m) => m.id === id); return path.join(cfg.bobModelsDir, e.category, path.basename(new URL(e.files[0].url).pathname)); };

// 1. Pause keeps the half file; resume asks for the rest with a Range request and finishes intact.
await shop.download(A);
await until(() => (shop.active.get(A)?.pub.done || 0) > 300000);
shop.pause(A);
await until(() => item(A).state === 'paused');
const part = fileOf(A) + '.part';
const partSize = fs.existsSync(part) ? fs.statSync(part).size : 0;
check('pause keeps the half-downloaded file', item(A).state === 'paused' && partSize > 0 && partSize < content.length, `${partSize}`);
gets.length = 0;
shop.resume(A);
await until(() => item(A).state === 'done');
const whole = fs.existsSync(fileOf(A)) && crypto.createHash('sha256').update(fs.readFileSync(fileOf(A))).digest('hex') === sha;
check('resume picks up where it stopped (Range request) and the file checks out', item(A).state === 'done' && whole && gets.some((g) => g.range === `bytes=${partSize}-`), JSON.stringify(gets.map((g) => g.range)));

// 2. A server that ignores Range: start that file again, don't loop forever.
await shop.download(B);
await until(() => (shop.active.get(B)?.pub.done || 0) > 200000);
shop.pause(B);
await until(() => item(B).state === 'paused');
mode = 'norange';
shop.resume(B);
await until(() => ['done', 'failed'].includes(item(B).state));
check('a server that ignores Range gets a clean restart of that file', item(B).state === 'done' && fs.statSync(fileOf(B)).size === content.length, item(B).error || '');
mode = 'ok';

// 3. Cancel deletes the half file.
fs.rmSync(fileOf(C), { force: true });
await shop.download(C);
await until(() => (shop.active.get(C)?.pub.done || 0) > 100000);
shop.cancel(C);
await until(() => item(C).state === 'cancelled');
check('cancel stops it and deletes the half-downloaded file', item(C).state === 'cancelled' && !fs.existsSync(fileOf(C) + '.part'));

// 4. Queue order: one at a time, top first; dragging changes what's next.
for (const id of [A, B]) fs.rmSync(fileOf(id), { force: true });
shop.clearDownloads();
gets.length = 0;
await shop.download(A, { queue: [B, C] });
check('several downloads queue up, one running at a time', item(A).state === 'downloading' && item(B).state === 'queued' && item(C).state === 'queued');
shop.moveDownload(C, B);
await until(() => [A, B, C].every((id) => item(id).state === 'done'), 15000);
const firstGet = (id) => gets.findIndex((g) => g.url === shop.catalog.models.find((m) => m.id === id).files[0].url);
check('a download dragged up runs next', firstGet(C) > firstGet(A) && firstGet(C) < firstGet(B), `${firstGet(A)} ${firstGet(C)} ${firstGet(B)}`);

// 5. Two at once when the setting says so.
mergeSettings(cfg, { downloads: { concurrent: 2 } });
check('settings accept 1 or 2 at once only', cfg.downloads.concurrent === 2 && (mergeSettings({}, { downloads: { concurrent: 9 } }).downloads.concurrent === 1));
for (const id of [A, B]) fs.rmSync(fileOf(id), { force: true });
await shop.download(A, { queue: [B] });
check('two run side by side', item(A).state === 'downloading' && item(B).state === 'downloading');
await until(() => item(A).state === 'done' && item(B).state === 'done');
mergeSettings(cfg, { downloads: { concurrent: 1 } });

// 6. A network hiccup is retried later; a damaged file isn't.
fs.rmSync(fileOf(A), { force: true });
mode = 'neterr-once';
await shop.download(A);
await until(() => item(A).tries === 1);
check('a network hiccup waits and tries again', item(A).state === 'queued' && item(A).retryAt > Date.now() && /connection reset/.test(item(A).error), item(A).state);
shop.cancel(A);
mode = 'bad';
fs.rmSync(fileOf(A), { force: true });
await shop.download(A);
await until(() => ['failed', 'queued'].includes(item(A).state) && !shop.active.has(A));
check('a damaged file fails straight away (no retry) and the next one carries on', item(A).state === 'failed' && /checksum/.test(item(A).error) && !fs.existsSync(fileOf(A) + '.part'));
mode = 'ok';

// 7. Restart: what was running comes back paused (opt-in to carry on by itself).
fs.rmSync(fileOf(B), { force: true });
await shop.download(B);
await until(() => (shop.active.get(B)?.pub.done || 0) > 100000);
const saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'downloads.json'), 'utf8'));
check('the list is saved to downloads.json', saved.some((d) => d.id === B && d.state === 'downloading'));
const again = new ModelShop(cfg, () => {});
const b2 = again.dl.find((d) => d.id === B);
check('after a restart an unfinished download waits, paused, for Resume', b2.state === 'paused' && /closed/.test(b2.note) && again.active.size === 0);
const auto = new ModelShop({ ...cfg, downloads: { resumeOnStart: true } }, () => {});
check('with "carry on when Bob starts" it queues up again', auto.dl.find((d) => d.id === B).state === 'queued');
shop.cancel(B);
await until(() => !shop.active.size);
check('downloads events carry the whole list for the Downloads panel', events.some((e) => e.type === 'downloads' && Array.isArray(e.items) && e.items.some((d) => d.id === A)));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
