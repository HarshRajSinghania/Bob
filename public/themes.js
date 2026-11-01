// Bob's themes. Each theme is a handful of colours (plus a font and corner roundness); everything on
// screen reads them as CSS variables, so a theme switch is instant and needs no reload.
// The MouseHole themes are copied from the MouseHole app by MouseWurX (ui/theme/Theme.kt); MouseWurX is the
// website's blueprint look (assets/css/site.css), with IBM Plex Mono bundled in public/fonts (OFL).

// ---------- colour helpers ----------
const HEX = /^#[0-9a-f]{6}$/i;
function rgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
function hex(r, g, b) { return '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join(''); }
export function mix(a, b, t) { if (!HEX.test(a) || !HEX.test(b)) return a; const x = rgb(a), y = rgb(b); return hex(...x.map((v, i) => v * t + y[i] * (1 - t))); }
export function isLight(h) { if (!HEX.test(h)) return false; const [r, g, b] = rgb(h); return (0.299 * r + 0.587 * g + 0.114 * b) > 150; }

// The colours a theme can set. These are also the rows of the "make your own" editor.
export const TOKENS = [
  ['bg', 'Background'], ['panel', 'Bars and panels'], ['card', 'Cards and Bob\'s bubbles'], ['you', 'Your bubbles'],
  ['line', 'Lines and borders'], ['text', 'Text'], ['muted', 'Quiet text'], ['accent', 'Accent'], ['onAccent', 'Text on accent'],
  ['good', 'Good'], ['warn', 'Warning'], ['bad', 'Problem'], ['spriteBg', 'Behind Bob']
];

export const FONTS = {
  system: { label: 'Segoe UI (system)', css: '"Segoe UI", system-ui, sans-serif' },
  plex: { label: 'IBM Plex Mono (MouseWurX)', css: '"IBM Plex Mono", Consolas, "DejaVu Sans Mono", "Liberation Mono", "Courier New", monospace' },
  mono: { label: 'Consolas', css: 'Consolas, "Cascadia Mono", monospace' },
  serif: { label: 'Georgia (bookish)', css: 'Georgia, "Times New Roman", serif' },
  rounded: { label: 'Rounded', css: '"Segoe UI Variable Display", "Segoe UI", "Trebuchet MS", sans-serif' }
};

// MouseHole's Material colour roles, mapped onto Bob's.
function mh(c, extra = {}) {
  return {
    bg: c.background, panel: c.surface, card: c.surfaceVariant, line: c.outline, text: c.onSurface, muted: c.onSurfaceVariant,
    accent: c.primary, onAccent: c.onPrimary, good: c.secondary, warn: c.warn, bad: c.error,
    you: mix(c.primary, c.surface, 0.28), spriteBg: c.surfaceVariant, ...extra
  };
}

const MH = {
  dark: { primary: '#5FBF8C', onPrimary: '#0B1410', secondary: '#3E8F68', background: '#0B1410', surface: '#12201A', surfaceVariant: '#1A2C24', onSurface: '#DCE6DF', onSurfaceVariant: '#8FA69A', error: '#E07A6A', outline: '#24392F', warn: '#E2B23A' },
  light: { primary: '#2E7D5B', onPrimary: '#FFFFFF', secondary: '#5FA183', background: '#EDF2ED', surface: '#FFFFFF', surfaceVariant: '#DBE8DE', onSurface: '#152019', onSurfaceVariant: '#55685D', error: '#B3261E', outline: '#C8D6CC', warn: '#8A6100' }
};
const MIDNIGHT = { primary: '#6AA9FF', onPrimary: '#080A0F', secondary: '#3F6FA8', background: '#080A0F', surface: '#0F141C', surfaceVariant: '#171E29', onSurface: '#DDE3EC', onSurfaceVariant: '#8794A8', error: '#FF7A6B', outline: '#1E2836', warn: '#FFC65C' };
const SLATE = { primary: '#4FB3BF', onPrimary: '#121212', secondary: '#357F88', background: '#121212', surface: '#1C1C1C', surfaceVariant: '#262626', onSurface: '#E4E4E4', onSurfaceVariant: '#9A9A9A', error: '#E0685A', outline: '#2E2E2E', warn: '#D9A23E' };
const PAPER = { primary: '#1F6F6B', onPrimary: '#FFFFFF', secondary: '#4E9A96', background: '#FAF8F3', surface: '#FFFFFF', surfaceVariant: '#EFEBE1', onSurface: '#1A1A17', onSurfaceVariant: '#5C5C55', error: '#B3261E', outline: '#DAD5C8', warn: '#8A6100' };
const HC = {
  dark: { primary: '#00E5FF', onPrimary: '#000000', secondary: '#00B8D4', background: '#000000', surface: '#0D0D0D', surfaceVariant: '#262626', onSurface: '#FFFFFF', onSurfaceVariant: '#E0E0E0', error: '#FF5252', outline: '#FFFFFF', warn: '#FFD600' },
  light: { primary: '#0046C8', onPrimary: '#FFFFFF', secondary: '#003399', background: '#FFFFFF', surface: '#FAFAFA', surfaceVariant: '#E0E0E0', onSurface: '#000000', onSurfaceVariant: '#212121', error: '#C70000', outline: '#000000', warn: '#7A4F00' }
};
const WURX = {
  light: { paper: '#E1E6E4', plate: '#EEF2F1', plate2: '#D5DCDA', grid: 'rgba(14,26,28,.06)', gridMajor: 'rgba(14,26,28,.095)', ink: '#101719', ink2: '#333F42', rule: '#AEB9B8', print: '#15626C', printSoft: '#D2E4E6', stamp: '#A32D18', stampSoft: '#F0DCD6', live: '#2C6446', liveSoft: '#DCE9E0' },
  dark: { paper: '#0C0F10', plate: '#13181A', plate2: '#1A2124', grid: 'rgba(180,215,220,.045)', gridMajor: 'rgba(180,215,220,.075)', ink: '#DEE7E8', ink2: '#B0BEC0', rule: '#2C383B', print: '#63C4D2', printSoft: '#11333A', stamp: '#E07257', stampSoft: '#33170F', live: '#63B88C', liveSoft: '#11291D' }
};
function wurx(c, dark) {
  return {
    colors: { bg: c.paper, panel: c.plate, card: c.plate2, you: c.printSoft, line: c.rule, text: c.ink, muted: c.ink2, accent: c.print, onAccent: dark ? '#0C0F10' : '#FFFFFF', good: c.live, warn: c.stamp, bad: c.stamp, spriteBg: c.plate2, dangerBg: c.stampSoft, goodBg: c.liveSoft, grid: c.grid, gridMajor: c.gridMajor },
    font: 'plex', radius: 0, blueprint: true, flat: true
  };
}

export const PRESETS = [
  { id: 'inn', name: 'Bob\'s Inn', group: 'Bob', what: 'Warm tavern browns. Bob\'s original.', colors: { bg: '#1d1510', panel: '#2b1d14', card: '#3a281b', you: '#34465a', line: '#5a4030', text: '#f3e7d3', muted: '#c7b296', accent: '#e7a64a', onAccent: '#2b1d14', good: '#7fbf7a', warn: '#e7a64a', bad: '#e07a6a', spriteBg: '#4a3220' } },
  { id: 'system', name: 'Match system', group: 'MouseHole', what: 'Mousehole dark or light, following Windows.', follows: ['mousehole-dark', 'mousehole-light'] },
  { id: 'mousehole-dark', name: 'Mousehole', group: 'MouseHole', what: 'Dark forest green. The original.', colors: mh(MH.dark, { warnBg: '#3A2E12', dangerBg: '#3A1A1A', goodBg: '#123022' }) },
  { id: 'mousehole-light', name: 'Mousehole Light', group: 'MouseHole', what: 'Same green, for daylight.', colors: mh(MH.light) },
  { id: 'midnight', name: 'Midnight', group: 'MouseHole', what: 'Near-black and blue. Easiest on the eyes at night.', colors: mh(MIDNIGHT) },
  { id: 'slate', name: 'Slate', group: 'MouseHole', what: 'Neutral grey, no colour cast.', colors: mh(SLATE) },
  { id: 'paper', name: 'Paper', group: 'MouseHole', what: 'Warm and high contrast, for bright light.', colors: mh(PAPER) },
  { id: 'hc-dark', name: 'High Contrast', group: 'MouseHole', what: 'Full-white text, everything outlined, colour-blind safe.', colors: mh(HC.dark), outlined: true },
  { id: 'hc-light', name: 'High Contrast Light', group: 'MouseHole', what: 'Black on white, everything outlined.', colors: mh(HC.light), outlined: true },
  { id: 'mousewurx-light', name: 'MouseWurX', group: 'MouseWurX', what: 'The website: blueprint paper, plates, IBM Plex Mono.', ...wurx(WURX.light, false) },
  { id: 'mousewurx-dark', name: 'MouseWurX Dark', group: 'MouseWurX', what: 'The website at night.', ...wurx(WURX.dark, true) }
];
export const DEFAULT_THEME = 'inn';

export function findTheme(id, custom = []) {
  return PRESETS.find((t) => t.id === id) || custom.find((t) => t.id === id) || null;
}

// Turn the saved style into the theme to show right now (Match system picks dark or light).
export function resolve(style = {}) {
  let t = findTheme(style.theme, style.custom) || findTheme(DEFAULT_THEME);
  if (t.follows) {
    const dark = !globalThis.matchMedia || globalThis.matchMedia('(prefers-color-scheme: dark)').matches;
    t = findTheme(t.follows[dark ? 0 : 1]);
  }
  return t;
}

// Every colour a theme leaves out is worked out from the ones it has, so a custom theme can be tiny.
export function fullColors(t) {
  const base = findTheme(DEFAULT_THEME).colors;
  const c = { ...base, ...(t.colors || {}) };
  if (!t.colors?.onAccent) c.onAccent = isLight(c.accent) ? '#1a1a1a' : '#ffffff';
  if (!t.colors?.you) c.you = mix(c.accent, c.panel, 0.28);
  if (!t.colors?.spriteBg) c.spriteBg = c.card;
  c.dangerBg = t.colors?.dangerBg || mix(c.bad, c.bg, 0.22);
  c.goodBg = t.colors?.goodBg || mix(c.good, c.bg, 0.3);
  c.backdrop = isLight(c.bg) ? 'rgba(20, 24, 26, 0.45)' : 'rgba(0, 0, 0, 0.7)';
  c.grid = t.colors?.grid || 'transparent';
  c.gridMajor = t.colors?.gridMajor || 'transparent';
  return c;
}

const VAR = { onAccent: 'on-accent', spriteBg: 'sprite-bg', dangerBg: 'danger-bg', goodBg: 'good-bg', gridMajor: 'grid-major' };
export function applyTheme(t, root = document.documentElement) {
  const c = fullColors(t);
  for (const [k, v] of Object.entries(c)) root.style.setProperty(`--${VAR[k] || k}`, v);
  root.style.setProperty('--font', (FONTS[t.font] || FONTS.system).css);
  root.style.setProperty('--r', `${Number.isFinite(t.radius) ? t.radius : 8}px`);
  root.style.setProperty('--shadow', t.flat ? '0 0 0 1px var(--accent) inset' : '0 0 0 2px var(--accent) inset');
  root.style.colorScheme = isLight(c.bg) ? 'light' : 'dark';
  document.body?.classList.toggle('blueprint', Boolean(t.blueprint));
  document.body?.classList.toggle('outlined', Boolean(t.outlined));
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = c.panel;
}

let current = {};
let watching = false;
// Animations: 'on' (default: Remote Desktop turns Windows' animation effects off, and movement is wanted),
// 'system' follows Windows' "Animation effects" setting, 'off' keeps everything still.
export function motionOff(style = current) {
  const m = style?.motion || 'on';
  if (m === 'off') return true;
  if (m === 'system') return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  return false;
}

export function applyStyle(style = {}) {
  current = style || {};
  applyTheme(resolve(current));
  document.body?.classList.toggle('still', motionOff(current));
  try { localStorage.setItem('bob-style', JSON.stringify(current)); } catch {} // so the next start shows the right colours at once
  if (!watching && globalThis.matchMedia) {
    watching = true;
    globalThis.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme(resolve(current)));
    globalThis.matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', () => document.body?.classList.toggle('still', motionOff(current)));
  }
}
export function currentStyle() { return current; }

export function swatch(t) {
  if (t.follows) {
    const [d, l] = t.follows.map((id) => fullColors(findTheme(id)));
    return [d.bg, d.accent, l.bg, l.accent];
  }
  const c = fullColors(t);
  return [c.bg, c.panel, c.card, c.accent, c.text];
}

// Called as the page loads, before the settings arrive, so Bob never flashes the wrong colours.
export function applySavedStyle() {
  try { applyStyle(JSON.parse(localStorage.getItem('bob-style') || '{}')); } catch { applyStyle({}); }
}
