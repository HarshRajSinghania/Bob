// Patches (or whatever the cat is called in Settings): small moments from The Idle Process. All wording original.
// Used by the server (now and then one line goes into Bob's prompt, about 30 tokens, never in a hat) and the page
// (the empty Tasks list, the moot). No model call, no extra memory.

export const MOMENTS = [
  '{{CAT}} is asleep on the warm part of the server rack',
  '{{CAT}} just walked across the keyboard and added a line of semicolons',
  '{{CAT}} is staring at an empty corner of the room, which is never reassuring',
  '{{CAT}} knocked a coffee mug off the desk and watched it fall, for science',
  '{{CAT}} is sitting on the notice board, on today\'s main quest',
  '{{CAT}} has claimed the reading chair and will not be negotiating',
  '{{CAT}} is chasing the mouse cursor across the screen',
  '{{CAT}} is curled up in the box the new graphics card came in',
  '{{CAT}} brought you a dead bug from the logs. Technically a real bug',
  '{{CAT}} is ignoring you with great focus',
  '{{CAT}} sat on the Stop button. Nothing stopped. {{CAT}} looks disappointed',
  '{{CAT}} is watching the progress bar like it owes money',
  '{{CAT}} is sleeping in a patch of virtual sunlight that you rendered on purpose',
  '{{CAT}} pushed a pen off the bookshelf, then a second one to make sure',
  '{{CAT}} is purring loudly enough to show up in the fan noise',
  '{{CAT}} is sitting in the doorway, neither in nor out, as is tradition'
];

const fill = (s, cat) => s.replaceAll('{{CAT}}', cat || 'Patches');

// A moment, picked by a number (a turn count, a minute) so the same moment doesn't repeat back to back.
export function catMoment(cat, n = Math.floor(Date.now() / 600000)) {
  return fill(MOMENTS[Math.abs(Math.floor(n)) % MOMENTS.length], cat);
}

// About one chat turn in five gets a cat line, never when the dials ask for plain, terse replies.
export function catPrompt({ cat, turn, dials = {}, user = 'the user' }) {
  if ((dials.wit ?? 2) === 0 || (dials.length ?? 2) === 0 || (dials.musing ?? 2) === 0) return '';
  if (Math.abs(Math.floor(turn)) % 5 !== 2) return '';
  return `Right now in The Idle Process: ${catMoment(cat, turn)}. If it fits, mention it in a few words at the end of your reply; skip it if ${user} is busy, stressed or the topic is serious.`;
}
