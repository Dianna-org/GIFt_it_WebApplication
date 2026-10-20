import { PAPER_COLOR } from '../config.js';
import { makeRng } from '../engine/random.js';

const TAU = Math.PI * 2;
const PALETTE = ['#e8506a', '#f4845f', '#f9c74f', '#6aa57a', '#2f8f83', '#4d96ff', '#b185db', '#f48fb1'];

export const PICTURE_LAYOUTS = [
  { id: 'classic', label: 'Classic', hint: 'Card on the desk' },
  { id: 'cake', label: 'With cake', hint: 'Cake and candles beside it' },
  { id: 'balloons', label: 'Balloons & confetti', hint: 'A party around the card' },
  { id: 'flowers', label: 'Flower bouquet', hint: 'Flowers in a vase' },
  { id: 'angled', label: 'Angled view', hint: 'Seen from an angle' },
  { id: 'bunting', label: 'Party bunting', hint: 'Flags above the card' },
];

export const ANIMATION_LAYOUTS = [
  { id: 'candles', label: 'Flickering candles', hint: 'Cake with burning flames' },
  { id: 'confetti', label: 'Confetti rain', hint: 'Card stands while confetti falls' },
  { id: 'text', label: 'Happy Birthday text', hint: 'Bouncing letters above the card' },
  { id: 'spin', label: 'Spinning card', hint: 'The card turns around' },
  { id: 'sparkle', label: 'Sparkles', hint: 'Twinkling stars' },
  { id: 'rise', label: 'Rising balloons', hint: 'Balloons float up' },
];

export const ANIM_SECONDS = 3;

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const m = (v) => Math.max(0, Math.min(255, Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f))));
  return `rgb(${m(n >> 16)},${m((n >> 8) & 255)},${m(n & 255)})`;
}

