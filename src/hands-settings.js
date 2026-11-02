// Hands settings (no imports, so config.js can use it). Hands are the things Bob can do on the PC beyond chatting:
// work with files, run commands, schedules, and open and use apps. Every Hand is OFF until the user turns it on,
// there is one master switch over all of them, and nothing here can make Bob skip asking.
//
// To add a Hand, add an entry to HANDS. Its switch, its line in Settings and its tool filtering all follow from it.
export const HANDS = {
  files: {
    label: 'Files',
    what: 'Move, copy and rename files, zip and unzip, and tidy a folder such as Downloads. Only in the folders you tick below. Nothing is ever deleted: things he throws away go to the Recycle Bin, and every job can be undone.',
    tools: ['file_hands', 'undo_files']
  },
  run: {
    label: 'Run programs and scripts',
    what: 'Run a command, script or program you approve, with its output live in the chat and a Stop button. Never as administrator, never with passwords, and some commands are always refused (formatting disks, boot settings, system registry, antivirus, user accounts, shutdown).',
    tools: ['run_command', 'run_recipe']
  },
  schedules: {
    label: 'Schedules',
    what: 'Do a job by himself at set times (once, daily, weekly, or every so many minutes) while Bob is open. You approve each schedule, and every action inside a run still asks for your OK, so a run with nobody at the PC just waits and then does nothing. Waking Bob when he is closed is a separate switch.',
    tools: ['schedule_job', 'list_schedules', 'change_schedule']
  },
  apps: {
    label: 'Open and use apps',
    what: 'Open apps from your Start menu, read a window\'s buttons and fields, and click, type or press keys in it, one approved action at a time. A red "Bob is driving" bar shows while he does; move the mouse or press Esc to stop him at once. Never terminals, admin tools, password managers, password fields, sign-in or security prompts, or his own window.',
    tools: ['open_app', 'app_look', 'app_act']
  }
};

const isAbs = (p) => typeof p === 'string' && p.length < 400 && !p.includes('\0') && (/^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('/'));

// The settings, cleaned. enabled = the master switch (Settings). held = the chat-page kill switch: it can only stop
// Hands that Settings has on, never switch anything on. Each Hand has { on }. folders = where the Files hand may work.
export function cleanHands(v = {}) {
  const out = { enabled: v.enabled === true, held: v.held === true };
  for (const id of Object.keys(HANDS)) out[id] = { on: v[id]?.on === true };
  out.folders = [...new Set([].concat(v.folders || []).filter(isAbs))].slice(0, 30);
  out.timeoutMin = [1, 5, 15, 30, 60, 120].includes(Number(v.timeoutMin)) ? Number(v.timeoutMin) : 15;
  return out;
}
export const handsSettings = (cfg) => cleanHands(cfg.hands || {});

// Is this Hand usable right now? The master switch and its own switch must be on, and the chat-page switch not stopped.
export function handOn(cfg, id) {
  const h = handsSettings(cfg);
  return h.enabled && !h.held && h[id]?.on === true;
}
// Why a Hand can't be used, in words for Bob to pass on.
export function handOffWhy(cfg, id) {
  const who = cfg.userName || 'The user', h = handsSettings(cfg);
  if (h.enabled && h.held && h[id]?.on) return `Hands are stopped with the Hands switch on the chat page. ${who} can switch them back on there.`;
  return `The ${HANDS[id].label} Hand is switched off. ${who} can turn it on in Settings, Hands.`;
}

// The tool names that belong to Hands that are off right now (brain.toolSchemas hides them; each tool checks again when run).
export function toolsOff(cfg) {
  const off = [];
  for (const [id, hand] of Object.entries(HANDS)) if (!handOn(cfg, id)) off.push(...hand.tools);
  return off;
}
