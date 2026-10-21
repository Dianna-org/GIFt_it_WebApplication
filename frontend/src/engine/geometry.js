// Pure geometry helpers (unit-tested).

export function lineIntersection(p, r, q, s) {
  // p + t r = q + u s
  const rxs = r.x * s.y - r.y * s.x;
  if (Math.abs(rxs) < 1e-9) return null;
  const qp = { x: q.x - p.x, y: q.y - p.y };
  const t = (qp.x * s.y - qp.y * s.x) / rxs;
  const u = (qp.x * r.y - qp.y * r.x) / rxs;
  return { t, u, x: p.x + t * r.x, y: p.y + t * r.y };
}

/**
 * Cut a tape strip (start S, end E, width w) with an infinite cut line through A and B.
 * The cut must cross both long edges of the strip, otherwise there is no piece (returns null).
 * Returns the polygon of the piece that stays on the card (the part nearest to S).
 */
export function cutTapeStrip(S, E, width, A, B, { mustSpan = true } = {}) {
  const dx = E.x - S.x, dy = E.y - S.y;
  const len = Math.hypot(dx, dy);
  if (len < 4) return null;
  const d = { x: dx / len, y: dy / len };
  const n = { x: -d.y, y: d.x };
  const h = width / 2;
  const top = { x: S.x + n.x * h, y: S.y + n.y * h };
  const bot = { x: S.x - n.x * h, y: S.y - n.y * h };
  const cut = { x: B.x - A.x, y: B.y - A.y };
  const i1 = lineIntersection(top, { x: dx, y: dy }, A, cut);
  const i2 = lineIntersection(bot, { x: dx, y: dy }, A, cut);
  if (!i1 || !i2) return null;
  // The cut must hit both edges within the strip length.
  if (i1.t <= 0.02 || i1.t > 1 || i2.t <= 0.02 || i2.t > 1) return null;
  // ...and the dragged cut line itself must reach both edges (u is the position along A->B),
  // unless the caller already knows the snip went into the tape (then the line is simply extended).
  if (mustSpan && (i1.u < 0 || i1.u > 1 || i2.u < 0 || i2.u > 1)) return null;
  return [top, { x: i1.x, y: i1.y }, { x: i2.x, y: i2.y }, bot];
}

export function pointInPolygon(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Straightness: 0 = wobbly, 50 = as drawn, 100 = perfect ruler line from first to last point. */
export function applyStraightness(points, straightness) {
  if (points.length < 2) return points;
  const t = Math.max(0, (straightness - 50) / 50);
  if (t === 0) return points;
  const a = points[0], b = points[points.length - 1];
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy || 1;
  return points.map((p) => {
    const u = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
    const lx = a.x + dx * u, ly = a.y + dy * u;
    return { x: p.x + (lx - p.x) * t, y: p.y + (ly - p.y) * t, p: p.p };
  });
}

/** Keep a rectangle fully inside [0,w]x[0,h]; returns the clamped centre and a scale factor <= 1. */
export function fitBoxInside(cx, cy, boxW, boxH, w, h) {
  const scale = Math.min(1, w / (boxW || 1), h / (boxH || 1));
  const bw = boxW * scale, bh = boxH * scale;
  return {
    scale,
    x: Math.min(Math.max(cx, bw / 2), w - bw / 2),
    y: Math.min(Math.max(cy, bh / 2), h - bh / 2),
  };
}
