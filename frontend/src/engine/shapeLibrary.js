/**
 * Shapes tool (like the shapes in Word): outline-only shapes the user places on the card and can then move,
 * resize and rotate. Every shape is a list of path commands in a unit box (-1..1 on both axes, y down),
 * normalised so the visible outline exactly fills the box. Commands: ['M',x,y] ['L',x,y] ['Q',cx,cy,x,y]
 * ['C',c1x,c1y,c2x,c2y,x,y] ['Z']. All are affine-invariant, so a stretched/rotated shape is drawn by
 * transforming the points – the line keeps the same thickness everywhere.
 * Pure geometry (no DOM) except drawShape(ctx…), unit-tested in shapeLibrary.test.js.
 */

const K = 0.5523; // circle-from-bezier constant
const TAU = Math.PI * 2;

// ---------- building blocks (unit-ish coordinates, normalised afterwards) ----------
function ellipse(cx, cy, rx, ry) {
  return [
    ['M', cx + rx, cy],
    ['C', cx + rx, cy + ry * K, cx + rx * K, cy + ry, cx, cy + ry],
    ['C', cx - rx * K, cy + ry, cx - rx, cy + ry * K, cx - rx, cy],
    ['C', cx - rx, cy - ry * K, cx - rx * K, cy - ry, cx, cy - ry],
    ['C', cx + rx * K, cy - ry, cx + rx, cy - ry * K, cx + rx, cy],
    ['Z'],
  ];
}
const circle = (cx, cy, r) => ellipse(cx, cy, r, r);
function poly(pts, close = true) {
  const out = pts.map(([x, y], i) => [i ? 'L' : 'M', x, y]);
  if (close) out.push(['Z']);
  return out;
}
function regular(n, r = 1, rot = -Math.PI / 2) {
  return poly(Array.from({ length: n }, (_, i) => [Math.cos(rot + (i * TAU) / n) * r, Math.sin(rot + (i * TAU) / n) * r]));
}
function star(n, rOut, rIn, rot = -Math.PI / 2) {
  return poly(Array.from({ length: n * 2 }, (_, i) => {
    const r = i % 2 ? rIn : rOut, a = rot + (i * Math.PI) / n;
    return [Math.cos(a) * r, Math.sin(a) * r];
  }));
}
function roundRect(x1, y1, x2, y2, r) {
  return [
    ['M', x1 + r, y1], ['L', x2 - r, y1], ['Q', x2, y1, x2, y1 + r], ['L', x2, y2 - r], ['Q', x2, y2, x2 - r, y2],
    ['L', x1 + r, y2], ['Q', x1, y2, x1, y2 - r], ['L', x1, y1 + r], ['Q', x1, y1, x1 + r, y1], ['Z'],
  ];
}
/** Points around an ellipse joined by outward bulges (clouds, flowers). */
function scallop(rx, ry, bumps, bulge, rot = -Math.PI / 2) {
  const at = (i) => [Math.cos(rot + (i * TAU) / bumps) * rx, Math.sin(rot + (i * TAU) / bumps) * ry];
  const out = [['M', ...at(0)]];
  for (let i = 0; i < bumps; i++) {
    const a = rot + ((i + 0.5) * TAU) / bumps;
    out.push(['Q', Math.cos(a) * rx * bulge, Math.sin(a) * ry * bulge, ...at(i + 1)]);
  }
  out.push(['Z']);
  return out;
}
/** Open arc of an ellipse from angle a0 to a1 (sampled). */
function arc(cx, cy, rx, ry, a0, a1, close = false, steps = 24) {
  const pts = Array.from({ length: steps + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / steps; return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]; });
  return poly(pts, close);
}

