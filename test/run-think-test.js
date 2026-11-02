// 1.5.16: quick (Low effort) replies don't think first. gemma4:e4b thinks by default, which on the PC streamed nothing
// but thinking for 200 tokens before a word of the answer. Medium and up, and Deep thought, keep thinking.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Ollama } from '../src/ollama.js';
import { LlamaCpp } from '../src/llamacpp.js';
import { Brain } from '../src/brain.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-think-'));

// Ollama: what goes in "think"
const ol = new Ollama({ ollamaUrl: 'http://127.0.0.1:1', dataDir: tmp });
let shows = 0;
ol.show = async (m) => { shows++; return { capabilities: m.startsWith('gemma4') || m.startsWith('qwen3') ? ['completion', 'tools', 'thinking'] : ['completion', 'tools'] }; };
check('quick reply on a thinking model: think false', (await ol.thinkField('gemma4:e4b', false)) === false);
check('quick reply on a model that doesn\'t think: nothing sent (no error from Ollama)', (await ol.thinkField('qwen2.5-coder:7b', false)) === undefined);
check('gpt-oss can\'t switch thinking off: its lowest level', (await ol.thinkField('gpt-oss:20b', false)) === 'low');
check('a level still goes only to gpt-oss, as before', (await ol.thinkField('gpt-oss:20b', 'high')) === 'high' && (await ol.thinkField('gemma4:26b', 'high')) === undefined);
check('no setting: nothing sent (the model\'s own default)', (await ol.thinkField('gemma4:e4b', undefined)) === undefined);
await ol.thinkField('gemma4:e4b', false);
check('the model is asked about thinking only once', shows === 2, String(shows));

// Ollama and llama.cpp request bodies
const bodies = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => { bodies.push(JSON.parse(init.body)); return new Response(String(url).includes('/v1/') ? 'data: {"choices":[{"delta":{"content":"hi"}}]}\n\ndata: [DONE]\n\n' : '{"message":{"content":"hi"},"done":true}\n', { status: 200 }); };
await ol.chat({ model: 'gemma4:e4b', messages: [{ role: 'user', content: 'x' }], think: false });
check('Ollama chat sends think:false for a quick reply', bodies.at(-1).think === false);
const lc = new LlamaCpp({ agentDir: tmp, dataDir: tmp, llamacpp: {} });
await lc.chatOnce({ model: 'gemma4:e4b', messages: [{ role: 'user', content: 'x' }], think: false });
check('llama.cpp asks the template to skip thinking for a quick reply', bodies.at(-1).chat_template_kwargs?.enable_thinking === false);
await lc.chatOnce({ model: 'gemma4:e4b', messages: [{ role: 'user', content: 'x' }] });
check('llama.cpp sends nothing extra otherwise', !('chat_template_kwargs' in bodies.at(-1)));
globalThis.fetch = realFetch;

// Bob: Low turns thinking off; Medium and Deep thought keep it
const dataDir = path.join(tmp, 'inn', 'bob'); fs.mkdirSync(dataDir, { recursive: true });
const cfg = { agentDir: tmp, innDir: path.join(tmp, 'inn'), dataDir, settingsFile: path.join(dataDir, 'settings.json'), readRoots: [], readOnlyRoots: [], userName: 'Sam', models: { bob: 'gemma4:e4b', reviewer: 'thinker:20b' }, sessionBrains: { deep: 'gemma4:26b' }, engine: 'ollama', ollamaUrl: 'http://127.0.0.1:1' };
const brain = new Brain(cfg, () => {});
clearInterval(brain.reminderTimer);
brain.ensureModel = async () => {}; brain.fitCtx = async () => 8192; brain.recall = async () => '';
const seen = [];
brain.engine = { chat: async ({ model, think }) => { seen.push({ model, think }); return { role: 'assistant', content: 'ok' }; } };
const ask = async (effort) => { seen.length = 0; await brain.runOn([], 'hi', () => {}, new AbortController().signal, [], { id: 'j', effort }, 's'); return seen[0]; };
check('Low: the chat brain answers without thinking first', (await ask('low')).think === false);
check('Medium: the big brain keeps its own thinking', (await ask('medium')).think === undefined);
cfg.session = 'deep';
check('Deep thought session at Low: its "high" level is kept', (await ask('low')).think === 'high');
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
