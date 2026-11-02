// "Equip Bob": a paper-doll screen. Bob stands in the middle with a slot for every job; the models on this PC
// are his kit. Pick a slot, then click a model in the kit (or drag it onto the slot) to equip it. Only kit that
// fits a slot goes in it. Empty slots say what Bob can't do yet, with a Get button for a recommended model.
// Nothing is ever equipped by itself. Pure HTML builders; cellar.js handles the clicks.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const gb = (n) => (n == null ? '' : n >= 1 ? `${(+n).toFixed(n >= 10 ? 0 : 1)} GB` : `${Math.round(n * 1000)} MB`);

// side: which column around Bob. how: where the choice is saved (job = Model roles, brain = a session brain,
// embed = housekeeping's topic matcher). cats: catalog categories that fit. off: can it be emptied, and what then.
export const SLOTS = [
  { id: 'bob', name: 'Brain', icon: '🧠', side: 'L', how: 'job', kind: 'llm', cats: ['chat', 'coding'], does: 'Thinks, chats and plans. Everything else hangs off this.', empty: "No brain: Bob can't think or chat" },
  { id: 'small', name: 'Quick brain', icon: '⚡', side: 'L', how: 'brain', kind: 'llm', cats: ['chat'], does: 'A small, fast brain for the Art and Light / gaming sessions, so games and the painter keep the card.', empty: 'No quick brain: Art and Light sessions have nothing small to run' },
  { id: 'deep', name: 'Deep thinking', icon: '🔭', side: 'L', how: 'brain', kind: 'llm', cats: ['chat', 'coding'], does: 'The strongest thinker, for the Deep thought session.', empty: 'Uses the second-look or main brain' },
  { id: 'tinker', name: 'Coding', icon: '🔨', side: 'L', how: 'job', kind: 'llm', cats: ['coding', 'chat'], does: 'Writes and fixes code.', empty: 'No coding brain: the main brain codes', off: true },
  { id: 'reviewer', name: 'Second look', icon: '🧐', side: 'L', how: 'job', kind: 'llm', cats: ['chat', 'coding'], does: 'Checks code and plans carefully before you rely on them.', empty: 'No second look: the main brain checks its own work', off: true },
  { id: 'eyes', name: 'Eyes', icon: '👁', side: 'L', how: 'job', kind: 'llm', cats: ['vision'], does: 'Looks at pictures and screenshots you attach.', empty: "No eyes: the main brain must see pictures itself, or Bob can't", off: true },
  { id: 'embed', name: 'Memory', icon: '🗂', side: 'L', how: 'embed', kind: 'embed', cats: ['embed'], does: 'Matches what you say to past Topics by meaning, not just words.', empty: 'Topics are matched by words (works, a bit less clever)' },
  { id: 'voice', name: 'Ears', icon: '👂', side: 'R', how: 'job', kind: 'voice', cats: ['voice'], does: 'Turns your voice into text (🎙 and "Hey Bob").', empty: "No ears: Bob can't hear you" },
  { id: 'speech', name: 'Voice', icon: '🔊', side: 'R', how: 'job', kind: 'speech', cats: ['speech'], does: 'Reads his replies aloud.', empty: 'Uses the Windows voice', off: 'windows' },
  { id: 'image', name: 'Painter', icon: '🎨', side: 'R', how: 'job', kind: 'images', cats: ['images'], does: 'Paints new pictures.', empty: "No painter: Bob can't make pictures" },
  { id: 'edit', name: 'Picture editor', icon: '✂', side: 'R', how: 'job', kind: 'edit', cats: ['images'], editOnly: true, does: 'Edits a picture, or keeps a character looking the same.', empty: "No editor: Bob can paint new pictures but can't edit them" },
  { id: 'video', name: 'Video', icon: '🎞', side: 'R', how: 'job', kind: 'video', cats: ['video'], does: 'Films short clips.', empty: "No camera: Bob can't make clips" },
  { id: 'music', name: 'Music', icon: '🎵', side: 'R', how: 'job', kind: 'music', cats: [], engine: 'audio', does: 'Composes songs and background music.', empty: "No music: Bob can't compose" },
  { id: 'sfx', name: 'Sound effects', icon: '💥', side: 'R', how: 'job', kind: 'sfx', cats: [], engine: 'audio', does: 'Makes short sounds for games and videos.', empty: "No sound effects: Bob can't make them" }
];
export const HELPERS = [
  { id: 'ledger', name: 'Spreadsheets', icon: '📊', how: 'job', kind: 'llm', cats: ['chat'], does: 'Data entry and spreadsheets.', empty: 'Uses the main brain', off: true },
  { id: 'scout', name: 'Research', icon: '🧭', how: 'job', kind: 'llm', cats: ['chat'], does: 'Web research with sources.', empty: 'Uses the main brain', off: true },
  { id: 'painter', name: 'Prompt writer', icon: '🖋', how: 'job', kind: 'llm', cats: ['chat'], does: 'Writes the picture and video prompts.', empty: 'Uses the main brain', off: true }
];
export const allSlots = () => [...SLOTS, ...HELPERS];

