// The brain-swap machine: a little pixel Rube Goldberg contraption that lifts Bob's lid,
// pulls out the old brain, and springs the new one in. Plays on a loop while a model loads.
import { motionOff } from './themes.js';
import { BOB, PALETTE } from './bob-sprite.js';

const W = 320, H = 100;
const LOOP_MS = 3600;
const PX = 3;            // Bob's pixel size
const HX = 200, HY = 40; // where Bob's sprite starts
const HEAD_CX = HX + 8 * PX;

const lerp = (a, b, t) => a + (b - a) * Math.min(1, Math.max(0, t));
const seg = (f, a, b) => (f - a) / (b - a); // 0..1 inside [a, b]
const ease = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };

function hue(name) {
  let h = 0;
  for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

function rect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function brain(ctx, cx, cy, h) {
  const base = `hsl(${h} 70% 70%)`, dark = `hsl(${h} 55% 45%)`;
  rect(ctx, cx - 9, cy - 3, 18, 9, base);
  rect(ctx, cx - 12, cy, 24, 6, base);
  rect(ctx, cx - 6, cy - 6, 12, 3, base);
  rect(ctx, cx - 6, cy - 2, 2, 5, dark);
  rect(ctx, cx, cy - 4, 2, 6, dark);
  rect(ctx, cx + 5, cy, 2, 4, dark);
  rect(ctx, cx - 10, cy + 3, 4, 2, dark);
}

// Bob's body without the lid (hair rows 0-2), and the lid on its own.
function body(ctx) {
  BOB.forEach((row, y) => {
    if (y < 3) return;
    [...row].forEach((ch, x) => { if (ch !== '.') rect(ctx, HX + x * PX, HY + y * PX, PX, PX, PALETTE[ch]); });
  });
}
function lid(ctx, dx, dy) {
  BOB.forEach((row, y) => {
    if (y >= 3) return;
    [...row].forEach((ch, x) => { if (ch !== '.') rect(ctx, HX + x * PX + dx, HY + y * PX + dy, PX, PX, PALETTE[ch]); });
  });
}

function claw(ctx, x, y, open) {
  const metal = '#9aa3ad', dark = '#5d6670';
  rect(ctx, x, 8, 1, y - 8, '#c7b296');      // cable
  rect(ctx, x - 6, y, 13, 3, metal);         // head
  rect(ctx, x - (open ? 9 : 7), y + 3, 3, 6, dark);
  rect(ctx, x + (open ? 7 : 5), y + 3, 3, 6, dark);
}

function scene(ctx, f, fromHue, toHue, t) {
  ctx.clearRect(0, 0, W, H);
  const wood = '#7a5232', woodDark = '#4a3220', metal = '#9aa3ad';

  // Rail and pulley
  rect(ctx, 104, 4, 212, 4, woodDark);
  rect(ctx, 100, 2, 8, 8, metal);

  // Ramp, ball, lever, string to the pulley
  for (let i = 0; i < 40; i++) rect(ctx, 6 + i * 2, 20 + i, 3, 2, wood);
  const fall = ease(seg(f, 0, 0.14));
  const bx = f < 0.14 ? lerp(10, 84, fall) : f < 0.2 ? lerp(84, 96, seg(f, 0.14, 0.2)) : 96;
  const by = f < 0.14 ? lerp(14, 54, fall) : f < 0.2 ? lerp(54, 66, seg(f, 0.14, 0.2)) : 66;
  if (f < 0.97) rect(ctx, bx - 3, by - 3, 6, 6, '#e05a4a');
  const tipped = f >= 0.16 && f < 0.97;
  const ly = tipped ? 0 : 6;
  for (let i = 0; i < 12; i++) rect(ctx, 90 + i * 2, 70 - (tipped ? -i * 0.5 : i * 0.5) - ly / 2, 3, 2, woodDark);
  rect(ctx, 100, 70, 3, 14, woodDark);
  rect(ctx, 104, 10, 1, tipped ? 54 : 58, '#c7b296');

  // Conveyor belt for the old brain
  rect(ctx, 250, 90, 70, 4, '#3a3a3a');
  for (let i = 0; i < 7; i++) rect(ctx, 252 + ((i * 10 + t / 40) % 68), 90, 3, 2, '#777');

  // Spring with the new brain waiting
  const squash = f > 0.66 && f < 0.72 ? 6 * seg(f, 0.66, 0.72) : 0;
  for (let i = 0; i < 5; i++) rect(ctx, 142, 94 - i * (4 - squash / 5) - 2, 16, 2, metal);
  rect(ctx, 140, 94, 20, 4, woodDark);

  // Claw path
  let cx = 120, cy = 14, open = true, carryLid = false, carryOld = false;
  if (f < 0.16) { cx = 120; }
  else if (f < 0.26) { cx = lerp(120, HEAD_CX, ease(seg(f, 0.16, 0.26))); }
  else if (f < 0.33) { cx = HEAD_CX; cy = lerp(14, HY - 8, ease(seg(f, 0.26, 0.33))); }
  else if (f < 0.37) { cx = HEAD_CX; cy = HY - 8; open = false; }
  else if (f < 0.44) { cx = HEAD_CX; cy = lerp(HY - 8, 12, ease(seg(f, 0.37, 0.44))); open = false; carryLid = true; carryOld = true; }
  else if (f < 0.54) { cx = lerp(HEAD_CX, 290, ease(seg(f, 0.44, 0.54))); cy = 12; open = false; carryLid = true; carryOld = true; }
  else if (f < 0.64) { cx = 290; cy = 12; open = false; carryLid = true; }
  else if (f < 0.74) { cx = lerp(290, HEAD_CX, ease(seg(f, 0.64, 0.74))); cy = 12; open = false; carryLid = true; }
  else if (f < 0.88) { cx = HEAD_CX; cy = 12; open = false; carryLid = true; }
  else if (f < 0.93) { cx = HEAD_CX; cy = lerp(12, HY - 8, ease(seg(f, 0.88, 0.93))); open = false; carryLid = true; }
  else { cx = HEAD_CX; cy = lerp(HY - 8, 14, ease(seg(f, 0.93, 1))); }

  // Bob
  body(ctx);
  const lidDX = carryLid ? cx - HEAD_CX : 0;
  const lidDY = carryLid ? cy - (HY - 8) : 0;

  // Old brain: in the head, then with the claw, then dropped on the belt
  if (carryOld) brain(ctx, cx, cy + 22, fromHue);
  else if (f >= 0.54 && f < 0.9) {
    const d = seg(f, 0.54, 0.6);
    const ox = f < 0.6 ? 290 : lerp(290, 340, seg(f, 0.6, 0.85));
    brain(ctx, ox, lerp(34, 84, ease(d)), fromHue);
  }

  // New brain: waits on the spring, flies in an arc, lands in the head
  if (f < 0.72) brain(ctx, 150, 80 + squash, toHue);
  else if (f < 0.84) {
    const k = seg(f, 0.72, 0.84);
    brain(ctx, lerp(150, HEAD_CX, k), lerp(80, HY + 4, k) - Math.sin(k * Math.PI) * 50, toHue);
  } else if (f < 0.93) brain(ctx, HEAD_CX, HY + 4, toHue);

  lid(ctx, lidDX, lidDY);
  claw(ctx, cx, cy, open);

  // Ding
  if (f > 0.93) {
    const a = seg(f, 0.93, 1);
    ctx.globalAlpha = 1 - a;
    for (const [dx, dy] of [[-22, -6], [22, -6], [0, -16]]) rect(ctx, HEAD_CX + dx * (0.6 + a), HY + dy * (0.6 + a), 3, 3, '#ffe08a');
    ctx.globalAlpha = 1;
  }
}

export function startSwap(canvas, { from = 'old', to = 'new' } = {}) {
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const fromHue = hue(from), toHue = hue(to);
  const t0 = performance.now();
  let raf = 0;
  const reduce = motionOff();
  const tick = (now) => {
    const t = now - t0;
    scene(ctx, reduce ? 0.5 : (t % LOOP_MS) / LOOP_MS, fromHue, toHue, t);
    if (!reduce) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

// For testing: draw one frame at a given point in the loop (0..1).
export function drawFrame(ctx, f, from = 'old', to = 'new') {
  scene(ctx, f, hue(from), hue(to), f * LOOP_MS);
}