// ---------- the shapes ----------
const DEFS = [
  // basic
  { id: 'square', label: 'Square', aspect: 1, cmds: () => poly([[-1, -1], [1, -1], [1, 1], [-1, 1]]) },
  { id: 'rectangle', label: 'Rectangle', aspect: 1.6, cmds: () => poly([[-1, -1], [1, -1], [1, 1], [-1, 1]]) },
  { id: 'rounded', label: 'Rounded rectangle', aspect: 1.5, cmds: () => roundRect(-1, -1, 1, 1, 0.3) },
  { id: 'circle', label: 'Circle', aspect: 1, cmds: () => circle(0, 0, 1) },
  { id: 'oval', label: 'Oval', aspect: 1.5, cmds: () => circle(0, 0, 1) },
  { id: 'triangle', label: 'Triangle', aspect: 1.1, cmds: () => poly([[0, -1], [1, 1], [-1, 1]]) },
  { id: 'right-triangle', label: 'Right triangle', aspect: 1, cmds: () => poly([[-1, -1], [1, 1], [-1, 1]]) },
  { id: 'diamond', label: 'Diamond', aspect: 0.75, cmds: () => poly([[0, -1], [1, 0], [0, 1], [-1, 0]]) },
  { id: 'parallelogram', label: 'Parallelogram', aspect: 1.6, cmds: () => poly([[-0.5, -1], [1, -1], [0.5, 1], [-1, 1]]) },
  { id: 'trapezoid', label: 'Trapezoid', aspect: 1.5, cmds: () => poly([[-0.55, -1], [0.55, -1], [1, 1], [-1, 1]]) },
  { id: 'pentagon', label: 'Pentagon', aspect: 1, cmds: () => regular(5) },
  { id: 'hexagon', label: 'Hexagon', aspect: 1.1, cmds: () => regular(6, 1, 0) },
  { id: 'octagon', label: 'Octagon', aspect: 1, cmds: () => regular(8, 1, Math.PI / 8) },
  // fun
  { id: 'star', label: 'Star', aspect: 1, cmds: () => star(5, 1, 0.42) },
  { id: 'star6', label: 'Six-point star', aspect: 1, cmds: () => star(6, 1, 0.55) },
  { id: 'burst', label: 'Burst', aspect: 1, cmds: () => star(12, 1, 0.74) },
  {
    id: 'heart', label: 'Heart', aspect: 1.08, cmds: () => [
      ['M', 0, 1], ['C', -0.9, 0.35, -1.25, -0.25, -0.95, -0.7], ['C', -0.65, -1.12, -0.12, -1.05, 0, -0.6],
      ['C', 0.12, -1.05, 0.65, -1.12, 0.95, -0.7], ['C', 1.25, -0.25, 0.9, 0.35, 0, 1], ['Z'],
    ],
  },
  { id: 'moon', label: 'Moon', aspect: 0.8, cmds: () => { const o = arc(0, 0, 1, 1, Math.PI * 0.3, Math.PI * 1.7, false, 40); const inner = arc(0.42, -0.08, 0.86, 0.86, Math.PI * 1.62, Math.PI * 0.38, false, 40).slice(1); return [...o, ...inner.map(([, x, y]) => ['L', x, y]), ['Z']]; } },
  { id: 'cloud', label: 'Cloud', aspect: 1.6, cmds: () => scallop(1, 0.62, 9, 1.32) },
  { id: 'drop', label: 'Drop', aspect: 0.75, cmds: () => [['M', 0, -1], ['C', 0.35, -0.45, 0.8, 0, 0.8, 0.4], ['C', 0.8, 0.85, 0.42, 1, 0, 1], ['C', -0.42, 1, -0.8, 0.85, -0.8, 0.4], ['C', -0.8, 0, -0.35, -0.45, 0, -1], ['Z']] },
  { id: 'lightning', label: 'Lightning', aspect: 0.65, cmds: () => poly([[0.15, -1], [-0.7, 0.15], [-0.05, 0.15], [-0.3, 1], [0.7, -0.25], [0.05, -0.25], [0.45, -1]]) },
  { id: 'arrow', label: 'Arrow', aspect: 1.6, cmds: () => poly([[-1, -0.35], [0.25, -0.35], [0.25, -0.85], [1, 0], [0.25, 0.85], [0.25, 0.35], [-1, 0.35]]) },
  { id: 'plus', label: 'Plus', aspect: 1, cmds: () => poly([[-0.33, -1], [0.33, -1], [0.33, -0.33], [1, -0.33], [1, 0.33], [0.33, 0.33], [0.33, 1], [-0.33, 1], [-0.33, 0.33], [-1, 0.33], [-1, -0.33], [-0.33, -0.33]]) },
  // bubbles
  {
    id: 'speech', label: 'Speech bubble', aspect: 1.4, cmds: () => [
      ['M', -0.7, -1], ['L', 0.7, -1], ['Q', 1, -1, 1, -0.7], ['L', 1, 0.2], ['Q', 1, 0.5, 0.7, 0.5], ['L', -0.15, 0.5],
      ['L', -0.55, 1], ['L', -0.5, 0.5], ['L', -0.7, 0.5], ['Q', -1, 0.5, -1, 0.2], ['L', -1, -0.7], ['Q', -1, -1, -0.7, -1], ['Z'],
    ],
  },
  { id: 'thought', label: 'Thought bubble', aspect: 1.4, cmds: () => [...scallop(1, 0.55, 9, 1.28).map((c) => c.map((v, i) => (i && i % 2 === 0 ? v - 0.3 : v))), ...circle(-0.55, 0.62, 0.13), ...circle(-0.78, 0.9, 0.08)] },
  { id: 'bubble', label: 'Soap bubble', aspect: 1, cmds: () => [...circle(0, 0, 1), ...arc(0, 0, 0.72, 0.72, Math.PI * 1.08, Math.PI * 1.42), ...circle(0.42, -0.5, 0.08)] },
  // pictures
  {
    id: 'smiley', label: 'Smiley face', aspect: 1, cmds: () => [
      ...circle(0, 0, 1), ...ellipse(-0.35, -0.3, 0.1, 0.16), ...ellipse(0.35, -0.3, 0.1, 0.16), ...arc(0, 0.05, 0.55, 0.5, Math.PI * 0.18, Math.PI * 0.82),
    ],
  },
  {
    id: 'leaf', label: 'Leaf', aspect: 0.62, cmds: () => [
      ['M', 0, -1], ['C', 0.75, -0.55, 0.75, 0.35, 0, 0.78], ['C', -0.75, 0.35, -0.75, -0.55, 0, -1], ['Z'],
      ['M', 0, -0.75], ['L', 0, 1], ['M', 0, -0.25], ['L', 0.32, -0.5], ['M', 0, 0.12], ['L', -0.32, -0.12], ['M', 0, 0.35], ['L', 0.3, 0.12],
    ],
  },
  {
    id: 'flower', label: 'Flower', aspect: 1, cmds: () => {
      // five round petals around a small centre
      const petals = [], n = 5, r0 = 0.24;
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 - Math.PI / n + (i * TAU) / n, b = a + TAU / n;
        const p = (ang, r) => [Math.cos(ang) * r, Math.sin(ang) * r];
        if (!i) petals.push(['M', ...p(a, r0)]);
        petals.push(['C', ...p(a - 0.12, 1.3), ...p(b + 0.12, 1.3), ...p(b, r0)]);
      }
      petals.push(['Z']);
      return [...petals, ...circle(0, 0, 0.2)];
    },
  },
  { id: 'tulip', label: 'Tulip', aspect: 0.6, cmds: () => [['M', -0.45, -0.95], ['L', -0.22, -0.55], ['L', 0, -0.95], ['L', 0.22, -0.55], ['L', 0.45, -0.95], ['C', 0.6, -0.4, 0.4, 0, 0, 0.02], ['C', -0.4, 0, -0.6, -0.4, -0.45, -0.95], ['Z'], ['M', 0, 0.02], ['L', 0, 1], ['M', 0, 0.6], ['Q', 0.45, 0.55, 0.5, 0.2], ['Q', 0.15, 0.25, 0, 0.6], ['Z']] },
  {
    id: 'present', label: 'Birthday present', aspect: 0.95, cmds: () => [
      ...poly([[-0.85, -0.25], [0.85, -0.25], [0.85, 1], [-0.85, 1]]), ...poly([[-1, -0.55], [1, -0.55], [1, -0.25], [-1, -0.25]]),
      ['M', -0.15, -0.55], ['L', -0.15, 1], ['M', 0.15, -0.55], ['L', 0.15, 1],
      ['M', 0, -0.55], ['C', -0.25, -1.05, -0.8, -1, -0.55, -0.7], ['Q', -0.35, -0.55, 0, -0.55], ['Z'],
      ['M', 0, -0.55], ['C', 0.25, -1.05, 0.8, -1, 0.55, -0.7], ['Q', 0.35, -0.55, 0, -0.55], ['Z'],
    ],
  },
  {
    id: 'balloon', label: 'Balloon', aspect: 0.6, cmds: () => [
      ['M', 0, -1], ['C', 0.6, -1, 0.75, -0.5, 0.7, -0.25], ['C', 0.62, 0.1, 0.25, 0.3, 0, 0.32], ['C', -0.25, 0.3, -0.62, 0.1, -0.7, -0.25], ['C', -0.75, -0.5, -0.6, -1, 0, -1], ['Z'],
      ...poly([[0, 0.32], [0.1, 0.42], [-0.1, 0.42]]), ['M', 0, 0.42], ['C', -0.25, 0.6, 0.25, 0.78, 0, 1],
    ],
  },
  {
    id: 'cake', label: 'Birthday cake', aspect: 1, cmds: () => [
      ...poly([[-1, 0.2], [1, 0.2], [1, 1], [-1, 1]]), ...poly([[-0.7, -0.35], [0.7, -0.35], [0.7, 0.2], [-0.7, 0.2]]),
      ['M', -1, 0.45], ['Q', -0.75, 0.62, -0.5, 0.45], ['Q', -0.25, 0.62, 0, 0.45], ['Q', 0.25, 0.62, 0.5, 0.45], ['Q', 0.75, 0.62, 1, 0.45],
      ...poly([[-0.07, -0.75], [0.07, -0.75], [0.07, -0.35], [-0.07, -0.35]]),
      ['M', 0, -1], ['C', 0.14, -0.9, 0.12, -0.8, 0, -0.78], ['C', -0.12, -0.8, -0.14, -0.9, 0, -1], ['Z'],
    ],
  },
  { id: 'party-hat', label: 'Party hat', aspect: 0.7, cmds: () => [...poly([[0, -0.72], [0.8, 1], [-0.8, 1]]), ...circle(0, -0.85, 0.15), ['M', -0.28, -0.12], ['L', 0.38, 0.22], ['M', -0.52, 0.43], ['L', 0.6, 0.98]] },
  { id: 'crown', label: 'Crown', aspect: 1.4, cmds: () => poly([[-1, 1], [-1, -0.7], [-0.5, 0], [0, -1], [0.5, 0], [1, -0.7], [1, 1]]) },
  {
    id: 'sun', label: 'Sun', aspect: 1, cmds: () => {
      const out = circle(0, 0, 0.5);
      for (let i = 0; i < 12; i++) { const a = (i * TAU) / 12; out.push(['M', Math.cos(a) * 0.65, Math.sin(a) * 0.65], ['L', Math.cos(a) * 1, Math.sin(a) * 1]); }
      return out;
    },
  },
  {
    id: 'butterfly', label: 'Butterfly', aspect: 1.25, cmds: () => [
      ['M', 0, -0.25], ['C', -0.4, -1.05, -1.1, -0.95, -0.95, -0.35], ['C', -0.85, 0, -0.35, 0, 0, 0], ['Z'],
      ['M', 0, 0], ['C', -0.35, 0.05, -0.85, 0.25, -0.6, 0.75], ['C', -0.4, 1, -0.1, 0.6, 0, 0.2], ['Z'],
      ['M', 0, -0.25], ['C', 0.4, -1.05, 1.1, -0.95, 0.95, -0.35], ['C', 0.85, 0, 0.35, 0, 0, 0], ['Z'],
      ['M', 0, 0], ['C', 0.35, 0.05, 0.85, 0.25, 0.6, 0.75], ['C', 0.4, 1, 0.1, 0.6, 0, 0.2], ['Z'],
      ['M', 0, -0.35], ['Q', -0.12, -0.8, -0.3, -1], ['M', 0, -0.35], ['Q', 0.12, -0.8, 0.3, -1],
    ],
  },
];