// The catalog entry behind a choice (by id or Ollama name), for its weight, size and licence.
export function entryOf(models, value) {
  if (!value) return null;
  return models.find((m) => m.id === value || m.ollama === value) || null;
}

// What's in each slot now.
export function equipped(slot, { roles, brains, embed }) {
  if (slot.how === 'brain') return brains?.[slot.id] || '';
  if (slot.how === 'embed') return embed || '';
  return roles?.current?.[slot.id] || '';
}

// Kit that fits a slot: what's on this PC (from Model roles), and catalog models not downloaded yet.
export function kitFor(slot, { roles, models }) {
  const have = (roles?.options?.[slot.kind] || []).map((o) => ({ ...o, entry: entryOf(models, o.value), installed: true }));
  const haveIds = new Set(have.map((h) => h.entry?.id).filter(Boolean));
  const shop = models.filter((m) => slot.cats.includes(m.category) && Boolean(m.use?.painter?.sdcpp?.edit) === Boolean(slot.editOnly) && m.status?.state !== 'installed' && !haveIds.has(m.id))
    .map((m) => ({ value: m.id, label: m.name, entry: m, installed: false }));
  return [...have, ...shop];
}

const stats = (e, fallback = '') => {
  if (!e) return fallback;
  return [e.sizeGB != null && `Size ${gb(e.sizeGB)}`, e.vramGB ? `uses ${gb(e.vramGB)} of graphics memory` : 'runs on the processor', e.license && `licence ${e.license}${e.commercial === false ? ' (personal use)' : ''}`].filter(Boolean).join(' · ');
};

function slotHtml(slot, ctx) {
  const cur = equipped(slot, ctx);
  const opt = cur && [...(ctx.roles?.options?.[slot.kind] || [])].find((o) => o.value === cur);
  const e = entryOf(ctx.models, cur);
  const name = (opt && opt.label !== cur ? opt.label : e?.name) || cur;
  const sel = ctx.selected === slot.id;
  const canOff = cur && slot.off && !(slot.off === 'windows' && cur === 'windows');
  const covers = cur && slot.kind === 'llm' ? allSlots().filter((s) => s.kind === 'llm' && equipped(s, ctx) === cur).length : 0;
  return `<div class="slot${cur && cur !== 'windows' ? ' on' : ''}${sel ? ' sel' : ''}" data-slot="${esc(slot.id)}" data-kind="${esc(slot.kind)}">
    <button type="button" class="slot-pick" data-slotpick="${esc(slot.id)}" aria-pressed="${sel}" title="${esc(slot.does)}">
      <span class="slot-icon" aria-hidden="true">${slot.icon}</span>
      <span class="slot-text"><strong>${esc(slot.name)}</strong><br>${cur && !(slot.off === 'windows' && cur === 'windows') ? `<span>${esc(name)}</span>${e?.vramGB ? ` <span class="weight">${gb(e.vramGB)}</span>` : ''}${covers > 1 ? ` <span class="tag good" title="One model doing several jobs loads once">covers ${covers} slots</span>` : ''}` : `<span class="muted">${esc(slot.empty)}</span>`}</span>
    </button>${canOff ? `<button type="button" class="mini unequip" data-unequip="${esc(slot.id)}" title="Take it off" aria-label="Take ${esc(name)} off ${esc(slot.name)}">✕</button>` : ''}</div>`;
}

