/**
 * "Hold to perfect": recognises the shape a hand-drawn stroke was meant to be and returns a clean version
 * of THE SAME shape – a straight line, a circle/ellipse, or a polygon with straight edges through the
 * drawn corners (made regular / rectangular when the drawing is close to that).
 * recognizeShape(points) -> { kind, label, points } or null when the stroke is too small to tell.
 * Pure functions (no canvas), unit-tested.
 */

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function bounds(pts) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const p of pts) { x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y); x2 = Math.max(x2, p.x); y2 = Math.max(y2, p.y); }
  return { x1, y1, x2, y2, w: x2 - x1, h: y2 - y1 };
}

function segDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

/** Where the line through p1-p2 meets the line through p3-p4 (null if parallel). */
function lineMeet(p1, p2, p3, p4) {
  const d = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
  if (Math.abs(d) < 1e-9) return null;
  const a = p1.x * p2.y - p1.y * p2.x, b = p3.x * p4.y - p3.y * p4.x;
  return { x: (a * (p3.x - p4.x) - (p1.x - p2.x) * b) / d, y: (a * (p3.y - p4.y) - (p1.y - p2.y) * b) / d };
}

/** Ramer–Douglas–Peucker simplification of an open polyline. */
export function simplify(pts, eps) {
  if (pts.length < 3) return pts.slice();
  let best = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = segDist(pts[i], pts[0], pts[pts.length - 1]);
    if (d > best) { best = d; idx = i; }
  }
  if (best <= eps) return [pts[0], pts[pts.length - 1]];
  const left = simplify(pts.slice(0, idx + 1), eps), right = simplify(pts.slice(idx), eps);
  return left.slice(0, -1).concat(right);
}

/** Corners of a closed loop: start from the point farthest from the first one so the seam isn't a fake corner. */
function corners(loop, eps) {
  const far = loop.reduce((bi, p, i) => (dist(p, loop[0]) > dist(loop[bi], loop[0]) ? i : bi), 0);
  const a = simplify(loop.slice(0, far + 1), eps), b = simplify(loop.slice(far).concat([loop[0]]), eps);
  let poly = a.slice(0, -1).concat(b.slice(0, -1));
  // drop nearly-straight "corners" (interior angle above ~155 degrees) and corners too close together
  let changed = true;
  while (changed && poly.length > 3) {
    changed = false;
    for (let i = 0; i < poly.length; i++) {
      const p = poly[(i - 1 + poly.length) % poly.length], c = poly[i], n = poly[(i + 1) % poly.length];
      const v1 = { x: p.x - c.x, y: p.y - c.y }, v2 = { x: n.x - c.x, y: n.y - c.y };
      const ang = Math.acos(Math.max(-1, Math.min(1, (v1.x * v2.x + v1.y * v2.y) / ((Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y)) || 1))));
      if (ang > (155 * Math.PI) / 180 || dist(p, c) < eps * 0.8) { poly.splice(i, 1); changed = true; break; }
    }
  }
  // a short edge is a corner that got bevelled (typically where the stroke starts and ends):
  // replace its two ends by the point where the neighbouring edges meet
  changed = true;
  while (changed && poly.length > 3) {
    changed = false;
    const n = poly.length, per = poly.reduce((s, p, i) => s + dist(p, poly[(i + 1) % n]), 0);
    for (let i = 0; i < n; i++) {
      const a = poly[i], b = poly[(i + 1) % n];
      if (dist(a, b) > (0.3 * per) / n) continue;
      const pa = poly[(i - 1 + n) % n], nb = poly[(i + 2) % n];
      const x = lineMeet(pa, a, b, nb);
      if (!x || dist(x, a) > per / n) continue;
      poly.splice(i, 1, x);
      poly.splice((i + 1) % poly.length, 1);
      changed = true;
      break;
    }
  }
  return poly;
}

function polygonError(pts, poly) {
  let sum = 0;
  for (const p of pts) {
    let m = Infinity;
    for (let i = 0; i < poly.length; i++) m = Math.min(m, segDist(p, poly[i], poly[(i + 1) % poly.length]));
    sum += m;
  }
  return sum / pts.length;
}

