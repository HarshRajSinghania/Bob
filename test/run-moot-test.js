// 1.5.7 Effort and the moot: Low is today's Bob; High drafts on the big brain and the reviewer checks it once;
// Extreme adds a checkpoint after each code change and checks fixes again. Plus the coding habit, drives, the cat.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Brain } from '../src/brain.js';
import { cleanEffort, effortPrompt, verdict, mootMinutes, draftBrain, reviewBrain } from '../src/moot.js';
import { systemPrompt, HATS, CORE } from '../src/persona.js';
import { catPrompt, catMoment, MOMENTS } from '../public/patches.js';
import { personalityPrompt } from '../public/personality.js';
import { readRoll } from '../src/clan.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-moot-'));
const agentDir = path.join(tmp, 'Agent'), innDir = path.join(agentDir, 'inn'), dataDir = path.join(innDir, 'bob');
fs.mkdirSync(dataDir, { recursive: true });
const cfg = { agentDir, innDir, dataDir, settingsFile: path.join(dataDir, 'settings.json'), readRoots: [innDir], readOnlyRoots: [], recycleBin: false, userName: 'Sam',
  models: { bob: 'main:latest', tinker: 'coder:latest', reviewer: 'qwen3.8:27b' }, sessionBrains: { deep: 'deep:latest' }, engine: 'ollama', ollamaUrl: 'http://127.0.0.1:1' };
const brain = new Brain(cfg, () => {});
clearInterval(brain.reminderTimer);
const loads = [];
brain.ensureModel = async (m) => { loads.push(m); }; brain.fitCtx = async () => 8192; brain.recall = async () => '';
brain.saveSession = () => {}; brain.saveQueue = () => {};
const realRun = brain.runTool.bind(brain);
brain.runTool = async (name, args, ctx) => (name === 'edit_file' ? { text: 'Changed src/a.js (1 edit).' } : realRun(name, args, ctx));

// A fake engine: front desk, workbench and reviewer each answer from their own script.
const calls = [];
let scripts = { desk: [], tinker: [], reviewer: [] };
const who = (sys) => (/second-look copy/.test(sys) ? 'reviewer' : /workbench copy/.test(sys) ? 'tinker' : 'desk');
brain.engine = { chat: async ({ model, messages }) => {
  const w = who(messages[0].content);
  calls.push({ w, model, sys: messages[0].content, last: messages.at(-1).content });
  return scripts[w].shift() || { role: 'assistant', content: w === 'reviewer' ? 'Looks right. Nothing to fix.' : 'done' };
}, unloadAll: async () => {} };
const call = (name, args = {}) => ({ role: 'assistant', content: '', tool_calls: [{ function: { name, arguments: args } }] });
const say = (content) => ({ role: 'assistant', content });
const LONG = 'Here is a careful answer. '.repeat(12);
let n = 0;
async function turn(text, effort, s) {
  calls.length = 0; loads.length = 0; scripts = { desk: [], tinker: [], reviewer: [], ...s };
  const events = [];
  const job = { id: `j${++n}`, sessionId: `s${n}`, text, effort, kind: 'chat' };
  await brain.run(`s${n}`, text, (ev) => events.push(ev), new AbortController().signal, [], job);
  const tokens = events.filter((e) => e.type === 'token').map((e) => e.text).join('');
  return { events, tokens, calls: [...calls], loads: [...loads], hist: brain.session(`s${n}`) };
}

// ---------- Low ----------
{
  const r = await turn('write me a paragraph about cats', 'low', { desk: [say(LONG)] });
  check('Low: one brain, the usual chat brain, no reviewer', r.calls.length === 1 && r.calls[0].model === 'main:latest' && !r.calls.some((c) => c.w === 'reviewer'), r.calls.map((c) => c.model).join());
  check('Low: no effort note in the prompt, no moot', !/Effort is/.test(r.calls[0].sys) && !r.events.some((e) => e.type === 'announce' && /moot/.test(e.text)));
  check('unknown effort values are Low', cleanEffort('turbo') === 'low' && cleanEffort(undefined) === 'low' && effortPrompt('low') === '');
  const j = brain.enqueue('x', 'hi', [], 'nonsense'); brain.cancelJob(j.jobId);
  check('the queue stores a clean effort', brain.queue.find((q) => q.id === j.jobId).effort === 'low' && brain.queueView?.() !== null);
}

// ---------- High, prose ----------
{
  const r = await turn('write me a paragraph about cats', 'high', { desk: [say(LONG)], reviewer: [say('Needs fixes:\n- Too repetitive.\nCorrected answer:\nCats are great.')] });
  check('High: the draft comes from the big brain (Deep thinking)', r.calls[0].w === 'desk' && r.calls[0].model === 'deep:latest', r.calls[0].model);
  check('High: the front desk is told the effort, in one short paragraph', /Effort is High/.test(r.calls[0].sys) && effortPrompt('high').length < 600);
  const rev = r.calls.find((c) => c.w === 'reviewer');
  check('High: the reviewer checks on the Review slot brain (Qwen 3.8)', rev && rev.model === 'qwen3.8:27b', rev?.model);
  check('High: the reviewer sees the draft', rev && rev.last.includes('Here is a careful answer') && /Looks right\.|Needs fixes:/.test(rev.last));
  check('High: prose gets no workbench fix round', !r.calls.some((c) => c.w === 'tinker'));
  check('High: a moot is announced, naming the reviewer copy and its brain', r.events.some((e) => e.type === 'announce' && /calls a moot/.test(e.text) && /qwen3\.8:27b/.test(e.text)));
  check('High: the minutes say to use the corrected answer', /Moot minutes:.*corrected answer/.test(r.tokens), r.tokens.slice(-200));
  check('the review and minutes are kept in the chat history', r.hist.some((m) => m.moot === 'check') && r.hist.some((m) => m.moot === 'minutes'));
  const name = readRoll(cfg).copies.find((c) => c.key === 'reviewer')?.name;
  check('the reviewer copy has a fresh clan name, not Bub', name && name !== 'Bub' && r.tokens.includes(`${name}, second look`), name);
}