function kitHtml(slot, ctx) {
  if (!slot) return '<p class="muted">Pick a slot around Bob to see what fits it.</p>';
  const kit = kitFor(slot, ctx);
  const cur = equipped(slot, ctx);
  const vram = ctx.vramGB;
  const items = kit.map((k) => {
    const e = k.entry;
    const heavy = vram && e?.vramGB > vram;
    const tip = stats(e, k.installed ? 'On this PC' : '');
    if (!k.installed) {
      return `<li class="kit shop model" title="${esc(tip)}"><span class="kit-name">${esc(k.label)}</span><span class="muted">${esc(tip)}</span>${heavy ? '<span class="tag warn">more than your card</span>' : ''}
        <button type="button" class="get" data-get="${esc(k.value)}">Get</button><div class="confirm" hidden></div></li>`;
    }
    return `<li class="kit${k.value === cur ? ' worn' : ''}${heavy ? ' heavy' : ''}" draggable="true" data-equip="${esc(k.value)}" data-kind="${esc(slot.kind)}" title="${esc(tip)}">
      <button type="button" class="kit-btn" data-equip="${esc(k.value)}" ${k.value === cur ? 'aria-current="true"' : ''}><span class="kit-name">${esc(k.label)}</span><span class="muted">${esc(tip)}</span>${heavy ? '<span class="tag warn">not recommended for your card</span>' : ''}${k.value === cur ? '<span class="tag good">equipped</span>' : ''}</button></li>`;
  }).join('');
  const engine = slot.engine && !(ctx.roles?.options?.[slot.kind] || []).length
    ? `<div class="model engine-step"><p>${esc(slot.name)} comes with the audio tools.</p><button class="get" data-engine="${esc(slot.engine)}">Get the audio tools</button><div class="confirm" hidden></div></div>` : '';
  const embedTip = slot.how === 'embed' && !kit.length ? '<p class="muted">Nothing here yet. An embedding model such as nomic-embed-text in Ollama shows up here once it is on this PC.</p>' : '';
  return `<h3>${slot.icon} ${esc(slot.name)}</h3><p class="muted">${esc(slot.does)}</p>${engine}${embedTip}<ol class="kit-list">${items || (engine || embedTip ? '' : '<li class="muted">Nothing fits this slot yet.</li>')}</ol>`;
}

// Everything equipped against the card: they don't all have to be loaded at once (Bob swaps), but it shows what fits together.
function weightHtml(ctx) {
  const seen = new Map();
  for (const s of SLOTS) { const e = entryOf(ctx.models, equipped(s, ctx)); if (e?.vramGB) seen.set(e.id, e); }
  const total = [...seen.values()].reduce((n, e) => n + e.vramGB, 0);
  const card = ctx.vramGB;
  if (!card) return `<p class="muted">Equipped: about ${gb(total)} of graphics memory in all.</p>`;
  const pct = Math.min(100, Math.round((total / card) * 100));
  return `<div class="weight-bar" title="Everything equipped, if it were all loaded at once"><div class="meter${total > card ? ' over' : ''}"><i style="width:${pct}%"></i></div>
    <span>${gb(total)} equipped · your card holds ${gb(card)}. ${total > card ? 'Not all at once: Bob loads what each job needs and swaps the rest (about 20 seconds a swap).' : 'All of it fits at once.'}</span></div>`;
}

// ---- Starter sets: a few models picked for the graphics card, as one button. Every download is still confirmed. ----
export const packFor = (packs, vramGB) => packs.find((p) => (vramGB || 0) >= p.minVramGB) || packs.at(-1);

// What a slot should hold for a catalog entry, once it's on this PC (the Ollama name, the catalog id, or
// "ollama:<name>" for ears). '' while it isn't there yet.
export function slotValue(slot, entry, roles) {
  if (!entry) return '';
  const opts = roles?.options?.[slot.kind] || [];
  const bare = (v) => String(v).replace(/:latest$/, '');
  const hit = opts.find((o) => o.value === entry.id || (entry.ollama && [bare(entry.ollama), `ollama:${bare(entry.ollama)}`].includes(bare(o.value))));
  return hit?.value || '';
}

// Ticked by default: what fits the card, plus what the set says to tick anyway.
export function starterTicks(pack, models, vramGB) {
  vramGB = vramGB || pack.cardGB || 0; // no card detected: judge by the card the set is for
  return new Set(pack.models.filter((id) => {
    const m = models.find((x) => x.id === id);
    return m && (m.status?.state === 'installed' || (pack.tick || []).includes(id) || !vramGB || !m.vramGB || m.vramGB <= vramGB);
  }));
}

// The downloads (models, then the engines they need) and the slots to fill when each is in.
export function starterPlan(pack, models, engines, picked) {
  const ids = [], plan = {};
  for (const id of pack.models) {
    if (!picked.has(id)) continue;
    const m = models.find((x) => x.id === id);
    if (!m) continue;
    plan[id] = pack.slots?.[id] || [];
    if (m.status?.state !== 'installed') ids.push(id);
    const eng = m.needs && engines.find((e) => e.name === m.needs);
    if (eng && !eng.installed && !ids.includes('engine:' + eng.id)) ids.push('engine:' + eng.id);
  }
  return { ids, plan };
}

