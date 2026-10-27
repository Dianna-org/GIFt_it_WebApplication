// Pattern pen: instead of a plain line, little shapes are stamped along the stroke (like PENUP's Patterns).
// Each pattern: gap = distance between stamps as a share of the size, turn = follow the stroke direction.

const TAU = Math.PI * 2;

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const rgba = (hex, a) => { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; };
function shade(hex, f) {
  const [r, g, b] = hexToRgb(hex);
  const m = (v) => Math.max(0, Math.min(255, Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f))));
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}

function heartPath(g, r) {
  g.beginPath();
  g.moveTo(0, r * 0.8);
  g.bezierCurveTo(-r * 1.25, 0, -r * 0.75, -r * 0.95, 0, -r * 0.35);
  g.bezierCurveTo(r * 0.75, -r * 0.95, r * 1.25, 0, 0, r * 0.8);
}
function starPath(g, r, points = 5, inner = 0.45) {
  g.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = (i * Math.PI) / points - Math.PI / 2, rr = i % 2 ? r * inner : r;
    g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  g.closePath();
}

/** Stamp functions draw centred at (0,0); r = half the size; c = colour; rng = random 0..1. */
const STAMPS = {
  dots(g, r, c) {
    g.beginPath(); g.arc(0, 0, r * 0.38, 0, TAU); g.fillStyle = c; g.fill();
  },
  bubbles(g, r, c, rng) {
    const rr = r * (0.45 + rng() * 0.55);
    g.beginPath(); g.arc(0, 0, rr, 0, TAU);
    g.fillStyle = rgba(c, 0.18); g.fill();
    g.lineWidth = Math.max(1.2, rr * 0.12); g.strokeStyle = rgba(c, 0.85); g.stroke();
    g.beginPath(); g.arc(-rr * 0.35, -rr * 0.35, rr * 0.22, 0, TAU); g.fillStyle = 'rgba(255,255,255,.85)'; g.fill();
  },
  smileys(g, r, c) {
    const rr = r * 0.8;
    g.beginPath(); g.arc(0, 0, rr, 0, TAU); g.fillStyle = c; g.fill();
    g.lineWidth = Math.max(1, rr * 0.08); g.strokeStyle = shade(c, -0.35); g.stroke();
    g.fillStyle = '#3a2a1a';
    g.beginPath(); g.arc(-rr * 0.33, -rr * 0.22, rr * 0.11, 0, TAU); g.arc(rr * 0.33, -rr * 0.22, rr * 0.11, 0, TAU); g.fill();
    g.beginPath(); g.arc(0, rr * 0.05, rr * 0.5, 0.15 * Math.PI, 0.85 * Math.PI);
    g.lineWidth = Math.max(1, rr * 0.11); g.lineCap = 'round'; g.strokeStyle = '#3a2a1a'; g.stroke();
  },
  hearts(g, r, c) {
    heartPath(g, r * 0.85); g.fillStyle = c; g.fill();
    g.beginPath(); g.ellipse(-r * 0.3, -r * 0.22, r * 0.14, r * 0.09, -0.6, 0, TAU); g.fillStyle = 'rgba(255,255,255,.45)'; g.fill();
  },
  daisies(g, r, c) {
    for (let i = 0; i < 8; i++) {
      g.save(); g.rotate((i * TAU) / 8);
      g.beginPath(); g.ellipse(0, -r * 0.5, r * 0.17, r * 0.4, 0, 0, TAU); g.fillStyle = '#ffffff'; g.fill();
      g.lineWidth = Math.max(0.8, r * 0.04); g.strokeStyle = rgba(c, 0.6); g.stroke();
      g.restore();
    }
    g.beginPath(); g.arc(0, 0, r * 0.26, 0, TAU); g.fillStyle = c; g.fill();
  },
  blossoms(g, r, c) {
    for (let i = 0; i < 5; i++) {
      g.save(); g.rotate((i * TAU) / 5);
      g.beginPath(); g.arc(0, -r * 0.45, r * 0.36, 0, TAU); g.fillStyle = i % 2 ? c : shade(c, 0.25); g.fill();
      g.restore();
    }
    g.beginPath(); g.arc(0, 0, r * 0.2, 0, TAU); g.fillStyle = '#fff3b0'; g.fill();
  },
  stars(g, r, c) {
    starPath(g, r * 0.85); g.fillStyle = c; g.fill();
    g.lineWidth = Math.max(1, r * 0.06); g.strokeStyle = shade(c, -0.25); g.lineJoin = 'round'; g.stroke();
  },
  sparkles(g, r, c, rng) {
    const rr = r * (0.5 + rng() * 0.5);
    const glow = g.createRadialGradient(0, 0, 0, 0, 0, rr);
    glow.addColorStop(0, rgba(c, 0.55)); glow.addColorStop(1, rgba(c, 0));
    g.fillStyle = glow; g.fillRect(-rr, -rr, rr * 2, rr * 2);
    g.beginPath();
    g.moveTo(0, -rr); g.quadraticCurveTo(0, 0, rr, 0); g.quadraticCurveTo(0, 0, 0, rr);
    g.quadraticCurveTo(0, 0, -rr, 0); g.quadraticCurveTo(0, 0, 0, -rr);
    g.fillStyle = shade(c, 0.55); g.fill();
    g.beginPath(); g.arc(0, 0, rr * 0.12, 0, TAU); g.fillStyle = '#ffffff'; g.fill();
  },
  smoke(g, r, c, rng) {
    for (let k = 0; k < 3; k++) {
      const x = (rng() - 0.5) * r * 0.9, y = (rng() - 0.5) * r * 0.9, rr = r * (0.55 + rng() * 0.7);
      const puff = g.createRadialGradient(x, y, 0, x, y, rr);
      puff.addColorStop(0, rgba(c, 0.16)); puff.addColorStop(0.6, rgba(c, 0.07)); puff.addColorStop(1, rgba(c, 0));
      g.fillStyle = puff; g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
  },
  leaves(g, r, c, rng, i) {
    // a vine: stem segment + a leaf on alternating sides
    g.strokeStyle = shade(c, -0.25); g.lineWidth = Math.max(1, r * 0.1); g.lineCap = 'round';
    g.beginPath(); g.moveTo(-r * 0.9, 0); g.lineTo(r * 0.9, 0); g.stroke();
    g.save(); g.scale(1, i % 2 ? -1 : 1); g.rotate(-0.6);
    g.beginPath(); g.moveTo(0, 0);
    g.quadraticCurveTo(r * 0.45, -r * 0.45, 0, -r * 0.95); g.quadraticCurveTo(-r * 0.45, -r * 0.45, 0, 0);
    g.fillStyle = c; g.fill(); g.restore();
  },
  confetti(g, r, c, rng) {
    const colours = ['#e8506a', '#f9c74f', '#4d96ff', '#90be6d', '#b185db', '#f4845f'];
    for (let k = 0; k < 3; k++) {
      g.save();
      g.translate((rng() - 0.5) * r * 1.4, (rng() - 0.5) * r * 1.4); g.rotate(rng() * TAU);
      g.fillStyle = rng() < 0.4 ? c : colours[Math.floor(rng() * colours.length)];
      g.fillRect(-r * 0.22, -r * 0.09, r * 0.44, r * 0.18);
      g.restore();
    }
  },
};

export const PATTERNS = [
  { id: 'dots', label: 'Dots', gap: 0.95, turn: false },
  { id: 'bubbles', label: 'Bubbles', gap: 1.0, turn: false },
  { id: 'smileys', label: 'Smiley faces', gap: 1.15, turn: false },
  { id: 'hearts', label: 'Hearts', gap: 1.05, turn: true },
  { id: 'daisies', label: 'Daisies', gap: 1.1, turn: false },
  { id: 'blossoms', label: 'Blossoms', gap: 1.05, turn: false },
  { id: 'stars', label: 'Stars', gap: 1.05, turn: false },
  { id: 'sparkles', label: 'Sparkles', gap: 0.9, turn: false },
  { id: 'smoke', label: 'Smoke', gap: 0.35, turn: false },
  { id: 'leaves', label: 'Leafy vine', gap: 0.9, turn: true },
  { id: 'confetti', label: 'Confetti', gap: 0.8, turn: false },
];
export const patternById = (id) => PATTERNS.find((p) => p.id === id) || PATTERNS[0];

/**
 * Stamps a pattern along already-resampled points (spaced `step` apart).
 * opts: size (px), color, seed-driven rng, rainbow (hue changes along the stroke).
 */
export function stampPattern(g, points, { size, color, rainbow }, rngOne, patternId, { from = 0, to = points.length, rngAt = null } = {}) {
  const p = patternById(patternId);
  const draw = STAMPS[p.id];
  const r = size / 2;
  // only stamps [from, to) – a live stroke draws its new part only (round 37); rngAt(i) = randomness per stamp
  for (let i = from; i < to; i++) {
    const pt = points[i], rng = rngAt ? rngAt(i) : rngOne;
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    const angle = p.turn && points.length > 1 ? Math.atan2(b.y - a.y, b.x - a.x) : (p.id === 'stars' || p.id === 'confetti' ? (rng() - 0.5) * 0.8 : 0);
    const c = rainbow ? hslToHex((i * 32) % 360, 80, 62) : color;
    g.save();
    g.translate(pt.x, pt.y);
    g.rotate(angle);
    draw(g, r, c, rng, i);
    g.restore();
  }
}

export function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return '#' + [f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('');
}