function backdrop(ctx, w, h, bg) {
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, h * 0.95);
  g.addColorStop(0, 'rgba(255,255,255,.28)'); g.addColorStop(1, 'rgba(0,0,0,.10)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}

const creaseCache = new WeakMap();
/** The artwork with a soft fold line down the middle (only on the paper itself, cuts stay see-through). */
function creased(art) {
  if (creaseCache.has(art)) return creaseCache.get(art);
  const c = document.createElement('canvas');
  c.width = art.width; c.height = art.height;
  const g = c.getContext('2d');
  g.drawImage(art, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  const w = c.width, gr = g.createLinearGradient(w * 0.47, 0, w * 0.53, 0);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(0,0,0,.14)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(w * 0.47, 0, w * 0.06, c.height);
  creaseCache.set(art, c);
  return c;
}

/** Draws the card artwork (an open spread) centred at (cx, cy) with width cw. Shadows follow the paper's shape. */
function card(ctx, art, cx, cy, cw, { rot = 0, sx = 1, transform, shadow = true } = {}) {
  const ch = (cw * art.height) / art.width;
  ctx.save();
  ctx.translate(cx, cy);
  if (transform) ctx.transform(...transform);
  ctx.rotate(rot);
  ctx.scale(sx, 1);
  if (shadow) { ctx.shadowColor = 'rgba(60,40,0,.35)'; ctx.shadowBlur = cw * 0.05; ctx.shadowOffsetY = cw * 0.025; }
  ctx.drawImage(creased(art), -cw / 2, -ch / 2, cw, ch);
  ctx.restore();
}

function balloon(ctx, x, y, s, color) {
  ctx.save();
  ctx.strokeStyle = 'rgba(90,70,40,.55)'; ctx.lineWidth = s * 0.03;
  ctx.beginPath(); ctx.moveTo(x, y + s * 0.62);
  ctx.bezierCurveTo(x - s * 0.25, y + s * 0.95, x + s * 0.25, y + s * 1.2, x, y + s * 1.6); ctx.stroke();
  ctx.shadowColor = 'rgba(60,40,0,.25)'; ctx.shadowBlur = s * 0.2; ctx.shadowOffsetY = s * 0.08;
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(x, y, s * 0.42, s * 0.52, 0, 0, TAU); ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.beginPath(); ctx.moveTo(x, y + s * 0.5); ctx.lineTo(x - s * 0.06, y + s * 0.62); ctx.lineTo(x + s * 0.06, y + s * 0.62); ctx.fillStyle = shade(color, -0.2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x - s * 0.15, y - s * 0.18, s * 0.07, s * 0.14, 0.5, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.fill();
  ctx.restore();
}

function cake(ctx, x, y, s, t = 0, flames = true) {
  ctx.save();
  ctx.translate(x, y);
  ctx.shadowColor = 'rgba(60,40,0,.3)'; ctx.shadowBlur = s * 0.1; ctx.shadowOffsetY = s * 0.05;
  const r = (px, py, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(px * s, py * s, w * s, h * s); };
  r(-0.5, 0.05, 1, 0.42, '#2f8f83');
  ctx.shadowColor = 'transparent';
  for (let i = 0; i < 5; i++) { ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.beginPath(); ctx.moveTo((-0.5 + i * 0.2) * s, 0.05 * s); ctx.lineTo((-0.4 + i * 0.2) * s, 0.47 * s); ctx.lineTo((-0.3 + i * 0.2) * s, 0.05 * s); ctx.fill(); }
  r(-0.38, -0.3, 0.76, 0.36, '#f4845f');
  r(-0.38, -0.12, 0.76, 0.07, '#fbe3a0');
  [-0.2, 0, 0.2].forEach((cx, i) => {
    r(cx - 0.025, -0.56, 0.05, 0.27, ['#e63946', '#4d96ff', '#90be6d'][i]);
    if (flames) {
      const f = 1 + 0.18 * Math.sin((t / ANIM_SECONDS) * TAU * 3 + i * 2);
      const sway = Math.sin((t / ANIM_SECONDS) * TAU * 2 + i) * 0.015;
      const g = ctx.createRadialGradient(cx * s, -0.66 * s, 0, cx * s, -0.66 * s, s * 0.18);
      g.addColorStop(0, 'rgba(255,220,120,.55)'); g.addColorStop(1, 'rgba(255,220,120,0)');
      ctx.fillStyle = g; ctx.fillRect((cx - 0.2) * s, -0.9 * s, 0.4 * s, 0.5 * s);
      ctx.fillStyle = '#ffb02e';
      ctx.beginPath(); ctx.ellipse((cx + sway) * s, -0.64 * s, 0.035 * s, 0.075 * s * f, sway * 6, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff1b0';
      ctx.beginPath(); ctx.ellipse((cx + sway) * s, -0.62 * s, 0.015 * s, 0.04 * s * f, sway * 6, 0, TAU); ctx.fill();
    }
  });
  ctx.restore();
}

function flower(ctx, x, y, s, color) {
  ctx.save(); ctx.translate(x, y);
  for (let i = 0; i < 6; i++) {
    ctx.rotate(TAU / 6);
    ctx.beginPath(); ctx.ellipse(0, -s * 0.5, s * 0.28, s * 0.42, 0, 0, TAU);
    ctx.fillStyle = i % 2 ? color : shade(color, 0.2); ctx.fill();
  }
  ctx.beginPath(); ctx.arc(0, 0, s * 0.25, 0, TAU); ctx.fillStyle = '#f9c74f'; ctx.fill();
  ctx.restore();
}

function bouquet(ctx, x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  const blooms = [[-0.45, -0.95, '#f4845f'], [0, -1.2, '#e8506a'], [0.45, -0.95, '#b185db'], [-0.22, -0.6, '#f9c74f'], [0.25, -0.6, '#f48fb1']];
  ctx.strokeStyle = '#4f8f56'; ctx.lineWidth = s * 0.05;
  blooms.forEach(([bx, by]) => { ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(bx * s * 0.3, by * s * 0.5, bx * s, by * s); ctx.stroke(); });
  ctx.fillStyle = '#6aa57a';
  [[-0.5, -0.4, -0.7], [0.5, -0.4, 0.7], [-0.15, -0.35, -0.2]].forEach(([lx, ly, a]) => { ctx.save(); ctx.translate(lx * s, ly * s); ctx.rotate(a); ctx.beginPath(); ctx.ellipse(0, 0, s * 0.1, s * 0.28, 0, 0, TAU); ctx.fill(); ctx.restore(); });
  blooms.forEach(([bx, by, c]) => flower(ctx, bx * s, by * s, s * 0.34, c));
  ctx.beginPath(); ctx.moveTo(-0.34 * s, 0); ctx.lineTo(0.34 * s, 0); ctx.lineTo(0.26 * s, 0.55 * s); ctx.lineTo(-0.26 * s, 0.55 * s); ctx.closePath();
  ctx.shadowColor = 'rgba(60,40,0,.3)'; ctx.shadowBlur = s * 0.1;
  ctx.fillStyle = '#2f8f83'; ctx.fill();
  ctx.restore();
}

function confetti(ctx, w, h, t, count = 90, seed = 7, falling = true) {
  const rng = makeRng(seed);
  for (let i = 0; i < count; i++) {
    const x0 = rng() * w, y0 = rng() * h, size = (6 + rng() * 10) * (w / 1600) * 1.6;
    const color = PALETTE[Math.floor(rng() * PALETTE.length)];
    const k = 1 + Math.floor(rng() * 2), ph = rng() * TAU, spin = rng() * TAU;
    const p = t / ANIM_SECONDS;
    const y = falling ? ((y0 + p * k * h) % (h + 60)) - 30 : y0;
    const x = x0 + (falling ? Math.sin(p * TAU * k + ph) * 18 : 0);
    ctx.save(); ctx.translate(x, y); ctx.rotate(spin + (falling ? p * TAU * k : 0));
    ctx.fillStyle = color; ctx.fillRect(-size / 2, -size / 4, size, size / 2); ctx.restore();
  }
}

function bunting(ctx, w, y, s, t = 0) {
  ctx.save();
  ctx.strokeStyle = 'rgba(90,70,40,.7)'; ctx.lineWidth = s * 0.03;
  const n = 11;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) { const x = (i / n) * w, yy = y + Math.sin((i / n) * Math.PI) * s * 0.5; i ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy); }
  ctx.stroke();
  for (let i = 0; i < n; i++) {
    const x = ((i + 0.5) / n) * w, yy = y + Math.sin(((i + 0.5) / n) * Math.PI) * s * 0.5;
    const sway = Math.sin((t / ANIM_SECONDS) * TAU + i) * 0.06;
    ctx.save(); ctx.translate(x, yy); ctx.rotate(sway);
    ctx.beginPath(); ctx.moveTo(-s * 0.3, 0); ctx.lineTo(s * 0.3, 0); ctx.lineTo(0, s * 0.62); ctx.closePath();
    ctx.fillStyle = PALETTE[i % PALETTE.length]; ctx.fill(); ctx.restore();
  }
  ctx.restore();
}

function star(ctx, x, y, r, a) {
  ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = '#fff';
  ctx.shadowColor = 'rgba(255,255,255,.9)'; ctx.shadowBlur = r;
  ctx.beginPath();
  ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y); ctx.quadraticCurveTo(x, y, x, y - r); ctx.fill(); ctx.restore();
}

function sparkles(ctx, w, h, t, n = 26, seed = 3) {
  const rng = makeRng(seed);
  for (let i = 0; i < n; i++) {
    const x = rng() * w, y = rng() * h, r = (10 + rng() * 22) * (w / 1600), ph = rng() * TAU, k = 1 + Math.floor(rng() * 2);
    const a = 0.5 + 0.5 * Math.sin((t / ANIM_SECONDS) * TAU * k + ph);
    star(ctx, x, y, r * (0.5 + a * 0.6), a * 0.9);
  }
}

function title(ctx, w, y, t, text = 'Happy Birthday!') {
  const size = w * 0.075;
  ctx.save();
  ctx.font = `bold ${size}px Georgia, serif`; ctx.textBaseline = 'middle';
  const widths = [...text].map((c) => ctx.measureText(c).width);
  let x = w / 2 - widths.reduce((a, b) => a + b, 0) / 2;
  [...text].forEach((c, i) => {
    const bounce = -Math.abs(Math.sin((t / ANIM_SECONDS) * TAU - i * 0.4)) * size * 0.35;
    ctx.fillStyle = PALETTE[i % PALETTE.length];
    ctx.shadowColor = 'rgba(60,40,0,.3)'; ctx.shadowBlur = size * 0.1; ctx.shadowOffsetY = size * 0.04;
    ctx.fillText(c, x, y + bounce); x += widths[i];
  });
  ctx.restore();
}

/** Paints a layout. `art` is the flat card canvas. Everything loops with period ANIM_SECONDS. */
export function renderLayout(canvas, layoutId, art, bg, t = 0.6, backArt = null) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height, u = w / 1600;
  const aspect = art.height / art.width;
  backdrop(ctx, w, h, bg);
  const cw = (cx) => Math.min(cx, (h * 0.62) / aspect);
  const p = (t / ANIM_SECONDS) * TAU;

  switch (layoutId) {
    case 'classic':
      sparkles(ctx, w, h, 0.7, 14, 11);
      card(ctx, art, w / 2, h / 2, cw(w * 0.62));
      break;
    case 'cake':
      card(ctx, art, w * 0.38, h * 0.5, cw(w * 0.58), { rot: -0.05 });
      cake(ctx, w * 0.77, h * 0.62, w * 0.28, 0.8);
      sparkles(ctx, w, h, 0.5, 10, 5);
      break;
    case 'balloons':
      confetti(ctx, w, h, 0, 110, 9, false);
      balloon(ctx, w * 0.12, h * 0.22, w * 0.2, PALETTE[0]); balloon(ctx, w * 0.2, h * 0.32, w * 0.17, PALETTE[2]);
      balloon(ctx, w * 0.88, h * 0.2, w * 0.2, PALETTE[5]); balloon(ctx, w * 0.8, h * 0.31, w * 0.17, PALETTE[1]);
      balloon(ctx, w * 0.9, h * 0.42, w * 0.14, PALETTE[6]);
      card(ctx, art, w / 2, h * 0.56, cw(w * 0.56), { rot: 0.02 });
      break;
    case 'flowers':
      card(ctx, art, w * 0.4, h * 0.5, cw(w * 0.6), { rot: 0.04 });
      bouquet(ctx, w * 0.84, h * 0.74, w * 0.3);
      break;
    case 'angled':
      card(ctx, art, w / 2, h * 0.52, cw(w * 0.58), { transform: [1, 0, -0.32, 0.82, 0, 0], rot: 0 });
      sparkles(ctx, w, h, 0.9, 12, 13);
      break;
    case 'bunting':
      bunting(ctx, w, h * 0.06, w * 0.09);
      confetti(ctx, w, h, 0, 70, 21, false);
      card(ctx, art, w / 2, h * 0.58, cw(w * 0.6));
      break;

    case 'candles':
      card(ctx, art, w * 0.38, h * 0.52, cw(w * 0.58), { rot: -0.04 });
      cake(ctx, w * 0.77, h * 0.64, w * 0.28, t);
      break;
    case 'confetti':
      card(ctx, art, w / 2, h * 0.52 + Math.sin(p) * 6 * u, cw(w * 0.6));
      confetti(ctx, w, h, t, 100, 31, true);
      break;
    case 'text':
      title(ctx, w, h * 0.13, t);
      card(ctx, art, w / 2, h * 0.58, cw(w * 0.58));
      break;
    case 'spin': {
      const c = Math.cos(p);
      const sx = Math.max(0.03, Math.abs(c));
      card(ctx, c < 0 && backArt ? backArt : art, w / 2, h / 2, cw(w * 0.6), { sx });
      sparkles(ctx, w, h, t, 12, 17);
      break;
    }
    case 'sparkle':
      card(ctx, art, w / 2, h / 2, cw(w * 0.62));
      sparkles(ctx, w, h, t, 40, 41);
      break;
    case 'rise': {
      card(ctx, art, w / 2, h * 0.56, cw(w * 0.56));
      const rng = makeRng(77);
      for (let i = 0; i < 9; i++) {
        const x = (0.06 + rng() * 0.88) * w, s = w * (0.1 + rng() * 0.08), k = 1;
        const y = h * 1.25 - (((t / ANIM_SECONDS) * k + rng()) % 1) * h * 1.6;
        balloon(ctx, x + Math.sin(p + i) * 14 * u, y, s, PALETTE[i % PALETTE.length]);
      }
      break;
    }
    default:
      card(ctx, art, w / 2, h / 2, cw(w * 0.6));
  }
}
