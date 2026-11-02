// The Apps Hand: off by default, a card for every open/look/act, the never-touch list (terminals, admin tools,
// password managers and prompts, password fields, Bob's own window), keys Bob may press, the "Bob is driving"
// bar only while acting, taking over with the mouse or Esc, and Stop everything ending the helper.
// Uses test/mock-apps-driver.js in place of installer\bob-apps.ps1.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanHands, handOn, toolsOff, HANDS } from '../src/hands-settings.js';
import { handsTools, stopEverything, handsPrompt, runningNow } from '../src/hands.js';
import { AppsDriver, blockedWindow, blockedApp, keysFor, BLOCKED_PROCESSES } from '../src/hands-apps.js';
import { Brain } from '../src/brain.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const throws = (f, re) => { try { f(); return false; } catch (e) { return re ? re.test(e.message) : true; } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-apps-'));
const mockLog = path.join(tmp, 'driver.log');
const sent = () => { try { return fs.readFileSync(mockLog, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };

// ---------- Settings ----------
check('the Apps hand exists, with its three tools', HANDS.apps && HANDS.apps.tools.join() === 'open_app,app_look,app_act');
check('it is off by default and hidden from Bob', cleanHands({}).apps.on === false && ['open_app', 'app_look', 'app_act'].every((t) => toolsOff({}).includes(t)));
check('it needs the master switch too', !handOn({ hands: { enabled: false, apps: { on: true } } }, 'apps') && handOn({ hands: { enabled: true, apps: { on: true } } }, 'apps'));
check('the Settings line says what it never touches and how to stop it', /Esc/.test(HANDS.apps.what) && /never terminals/i.test(HANDS.apps.what) && /password/.test(HANDS.apps.what));

// ---------- The never-touch list ----------
const own = { ownPids: [process.pid] };
check('terminals go through the Run hand instead', /Run hand/.test(blockedWindow({ title: 'Command Prompt', process: 'cmd', pid: 9 }, own)) && /Run hand/.test(blockedWindow({ title: 'Windows PowerShell', process: 'powershell.exe', pid: 9 }, own)) && /Run hand/.test(blockedWindow({ title: 'x', process: 'WindowsTerminal', pid: 9 }, own)));
check('admin tools and password managers are off limits', ['regedit', 'taskmgr', 'mmc', 'KeePassXC', '1Password', 'Bitwarden', 'consent', 'CredentialUIBroker'].every((p) => blockedWindow({ title: 'x', process: p, pid: 9 }, own)));
check('password and security prompts are off limits whatever the app', blockedWindow({ title: 'Enter your password', process: 'someapp', pid: 9 }, own) && blockedWindow({ title: 'Windows Security', process: 'svchost', pid: 9 }, own) && blockedWindow({ title: 'User Account Control', process: 'x', pid: 9 }, own));
check("Bob's own window is off limits (he can't approve his own cards)", /own window/.test(blockedWindow({ title: 'Bob', process: 'notepad', pid: process.pid }, own)) && /own window/.test(blockedWindow({ title: 'Bob', process: 'Bob', pid: 1 }, own)));
check('ordinary apps are fine', blockedWindow({ title: 'Untitled - Notepad', process: 'notepad', pid: 9 }, own) === '' && blockedWindow({ title: 'Sketch - Paint', process: 'mspaint', pid: 9 }, own) === '');
check('the Start menu tools are refused by name', ['Command Prompt', 'Windows PowerShell', 'Registry Editor', 'Task Manager', 'Terminal', 'Control Panel', 'Bitwarden'].every((n) => blockedApp(n)) && !blockedApp('Notepad') && !blockedApp('Blender 4.2'));
const ps = fs.readFileSync(path.join(here, '..', 'installer', 'bob-apps.ps1'), 'utf8');
const psBlocked = ps.match(/static readonly string\[\] Blocked = new string\[\] \{([\s\S]*?)\};/)[1].match(/"([^"]+)"/g).map((s) => s.slice(1, -1));
check('the helper refuses the same programs itself (two locks, not one)', BLOCKED_PROCESSES.every((p) => psBlocked.includes(p)) && psBlocked.every((p) => BLOCKED_PROCESSES.includes(p)));

// ---------- Keys ----------
check('plain keys and Ctrl/Shift/Alt combinations map to SendKeys', keysFor('Enter') === '{ENTER}' && keysFor('ctrl+s') === '^s' && keysFor('Ctrl + Shift + N') === '^+n' && keysFor('Shift+Tab') === '+{TAB}' && keysFor('F5') === '{F5}' && keysFor('Alt+F4') === '%{F4}');
check('never the Windows key or Ctrl+Alt combinations', throws(() => keysFor('Win+R'), /Windows key/) && throws(() => keysFor('Ctrl+Alt+Delete'), /Ctrl\+Alt/) && throws(() => keysFor('Ctrl+Alt+T'), /Ctrl\+Alt/));
check('unknown keys and empty input are refused', throws(() => keysFor('PrintScreen'), /doesn't press/) && throws(() => keysFor(''), /key/) && throws(() => keysFor('a+b+c+d'), /key/));

// ---------- The helper script ----------
check('the helper is plain ASCII with no PowerShell 7 or newer-C# syntax', !/[^\x00-\x7F]/.test(ps) && !/\?\?=|\?\.\w/.test(ps.replace(/\?\? ""/g, '')) && !/\$"/.test(ps));
check('it never elevates', !/-Verb\s+RunAs|runas|Highest/i.test(ps));
check('the red bar says how to take back control, and moving the mouse or Esc stops it', /Bob is driving\.  Move the mouse or press Esc/.test(ps) && /StopNow\("mouse"\)/.test(ps) && /GetAsyncKeyState\(0x1B\)/.test(ps));
check('the bar is click-through and never steals focus', /ShowWithoutActivation \{ get \{ return true; \} \}/.test(ps) && /0x08000000/.test(ps) && /0x00000020/.test(ps));
check('it only acts while driving, and not after you took over', /if \(stopped\) throw new Exception\("Stopped: you took back control\."\)/.test(ps) && /if \(!driving\) throw/.test(ps));
check('it never types into or reads password fields', /if \(e\.Current\.IsPassword\) throw new Exception\("Bob never types into password fields\."\)/.test(ps) && /if \(!pw && e\.TryGetCurrentPattern\(ValuePattern/.test(ps));
check("it prefers the app's own controls, and puts the pointer back after a real click", ps.indexOf('InvokePattern.Pattern') < ps.indexOf('mouse_event(0x0002') && /SetCursorPos\(old\.X, old\.Y\)/.test(ps));
check('it opens only apps that are really in the Start menu, through the shell', /Get-StartApps \| Where-Object \{ \$_\.AppID -eq \$id \}/.test(ps) && /shell:AppsFolder/.test(ps));
check("it ends when Bob does (stdin closes) and hides the bar on the way out", /if \(\$null -eq \$line\) \{ break \}/.test(ps) && /\[BobApps\.Driver\]::Drive\(\$false\)\s*$/.test(ps.trim() + '\n'));

// ---------- The tools, through the brain's approval flow ----------
const dataDir = path.join(tmp, 'inn', 'bob');
fs.mkdirSync(dataDir, { recursive: true });
const cfg = { dataDir, painterDir: dataDir, innDir: path.join(tmp, 'inn'), userName: 'Sam', hands: { enabled: true, apps: { on: true }, files: { on: false }, run: { on: false }, folders: [] } };
const logs = [], events = [];
const fake = Object.create(Brain.prototype);
Object.assign(fake, { cfg, tools: {}, approvals: new Map(), handApprovals: new Set(), state: { state: 'idle' }, setState() {}, log: (k, t) => logs.push(`${k}: ${t}`), broadcast: (e) => events.push(e), saveHands(next) { cfg.hands = next; } });
const driver = new AppsDriver({ command: [process.execPath, path.join(here, 'mock-apps-driver.js')], env: { ...process.env } });
process.env.MOCK_APPS_LOG = mockLog;
process.env.MOCK_BOB_PID = String(process.pid);
Object.assign(fake.tools, handsTools(fake, { apps: { driver } }));
let onCard = () => true;
const ctx = () => ({ emit: (e) => { events.push(e); if (e.type === 'approval') setTimeout(() => fake.answerApproval(e.id, onCard(e)), 5); }, signal: new AbortController().signal, allowAll: new Set() });
const cards = () => events.filter((e) => e.type === 'approval');

check("Bob's prompt explains look-then-act when the Apps hand is on", /app_look/.test(handsPrompt(cfg)) && !/app_look/.test(handsPrompt({ ...cfg, hands: { ...cfg.hands, apps: { on: false } } })));
{
  const offCfg = { ...cfg, hands: { ...cfg.hands, apps: { on: false } } };
  const offTools = handsTools({ cfg: offCfg, log() {} }, { apps: { driver: new AppsDriver({ command: [process.execPath, path.join(here, 'mock-apps-driver.js')] }) } });
  let msg = ''; try { await offTools.app_act.check({ window: 'notepad', action: 'click', name: 'Save' }, null); } catch (e) { msg = e.message; }
  check('switched off, the tools refuse even if called', /switched off/.test(msg));
}

// open_app
const o1 = await fake.runTool('open_app', { name: 'notepad' }, ctx());
const oc = cards().at(-1);
check('opening an app shows a card with the app and an "Open it" button', oc && /Open Notepad/.test(oc.command) && oc.button === 'Open it' && oc.hand === true && /not as administrator/.test(oc.text));
check('…and opens it through the Start menu id after the click', /Opened Notepad/.test(o1.text) && sent().some((m) => m.op === 'open' && m.appId === 'Microsoft.WindowsNotepad_8wekyb3d8bbwe!App'));
const nCards = cards().length;
const o2 = await fake.runTool('open_app', { name: 'Command Prompt' }, ctx());
const o3 = await fake.runTool('open_app', { name: 'Registry Editor' }, ctx());
check('terminals and admin tools are refused before any card', /off limits/.test(o2.text) && /off limits/.test(o3.text) && cards().length === nCards);
onCard = () => false;
const o4 = await fake.runTool('open_app', { name: 'Paint' }, ctx());
check('Deny = nothing opened', /said no/.test(o4.text) && !sent().some((m) => m.op === 'open' && /Paint/.test(m.appId)));
onCard = () => true;

// app_look
const l1 = await fake.runTool('app_look', {}, ctx());
check('listing windows needs a card too, and hides the off-limits ones', /List open windows/.test(cards().at(-1).command) && /Untitled - Notepad/.test(l1.text) && /Paint/.test(l1.text) && !/Command Prompt|KeePass|Windows Security|\bBob \(/.test(l1.text));
const l2 = await fake.runTool('app_look', { window: 'notepad', picture: true }, ctx());
check('looking at a window shows a card naming it', /Look at Untitled - Notepad/.test(cards().at(-1).command) && cards().at(-1).cwd === 'notepad');
check('Bob gets the names of its controls, and never a password value', /Button "Save" \[id save\]/.test(l2.text) && /Edit "Text editor".*= "hello"/.test(l2.text) && /password field: never typed in/.test(l2.text));
check('the picture of the window goes to the chat', events.some((e) => e.type === 'image' && /window-\d+\.png/.test(e.url)) && /picture of the window/.test(l2.text));
const nC2 = cards().length;
for (const w of ['cmd', 'KeePassXC', 'Windows Security', 'Bob']) {
  const r = await fake.runTool('app_look', { window: w }, ctx());
  check(`looking at ${w} is refused before any card`, /off limits|Run hand|own window|password or security/.test(r.text) && cards().length === nC2, r.text);
}
const l3 = await fake.runTool('app_look', { window: 'no such app' }, ctx());
check('an unknown window lists the ones Bob may use', /No open window matches/.test(l3.text) && /Notepad/.test(l3.text) && !/KeePass/.test(l3.text));

// app_act
const before = sent().length;
const a1 = await fake.runTool('app_act', { window: 'notepad', action: 'click', type: 'Button', name: 'Save' }, ctx());
const ac = cards().at(-1);
check('each action shows a card with exactly what and where, and says how to stop', /Click Button "Save"/.test(ac.command) && /Untitled - Notepad/.test(ac.cwd) && ac.button === 'Do it' && /move the mouse or press Esc/.test(ac.text));
const ops = sent().slice(before).map((m) => m.op + (m.op === 'drive' ? `:${m.on}` : ''));
check('the red bar goes up just for the action and comes down after', /drive:true,act,drive:false/.test(ops.join()), ops.join());
check('the window is checked again right before acting', ops.indexOf('windows', 1) < ops.indexOf('act'));
check('the result goes back to Bob and into the logbook', /Done: click Save/.test(a1.text) && logs.some((l) => /apps: click Button "Save" in Untitled - Notepad/.test(l)));
const t1 = await fake.runTool('app_act', { window: 'notepad', action: 'type', type: 'Edit', name: 'Text editor', text: 'Shopping list' }, ctx());
check('typing shows the text on the card', /Type into Edit "Text editor": "Shopping list"/.test(cards().at(-1).command) && /Done/.test(t1.text) && sent().some((m) => m.op === 'act' && m.text === 'Shopping list'));
const nC3 = cards().length;
const t2 = await fake.runTool('app_act', { window: 'notepad', action: 'type', type: 'Edit', name: 'Password', id: 'pw', text: 'x' }, ctx());
check('a field that looks like a password is refused before any card', /never types into password/.test(t2.text) && cards().length === nC3);
const k1 = await fake.runTool('app_act', { window: 'notepad', action: 'keys', keys: 'Win+R' }, ctx());
check('the Windows key is refused before any card', /Windows key/.test(k1.text) && cards().length === nC3);
const k2 = await fake.runTool('app_act', { window: 'notepad', action: 'keys', keys: 'Ctrl+S' }, ctx());
check('allowed keys are sent as SendKeys', /Done/.test(k2.text) && sent().some((m) => m.op === 'act' && m.keys === '^s'));
const x1 = await fake.runTool('app_act', { window: 'cmd', action: 'keys', keys: 'Enter' }, ctx());
check('acting in a terminal is refused (that is the Run hand)', /Run hand/.test(x1.text));
onCard = () => false;
const d1 = await fake.runTool('app_act', { window: 'notepad', action: 'click', name: 'File' }, ctx());
check('Deny = nothing done', /said no/.test(d1.text) && !sent().some((m) => m.op === 'act' && m.target?.name === 'File'));

// "Allow the rest of this job", then taking over with the mouse
onCard = () => 'all';
const job = ctx();
await fake.runTool('app_act', { window: 'notepad', action: 'click', name: 'File' }, job);
const nC4 = cards().length;
await fake.runTool('app_act', { window: 'notepad', action: 'click', name: 'Save' }, job);
check('"Allow the rest of this job" covers the next action in the same window', cards().length === nC4);
await fake.runTool('app_act', { window: 'paint', action: 'click', name: 'Brush' }, job);
check('…but not a different window', cards().length === nC4 + 1);
const s1 = await fake.runTool('app_act', { window: 'notepad', action: 'type', name: 'Text editor', text: 'TAKE OVER' }, job);
await wait(30);
check('moving the mouse stops Bob mid-job', /took back control|Stopped/.test(s1.text) && events.some((e) => e.type === 'apps-stopped' && /moved the mouse/.test(e.why)));
check('…and ends "allow the rest of this job" for apps', ![...job.allowAll].some((g) => g.startsWith('apps-')));
const s2 = await fake.runTool('app_act', { window: 'notepad', action: 'click', name: 'Save' }, job);
check('…and Bob does not carry on in that job', /took back the mouse/.test(s2.text));
check('taking over is in the logbook', logs.some((l) => /moved the mouse; Bob stopped driving/.test(l)));
const s3 = await fake.runTool('app_act', { window: 'notepad', action: 'click', name: 'Save' }, ctx());
check('a new job can ask again', /Done/.test(s3.text));

// Stop everything ends the helper and its bar
check('the helper is listed as running while it is up', runningNow().some((r) => r.line === 'Apps hand'));
stopEverything(fake);
await wait(100);
check('Stop everything ends the apps helper (and its red bar)', !driver.child && !runningNow().some((r) => r.line === 'Apps hand') && !handOn(cfg, 'apps'));
const after = await fake.runTool('app_act', { window: 'notepad', action: 'click', name: 'Save' }, ctx());
check('after Stop everything the Apps hand is off', /switched off/.test(after.text));

// The helper itself: off Windows the real one is refused with a reason
if (process.platform !== 'win32') check('off Windows the real helper says it needs Windows', throws(() => new AppsDriver().start(), /Windows/));

// UI
const ui = fs.readFileSync(path.join(here, '..', 'public', 'hands.js'), 'utf8');
check('the card uses the button text the Hand asks for', /esc\(ev\.button \|\| 'Run it'\)/.test(ui));
check('the chat says when Bob stopped because you took over', /apps-stopped/.test(ui));

driver.stop();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
