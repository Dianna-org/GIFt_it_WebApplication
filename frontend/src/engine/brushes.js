import { makeRng, smoothNoise } from './random.js';
import { patternById, stampPattern } from './patterns.js';

// How each tool is composited onto the card once the stroke is finished.
// Every stroke is rendered opaque on its own layer and blended with these settings,
// so a single stroke never darkens itself but crossing strokes do (like real highlighters).
export const BLEND = {
  crayon: { op: 'multiply', alpha: 1 },       // pigments mix when crayons cross
  marker: { op: 'source-over', alpha: 0.85 }, // slightly see-through
  highlighter: { op: 'multiply', alpha: 0.5 },
  brush: { op: 'source-over', alpha: 1 },
  glitter: { op: 'source-over', alpha: 1 },
  pattern: { op: 'source-over', alpha: 1 },
  calligraphy: { op: 'source-over', alpha: 1 },
  spray: { op: 'source-over', alpha: 1 },      // the mist is see-through already: passes build up
};

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const rgba = (hex, a) => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
};
function shade(hex, f) {
  const [r, g, b] = hexToRgb(hex);
  const m = (v) => Math.max(0, Math.min(255, Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f))));
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}

function grain(x, y) {
  const n = Math.sin(Math.floor(x) * 12.9898 + Math.floor(y) * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

function smoothPath(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  if (pts.length === 1) { ctx.lineTo(pts[0].x + 0.01, pts[0].y); return; }
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last.x, last.y);
}

/** Resample to roughly even spacing so textures and width variation are speed independent. */
export function resample(pts, step) {
  if (pts.length < 2) return pts.slice();
  const out = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    let a = out[out.length - 1];
    const b = pts[i];
    let d = Math.hypot(b.x - a.x, b.y - a.y);
    while (d + carry >= step) {
      const t = (step - carry) / d;
      a = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      out.push(a);
      d = Math.hypot(b.x - a.x, b.y - a.y);
      carry = 0;
    }
    carry += d;
  }
  const last = pts[pts.length - 1];
  const tail = out[out.length - 1];
  if (Math.hypot(last.x - tail.x, last.y - tail.y) > 0.5) out.push(last);
  return out;
}

/*
 * Strokes are drawn in two steps (round 37, so long strokes stay fast):
 *   UNITS[tool](points, opts)  -> the stroke's evenly spaced points ("units"), always the same for the same
 *                                start of a stroke, so a growing stroke only adds units at the end;
 *   DRAW[tool](ctx, units, opts, from, to, final) -> draws units [from, to) exactly as the whole stroke
 *                                would draw them (randomness is per unit, widths depend on the distance
 *                                from the start, the end of the stroke only tapers when `final`).
 * The paper draws the finished part of a live stroke once (from..to, final = false) and each frame only
 * re-draws the last stretch (final = true) – instead of the whole stroke 60 times a second.
 */
const unitRng = (seed, i) => makeRng(((seed * 2654435761) ^ (i * 40503 + 0x9e37)) >>> 0);

// a path through units [from - 1, to) – sharing one point with the part before, so the line is unbroken
function polyline(ctx, u, from, to) {
  ctx.beginPath();
  const a = Math.max(0, from - 1);
  ctx.moveTo(u[a].x, u[a].y);
  if (to - a === 1) ctx.lineTo(u[a].x + 0.01, u[a].y);
  for (let i = a + 1; i < to; i++) ctx.lineTo(u[i].x, u[i].y);
}

const BRUSH_STEP = 2.5, GLITTER_STEP = 1.5, CRAYON_STEP = 1.1;
const highlighterStep = (size) => Math.max(1, (size * 0.38) / 3);
const CALLI_STEP = 1.2, CALLI_ANGLE = -Math.PI / 4; // the flat nib is held at 45° (thick ↘ / thin ↗ strokes)
const sprayStep = (size) => Math.max(1.5, size * 0.12);
const patternStep = (opts) => Math.max(2, opts.size * patternById(opts.pattern).gap * ((opts.spacing ?? 100) / 100));

