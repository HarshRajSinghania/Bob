// "Let Bob search the web" (1.5.27, 2026-11-02: "add a switch, off by default"). Off: web_search and
// fetch_page are taken out of Bob's tools, a call by name gets WEB_OFF back, and his prompt tells him to say
// where the switch is when a question needs the internet. No imports, so config.js and brain.js can both use it.
export const WEB_TOOLS = ['web_search', 'fetch_page'];
export const webOn = (cfg) => cfg?.webSearch === true;
export const WEB_SWITCH = 'Let Bob search the web';
export const WEB_WHERE = 'Settings';
export const WEB_PILL = '🌐 Web search'; // the same setting, on the chat page next to Effort (1.5.28)
const HOW = `click "${WEB_PILL}" next to Effort on the chat page, or turn on "${WEB_SWITCH}" in ${WEB_WHERE}`;
export const WEB_OFF = `Web search is off, so I can't look things up online. To let me, ${HOW}, then ask again.`;

// One line for Bob's prompt while it's off, so he knows and can say so instead of guessing.
export function webPrompt(cfg) {
  if (webOn(cfg)) return '';
  const who = cfg?.userName || 'the user';
  return `\n\nWeb search is OFF: you can't search the web or open web pages. If a question needs the internet (news, prices, versions, docs or facts you aren't sure of), say in one line that web search is off so you can't look it up, and that ${who} can ${HOW}. Always mention the switch; that's the way forward. Answer from what you know only if you're sure, and say it may be out of date. Never pretend you looked something up.`;
}
