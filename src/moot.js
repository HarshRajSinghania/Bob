// Effort (1.5.7). The chat bar has Low / High / Extreme.
//   Low (default): today's Bob. One brain, a quick answer, nothing extra loads.
//   High: Bob calls a moot. The draft is made on the big brain (Deep thinking, or the main one), then his reviewer
//         copy (the Review slot brain) checks it once. Code problems go back to the workbench for one fix round.
//   Extreme: the same, plus the reviewer checks each code change as it's made (checkpoints), and a second
//         check after fixes. Slowest: on a 16 GB card every check is a brain swap.
// Big brains load only for the job; settle() lets them go when it ends, as with any big job.
// The moot is Bob and his copies meeting in The Idle Process to agree on an answer. All wording is original.
import { copyName } from './clan.js';
import { catMoment } from '../public/patches.js';

export const EFFORTS = ['low', 'high', 'extreme'];
export const cleanEffort = (v) => (EFFORTS.includes(v) ? v : 'low');
export const careful = (job) => cleanEffort(job?.effort) !== 'low';
export const MAX_CHECKPOINTS = 6;

// The brain that drafts at High and Extreme: Deep thinking if one is picked, otherwise the main brain.
export function draftBrain(cfg) {
  const model = cfg.sessionBrains?.deep || cfg.models?.bob;
  return model ? { model, cpu: false, think: 'high', ctx: null } : null;
}
// The brain that checks: the Review slot, else Deep thinking, else the main brain (it then checks its own work).
export function reviewBrain(cfg) {
  const model = cfg.models?.reviewer || cfg.sessionBrains?.deep || cfg.models?.bob;
  return model ? { model, cpu: false, think: 'high', ctx: null } : null;
}

// One short paragraph, only at High and Extreme (Low adds nothing, so every-day chats stay slim).
export function effortPrompt(effort) {
  const e = cleanEffort(effort);
  if (e === 'low') return '';
  return `Effort is ${e === 'high' ? 'High' : 'Extreme'}: {{USER}} wants the best answer, not the fastest. Plan first, check facts with your tools, and answer completely. Writing: outline, draft, then re-read it for mistakes and clarity. Coding and research go to the matching hat. Your reviewer copy checks the result${e === 'extreme' ? ', and each code change as it happens' : ''}, so never claim something was tested or checked unless a tool result shows it.`;
}

const LOOKS_RIGHT = /^\W*looks right/i;
export const verdict = (text) => (LOOKS_RIGHT.test(String(text || '').trim()) ? 'ok' : /needs fixes/i.test(String(text || '')) ? 'fix' : 'unclear');

export const CHECK_TASK = `Check the answer Bob just gave (under "Already done this turn") before {{USER}} relies on it.
- Does it answer what was asked, completely?
- Is every fact, number, link and quote backed by a tool result above or by solid common knowledge? Flag anything that isn't.
- Code: bugs, edge cases, missing steps, and any claim that it builds or passes without a run result showing it.
- Writing: mistakes, unclear parts, wrong tone.
Read files if you need to (you can't change them).
Start with exactly "Looks right." or "Needs fixes:". If it needs fixes, list them most serious first, one line each with the smallest fix. If the answer isn't code, then add "Corrected answer:" and the whole corrected answer. Don't invent problems; if it's fine, say "Looks right." and why in one line.`;

export function fixTask(review) {
  return `Your reviewer copy checked your changes and found problems:\n${review}\n\nFix the real ones the same careful way (read first, small steps, check each). Then report honestly: what's fixed, what isn't, and what you ran. If you disagree with a point, say why in one line.`;
}

export function checkpointTask({ copy, plan, name, where, args, result }) {
  return `Checkpoint: ${copy} just made one change in the middle of a job. Check only this change: is it correct and safe, and does it fit the plan? Under 120 words.
Plan and notes so far:
${String(plan || '(none written)').slice(-2000)}

The change (${name}${where ? ` on ${where}` : ''}):
${String(args || '').slice(0, 4000)}

Result: ${String(result || '').slice(0, 400)}
Start with exactly "Looks right." or "Needs fixes:".`;
}

const plain = (hat) => ({ tinker: 'workbench', scout: 'scouting', ledger: 'ledger', painter: 'painter', reviewer: 'reviewer' }[hat] || hat);

// The opening line of a moot, shown as a note in the chat.
export function mootOpening(cfg, effort, turnNo = 0) {
  const rev = copyName(cfg, 'reviewer', 'second look');
  const e = cleanEffort(effort);
  const draft = draftBrain(cfg)?.model || 'the main brain';
  const check = reviewBrain(cfg)?.model || 'the main brain';
  const cat = turnNo % 3 === 0 ? ` ${catMoment(cfg.catName, turnNo)}.` : '';
  return `🛰 Bob calls a moot in The Idle Process. He drafts on the big brain (${draft}), then ${rev} checks it (${check})${e === 'extreme' ? ', and checks each code change along the way' : ''}. Slower, more careful.${cat}`;
}

