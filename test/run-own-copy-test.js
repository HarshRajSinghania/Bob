// 1.5.35: a brain picked by its Ollama name (like "gpt-oss:20b") runs from Bob's own pinned copy when that copy is
// downloaded, instead of Ollama's (Ollama's gpt-oss has no chat template: 2 of 25 tool jobs right, the official 25 of 25).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LlamaCpp } from '../src/llamacpp.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-own-'));
const own = path.join(tmp, 'models', 'bob');
const ollama = path.join(tmp, 'models');
const man = path.join(ollama, 'manifests', 'registry.ollama.ai', 'library', 'gpt-oss');
fs.mkdirSync(man, { recursive: true }); fs.mkdirSync(path.join(ollama, 'blobs'), { recursive: true });
fs.writeFileSync(path.join(ollama, 'blobs', 'sha256-ccc'), 'GGUF');
fs.writeFileSync(path.join(man, '20b'), JSON.stringify({ layers: [{ mediaType: 'application/vnd.ollama.image.model', digest: 'sha256:ccc' }] }));
const eng = new LlamaCpp({ agentDir: tmp, dataDir: tmp, bobModelsDir: own, llamacpp: { ollamaModelsDir: ollama } });
clearInterval(eng.idleTimer);
check('without Bob\'s own copy: Ollama\'s file, as before', eng.resolve('gpt-oss:20b').gguf.endsWith('sha256-ccc'));
fs.mkdirSync(path.join(own, 'coding'), { recursive: true });
fs.writeFileSync(path.join(own, 'coding', 'gpt-oss-20b-MXFP4.gguf'), 'GGUF');
check('with the official copy downloaded: that file, by Ollama name', eng.resolve('gpt-oss:20b').gguf === path.join(own, 'coding', 'gpt-oss-20b-MXFP4.gguf'));
check('and by its catalog id', eng.resolve('gpt-oss-20b').gguf === path.join(own, 'coding', 'gpt-oss-20b-MXFP4.gguf'));
fs.rmSync(path.join(own, 'coding'), { recursive: true });
fs.mkdirSync(path.join(own, 'chat'), { recursive: true });
fs.writeFileSync(path.join(own, 'chat', 'gpt-oss-20b-MXFP4.gguf'), 'GGUF');
check('found in another of Bob\'s model folders too (an older Bob filed it under chat)', eng.resolve('gpt-oss:20b').gguf === path.join(own, 'chat', 'gpt-oss-20b-MXFP4.gguf'));
fs.writeFileSync(path.join(own, 'chat', 'gpt-oss-20b-MXFP4.gguf.part'), 'half');
check('a download still in progress is not used', eng.resolve('gpt-oss:20b').gguf.endsWith('sha256-ccc'));
check('a path set by hand still wins', new LlamaCpp({ agentDir: tmp, dataDir: tmp, bobModelsDir: own, llamacpp: { ollamaModelsDir: ollama, models: { 'gpt-oss:20b': 'X:\\\\mine.gguf' } } }).resolve('gpt-oss:20b').gguf === 'X:\\\\mine.gguf');
check('nothing odd in a name reaches the file system', eng.catalogFile('..\\\\x') === null && eng.catalogFile('a b') === null);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