export const UNITS = {
  pattern: (pts, opts) => resample(pts, patternStep(opts)),
  marker: (pts) => pts,
  highlighter: (pts, { size }) => resample(pts, highlighterStep(size)),
  crayon: (pts) => resample(pts, CRAYON_STEP),
  brush: (pts) => resample(pts, BRUSH_STEP),
  glitter: (pts) => resample(pts, GLITTER_STEP),
  calligraphy: (pts) => resample(pts, CALLI_STEP),
  spray: (pts, { size }) => resample(pts, sprayStep(size)),
};

/** How many units at the end of a live stroke may still change (they are re-drawn every frame). */
export function keepUnits(tool, opts) {
  const step = { pattern: patternStep(opts), marker: 4, highlighter: highlighterStep(opts.size), crayon: CRAYON_STEP, brush: BRUSH_STEP, glitter: GLITTER_STEP,
    calligraphy: CALLI_STEP, spray: sprayStep(opts.size) }[tool];
  const endZone = tool === 'brush' ? opts.size * 1.9 : 0; // the brush tapers off at the end
  return Math.ceil((endZone + 16) / step) + 3;
}

const DRAW = {
  // pattern pen: shapes stamped along the stroke (engine/patterns.js)
  pattern(ctx, u, opts, from, to) {
    stampPattern(ctx, u, opts, null, opts.pattern, { from, to, rngAt: (i) => unitRng(opts.seed, i) });
  },

  marker(ctx, u, { size, color }, from, to) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = color; ctx.lineWidth = size;
    if (from === 0 && to === u.length) smoothPath(ctx, u); else polyline(ctx, u, from, to);
    ctx.stroke();
  },

  highlighter(ctx, u, { size, color }, from, to) {
    // chisel tip: a flat rectangle held at 45 degrees
    ctx.fillStyle = color;
    const w = size, h = size * 0.38, ang = -Math.PI / 4;
    for (let i = from; i < to; i++) {
      ctx.save(); ctx.translate(u[i].x, u[i].y); ctx.rotate(ang);
      ctx.fillRect(-w / 2, -h / 2, w, h); ctx.restore();
    }
  },

  crayon(ctx, u, { size, color, seed }, from, to) {
    const r = size / 2;
    const dots = Math.max(5, Math.round(size * 0.9));
    for (let k = from; k < to; k++) {
      const p = u[k], rng = unitRng(seed, k);
      for (let i = 0; i < dots; i++) {
        const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * r;
        const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
        const alpha = 0.45 + rng() * 0.55, dark = rng() < 0.12, s = 1 + rng() * 1.3;
        // paper tooth: the same spots stay bare, so crossing strokes fill the gaps
        if (grain(x, y) > 0.68) continue;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = dark ? shade(color, 0.25) : color;
        ctx.fillRect(x, y, s, s);
      }
    }
    ctx.globalAlpha = 1;
  },

  brush(ctx, u, { size, color, seed }, from, to, final) {
    const n = u.length;
    if (n < 2) {
      if (from === 0) { ctx.beginPath(); ctx.arc(u[0].x, u[0].y, size / 2, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); }
      return;
    }
    const rng = makeRng(seed);
    const bristles = Math.max(4, Math.round(size / 2.2));
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const a0 = Math.max(0, from - 1);
    // direction normals (from the neighbouring units)
    const normal = (i) => {
      const a = u[Math.max(0, i - 1)], b = u[Math.min(n - 1, i + 1)];
      const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      return { x: -(b.y - a.y) / l, y: (b.x - a.x) / l };
    };
    const normals = [];
    for (let i = a0; i < to; i++) normals.push(normal(i));
    for (let k = 0; k < bristles; k++) {
      const off = (k / (bristles - 1) - 0.5) * 2; // -1..1 across the brush
      const phase = rng() * 100;
      const lw = Math.max(1.2, (size / bristles) * (1.4 + rng() * 0.8));
      const tone = (rng() - 0.5) * 0.28;
      const alpha = 0.65 + rng() * 0.35;
      ctx.strokeStyle = shade(color, tone);
      ctx.lineWidth = lw;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      let started = false;
      for (let i = a0; i < to; i++) {
        const dist = i * BRUSH_STEP;
        // uneven pressure: width swells and thins along the stroke, tapering in at the start and out at the end
        const press = 0.62 + 0.38 * smoothNoise(null, dist * 0.016 + phase * 0.01 + seed * 0.001);
        const taper = Math.min(1, 0.12 + dist / (size * 1.6), final ? ((n - 1 - i) * BRUSH_STEP) / (size * 1.4) + 0.25 : 1);
        const spread = (size / 2) * off * press * Math.max(0.15, taper);
        const jitter = smoothNoise(null, i * 0.35 + phase) * lw * 0.6;
        const nm = normals[i - a0];
        const x = u[i].x + nm.x * (spread + jitter), y = u[i].y + nm.y * (spread + jitter);
        // dry-brush gaps
        const gap = smoothNoise(null, i * 0.2 + phase * 3) > 0.82 && Math.abs(off) > 0.6;
        if (gap) { started = false; continue; }
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },

  glitter(ctx, u, { size, color, seed }, from, to) {
    // the gel line goes BEHIND what is already drawn, so it never covers the glitter of the part before
    ctx.save();
    ctx.globalCompositeOperation = 'destination-over';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = color; ctx.lineWidth = size;
    polyline(ctx, u, from, to); ctx.stroke();
    ctx.restore();
    // grainy glitter flecks inside the line
    const sparkles = [];
    const flecks = Math.max(2, size * 0.5);
    for (let k = from; k < to; k++) {
      const p = u[k], rng = unitRng(seed, k);
      for (let i = 0; i < flecks; i++) {
        const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * (size / 2);
        const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
        const roll = rng();
        ctx.fillStyle = roll < 0.35 ? '#ffffff' : roll < 0.6 ? shade(color, 0.5) : roll < 0.8 ? shade(color, -0.3) : '#ffe9a8';
        ctx.globalAlpha = 0.5 + rng() * 0.5;
        const s = 0.8 + rng() * 1.5;
        ctx.fillRect(x, y, s, s);
        if (rng() < 0.035) sparkles.push({ x, y, r: 2.5 + rng() * (size * 0.55), phase: rng() * 6.28, speed: 1.5 + rng() * 3 });
      }
    }
    ctx.globalAlpha = 1;
    return { sparkles };
  },

  // calligraphy pen: a flat nib swept along the stroke – broad when moving across the nib, a hairline along it
  calligraphy(ctx, u, { size, color }, from, to) {
    const nx = (Math.cos(CALLI_ANGLE) * size) / 2, ny = (Math.sin(CALLI_ANGLE) * size) / 2;
    ctx.fillStyle = color; ctx.strokeStyle = color;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const a0 = Math.max(0, from - 1);
    ctx.beginPath();
    if (to - a0 === 1) { // a single dab: the nib's own shape
      const p = u[a0];
      ctx.moveTo(p.x - nx, p.y - ny); ctx.lineTo(p.x + nx, p.y + ny);
    } else {
      // one quad per step, all wound the same way, filled as ONE path (no seams between them)
      for (let i = a0 + 1; i < to; i++) {
        const a = u[i - 1], b = u[i];
        const cross = (b.x - a.x) * ny - (b.y - a.y) * nx;
        const s = cross >= 0 ? 1 : -1;
        ctx.moveTo(a.x - nx * s, a.y - ny * s); ctx.lineTo(a.x + nx * s, a.y + ny * s);
        ctx.lineTo(b.x + nx * s, b.y + ny * s); ctx.lineTo(b.x - nx * s, b.y - ny * s); ctx.closePath();
      }
      ctx.fill('nonzero');
      // the nib has some thickness too, so strokes along it stay a fine hairline instead of vanishing
      polyline(ctx, u, from, to);
    }
    ctx.lineWidth = Math.max(1.2, size * 0.1);
    ctx.stroke();
  },

  // spray can: a soft mist with fine speckles, denser in the middle; passing over a spot again builds it up
  spray(ctx, u, { size, color, seed }, from, to) {
    const r = size / 2, puff = mist(color);
    const dots = Math.round(size * 1.1);
    ctx.fillStyle = color;
    for (let k = from; k < to; k++) {
      const p = u[k], rng = unitRng(seed, k);
      ctx.globalAlpha = 0.045;
      ctx.drawImage(puff, p.x - r, p.y - r, size, size);
      for (let i = 0; i < dots; i++) {
        const a = rng() * Math.PI * 2, d = r * Math.min(1, Math.abs(rng() + rng() + rng() - 1.5) / 1.1);
        const s = 0.7 + rng() * 1.2;
        ctx.globalAlpha = 0.2 + rng() * 0.45;
        ctx.fillRect(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, s, s);
      }
      if (rng() < 0.06) { // now and then a bigger droplet spits out
        const a = rng() * Math.PI * 2, d = r * (0.3 + rng() * 0.8);
        ctx.globalAlpha = 0.55 + rng() * 0.35;
        ctx.beginPath(); ctx.arc(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 0.9 + rng() * 1.6, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  },
};

// a soft round puff of the spray colour (one pre-drawn picture per colour: gradients per dot are too slow)
const mistCache = new Map();
function mist(color) {
  let c = mistCache.get(color);
  if (c) return c;
  const n = 64, m = n / 2;
  c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d'), grad = g.createRadialGradient(m, m, 0, m, m, m);
  grad.addColorStop(0, rgba(color, 1)); grad.addColorStop(0.45, rgba(color, 0.55)); grad.addColorStop(1, rgba(color, 0));
  g.fillStyle = grad; g.fillRect(0, 0, n, n);
  if (mistCache.size > 40) mistCache.clear();
  mistCache.set(color, c);
  return c;
}

/** Draw units [from, to) of a stroke (see above). Returns optional sparkles for glitter. */
export function drawStrokeRange(ctx, tool, units, opts, from, to, final) {
  if (!units.length || to <= from) return {};
  return DRAW[tool](ctx, units, opts, from, to, final) || {};
}

/** Draw one whole stroke (already straightened) onto an empty layer. Returns optional sparkles for glitter. */
export function renderStroke(ctx, tool, points, opts) {
  if (!points.length) return {};
  const u = UNITS[tool](points, opts);
  return drawStrokeRange(ctx, tool, u, opts, 0, u.length, true);
}

let sparkleSprite = null;
function sprite() {
  if (sparkleSprite) return sparkleSprite;
  const n = 64, c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d'), m = n / 2, r = n * 0.42;
  const glow = g.createRadialGradient(m, m, 0, m, m, m);
  glow.addColorStop(0, 'rgba(255,255,255,.9)'); glow.addColorStop(0.25, 'rgba(255,255,255,.35)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = glow; g.fillRect(0, 0, n, n);
  g.fillStyle = '#fff';
  g.beginPath();
  g.moveTo(m, m - r); g.quadraticCurveTo(m, m, m + r, m); g.quadraticCurveTo(m, m, m, m + r);
  g.quadraticCurveTo(m, m, m - r, m); g.quadraticCurveTo(m, m, m, m - r); g.fill();
  sparkleSprite = c;
  return c;
}

/** Four-point twinkle star used for glitter sparkles (a pre-drawn sprite: blur effects are too slow per frame). */
export function drawSparkle(ctx, x, y, r, alpha) {
  const a = ctx.globalAlpha;
  ctx.globalAlpha = alpha;
  ctx.drawImage(sprite(), x - r * 1.2, y - r * 1.2, r * 2.4, r * 2.4);
  ctx.globalAlpha = a;
}
