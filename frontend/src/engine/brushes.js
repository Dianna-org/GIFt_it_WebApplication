import { makeRng, smoothNoise } from './random.js';

// How each tool is composited onto the card once the stroke is finished.
// Every stroke is rendered opaque on its own layer and blended with these settings,
// so a single stroke never darkens itself but crossing strokes do (like real highlighters).
export const BLEND = {
  crayon: { op: 'multiply', alpha: 1 },       // pigments mix when crayons cross
  marker: { op: 'source-over', alpha: 0.85 }, // slightly see-through
  highlighter: { op: 'multiply', alpha: 0.5 },
  brush: { op: 'source-over', alpha: 1 },
  glitter: { op: 'source-over', alpha: 1 },
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

const RENDER = {
  marker(ctx, pts, { size, color }) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = color; ctx.lineWidth = size;
    smoothPath(ctx, pts); ctx.stroke();
  },

  highlighter(ctx, pts, { size, color }) {
    // chisel tip: a flat rectangle held at 45 degrees
    ctx.fillStyle = color;
    const w = size, h = size * 0.38;
    const ang = -Math.PI / 4;
    const dense = resample(pts, Math.max(1, h / 3));
    const stampAt = (p) => {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(ang);
      ctx.fillRect(-w / 2, -h / 2, w, h); ctx.restore();
    };
    dense.forEach(stampAt);
    if (dense.length === 1) stampAt(dense[0]);
  },

  crayon(ctx, pts, { size, color, seed }) {
    const rng = makeRng(seed);
    const dense = resample(pts, 1.1);
    const r = size / 2;
    const dots = Math.max(5, Math.round(size * 0.9));
    const draw = (p) => {
      for (let i = 0; i < dots; i++) {
        const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * r;
        const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
        // paper tooth: the same spots stay bare, so crossing strokes fill the gaps
        if (grain(x, y) > 0.68) continue;
        ctx.globalAlpha = 0.45 + rng() * 0.55;
        ctx.fillStyle = rng() < 0.12 ? shade(color, 0.25) : color;
        const s = 1 + rng() * 1.3;
        ctx.fillRect(x, y, s, s);
      }
    };
    dense.forEach(draw);
    ctx.globalAlpha = 1;
  },

  brush(ctx, pts, { size, color, seed }) {
    const rng = makeRng(seed);
    const dense = resample(pts, 2.5);
    if (dense.length < 2) {
      ctx.beginPath(); ctx.arc(pts[0].x, pts[0].y, size / 2, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
      return;
    }
    const n = dense.length;
    const bristles = Math.max(4, Math.round(size / 2.2));
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // direction normals
    const normals = dense.map((p, i) => {
      const a = dense[Math.max(0, i - 1)], b = dense[Math.min(n - 1, i + 1)];
      const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      return { x: -(b.y - a.y) / l, y: (b.x - a.x) / l };
    });
    for (let k = 0; k < bristles; k++) {
      const off = (k / (bristles - 1) - 0.5) * 2; // -1..1 across the brush
      const phase = rng() * 100;
      const lw = Math.max(1.2, (size / bristles) * (1.4 + rng() * 0.8));
      const tone = (rng() - 0.5) * 0.28;
      ctx.strokeStyle = shade(color, tone);
      ctx.lineWidth = lw;
      ctx.globalAlpha = 0.65 + rng() * 0.35;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1);
        // uneven pressure: width swells and thins along the stroke, tapering at both ends
        const press = 0.62 + 0.38 * smoothNoise(null, u * 6 + phase * 0.01 + seed * 0.001);
        const taper = Math.min(1, u * 9, (1 - u) * 6 + 0.25);
        const spread = (size / 2) * off * press * Math.max(0.15, taper);
        const jitter = smoothNoise(null, i * 0.35 + phase) * lw * 0.6;
        const x = dense[i].x + normals[i].x * (spread + jitter);
        const y = dense[i].y + normals[i].y * (spread + jitter);
        // dry-brush gaps
        const gap = smoothNoise(null, i * 0.2 + phase * 3) > 0.82 && Math.abs(off) > 0.6;
        if (gap) { started = false; continue; }
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },

  glitter(ctx, pts, { size, color, seed }) {
    const rng = makeRng(seed);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = color; ctx.lineWidth = size;
    smoothPath(ctx, pts); ctx.stroke();
    // grainy glitter flecks inside the line
    const dense = resample(pts, 1.5);
    const sparkles = [];
    for (const p of dense) {
      for (let i = 0; i < Math.max(2, size * 0.5); i++) {
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
};

/** Draw one stroke (already straightened) onto an empty layer. Returns optional sparkles for glitter. */
export function renderStroke(ctx, tool, points, opts) {
  if (!points.length) return {};
  return RENDER[tool](ctx, points, opts) || {};
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
