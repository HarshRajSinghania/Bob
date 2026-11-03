// 1.5.63: The owner switched the Coding brain to Qwen3.6 35B-A3B after the race (Qwen3 Coder 30B stays installed).
import fs from 'node:fs';
import { brainDefaults } from '../src/sessions.js';
import { samplingFor, familyOf } from '../src/model-family.js';
import { HELP } from '../public/help-content.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const cat = JSON.parse(fs.readFileSync(new URL('../catalog.json', import.meta.url)));
const q = cat.models.find((m) => m.id === 'qwen3.6-35b-a3b');
check('Qwen3.6 35B-A3B has passed its PC test (no New tag)', q && !q.trial);
const big = cat.packs.find((p) => p.id === 'big');
check('the 16 GB starter set equips it for Brain and Coding, Gemma 4 26B for Office and Deep thinking', ['bob', 'tinker'].every((x) => big.slots['qwen3.6-35b-a3b']?.includes(x)) && ['deep', 'office'].every((x) => big.slots['gemma4-26b']?.includes(x)) && !big.slots['gemma4-26b'].includes('bob') && !big.models.includes('qwen3-coder-30b'));
check('Qwen3 Coder 30B is still in the catalogue to pick', cat.models.some((m) => m.id === 'qwen3-coder-30b' && m.jobs.includes('tinker')));

const id = 'qwen3.6-35b-a3b';
check('Coding thinks at every effort, at 128K', ['low', 'medium', 'high', 'extreme'].every((e) => JSON.stringify(brainDefaults(id, 'tinker', e)) === JSON.stringify({ ctx: 131072 })));
check('everyday chat (Brain) never thinks first, and uses the same 128K load', ['low', 'medium', 'high'].every((e) => JSON.stringify(brainDefaults(id, 'bob', e)) === JSON.stringify({ ctx: 131072, think: false })));
check('every other copy on it gets 128K too, so a hand-off never reloads it', brainDefaults(id, 'scout', 'low').ctx === 131072 && !('think' in brainDefaults(id, 'scout', 'low')));
check('other brains are untouched', JSON.stringify(brainDefaults('qwen3-coder:30b', 'tinker', 'low')) === '{}' && JSON.stringify(brainDefaults('gemma4:26b', 'bob', 'low')) === '{}');

check('family is the Qwen3.5/3.6 one', familyOf(id, null) === 'qwen3.5');
const think = samplingFor({}, id, null, { think: undefined });
check('thinking: temp 0.6, top_p 0.95, top_k 20, min_p 0', think.temperature === 0.6 && think.top_p === 0.95 && think.top_k === 20 && think.min_p === 0 && !think.presence_penalty, JSON.stringify(think));
const plain = samplingFor({}, id, null, { think: false });
check('no thinking: temp 0.7, top_p 0.8, top_k 20, presence_penalty 1.5', plain.temperature === 0.7 && plain.top_p === 0.8 && plain.top_k === 20 && plain.presence_penalty === 1.5, JSON.stringify(plain));
check('with tools the temperature keeps Bob\'s 0.6 cap', samplingFor({}, id, null, { think: false, tools: true }).temperature === 0.6);

const faq = HELP.find((h) => h.id === 'faq-coding-think');
check('Help has the FAQ in Bob\'s voice: coding always thinks, chat answers straight off', faq && /For coding, always/.test(faq.html) && /straight off/.test(faq.html) && faq.title === 'When does Bob think things through first?');
check('the glossary says coding always thinks and chat doesn\'t', /Thinking first<\/dt><dd>[^<]*coding jobs always do; everyday chat at Low answers straight away/.test(HELP.find((h) => h.id === 'glossary').html));
// ---------- 1.5.66: his own one more go thinks it through ----------
{
  const os = await import('node:os'); const path = await import('node:path');
  const { Brain } = await import('../src/brain.js');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob coding '));
  const inn = path.join(tmp, 'inn'), dataDir = path.join(inn, 'bob');
  fs.mkdirSync(dataDir, { recursive: true });
  const make = (bob) => {
    const brain = new Brain({ agentDir: tmp, innDir: inn, dataDir, settingsFile: path.join(dataDir, 'settings.json'), readRoots: [inn], readOnlyRoots: [], recycleBin: false, userName: 'Sam', models: { bob }, engine: 'ollama', ollamaUrl: 'http://127.0.0.1:1' }, () => {});
    clearInterval(brain.reminderTimer);
    brain.ensureModel = async () => {}; brain.fitCtx = async (m, c) => c; brain.recall = async () => '';
    const calls = [];
    const replies = [{ role: 'assistant', content: "Sorry, I can't do that." }, { role: 'assistant', content: 'Here it is: 42.' }];
    brain.engine = { chat: async (o) => { calls.push({ think: o.think, ctx: o.ctx }); return replies.shift() || { role: 'assistant', content: 'ok' }; } };
    return { brain, calls };
  };
  const run = async (b) => { const evs = []; await b.brain.runOn([], 'what is six times seven', (e) => evs.push(e), new AbortController().signal, [], null, 's1'); return evs; };
  const q = make('qwen3.6-35b-a3b');
  const evs = await run(q);
  check('everyday chat on Qwen3.6: the first answer doesn\'t think, at 128K', q.calls[0]?.think === false && q.calls[0]?.ctx === 131072, JSON.stringify(q.calls));
  check('his one more go thinks it through, on the same 128K load', q.calls.length === 2 && q.calls[1].think !== false && q.calls[1].ctx === 131072, JSON.stringify(q.calls));
  check('the chat says so plainly', evs.some((e) => e.type === 'announce' && /thinking it through this time/.test(e.text)));
  const g = make('gemma4:26b');
  const gevs = await run(g);
  check('another brain retries as before (no thinking line)', g.calls.length === 2 && g.calls[1].think === false && !gevs.some((e) => e.type === 'announce' && /thinking it through/.test(e.text)), JSON.stringify(g.calls));
  check('Help says the second go thinks it through', /second go thinks it through: same brain, no reload/.test(faq.html));
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