// ---------- normalising: the visible outline fills -1..1 exactly ----------
/** Polylines (arrays of {x,y}) following the commands; curves sampled. */
export function flatten(cmds, steps = 16) {
  const lines = [];
  let cur = null, start = null, line = null;
  for (const c of cmds) {
    if (c[0] === 'M') { line = [{ x: c[1], y: c[2] }]; lines.push(line); cur = start = line[0]; continue; }
    if (c[0] === 'Z') { if (line && start) line.push({ ...start }); cur = start; continue; }
    if (c[0] === 'L') { cur = { x: c[1], y: c[2] }; line.push(cur); continue; }
    const p0 = cur;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, u = 1 - t;
      let x, y;
      if (c[0] === 'Q') { x = u * u * p0.x + 2 * u * t * c[1] + t * t * c[3]; y = u * u * p0.y + 2 * u * t * c[2] + t * t * c[4]; }
      else { x = u * u * u * p0.x + 3 * u * u * t * c[1] + 3 * u * t * t * c[3] + t * t * t * c[5]; y = u * u * u * p0.y + 3 * u * u * t * c[2] + 3 * u * t * t * c[4] + t * t * t * c[6]; }
      line.push({ x, y });
    }
    cur = line[line.length - 1];
  }
  return lines;
}

function normalise(cmds) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const l of flatten(cmds)) for (const p of l) { x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y); x2 = Math.max(x2, p.x); y2 = Math.max(y2, p.y); }
  const sx = 2 / (x2 - x1 || 1), sy = 2 / (y2 - y1 || 1), cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
  return cmds.map((c) => (c[0] === 'Z' ? c : [c[0], ...c.slice(1).map((v, i) => (i % 2 ? (v - cy) * sy : (v - cx) * sx))]));
}

