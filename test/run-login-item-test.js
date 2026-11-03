// 1.5.49: "Launch on start-up" reads the real Windows entry (registered with --hidden) and switching off clears it.
import { createRequire } from 'node:module';
const { loginItem } = createRequire(import.meta.url)('../electron/login-item.cjs');

let pass = 0, fail = 0;
const check = (name, ok) => { if (ok) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}`); } };
// A stand-in for Electron's app on Windows: entries are keyed by their arguments.
function fakeApp(entries = {}) {
  const key = (o) => JSON.stringify(o?.args || []);
  return { entries, getLoginItemSettings: (o) => ({ openAtLogin: Boolean(entries[key(o)]) }), setLoginItemSettings: (o) => { if (o.openAtLogin) entries[key(o)] = true; else delete entries[key(o)]; } };
}
let app = fakeApp({ '["--hidden"]': true });
check('an entry with --hidden reads as on (it read as off before 1.5.49)', loginItem(app).get() === true);
loginItem(app).set(false);
check('switching off clears the --hidden entry', loginItem(app).get() === false && !Object.keys(app.entries).length);
app = fakeApp({ '[]': true });
check('an older entry without arguments reads as on', loginItem(app).get() === true);
loginItem(app).set(false);
check('switching off clears the older entry too', loginItem(app).get() === false);
app = fakeApp();
check('nothing registered reads as off (opt-in)', loginItem(app).get() === false);
loginItem(app).set(true);
check('switching on registers it with --hidden', app.entries['["--hidden"]'] === true && loginItem(app).get() === true);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