// ---------- High, short ----------
{
  const r = await turn('hi', 'high', { desk: [say('Hey Sam.')] });
  check('High: a short chat reply skips the second look (no big brain loads for "hi")', !r.calls.some((c) => c.w === 'reviewer') && r.events.some((e) => e.type === 'announce' && /skipped/.test(e.text)));
}

// ---------- High, code ----------
{
  const r = await turn('fix the off-by-one in a.js', 'high', {
    desk: [call('ask_specialist', { hat: 'tinker', task: 'fix it' })],
    tinker: [{ ...call('edit_file', { path: 'a.js', find: 'i <= n', replace: 'i < n' }), content: 'Plan:\n1. Read a.js\n2. Fix the loop' }, say('Changed a.js. Not run: no Run hand.'), say('Fixed the second point too.')],
    reviewer: [say('Needs fixes:\n- The empty-list case still breaks.')]
  });
  check('the workbench prompt has the careful-engineer steps', /Look first/.test(r.calls.find((c) => c.w === 'tinker')?.sys || '') && /Report honestly/.test(HATS.tinker.prompt));
  const order = r.calls.map((c) => c.w).join(',');
  check('High code: workbench, then reviewer, then one fix round, no second check', /tinker.*reviewer,tinker$/.test(order) && r.calls.filter((c) => c.w === 'reviewer').length === 1, order);
  check('High code: no checkpoints (those are Extreme)', !/Checkpoint/.test(r.tokens));
  check('High code: the fix round gets the reviewer\'s points', r.calls.at(-1).last.includes('empty-list case'));
  check('High code: the minutes say the fixes weren\'t checked again', /fixes made; .* hasn't checked them again/.test(r.tokens), r.tokens.slice(-200));
}

// ---------- Extreme, code ----------
{
  const r = await turn('fix the off-by-one in a.js', 'extreme', {
    desk: [call('ask_specialist', { hat: 'tinker', task: 'fix it' })],
    tinker: [{ ...call('edit_file', { path: 'a.js', find: 'i <= n', replace: 'i < n' }), content: 'Plan: fix the loop.' }, say('Changed a.js.'), say('Fixed.')],
    reviewer: [say('Looks right. The loop bound is fixed.'), say('Needs fixes:\n- Add a test.'), say('Looks right. Test added.')]
  });
  const order = r.calls.map((c) => c.w).join(',');
  check('Extreme: a checkpoint right after the change, inside the workbench job', /^desk,tinker,reviewer,tinker/.test(order) && /Checkpoint, /.test(r.tokens), order);
  check('Extreme: the workbench reads the checkpoint before carrying on', r.calls.filter((c) => c.w === 'tinker')[1]?.last.includes('Checkpoint from'));
  check('Extreme: the workbench brain is brought back after the checkpoint', r.loads.filter((m) => m === 'coder:latest').length >= 2, r.loads.join());
  check('Extreme: final check, fix, then a second check', /reviewer,tinker,reviewer$/.test(order), order);
  check('Extreme: the minutes end "checked, nothing open"', /Moot minutes:.*checked a change: fine.*Result: checked, nothing open\./.test(r.tokens), r.tokens.slice(-300));
}

// ---------- Small parts ----------
check('verdicts are read from the first words', verdict('Looks right. ok') === 'ok' && verdict('Needs fixes:\n- x') === 'fix' && verdict('hmm') === 'unclear');
check('minutes say plainly when points are still open', /not finished/.test(mootMinutes([{ kind: 'check', verdict: 'fix' }], 'R')));
check('without a Review brain, the main brain checks its own work', reviewBrain({ models: { bob: 'm' } }).model === 'm' && draftBrain({ models: { bob: 'm' } }).model === 'm');
check('the scout cross-checks: two sources for important claims, then re-reads the draft', /two independent sources/.test(HATS.scout.prompt) && /re-read your draft/.test(HATS.scout.prompt));
check('the front desk outlines, drafts and re-reads longer writing', /outline, draft, then re-read/.test(systemPrompt({ now: 'now' })));
check('drives live in the Ambition dial (middle = Bob as he was), as things he says, never acts on alone', !/drives/i.test(CORE) && /never act on alone/.test(personalityPrompt({ drive: 3 }, 'Sam')));
check('the persona no longer names Bub', !/Bub\b/.test(CORE));
// The cat
check('cat moments use the cat\'s name and are original lines', MOMENTS.length >= 12 && catMoment('Miso', 3).startsWith('Miso') && !catMoment('Miso', 3).includes('{{'));
const turns = Array.from({ length: 10 }, (_, i) => catPrompt({ cat: 'Patches', turn: i }));
check('the cat turns up in about one turn in five, a short line', turns.filter(Boolean).length === 2 && turns.filter(Boolean).every((t) => t.length < 300));
check('no cat lines when the dials ask for plain or terse replies', !catPrompt({ cat: 'P', turn: 2, dials: { length: 0 } }) && !catPrompt({ cat: 'P', turn: 2, dials: { wit: 0 } }));

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
