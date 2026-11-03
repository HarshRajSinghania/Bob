// 1.5.60: "Check out github.com/MouseWurX/Bob" with web search on. Qwen3 4B answered "I have no live web access" and
// "that isn't on your PC" instead of calling fetch_page. Now the front desk opens the first link itself first.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Brain } from '../src/brain.js';
import { findLinks, normaliseUrl, linkPrompt, LINK_PROMPT } from '../src/web.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };

// ---------- Finding links ----------
check('a bare github address is a link', findLinks('Check out github.com/MouseWurX/Bob')[0] === 'https://github.com/MouseWurX/Bob');
check('"https:/" with one slash is fixed', normaliseUrl('https:/example.com/a') === 'https://example.com/a');
check('a full link keeps its query and loses the full stop after it', findLinks('see https://x.org/p?q=1.')[0] === 'https://x.org/p?q=1');
check('a bare domain with no path is a link', findLinks('what is on docs.python.org')[0] === 'https://docs.python.org/');
for (const t of ['open config.json please', 'run build.sh', 'Bob.app is on the Mac', 'C:\\Users\\you\\notes.ca', 'v1.5.60 is out', 'save it as logo.ai'])
  check(`not a link: ${t}`, findLinks(t).length === 0, JSON.stringify(findLinks(t)));
check('at most two links, no repeats', findLinks('a.com b.com a.com c.com').length === 2);

// ---------- The prompt line ----------
check('web on: the prompt says a link is a web page and fetch_page opens it', linkPrompt({ webSearch: true }).includes(LINK_PROMPT) && /not a file on this PC/.test(LINK_PROMPT) && /fetch_page/.test(LINK_PROMPT));
check('web off: the off line instead, no link line', !linkPrompt({ webSearch: false }));

// ---------- The front desk opens the link before a brain that refuses in prose ----------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-links-'));
const agentDir = path.join(tmp, 'Agent'), innDir = path.join(agentDir, 'inn'), dataDir = path.join(innDir, 'bob');
fs.mkdirSync(dataDir, { recursive: true });
const make = (webSearch) => {
  const cfg = { agentDir, innDir, dataDir, settingsFile: path.join(dataDir, 'settings.json'), readRoots: [innDir], readOnlyRoots: [], recycleBin: false, userName: 'Sam',
    models: { bob: 'qwen3-4b:latest' }, engine: 'ollama', ollamaUrl: 'http://127.0.0.1:1', webSearch };
  const brain = new Brain(cfg, () => {});
  clearInterval(brain.reminderTimer);
  brain.ensureModel = async () => {}; brain.fitCtx = async () => 8192; brain.recall = async () => '';
  const fetched = [];
  brain.tools.fetch_page = { ...brain.tools.fetch_page, run: async ({ url }) => { fetched.push(url); return 'Bob: a local AI helper. README ...'; } };
  const seen = [];
  // A small brain that refuses in prose unless the page is already in front of it.
  brain.engine = { chat: async ({ messages }) => {
    seen.push(messages);
    const has = messages.some((m) => m.role === 'tool' && /README/.test(m.content));
    return { role: 'assistant', content: has ? 'It is Bob, a local AI helper.' : "I don't have live web access, and that link isn't on your PC." };
  } };
  return { brain, fetched, seen };
};
const run = async (b, text) => { const evs = []; await b.brain.runOn([], text, (e) => evs.push(e), new AbortController().signal, [], null, 's1'); return evs; };

{
  const b = make(true);
  const evs = await run(b, 'Check out github.com/MouseWurX/Bob');
  check('web on: the link is opened once, normalised', b.fetched.length === 1 && b.fetched[0] === 'https://github.com/MouseWurX/Bob', JSON.stringify(b.fetched));
  check('the chat shows it as a Read the page step', evs.some((e) => e.type === 'tool' && e.name === 'fetch_page'));
  check('the brain answers from the page first time (no "I can\'t" retry)', b.seen.length === 1, String(b.seen.length));
  const first = b.seen[0];
  check('the page text is in front of the brain before its first word', first.some((m) => m.role === 'tool' && m.tool_name === 'fetch_page'));
  check('the brain is told a link is a web page', first[0].content.includes(LINK_PROMPT));
}
{
  const b = make(false);
  await run(b, 'Check out github.com/MouseWurX/Bob');
  check('web off: nothing is fetched', b.fetched.length === 0);
}
{
  const b = make(true);
  await run(b, 'hi Bob, how are you?');
  check('no link: nothing is fetched', b.fetched.length === 0);
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