export const SHAPES = DEFS.map((d) => ({ id: d.id, label: d.label, aspect: d.aspect, cmds: normalise(d.cmds()) }));
const BY_ID = new Map(SHAPES.map((s) => [s.id, s]));
export const shapeById = (id) => BY_ID.get(id) || SHAPES[0];
export const SHAPE_IDS = SHAPES.map((s) => s.id);

// ---------- placing ----------
/** Unit-box point -> canvas point for a placed shape {x, y, w, h, rot}. */
export function toCanvas(s, u, v) {
  const c = Math.cos(s.rot || 0), n = Math.sin(s.rot || 0), a = (u * s.w) / 2, b = (v * s.h) / 2;
  return { x: s.x + a * c - b * n, y: s.y + a * n + b * c };
}
/** Canvas point -> the shape's own (unrotated, centred) coordinates in pixels. */
export function toLocal(s, p) {
  const c = Math.cos(s.rot || 0), n = Math.sin(s.rot || 0), dx = p.x - s.x, dy = p.y - s.y;
  return { x: dx * c + dy * n, y: -dx * n + dy * c };
}
/** The four corners of a placed shape's box (canvas). */
export const corners = (s) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => toCanvas(s, u, v));
/** Axis-aligned bounds of a placed shape, padded. */
export function shapeBounds(s, pad = 0) {
  const cs = corners(s);
  const xs = cs.map((p) => p.x), ys = cs.map((p) => p.y);
  const x = Math.min(...xs) - pad, y = Math.min(...ys) - pad;
  return { x, y, w: Math.max(...xs) + pad - x, h: Math.max(...ys) + pad - y };
}
/** Is the canvas point inside the shape's (rotated) box? */
export function insideBox(s, p, pad = 0) {
  const l = toLocal(s, p);
  return Math.abs(l.x) <= s.w / 2 + pad && Math.abs(l.y) <= s.h / 2 + pad;
}