// What happened at the moot, in a few words, kept with the reply. "Not done" is said plainly when it isn't.
export function mootMinutes(rounds, rev) {
  if (!rounds.length) return '';
  const words = rounds.map((r) => r.kind === 'check' ? `${rev} checked: ${r.verdict === 'ok' ? 'looks right' : r.verdict === 'fix' ? 'needs fixes' : 'no clear verdict'}`
    : r.kind === 'fix' ? `${r.copy} fixed what was found`
    : r.kind === 'checkpoint' ? `${rev} checked a change: ${r.verdict === 'ok' ? 'fine' : 'needs fixes'}` : '');
  const last = [...rounds].reverse().find((r) => r.kind === 'check');
  const fixedAfter = rounds.at(-1)?.kind === 'fix';
  const end = !last ? '' : fixedAfter ? `Result: fixes made; ${rev} hasn't checked them again (Extreme effort does).` : last.verdict === 'ok' ? 'Result: checked, nothing open.'
    : last.corrected ? `Result: use ${rev}'s corrected answer above.`
    : `Result: not finished. ${rev}'s points above are still open.`;
  return `**Moot minutes:** ${words.filter(Boolean).join(' · ')}. ${end}`.trim();
}

// After the draft (runOn) at High or Extreme: the reviewer checks, code gets a fix round, Extreme checks again.
export async function runMoot(brain, { msgs, base, emit, signal, job, ctx }) {
  const effort = cleanEffort(job?.effort);
  const added = msgs.slice(base);
  const draft = [...added].reverse().find((m) => m.role === 'assistant' && !m.tool_calls && m.content);
  const used = added.flatMap((m) => (m.tool_calls || []).map((c) => c.function?.name));
  const toolText = added.filter((m) => m.role === 'tool').map((m) => String(m.content)).join('\n');
  if (!draft || ['picture', 'video'].includes(job?.kind) || used.some((n) => /^(make_image|make_video|make_music|make_sound|workshop_run)$/.test(n))) return null;
  if (String(draft.content).length < 200 && !used.length) {
    emit({ type: 'announce', text: 'Short reply, so the moot skipped the second look.' });
    return null;
  }
  const rev = copyName(brain.cfg, 'reviewer', 'second look');
  const force = reviewBrain(brain.cfg);
  // Code was changed this turn: a workbench note "edit_file <path>: <result>" that isn't an error, or Bob's own edit.
  const changedCode = /\b(?:edit_file|write_file)\b[^|\]]*?:\s*(?!Error|.*said no)/.test(toolText)
    || added.some((m, i) => m.role === 'tool' && ['edit_file', 'write_file'].includes(m.tool_name) && !/^Error|said no/i.test(String(m.content)) && i >= 0);
  const rounds = [...(ctx.mootRounds || [])];
  const say = (text) => { emit({ type: 'token', text }); };
  const check = async (n) => {
    say(`\n\n---\n**${rev}, second look${n > 1 ? ' (again)' : ''}:**\n\n`);
    const text = await brain.runHat('reviewer', CHECK_TASK, ctx, force);
    msgs.push({ role: 'assistant', content: `${rev}, second look: ${text}`, moot: 'check' });
    const v = verdict(text);
    rounds.push({ kind: 'check', verdict: v, corrected: /corrected answer:/i.test(text) });
    return { text, v };
  };
  let res = await check(1);
  const maxFix = effort === 'extreme' ? 2 : 1;
  for (let i = 0; i < maxFix && res.v !== 'ok' && changedCode && !signal?.aborted; i++) {
    const copy = copyName(brain.cfg, 'tinker', 'workbench');
    say(`\n\n---\n**${copy}, fixing:**\n\n`);
    const fixed = await brain.runHat('tinker', fixTask(res.text), ctx);
    msgs.push({ role: 'assistant', content: fixed, moot: 'fix' });
    rounds.push({ kind: 'fix', copy });
    // High trusts one fix round (the report says what was fixed); Extreme checks the fix again.
    if (effort === 'extreme') res = await check(i + 2);
    else break;
  }
  const minutes = mootMinutes(rounds, rev);
  if (minutes) { say(`\n\n${minutes}`); msgs.push({ role: 'assistant', content: minutes, moot: 'minutes' }); }
  brain.log('moot', `${effort}: ${rounds.map((r) => r.kind + (r.verdict ? `:${r.verdict}` : '')).join(', ')}`);
  return { rounds, minutes };
}

// Extreme only: called by the workbench loop after each change that went through.
export async function checkpoint(brain, ctx, { hat, copy, plan, name, where, args, result }) {
  if (hat !== 'tinker' || cleanEffort(ctx.job?.effort) !== 'extreme') return null;
  ctx.checkpoints = (ctx.checkpoints || 0) + 1;
  if (ctx.checkpoints > MAX_CHECKPOINTS) return null;
  const rev = copyName(brain.cfg, 'reviewer', 'second look');
  ctx.emit({ type: 'token', text: `\n\n**Checkpoint, ${rev}:** ` });
  const text = await brain.runHat('reviewer', checkpointTask({ copy, plan, name, where, args, result }), { ...ctx, hatNotes: '' }, reviewBrain(brain.cfg));
  ctx.emit({ type: 'token', text: '\n\n' });
  (ctx.mootRounds ||= []).push({ kind: 'checkpoint', verdict: verdict(text) === 'ok' ? 'ok' : 'fix' });
  return `Checkpoint from ${rev} on that change:\n${text}\nIf it found a real problem, fix it next; otherwise carry on with the plan.`;
}

export { plain as hatWord };
