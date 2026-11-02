// 1.5.3: Bob shows RAM as well as graphics memory: in the brain label (how each brain splits between the card
// and system memory) and in Now running (graphics card and RAM meters, the brain by its friendly name).
import fs from 'node:fs';
import { Brain } from '../src/brain.js';
import { ramNow } from '../src/server-ram.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

const cfg = { models: { bob: 'gemma4:e4b', tinker: 'qwen3-coder:30b' }, sessionBrains: {}, session: 'normal', ollamaKeepAlive: '5m' };
const status = (loaded) => Brain.prototype.brainStatus.call({ cfg, waking: null, turns: new Map(), engine: { loaded: async () => loaded, estimateLoad: async () => 8 } });
const GB = 1e9;

let s = await status([{ name: 'gemma4:e4b', size: 7 * GB, vram: 5.8 * GB, split: true }]);
check('Ollama: a brain partly in RAM shows both parts', s.models[0].gb === 5.8 && s.models[0].ramGB === 1.2 && s.gb === 5.8 && s.ramGB === 1.2, JSON.stringify(s.models));
s = await status([{ name: 'gemma4:e4b', size: 6 * GB, vram: 6 * GB, split: true }]);
check('Ollama: all on the card means 0 GB in RAM', s.models[0].gb === 6 && s.ramGB === 0 && s.models[0].onCard);
s = await status([{ name: 'gemma4:e4b', size: 6 * GB, vram: 0, split: true }]);
check('Ollama: on the processor only, it is all RAM', s.models[0].gb === 0 && s.ramGB === 6 && !s.models[0].onCard);
s = await status([{ name: 'gemma4:e4b', size: 6 * GB, vram: 0, split: false }]);
check('llama.cpp without a per-process figure: no RAM guess, the file size as before', s.ramGB === null && s.models[0].gb === 6 && s.models[0].ramGB === null);
s = await status([{ name: 'gemma4:e4b', size: 6 * GB, vram: 5 * GB, split: true }]);
check('llama.cpp with nvidia-smi: card and RAM', s.models[0].gb === 5 && s.ramGB === 1);
s = await status([]);
check('nothing loaded: no RAM figure', s.ramGB === null && s.gb === 0 && s.state === 'asleep');

const llama = read('src/llamacpp.js'), ollama = read('src/ollama.js');
check('engines say whether they know the split', /split: vram > 0/.test(llama) && /split: true/.test(ollama));

const bar = read('public/brain-bar.js');
check('the label reads "5.8 GB on the graphics card · 1.2 GB in RAM"', /GB on the graphics card`/.test(bar) && /GB in RAM`/.test(bar) && /parts\.join\(' · '\)/.test(bar) && /Brain: loaded · \$\{mem\}/.test(bar) && /Brain: working · \$\{mem\}/.test(bar));

const r = ramNow(32 * GB, 20 * GB);
check('system RAM in use: total minus available', r.usedGB === 12 && r.totalGB === 32);
const server = read('src/server.js'), layout = read('public/layout.js'), html = read('public/index.html');
check('/api/gpu adds RAM and the brain by its friendly name', /ram: ramNow\(\), brain:/.test(server) && /entry\?\.name \|\| id/.test(server));
check('Now running: a Memory section with Graphics card and RAM meters', /<div class="now-sec">Memory<\/div>/.test(html) && /row\('RAM', ram\)/.test(layout) && /textContent = 'RAM'/.test(layout));
check('no NVIDIA card says "Graphics card: not detected", not the old wording', /'not detected'/.test(layout) && !/No NVIDIA card info/.test(layout));
check('model ids stay out of Now running (friendly name only)', /`Brain: \$\{brain\}`/.test(layout) && !/· \$\{model\}/.test(layout));
const css = read('public/style.css');
check('the Session menu has its own line, so its name is not cut off', /\.side \.session-wrap \{ flex-wrap: wrap; \}/.test(css) && /\.side \.session \{ flex: 1 1 100%; \}/.test(css));

// The Hands kill switch on the chat page (1.5.3). Hands are turned on in Settings; this only stops them.
{
  const hs = read('public/hands-switch.js'), app = read('public/app.js');
  const { cleanHands, handOn, handOffWhy } = await import('../src/hands-settings.js');
  const { holdHands } = await import('../src/hands.js');
  check('a Hands button sits next to "Free memory when Bob is idle"', /id="brainFree"[\s\S]{0,300}id="handsBtn"/.test(html));
  check('the chat-page switch never touches the Settings switches', !/\/api\/hands\/settings/.test(hs) && !/enabled:\s*true/.test(hs) && /\/api\/hands\/hold/.test(hs));
  check('changes from elsewhere show on the button too', /ev\.type === 'hands'\) handsSwitch\.update\(ev\.settings\)/.test(app));
  const mk = (h) => { const b = { cfg: { hands: cleanHands(h) }, saveHands(n) { this.cfg.hands = n; }, denyHands: () => 1, log() {} }; return b; };
  let b = mk({ enabled: false, files: { on: true } }), threw = '';
  try { holdHands(b, false); } catch (e) { threw = e.message; }
  check('with Hands off in Settings the switch cannot switch anything on', /off in Settings/.test(threw) && !handOn(b.cfg, 'files'));
  b = mk({ enabled: true, files: { on: true } });
  const n = holdHands(b, true);
  check('stopping keeps Settings as it was, answers waiting cards No and blocks the Hand', b.cfg.hands.enabled === true && b.cfg.hands.files.on === true && b.cfg.hands.held === true && n === 1 && !handOn(b.cfg, 'files'));
  check('Bob is told why, and where to switch it back', /chat page/.test(handOffWhy(b.cfg, 'files')));
  holdHands(b, false);
  check('switching back on lets the same Hands work again, nothing more', handOn(b.cfg, 'files') && !handOn(b.cfg, 'run'));
  const r = read('src/hands-routes.js');
  check('stopping works from anywhere; carrying on only at the PC', r.indexOf("p === '/api/hands/hold' && b.held === true") < r.indexOf('if (!isLocal)') && r.indexOf("if (p === '/api/hands/hold') { holdHands(brain, false)") > r.indexOf('if (!isLocal)'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