/** Draws a placed shape's outline (never filled). */
export function drawShape(g, s) {
  const def = shapeById(s.kind);
  g.save();
  g.beginPath();
  for (const c of def.cmds) {
    if (c[0] === 'Z') { g.closePath(); continue; }
    const pts = [];
    for (let i = 1; i < c.length; i += 2) pts.push(toCanvas(s, c[i], c[i + 1]));
    if (c[0] === 'M') g.moveTo(pts[0].x, pts[0].y);
    else if (c[0] === 'L') g.lineTo(pts[0].x, pts[0].y);
    else if (c[0] === 'Q') g.quadraticCurveTo(pts[0].x, pts[0].y, pts[1].x, pts[1].y);
    else g.bezierCurveTo(pts[0].x, pts[0].y, pts[1].x, pts[1].y, pts[2].x, pts[2].y);
  }
  g.lineJoin = 'round'; g.lineCap = 'round';
  g.lineWidth = s.width; g.strokeStyle = s.color;
  g.stroke();
  g.restore();
}

/**
 * Editing a selected shape. Handles: 'nw','n','ne','e','se','s','sw','w' (resize, the opposite side stays
 * put), 'rotate' (round handle outside the top edge – or the bottom edge when the top is off the card) and
 * 'move' (anywhere inside the box).
 */
