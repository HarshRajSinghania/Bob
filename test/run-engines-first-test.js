// 1.5.74 "engines first": first start gets the core engines and one small starter brain before anything else,
// and checks that each engine really starts. Run: node test/run-engines-first-test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { starterBrain, readyPlan, CORE_ENGINES } from '../public/equip.js';
import { checkEngine } from '../src/engines.js';
import { exeName } from '../src/platform.js';

const here = path.dirname(fileURLToPath(import.meta.url));
let failures = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failures++; };
const cat = JSON.parse(fs.readFileSync(path.join(here, '..', 'catalog.json'), 'utf8'));

// The starter brain for each device.
check(starterBrain({ vramGB: 16, ramGB: 32 }) === 'gemma4-e4b', 'PC with a 16 GB card: Gemma 4 E4B');
check(starterBrain({ vramGB: 8, ramGB: 16 }) === 'gemma4-e4b', 'PC with an 8 GB card: E4B');
check(starterBrain({ vramGB: 6, ramGB: 32 }) === 'gemma4-e2b', 'laptop with a 6 GB card: E2B');
check(starterBrain({ ramGB: 32 }) === 'gemma4-e2b', 'no graphics card: E2B');
check(starterBrain({ vramGB: 16, ramGB: 32, integrated: true }) === 'gemma4-e4b', 'built-in graphics with 32 GB (Legion Go): E4B');
check(starterBrain({ vramGB: 6, ramGB: 16, unified: true }) === 'gemma4-e4b' && starterBrain({ vramGB: 5, ramGB: 8, unified: true }) === 'gemma4-e2b', 'Mac: E4B from 16 GB, E2B on 8 GB');
for (const id of ['gemma4-e4b', 'gemma4-e2b']) check(cat.models.find((m) => m.id === id)?.files?.some((f) => f.role === 'gguf'), `${id} downloads without Ollama`);

// What step 1 queues: missing core engines first (none that this computer has no build of), then the brain.
const models = cat.models.map((m) => ({ ...m, status: { state: 'missing' } }));
const engines = [{ id: 'llamacpp', installed: false }, { id: 'sdcpp', installed: true }, { id: 'whispercpp', installed: false, available: false }, { id: 'piper', installed: false }];
const p = readyPlan({ vramGB: 16, ramGB: 32 }, models, engines);
check(p.ids.join() === 'engine:llamacpp,gemma4-e4b', `queues only what's missing, engines first (${p.ids.join()})`);
check(p.engines.map((e) => e.id).join() === 'llamacpp,sdcpp', 'shows the core engines this computer can have (not whisper.cpp on a Mac, not Piper)');
const done = readyPlan({ vramGB: 16 }, models.map((m) => (m.id === 'gemma4-e4b' ? { ...m, status: { state: 'installed' } } : m)), engines.map((e) => ({ ...e, installed: true })));
check(done.ids.length === 0, 'nothing to queue once everything is here');
check(CORE_ENGINES.join() === 'llamacpp,sdcpp,whispercpp', 'core engines: llama.cpp, stable-diffusion.cpp, whisper.cpp');

// Does each engine start? (run is replaced: no real program is started.)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-engcheck-'));
const cfg = { agentDir: tmp };
check((await checkEngine(cfg, 'llamacpp')).why === 'not downloaded yet', 'not downloaded: says so');
fs.mkdirSync(path.join(tmp, 'llama.cpp'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'llama.cpp', exeName('llama-server')), 'x');
let asked = null;
const ok = await checkEngine(cfg, 'llamacpp', { run: (exe, args, o, cb) => { asked = args; cb(null, 'usage: llama-server [options]', ''); } });
check(ok.ok && asked.join() === '--help', 'starts with --help and prints: works');
const dll = await checkEngine(cfg, 'llamacpp', { run: (exe, a, o, cb) => cb(Object.assign(new Error('x'), { code: -1073741515 }), '', '') });
check(!dll.ok && /0xC0000135/.test(dll.why) && /runtime file/.test(dll.why), `a missing runtime file is named (${dll.why})`);
const gone = await checkEngine(cfg, 'llamacpp', { run: (exe, a, o, cb) => cb(Object.assign(new Error('x'), { code: 'ENOENT' }), '', '') });
check(!gone.ok && /couldn't be started/.test(gone.why), 'a program that can\'t start says so');
const quiet = await checkEngine(cfg, 'llamacpp', { run: (exe, a, o, cb) => cb(null, '', '') });
check(!quiet.ok, 'silence is not "works"');
const slow = await checkEngine(cfg, 'llamacpp', { run: (exe, a, o, cb) => cb(Object.assign(new Error('x'), { killed: true }), '', '') });
check(!slow.ok && /20 seconds/.test(slow.why), 'no answer in time');
const help1 = await checkEngine(cfg, 'llamacpp', { run: (exe, a, o, cb) => cb(Object.assign(new Error('x'), { code: 1 }), '', 'usage: ...') });
check(help1.ok, 'an old build that exits 1 after printing its help still works');
fs.rmSync(tmp, { recursive: true, force: true });

// Welcome wiring.
const cellar = fs.readFileSync(path.join(here, '..', 'public', 'cellar.js'), 'utf8');
check(/Step 1: getting me ready/.test(cellar) && /data-getready/.test(cellar) && /\/api\/engines\/check/.test(cellar), 'Welcome has step 1 with its checks and Try again');
check(!/readyTried/.test(cellar) && /Get Bob ready \(about \$\{gb\(readyGB\)\}\)/.test(cellar), 'step 1 is one click on Get Bob ready, with its size; never started by itself');
check(/data-readypause/.test(cellar) && /data-readystop/.test(cellar) && /data-readyresume/.test(cellar), 'Pause, Stop and Resume sit in step 1');
check(/Not enough free disk: free up \$\{short\} GB, then press Try again\./.test(cellar) && /needGB \+ 2/.test(cellar), 'won\'t start without its size plus 2 GB free');
check(/Free disk: \$\{hw\.freeGB/.test(cellar.slice(cellar.indexOf('Step 1: getting me ready'))), 'size and free disk are shown before anything moves');
const server = fs.readFileSync(path.join(here, '..', 'src', 'server.js'), 'utf8');
check(/'\/api\/engines\/check'/.test(server), 'the server answers /api/engines/check');

console.log(`\n${failures ? failures + ' failed' : 'all passed'}`);
process.exit(failures ? 1 : 0);
