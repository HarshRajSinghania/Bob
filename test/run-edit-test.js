// Picture edits: Bob never quietly paints a new picture when an edit was meant, and says when an edit model
// is on the PC but not assigned.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Brain } from '../src/brain.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-edit-'));
const f = (n) => { const p = path.join(dir, n); fs.writeFileSync(p, 'x'); return p; };
const photo = { id: 'r1', name: 'photo', kind: 'chat', file: 'photo.png' };

function bob({ edits = false, waiting = '' } = {}) {
  const b = Object.create(Brain.prototype);
  const sdcpp = { exe: f('sd.exe'), image: { diffusionModel: f('z.gguf') } };
  if (edits) sdcpp.edit = { diffusionModel: f('qie.gguf'), vae: f('vae.st'), llm: f('vl.gguf') };
  b.cfg = { agentDir: dir, painter: { engine: 'sdcpp', sdcpp }, stt: { provider: 'http' } };
  b.refs = { find: (n) => (n === 'photo' ? photo : null), list: () => [photo], pathOf: () => path.join(dir, 'photo.png') };
  b.shop = { roles: async () => ({ current: { edit: '' }, options: { edit: waiting ? [{ value: 'qwen-image-edit-2509', label: waiting }] : [] } }) };
  b.painted = [];
  b.paintOwn = async (kind, args) => { b.painted.push({ kind, args }); return `painted ${kind}`; };
  return b;
}
const ctx = (pics = []) => ({ pics, emit() {}, signal: new AbortController().signal });

{
  const b = bob();
  const r = await b.makeImage({ prompt: 'make it a watercolour' }, ctx([photo]));
  check('a picture attached but not named: nothing is painted, Bob is told how to edit it', !b.painted.length && /Didn't paint yet/.test(r) && /reference \["photo"\]/.test(r) && /mode "new"/.test(r));
  await b.makeImage({ prompt: 'a lighthouse', mode: 'new' }, ctx([photo]));
  check('mode "new" paints something new even with a picture attached', b.painted.at(-1)?.kind === 'image' && !b.painted.at(-1).args.image);
}
{
  const b = bob();
  const r = await b.makeImage({ prompt: 'watercolour', reference: ['photo'] }, ctx([photo]));
  check('an edit with no edit model: nothing painted, and it says so with the way to fix it', !b.painted.length && /Didn't paint anything/.test(r) && /No picture-edit model is on this PC/.test(r) && /start_from/.test(r));
}
{
  const b = bob({ waiting: 'Qwen Image Edit 2509' });
  const r = await b.makeImage({ prompt: 'watercolour', reference: ['photo'] }, ctx([photo]));
  check('an edit model on the PC but not assigned is named, with where to assign it', !b.painted.length && /Qwen Image Edit 2509 is on this PC but isn't assigned to "Picture edits"/.test(r) && /Equip Bob/.test(r));
}
{
  const b = bob();
  const r = await b.makeImage({ prompt: 'watercolour', reference: ['photo'], mode: 'start_from', strength: 0.4 }, ctx([photo]));
  check('start_from (asked for) still reworks the picture, with a drift note', b.painted.at(-1)?.kind === 'image' && b.painted.at(-1).args.strength === 0.4 && /look can drift/.test(r));
}
{
  const b = bob({ edits: true });
  await b.makeImage({ prompt: 'watercolour', reference: ['photo'] }, ctx([photo]));
  check('with an edit model, the picture goes to the edit model as a reference', b.painted.at(-1)?.kind === 'edit' && b.painted.at(-1).args.refs?.[0] === path.join(dir, 'photo.png'));
}
const ui = fs.readFileSync(new URL('../public/cellar.js', import.meta.url), 'utf8');
check('Model roles shows a model that is on the PC but not assigned, with a Use button', /On this PC, not assigned yet/.test(ui) && /data-userole=/.test(ui) && /b\.dataset\.userole/.test(ui));
const tools = fs.readFileSync(new URL('../src/tools.js', import.meta.url), 'utf8');
check('make_image offers mode new', /enum: \['keep_look', 'start_from', 'new'\]/.test(tools));

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