const HANDLE_DIRS = { nw: [-1, -1], n: [0, -1], ne: [1, -1], e: [1, 0], se: [1, 1], s: [0, 1], sw: [-1, 1], w: [-1, 0] };
export function handlePositions(s, gap, cardH = Infinity) {
  const out = Object.entries(HANDLE_DIRS).map(([id, [u, v]]) => ({ id, ...toCanvas(s, u, v) }));
  const up = toCanvas(s, 0, -1 - (2 * gap) / s.h);
  const rotBelow = up.y < gap * 0.5 || up.y > cardH - gap * 0.5;
  out.push({ id: 'rotate', ...(rotBelow ? toCanvas(s, 0, 1 + (2 * gap) / s.h) : up), below: rotBelow });
  return out;
}
export function handleAt(s, p, radius, gap, cardH) {
  for (const h of handlePositions(s, gap, cardH)) if (Math.hypot(h.x - p.x, h.y - p.y) <= radius) return h.id;
  return insideBox(s, p, radius * 0.5) ? 'move' : null;
}

export const MIN_SHAPE = 16;
/**
 * New box for dragging handle `h` of shape `s0` (as it was when the drag began) to canvas point p.
 * keepRatio (Shift, or always for corner handles of "even" shapes when asked) keeps the proportions.
 */