export function starterHtml(ctx) {
  const packs = ctx.packs || [];
  if (!packs.length) return '';
  const pack = packs.find((p) => p.id === ctx.packId) || packFor(packs, ctx.vramGB);
  const picked = ctx.picks || starterTicks(pack, ctx.models, ctx.vramGB);
  const { ids } = starterPlan(pack, ctx.models, ctx.engines || [], picked);
  const total = ids.reduce((n, id) => n + (ctx.models.find((m) => m.id === id)?.sizeGB || 0), 0);
  const slotName = (id) => allSlots().find((s) => s.id === id);
  const rows = pack.models.map((id) => {
    const m = ctx.models.find((x) => x.id === id);
    if (!m) return '';
    const here = m.status?.state === 'installed';
    const slots = (pack.slots?.[id] || []).map(slotName).filter(Boolean);
    const card = ctx.vramGB || pack.cardGB;
    const big = card && m.vramGB > card;
    return `<li><label><input type="checkbox" data-starterpick="${esc(id)}" ${picked.has(id) ? 'checked' : ''}>
      <span>${slots.map((s) => s.icon).join('')} <strong>${esc(m.name)}</strong> <span class="muted">for ${esc(slots.map((s) => s.name).join(', '))} · ${here ? 'already here' : gb(m.sizeGB)}${m.license ? ` · ${esc(m.license)}` : ''}</span>
      ${pack.notes?.[id] ? `<br><span class="${big ? 'warn-text' : 'muted'}">${esc(pack.notes[id])}</span>` : big ? '<br><span class="warn-text">more than your card: slow</span>' : ''}</span></label></li>`;
  }).join('');
  const open = ctx.starterOpen ?? !equipped(SLOTS[0], ctx);
  return `<details class="starter"${open ? ' open' : ''}><summary>⭐ Starter set for your PC</summary>
    <p class="muted">A small set that lets Bob chat, plan, research, code, see pictures, speak${pack.id === 'cpu' ? '' : ', paint and film'}. All free for commercial use. Pick the set, untick what you don't want, then press the button: you see the full list before anything downloads.</p>
    <label class="pick"><strong>Set</strong> <select data-starterpack aria-label="Starter set">${packs.map((p) => `<option value="${esc(p.id)}" ${p.id === pack.id ? 'selected' : ''}>${esc(p.label)}${p.id === packFor(packs, ctx.vramGB).id ? ' (this PC)' : ''}</option>`).join('')}</select></label>
    <ul class="packlist">${rows}</ul>
    ${pack.times ? `<p class="muted">⏱ ${esc(pack.times)}</p>` : ''}
    <div class="row"><button type="button" class="get" data-starter="${esc(pack.id)}" ${picked.size ? '' : 'disabled'}>Equip starter set${ids.length ? ` (${gb(total)} to download)` : ''}</button></div>
    <div class="confirm starter-confirm" hidden></div></details>`;
}

export function equipHtml(ctx) {
  const sel = allSlots().find((s) => s.id === ctx.selected);
  const col = (side) => SLOTS.filter((s) => s.side === side).map((s) => slotHtml(s, ctx)).join('');
  return `<div class="equip-top"><p class="muted">Pick a slot, then click a model in the kit (or drag it onto the slot). Only what fits a slot goes in it. Nothing is equipped without you.</p>
      <button type="button" class="link" data-eqview="list">Plain list instead</button></div>
    ${starterHtml(ctx)}
    ${weightHtml(ctx)}
    <div class="equip-page">
      ${ctx.attributes || ''}
      <div class="equip-mid">
        <div class="doll"><div class="doll-col">${col('L')}</div><div class="doll-mid"><canvas class="doll-bob" width="160" height="160" aria-label="Bob"></canvas><div class="muted">Bob</div></div><div class="doll-col">${col('R')}</div></div>
        <details class="helpers"${HELPERS.some((h) => h.id === ctx.selected) ? ' open' : ''}><summary>Helpers (optional: each uses the main brain unless you pick one)</summary><div class="helper-row">${HELPERS.map((s) => slotHtml(s, ctx)).join('')}</div></details>
      </div>
      <section class="kit-panel" aria-live="polite"><div class="kit-head muted">Inventory</div>${kitHtml(sel, ctx)}</section>
    </div>`;
}
