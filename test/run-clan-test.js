// Tests the Bob clan names: puns on Bob, stable per copy, never repeated.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { copyName, readRoll, FOUNDERS, POOL, BY_JOB } from '../src/clan.js';
import { systemPrompt } from '../src/persona.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-clan-'));
const cfg = { dataDir };

check('workbench copy is Bobcat', copyName(cfg, 'tinker') === 'Bobcat');
check('the same copy keeps its name', copyName(cfg, 'tinker') === 'Bobcat');
const names = ['ledger', 'scout', 'painter', 'reviewer'].map((k) => copyName(cfg, k));
check('founders get their own names', names.join() === 'Robert,Bobolink,Bobcasso,Bub', names.join());
const extra = Array.from({ length: POOL.length + 5 }, (_, i) => copyName(cfg, `cloud:test${i}`));
const all = readRoll(cfg).copies.map((c) => c.name.toLowerCase());
check('no two copies ever share a name, even past the name list', new Set(all).size === all.length, `${all.length} copies`);
check('new copies get Bob puns first', extra[0] === 'Bobert' && extra[1] === 'Bobby Tables');
check('after the Bob puns, cloud copies get sci-fi names suited to the job', extra[POOL.length] === 'Zaphod', extra[POOL.length]);
check('every name in the list plays on Bob', [...Object.values(FOUNDERS).map((f) => f.name), ...POOL].every((n) => /bob|bub|robert/i.test(n)));
const sp = systemPrompt({ hat: 'tinker', now: 'now', copy: 'Bobcat' });
check('the workbench prompt knows its name', sp.includes('you go by Bobcat') && !sp.includes('{{'));
check('no leftover placeholders at the front desk', !systemPrompt({ now: 'now' }).includes('{{'));
fs.rmSync(dataDir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
