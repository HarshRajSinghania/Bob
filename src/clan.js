// The Bob clan: every copy of Bob gets its own play on "Bob", and no two copies ever share a name.
// The roll is kept in inn\bob\clan.json, so a name once given is never given again.
import fs from 'node:fs';
import path from 'node:path';

// The first copies, one per job.
export const FOUNDERS = {
  tinker: { name: 'Bobcat', why: 'heavy machinery for heavy code' },
  ledger: { name: 'Robert', why: 'insists on his full name; keeps the books' },
  scout: { name: 'Bobolink', why: 'a bird that ranges far and comes back with news' },
  painter: { name: 'Bobcasso', why: 'the artsy one' },
  reviewer: { name: 'Bub', why: 'short, blunt, slightly grumpy' }
};

// Names for later copies (cloud helpers and anything new), handed out in order, never reused.
export const POOL = [
  'Bobert', 'Bobby Tables', 'Bob++', 'Bobject', 'Bobzilla', 'Bobi-Wan', 'Bobba Fett', 'Bob-omb', 'Bobble', 'Bobsled',
  'Kebob', 'Bobbin', 'Roberto', 'Bobbit', 'Bobtimus Prime', 'Bobcorn', 'Discobob', 'Bobservatory', 'Thingamabob', 'Bobsidian',
  'Bobathan', 'Bobble-Head', 'Bobolith', 'Bobnoxious', 'Bobtail', 'Shishkebob', 'Bobbington', 'Robobob', 'Bobstacle', 'Bob 2: Electric Bobaloo'
];

// When the Bob puns run out, copies borrow great sci-fi and fantasy names that suit their job, punned where possible.
export const BY_JOB = {
  tinker: ['Montgomery Bob', 'Bobi La Forge', 'Kaylee', 'Tony Bobstark', 'Hephaestus', 'Gimli', 'Bobby Wrench', 'Daedalus', 'Rocket', 'Chief O\'Bobrien', 'Fezzik', 'Bender', 'Q-Bob', 'Gizmo'],
  ledger: ['Hari Seldon', 'Deep Thought', 'Bobbage', 'Spock-keeper', 'Mr. Tally-Ho', 'The Abacus of Gondor', 'Tharkun the Thrifty', 'Bilbo Bookkeeper', 'Quark', 'Gringotts', 'Cogsworth', 'Ledger-main'],
  scout: ['Ford Prefect', 'Strider', 'Radagast', 'Uhura', 'Samwise', 'Arthur Dent', 'Bobi Tano', 'Wayfinder', 'Hermione', 'The Hitchhiker', 'Pathfinder Bob', 'Gandalf the Googler'],
  painter: ['Slartibartfast', 'Bob Fjordmaker', 'Luna Lovebob', 'Ferris Wheeler', 'Elrond Hues', 'Pixel Prime', 'Leonardo da Vinci-Bot', 'Bobsidian Brush', 'The Fjord Prefect'],
  reviewer: ['Marvin', 'Mad-Eye Bobby', 'Odo', 'Tuvok', 'Worf-worthy', 'Rorschach', 'Judge Bobb', 'Inspector Javert', 'Grumpy Bobalf', 'Constant Vigilance'],
  cloud: ['Zaphod', 'Trillian', 'Starbuck', 'Skywalker', 'Bob-in-the-Sky', 'Cloud City Bob', 'Mothership', 'Nimbus 2000', 'Stratus Bob', 'Orbiter', 'Major Tom', 'Space Bobby']
};
const GENERAL = ['Rincewind', 'Ripley', 'Hal-Bob', 'Kirkbob', 'Bobba Ganoush', 'Bobble Fett', 'Frodo Bobbins', 'The Bobfather', 'Bobcat Ballou', 'Bobsidian Order', 'Bobby Dazzler', 'Bob Marley Jacob'];

function rollFile(cfg) { return path.join(cfg.dataDir, 'clan.json'); }

export function readRoll(cfg) {
  try { return JSON.parse(fs.readFileSync(rollFile(cfg), 'utf8')); } catch { return { copies: [] }; }
}

// The name for a copy, by its job or helper key. Gives a new, never-used name the first time.
export function copyName(cfg, key, role) {
  const roll = readRoll(cfg);
  const have = roll.copies.find((c) => c.key === key);
  if (have) return have.name;
  const used = new Set(roll.copies.map((c) => c.name.toLowerCase()));
  for (const f of Object.values(FOUNDERS)) used.add(f.name.toLowerCase());
  const job = String(key).startsWith('cloud:') ? 'cloud' : String(key).split(':')[0];
  const free = (list) => (list || []).find((n) => !used.has(n.toLowerCase()));
  let name = FOUNDERS[key] && !roll.copies.some((c) => c.name === FOUNDERS[key].name) ? FOUNDERS[key].name : free(POOL) || free(BY_JOB[job]) || free(GENERAL) || free(Object.values(BY_JOB).flat());
  for (let n = roll.copies.length + 2; !name; n++) if (!used.has(`bob-${n}`)) name = `Bob-${n}`;
  roll.copies.push({ key, name, role: role || key, born: new Date().toISOString().slice(0, 10) });
  try { fs.writeFileSync(rollFile(cfg), JSON.stringify(roll, null, 2)); } catch {}
  return name;
}
