// Stands in for installer\bob-apps.ps1 in tests: same JSON-lines protocol, a few made-up windows.
// Every request it gets is appended to the file in MOCK_APPS_LOG.
import fs from 'node:fs';
import readline from 'node:readline';
const log = (m) => { if (process.env.MOCK_APPS_LOG) fs.appendFileSync(process.env.MOCK_APPS_LOG, JSON.stringify(m) + '\n'); };
const own = Number(process.env.MOCK_BOB_PID || 0);
const windows = [
  { hwnd: 101, title: 'Untitled - Notepad', process: 'notepad', pid: 4242 },
  { hwnd: 102, title: 'Command Prompt', process: 'cmd', pid: 4243 },
  { hwnd: 103, title: 'Bob', process: 'Bob', pid: own },
  { hwnd: 104, title: 'Vault - KeePassXC', process: 'KeePassXC', pid: 4244 },
  { hwnd: 105, title: 'Windows Security', process: 'svchost', pid: 4245 },
  { hwnd: 106, title: 'Sketch - Paint', process: 'mspaint', pid: 4246 }
];
const apps = [{ name: 'Notepad', appId: 'Microsoft.WindowsNotepad_8wekyb3d8bbwe!App' }, { name: 'Paint', appId: 'Microsoft.Paint_8wekyb3d8bbwe!App' }, { name: 'Command Prompt', appId: 'cmd' }, { name: 'Registry Editor', appId: 'regedit' }];
let driving = false;
const out = (m) => process.stdout.write(JSON.stringify(m) + '\n');
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  let m; try { m = JSON.parse(line); } catch { return; }
  log(m);
  const r = { id: m.id, ok: true };
  if (m.op === 'windows') r.windows = windows;
  else if (m.op === 'apps') r.apps = apps;
  else if (m.op === 'open') { if (!apps.some((a) => a.appId === m.appId)) { r.ok = false; r.error = 'not in the Start menu'; } }
  else if (m.op === 'look') r.items = [{ type: 'Edit', name: 'Text editor', id: '15', enabled: true, password: false, value: 'hello' }, { type: 'MenuItem', name: 'File', id: '', enabled: true }, { type: 'Button', name: 'Save', id: 'save', enabled: true }, { type: 'Edit', name: 'Password', id: 'pw', password: true }];
  else if (m.op === 'picture') { fs.writeFileSync(m.file, 'PNG'); r.file = m.file; }
  else if (m.op === 'drive') driving = Boolean(m.on);
  else if (m.op === 'act') {
    if (!driving) { r.ok = false; r.error = "Bob isn't driving right now."; }
    else if (m.text === 'TAKE OVER') { driving = false; out({ event: 'stopped', why: 'mouse' }); r.ok = false; r.error = 'Stopped: you took back control.'; }
    else r.did = `${m.action} ${m.target?.name || ''}`.trim();
  } else if (m.op === 'quit') { out(r); process.exit(0); }
  out(r);
});
