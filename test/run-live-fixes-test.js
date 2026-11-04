// 1.5.104: fixes from the live test on the replicant matrix. One request gets one Set it up card, a card is never a
// failure, a chat queued behind a picture gets the ⏳ line (and "ok" after it the plain answer), the start of a
// picture doesn't read "Painting 82/82", and brains and programs set by hand in config.json count as here.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Brain } from '../src/brain.js';
import { queuedLine, NOTHING_TO_OK_BUSY, NOTHING_TO_OK } from '../src/handoff.js';
import { configuredGguf } from '../src/models.js';
import { engineExe, ENGINES } from '../src/engines.js';
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { if (ok) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra); } };
const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

// 1. One request, one card: the tool's offer, its retry and Bob's own offer_setup make one card between them.
{
  const events = [];
  const fake = { cfg: {}, log() {}, offers: null };
  const ctx = { emit: (ev) => events.push(ev), job: { id: 'j1' } };
  const first = await Brain.prototype.offerSetup.call(fake, 'web', ctx);
  const again = await Brain.prototype.offerSetup.call(fake, 'web', ctx);
  check('the first offer shows one card', events.filter((e) => e.type === 'offer-setup').length === 1 && /Switch it on/.test(first));
  check('a second offer for the same thing in the same turn shows no new card', events.filter((e) => e.type === 'offer-setup').length === 1 && /already under the chat/.test(again));
  check('both mark the tool as having offered a card', ctx.offeredNow === true);
  const ctx2 = { emit: (ev) => events.push(ev), job: { id: 'j2' } };
  await Brain.prototype.offerSetup.call(fake, 'web', ctx2);
  check('a new request gets its own card', events.filter((e) => e.type === 'offer-setup').length === 2);
}
const brainSrc = read('src/brain.js');
check('a tool that offered a card is not checked or tried again', /ctx\.offeredNow = false;\s*\n\s*try \{ text = String\(await tool\.run\(args, ctx\)\); \}/.test(brainSrc) && /let v = ctx\.offeredNow \? \{ ok: true \} : await this\.checkTool\(name, args, text, ctx\);/.test(brainSrc));

// 2. The ⏳ line for a chat queued behind a picture, clip, song or sound.
check('queued line says what Bob is on and that nothing is needed', queuedLine('Painting 12/30') === "⏳ I'm still on the last job (Painting 12/30). Nothing for you to do; I'll answer this as soon as it's done. If it can't wait, stop that job in Tasks.");
check('queued line without a detail', queuedLine('') === "⏳ I'm still on the last job. Nothing for you to do; I'll answer this as soon as it's done. If it can't wait, stop that job in Tasks.");
check('it goes out as a waiting-line (updated in place), not the old busy note', /type: 'waiting-line', sessionId, jobId: job\.id, id: `queued-\$\{job\.id\}`, text: busy/.test(brainSrc) && !/I'll answer this as soon as it's done\. If this can't wait, stop it in Tasks\./.test(brainSrc));
{
  const sent = [];
  const fake = { lastActivity: 0, approvals: new Map(), gate: { waitingNow: 0 }, state: { state: 'painting' }, queue: [{ id: 'q', state: 'waiting', sessionId: 's1', queuedLine: true }], broadcast: (e) => sent.push(e) };
  const r = Brain.prototype.enqueue.call(fake, 's1', 'ok');
  await new Promise((res) => setTimeout(res, 5));
  check('"ok" while a chat waits behind a picture gets the plain answer, not a job', r.jobId === null && r.answered === NOTHING_TO_OK_BUSY && sent.some((e) => e.text === NOTHING_TO_OK_BUSY));
  check('the plain answer while painting', NOTHING_TO_OK_BUSY === "There's nothing to OK right now. I'm still on the last job, and I'll answer you as soon as it's done." && NOTHING_TO_OK !== NOTHING_TO_OK_BUSY);
}
check('Telegram says each ⏳ line once', /case 'waiting-line': if \(!\(this\.waitSaid \|\|= new Set\(\)\)\.has\(ev\.id\)\)/.test(read('src/telegram.js')));

// 3. "Painting 82/82" at the start: a full bar before the first real step is ignored.
check('a finished-looking bar before the first step is ignored', /if \(!stepping && n >= total\) return; stepping = true;/.test(brainSrc));

// 4. Set by hand in config.json counts as here.
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-live-'));
  const gguf = path.join(dir, 'my-brain.gguf'); fs.writeFileSync(gguf, 'x');
  const exe = path.join(dir, process.platform === 'win32' ? 'llama-server.exe' : 'llama-server'); fs.writeFileSync(exe, 'x');
  check('a brain given its .gguf in llamacpp.models', configuredGguf({ llamacpp: { models: { 'qwen3-4b': gguf } } }, { id: 'qwen3-4b' }) === gguf);
  check('also by its Ollama name, and as { gguf }', configuredGguf({ llamacpp: { models: { 'qwen3:4b': { gguf } } } }, { id: 'x', ollama: 'qwen3:4b' }) === gguf);
  check('a path that isn\'t there doesn\'t count', configuredGguf({ llamacpp: { models: { a: path.join(dir, 'nope.gguf') } } }, { id: 'a' }) === null);
  const lc = ENGINES.find((e) => e.id === 'llamacpp');
  check('llama-server set in llamacpp.exe counts as here', engineExe({ agentDir: path.join(dir, 'agent'), llamacpp: { exe } }, lc) === exe);
  check('a configured exe that isn\'t there doesn\'t count', engineExe({ agentDir: path.join(dir, 'agent'), llamacpp: { exe: path.join(dir, 'gone') } }, lc) === null);
  fs.rmSync(dir, { recursive: true, force: true });
}
check('the models list says where a hand-set brain is', /where = pulled \? \['Ollama'\] : byHand \? \['config\.json'\]/.test(read('src/models.js')));

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
