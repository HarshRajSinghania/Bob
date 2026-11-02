// Bob's toolbox (1.5.5): every chat starts with a small core of tools. The rest sit in groups that are added
// only when a message needs them, so his small brain isn't carrying ~4,000 tokens of tool descriptions it
// won't use. Three ways a group gets added:
//   1. the user's words this turn match the group (cheap word check, no extra model call),
//   2. Bob asks for it with use_tools(group),
//   3. Bob calls one of its tools by name anyway (small models do this): it's added and the call runs.
// A group used in a chat stays for the next few messages of that chat, then drops off again.
// Setting allTools (Advanced, off) sends every tool every time, the old way.
import { HANDS, handOn, handOffWhy } from './hands-settings.js';

export const CORE = ['notice_board', 'remember', 'reminders', 'list_folder', 'read_file', 'web_search', 'fetch_page', 'ask_specialist', 'use_tools'];

// Groups Bob can add. `what` is what Bob reads in use_tools; `words` is the cheap pre-check on the user's message.
const WORK_GROUPS = {
  pictures: {
    what: 'make pictures, video clips, music and sound effects; save reference pictures; ComfyUI workflows',
    tools: ['make_image', 'make_video', 'save_reference', 'make_music', 'make_sound', 'workshop_list', 'workshop_run'],
    words: /\b(pic|pics|picture|image|photo|draw|drawing|paint|painting|render|artwork|art|portrait|wallpaper|logo|icon|sprite|concept|illustrat\w*|video|clip|animat\w*|music|song|tune|melody|beat|sound|sfx|workflow|comfy\w*|reference|character sheet)s?\b/i
  },
  documents: {
    what: 'write or edit files, save spreadsheets, search inside files',
    tools: ['write_file', 'edit_file', 'save_spreadsheet', 'search_files'],
    words: /\b(save|write|edit|document|txt|csv|spreadsheet|excel|search (?:my|the|in|for)|find (?:in|where)|grep)\b/i
  },
  memory: {
    what: 'forget a topic Bob keeps notes on',
    tools: ['forget_topic'],
    words: /\b(forget|erase|delete (?:the |that |your )?(?:note|topic|memory))\b/i
  },
  cloud: {
    what: 'hand one job to a paid cloud helper (asks first, costs money)',
    tools: ['ask_cloud'],
    words: /\b(cloud|claude|gpt|openai|gemini|anthropic|online model|bigger model)\b/i
  }
};

// The Hands each get their own group, only when that Hand is switched on.
const HAND_WORDS = {
  files: /\b(move|copy|rename|zip|unzip|extract|tidy|organi[sz]e|sort|clean ?up|downloads|undo|folder|folders)\b/i,
  run: /\b(run|execute|command|script|terminal|powershell|cmd|install|build|npm|python|node|git|recipe)\b/i,
  schedules: /\b(schedules?|scheduled|every (?:day|morning|night|week|hour|\d+)|daily|weekly|hourly|at \d|each (?:day|morning|week))\b/i,
  apps: /\b(open|launch|click|press|app|apps|notepad|browser|chrome|explorer|blender|paint\.net)\b/i
};

export function groupsFor(brain) {
  const g = {};
  for (const [id, x] of Object.entries(WORK_GROUPS)) g[id] = { ...x };
  for (const [id, hand] of Object.entries(HANDS)) {
    g[id] = { what: `Hands, ${hand.label.toLowerCase()}`, tools: hand.tools, words: HAND_WORDS[id] || /$^/, hand: id };
  }
  // Only groups with at least one tool Bob can use on this PC right now.
  const out = {};
  for (const [id, x] of Object.entries(g)) {
    const usable = x.tools.filter((n) => brain.usable(n));
    if (usable.length) out[id] = { ...x, tools: usable };
  }
  return out;
}

export const groupOf = (brain, name) => Object.entries(groupsFor(brain)).find(([, x]) => x.tools.includes(name))?.[0] || null;

// The groups the user's words point at this turn.
export function guessGroups(brain, text) {
  const t = String(text || '');
  return Object.entries(groupsFor(brain)).filter(([, x]) => x.words.test(t)).map(([id]) => id);
}

export const allToolsOn = (cfg) => cfg.allTools === true;

// How many of the chat's next messages a used group stays for.
export const STICKY_TURNS = 3;

// The use_tools tool. Its group list is filled in per turn (brain.toolSchemas), so Bob only sees groups he can add.
export function useToolsTool(brain) {
  return {
    schema: {
      type: 'function',
      function: {
        name: 'use_tools',
        description: 'Add a group of tools you need for this job, then call them. Groups: {{GROUPS}}.',
        parameters: { type: 'object', properties: { group: { type: 'string', description: 'Which group', enum: ['{{GROUP_IDS}}'] } }, required: ['group'] }
      }
    },
    async run({ group }, ctx) {
      const groups = groupsFor(brain);
      const id = String(group || '').toLowerCase().trim();
      const handId = Object.keys(HANDS).find((h) => h === id);
      if (!groups[id]) {
        if (handId && !handOn(brain.cfg, handId)) return handOffWhy(brain.cfg, handId);
        return `There is no group called ${group || '(none)'}. Groups you can add: ${Object.keys(groups).join(', ') || 'none'}.`;
      }
      ctx.loaded?.add(id);
      return `Added ${id}: ${groups[id].tools.join(', ')}. Call the one you need now.`;
    },
    summary: ({ group }) => `tools: ${group}`
  };
}

// The text that fills in use_tools's description and enum.
export function fillUseTools(schema, groups, loaded) {
  const open = Object.entries(groups).filter(([id]) => !loaded.has(id));
  if (!open.length) return null; // everything's already here; no need for the tool
  const s = JSON.parse(JSON.stringify(schema));
  s.function.description = s.function.description.replace('{{GROUPS}}', open.map(([id, x]) => `${id} = ${x.what}`).join('; '));
  s.function.parameters.properties.group.enum = open.map(([id]) => id);
  return s;
}