export function resizeShape(s0, h, p, { keepRatio = false } = {}) {
  const [du, dv] = HANDLE_DIRS[h];
  const l = toLocal(s0, p);
  // the opposite side/corner stays where it is
  const ox = (-du * s0.w) / 2, oy = (-dv * s0.h) / 2;
  let w = du ? Math.max(MIN_SHAPE, (l.x - ox) * du) : s0.w;
  let hh = dv ? Math.max(MIN_SHAPE, (l.y - oy) * dv) : s0.h;
  if (keepRatio && du && dv) {
    const k = Math.max(w / s0.w, hh / s0.h);
    w = Math.max(MIN_SHAPE, s0.w * k); hh = Math.max(MIN_SHAPE, s0.h * k);
  }
  const cx = du ? ox + (du * w) / 2 : 0, cy = dv ? oy + (dv * hh) / 2 : 0;
  const c = toCanvas({ ...s0, w: 2, h: 2 }, cx, cy);
  return { ...s0, x: c.x, y: c.y, w, h: hh };
}
/** Angle for the rotate handle dragged to p (snaps to 15° steps when close, or always with snap=true). */
export function rotateShape(s0, p, { snap = false } = {}) {
  let a = Math.atan2(p.y - s0.y, p.x - s0.x) + Math.PI / 2;
  const step = Math.PI / 12, k = Math.round(a / step) * step;
  if (snap || Math.abs(a - k) < (3 * Math.PI) / 180) a = k;
  a = Math.atan2(Math.sin(a), Math.cos(a));
  return { ...s0, rot: Math.abs(a) < 1e-9 ? 0 : a };
}
/** Box for a shape dragged out from a to b (Shift: keep the shape's own proportions). */
export function boxFromDrag(kind, a, b, { keepRatio = false } = {}) {
  let w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
  if (keepRatio) { const asp = shapeById(kind).aspect; if (w / h > asp) h = w / asp; else w = h * asp; }
  w = Math.max(MIN_SHAPE, w); h = Math.max(MIN_SHAPE, h);
  return { x: a.x + (Math.sign(b.x - a.x) || 1) * (w / 2), y: a.y + (Math.sign(b.y - a.y) || 1) * (h / 2), w, h, rot: 0 };
}
/** The shape's own proportions at a given size (longest side = size). */
export function defaultBox(kind, x, y, size) {
  const asp = shapeById(kind).aspect;
  return asp >= 1 ? { x, y, w: size, h: size / asp, rot: 0 } : { x, y, w: size * asp, h: size, rot: 0 };
}

/** Plain-data copy, validated (used for undo and for saving/loading). Text boxes are kind 'text'. */
export function cleanShape(s) {
  const num = (v, d) => (Number.isFinite(+v) ? +v : d);
  const base = {
    id: String(s.id || Math.random().toString(36).slice(2, 10)).slice(0, 24), kind: s.kind === 'text' ? 'text' : shapeById(s.kind).id,
    x: num(s.x, 0), y: num(s.y, 0), w: Math.max(MIN_SHAPE, num(s.w, 100)), h: Math.max(MIN_SHAPE, num(s.h, 100)),
    rot: num(s.rot, 0), color: /^#[0-9a-fA-F]{6}$/.test(s.color) ? s.color : '#333333', width: Math.min(60, Math.max(1, num(s.width, 8))),
  };
  if (base.kind !== 'text') return base;
  return {
    ...base, text: String(s.text ?? '').slice(0, 200), family: String(s.family || 'Arial, sans-serif').slice(0, 120),
    size: Math.min(2000, Math.max(8, num(s.size, 120))), bold: !!s.bold, italic: !!s.italic,
  };
}

// ---------- text boxes ----------
export const TEXT_PAD = 6;
export const textLineHeight = (size) => size * 1.2;
/**
 * Word wrap like Word: lines no wider than maxW (measured with `measure(str)` -> px), new lines kept,
 * a single word longer than the line is broken up.
 */
export function wrapText(text, maxW, measure) {
  const out = [];
  for (const para of String(text).split('\n')) {
    if (!para.trim()) { out.push(''); continue; }
    let line = '';
    for (let word of para.split(/ +/).filter(Boolean)) {
      while (measure(word) > maxW && word.length > 1) {
        let n = word.length - 1;
        while (n > 1 && measure(word.slice(0, n)) > maxW) n--;
        if (line) { out.push(line); line = ''; }
        out.push(word.slice(0, n));
        word = word.slice(n);
      }
      const t = line ? line + ' ' + word : word;
      if (line && measure(t) > maxW) { out.push(line); line = word; } else line = t;
    }
    out.push(line);
  }
  return out;
}
/** Lines of a text box and the height they need (the box is at least that tall). */
export function textLayout(t, measure) {
  const lines = wrapText(t.text, Math.max(1, t.w - TEXT_PAD * 2), measure);
  return { lines, lineH: textLineHeight(t.size), needH: lines.length * textLineHeight(t.size) + TEXT_PAD * 2 };
}
