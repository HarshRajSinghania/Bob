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
check('the 16 GB starter set equips it for Coding', big.slots['qwen3.6-35b-a3b']?.includes('tinker') && !big.models.includes('qwen3-coder-30b'));
check('Qwen3 Coder 30B is still in the catalogue to pick', cat.models.some((m) => m.id === 'qwen3-coder-30b' && m.jobs.includes('tinker')));

const id = 'qwen3.6-35b-a3b';
check('Coding at Low: 128K and no thinking', JSON.stringify(brainDefaults(id, 'tinker', 'low')) === JSON.stringify({ ctx: 131072, think: false }));
check('Coding at Medium and up: 128K and it thinks', ['medium', 'high', 'extreme'].every((e) => JSON.stringify(brainDefaults(id, 'tinker', e)) === JSON.stringify({ ctx: 131072 })));
check('other brains are untouched', JSON.stringify(brainDefaults('qwen3-coder:30b', 'tinker', 'low')) === '{}' && JSON.stringify(brainDefaults('gemma4:26b', 'bob', 'low')) === '{}');

check('family is the Qwen3.5/3.6 one', familyOf(id, null) === 'qwen3.5');
const think = samplingFor({}, id, null, { think: undefined });
check('thinking: temp 0.6, top_p 0.95, top_k 20, min_p 0', think.temperature === 0.6 && think.top_p === 0.95 && think.top_k === 20 && think.min_p === 0 && !think.presence_penalty, JSON.stringify(think));
const plain = samplingFor({}, id, null, { think: false });
check('no thinking: temp 0.7, top_p 0.8, top_k 20, presence_penalty 1.5', plain.temperature === 0.7 && plain.top_p === 0.8 && plain.top_k === 20 && plain.presence_penalty === 1.5, JSON.stringify(plain));
check('with tools the temperature keeps Bob\'s 0.6 cap', samplingFor({}, id, null, { think: false, tools: true }).temperature === 0.6);

const faq = HELP.find((h) => h.id === 'faq-coding-think');
check('Help has the FAQ in Bob\'s voice', faq && /\bI answer straight off\b/.test(faq.html) && /Medium/.test(faq.html));
check('the glossary says when the Coding brain thinks', /Thinking first<\/dt><dd>[^<]*Coding brain[^<]*Medium/.test(HELP.find((h) => h.id === 'glossary').html));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