/** Best-fit ellipse from the principal axes of the points: centre, half-axes a >= b, angle. */
function fitEllipse(pts) {
  const n = pts.length;
  const cx = pts.reduce((s, p) => s + p.x, 0) / n, cy = pts.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of pts) { const dx = p.x - cx, dy = p.y - cy; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const c = Math.cos(angle), s = Math.sin(angle);
  // half-axes from the mean distance along each axis (for points on an ellipse: mean |u| = 2a/pi)
  let mu = 0, mv = 0;
  for (const p of pts) { const dx = p.x - cx, dy = p.y - cy; mu += Math.abs(dx * c + dy * s); mv += Math.abs(-dx * s + dy * c); }
  const a = ((mu / n) * Math.PI) / 2, b = ((mv / n) * Math.PI) / 2;
  let err = 0;
  for (const p of pts) {
    const dx = p.x - cx, dy = p.y - cy, u = dx * c + dy * s, v = -dx * s + dy * c;
    const k = Math.hypot(u / (a || 1), v / (b || 1)); // 1 on the ellipse
    err += Math.abs(k - 1) * Math.min(a, b) * 0.5 + Math.abs(k - 1) * Math.max(a, b) * 0.5;
  }
  return { cx, cy, a, b, angle, err: err / n };
}

/** Snap an angle to the nearest multiple of `step` if within `tol` (radians). */
function snapAngle(a, step, tol) {
  const k = Math.round(a / step) * step;
  return Math.abs(a - k) < tol ? k : a;
}

/** Points every ~3 px along a closed polygon (corners stay sharp). */
function tracePolygon(poly, closed = true) {
  const out = [];
  const n = closed ? poly.length : poly.length - 1;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], steps = Math.max(1, Math.ceil(dist(a, b) / 3));
    for (let k = 0; k < steps; k++) out.push({ x: a.x + ((b.x - a.x) * k) / steps, y: a.y + ((b.y - a.y) * k) / steps });
  }
  out.push(closed ? { ...poly[0] } : { ...poly[poly.length - 1] });
  if (closed) out.push({ ...out[1] }); // a little overlap so the start/end joins without a gap
  return out;
}

function traceEllipse({ cx, cy, a, b, angle }) {
  const steps = Math.max(24, Math.ceil((Math.PI * (a + b)) / 3));
  const c = Math.cos(angle), s = Math.sin(angle), out = [];
  for (let i = 0; i <= steps + 1; i++) {
    const t = (i / steps) * Math.PI * 2, u = Math.cos(t) * a, v = Math.sin(t) * b;
    out.push({ x: cx + u * c - v * s, y: cy + u * s + v * c });
  }
  return out;
}

function regularPolygon(poly) {
  const n = poly.length;
  const cx = poly.reduce((s, p) => s + p.x, 0) / n, cy = poly.reduce((s, p) => s + p.y, 0) / n;
  const r = poly.reduce((s, p) => s + Math.hypot(p.x - cx, p.y - cy), 0) / n;
  // keep the direction of the first corner, keep the drawing direction
  const a0 = Math.atan2(poly[0].y - cy, poly[0].x - cx);
  const turn = poly.reduce((s, p, i) => { const q = poly[(i + 1) % n]; return s + (p.x * q.y - q.x * p.y); }, 0) >= 0 ? 1 : -1;
  return Array.from({ length: n }, (_, i) => ({ x: cx + Math.cos(a0 + turn * (i * 2 * Math.PI) / n) * r, y: cy + Math.sin(a0 + turn * (i * 2 * Math.PI) / n) * r }));
}

function interiorAngles(poly) {
  return poly.map((c, i) => {
    const p = poly[(i - 1 + poly.length) % poly.length], n = poly[(i + 1) % poly.length];
    const v1 = { x: p.x - c.x, y: p.y - c.y }, v2 = { x: n.x - c.x, y: n.y - c.y };
    return Math.acos(Math.max(-1, Math.min(1, (v1.x * v2.x + v1.y * v2.y) / ((Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y)) || 1))));
  });
}

/** A rectangle through 4 roughly-right-angled corners (square if the sides are nearly equal). */
function rectangleFrom(poly) {
  const cx = poly.reduce((s, p) => s + p.x, 0) / 4, cy = poly.reduce((s, p) => s + p.y, 0) / 4;
  // orientation: average direction of the edges, folded to 0..90 degrees
  let sx = 0, sy = 0;
  for (let i = 0; i < 4; i++) {
    const a = poly[i], b = poly[(i + 1) % 4];
    const ang = Math.atan2(b.y - a.y, b.x - a.x) * 4; // x4 folds the 4 edge directions together
    sx += Math.cos(ang); sy += Math.sin(ang);
  }
  let ang = snapAngle(Math.atan2(sy, sx) / 4, Math.PI / 2, (8 * Math.PI) / 180);
  const c = Math.cos(ang), s = Math.sin(ang);
  let hu = 0, hv = 0;
  for (const p of poly) { const dx = p.x - cx, dy = p.y - cy; hu += Math.abs(dx * c + dy * s); hv += Math.abs(-dx * s + dy * c); }
  hu /= 4; hv /= 4;
  if (Math.abs(hu - hv) / Math.max(hu, hv) < 0.1) hu = hv = (hu + hv) / 2; // a square
  const square = hu === hv;
  const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([ku, kv]) => ({ x: cx + ku * hu * c - kv * hv * s, y: cy + ku * hu * s + kv * hv * c }));
  return { pts, square };
}

/** Evenly spaced points along a polyline (hand speed varies, so raw points bunch up where it was slow). */
function even(pts, step) {
  const out = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], l = dist(a, b);
    let t = step - carry;
    while (t <= l) { out.push({ x: a.x + ((b.x - a.x) * t) / l, y: a.y + ((b.y - a.y) * t) / l }); t += step; }
    carry = l - (t - step);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

const POLY_NAMES = { 3: 'triangle', 4: 'quadrilateral', 5: 'pentagon', 6: 'hexagon', 7: 'heptagon', 8: 'octagon' };

export function recognizeShape(input) {
  let pts = input.filter((p, i) => i === 0 || dist(p, input[i - 1]) > 0.5);
  if (pts.length < 6) return null;
  const bb = bounds(pts);
  const diag = Math.hypot(bb.w, bb.h);
  if (diag < 24) return null;
  // closed if the end comes back near the start – also when the hand overshoots past the start
  // (then the overlapping bit is trimmed off) or stops a little short of it
  const near = Math.max(14, 0.2 * diag);
  let closed = false, cutA = 0, cutB = pts.length - 1, bestD = Infinity;
  const head = Math.max(2, Math.floor(pts.length * 0.3));
  for (let i = 0; i < head; i++) {
    for (let j = pts.length - head; j < pts.length; j++) {
      const d = dist(pts[i], pts[j]);
      if (j - i > pts.length * 0.5 && d < bestD) { bestD = d; cutA = i; cutB = j; }
    }
  }
  if (bestD < near) { closed = true; pts = pts.slice(cutA, cutB + 1); }
  pts = even(pts, Math.max(1, diag / 120));

  if (!closed) {
    const A = pts[0], B = pts[pts.length - 1], chord = dist(A, B);
    const dev = Math.max(...pts.map((p) => segDist(p, A, B)));
    if (dev < 0.12 * chord) { // a straight line
      const ang = snapAngle(Math.atan2(B.y - A.y, B.x - A.x), Math.PI / 4, (6 * Math.PI) / 180);
      const end = { x: A.x + Math.cos(ang) * chord, y: A.y + Math.sin(ang) * chord };
      return { kind: 'line', label: 'straight line', points: tracePolygon([A, end], false) };
    }
    const segs = simplify(pts, 0.06 * diag); // zigzag / V / L: straight segments through the corners
    return { kind: 'polyline', label: segs.length === 3 ? 'angle' : 'straight lines', points: tracePolygon(segs, false) };
  }

  // closed: ellipse or polygon, whichever fits the drawing better
  const loop = pts.slice();
  const ell = fitEllipse(loop);
  const poly = corners(loop, 0.07 * diag);
  const polyErr = poly.length >= 3 ? polygonError(loop, poly) : Infinity;
  if (poly.length < 3 || poly.length > 8 || ell.err <= polyErr * 1.15) {
    const round = Math.min(ell.a, ell.b) / Math.max(ell.a, ell.b) > 0.85;
    const e = round ? { ...ell, a: (ell.a + ell.b) / 2, b: (ell.a + ell.b) / 2 } : { ...ell, angle: snapAngle(ell.angle, Math.PI / 2, (8 * Math.PI) / 180) };
    return { kind: round ? 'circle' : 'ellipse', label: round ? 'circle' : 'oval', points: traceEllipse(e) };
  }
  const sides = poly.map((p, i) => dist(p, poly[(i + 1) % poly.length]));
  const mean = sides.reduce((a, b) => a + b, 0) / sides.length;
  const evenSides = sides.every((l) => Math.abs(l - mean) / mean < 0.15);
  if (poly.length === 4 && interiorAngles(poly).every((a) => Math.abs(a - Math.PI / 2) < (16 * Math.PI) / 180)) {
    const r = rectangleFrom(poly);
    return { kind: r.square ? 'square' : 'rectangle', label: r.square ? 'square' : 'rectangle', points: tracePolygon(r.pts) };
  }
  if (evenSides) {
    return { kind: 'regular', label: (poly.length === 3 ? 'equilateral ' : 'regular ') + POLY_NAMES[poly.length], points: tracePolygon(regularPolygon(poly)) };
  }
  return { kind: 'polygon', label: POLY_NAMES[poly.length], points: tracePolygon(poly) };
}
