import { describe, it, expect } from 'vitest';
import { recognizeShape } from './shapes.js';

// a deterministic "shaky hand"
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
const shaky = (pts, amp = 3) => pts.map((p) => ({ x: p.x + rnd() * amp, y: p.y + rnd() * amp }));
const along = (corners, closed = true, step = 4) => {
  const out = [];
  const n = closed ? corners.length : corners.length - 1;
  for (let i = 0; i < n; i++) {
    const a = corners[i], b = corners[(i + 1) % corners.length], k = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step);
    for (let j = 0; j < k; j++) out.push({ x: a.x + ((b.x - a.x) * j) / k, y: a.y + ((b.y - a.y) * j) / k });
  }
  out.push(closed ? { ...corners[0] } : { ...corners[corners.length - 1] });
  return out;
};
const ellipse = (cx, cy, a, b, n = 80) => Array.from({ length: n + 1 }, (_, i) => ({ x: cx + Math.cos((i / n) * 2 * Math.PI) * a, y: cy + Math.sin((i / n) * 2 * Math.PI) * b }));

describe('hold-to-perfect shape recognition', () => {
  it('a wobbly circle becomes a circle', () => {
    expect(recognizeShape(shaky(ellipse(200, 200, 80, 76))).kind).toBe('circle');
  });
  it('a wobbly oval becomes an oval', () => {
    expect(recognizeShape(shaky(ellipse(200, 200, 120, 60))).kind).toBe('ellipse');
  });
  it('a wobbly triangle becomes a triangle', () => {
    const r = recognizeShape(shaky(along([{ x: 100, y: 300 }, { x: 260, y: 290 }, { x: 150, y: 120 }])));
    expect(['polygon', 'regular']).toContain(r.kind);
    expect(r.label).toMatch(/triangle/);
  });
  it('an even triangle becomes an equilateral triangle', () => {
    const h = 160 * Math.sqrt(3) / 2;
    expect(recognizeShape(shaky(along([{ x: 100, y: 300 }, { x: 260, y: 300 }, { x: 180, y: 300 - h }]))).label).toBe('equilateral triangle');
  });
  it('a wobbly square becomes a square, a long box a rectangle', () => {
    expect(recognizeShape(shaky(along([{ x: 100, y: 100 }, { x: 250, y: 104 }, { x: 248, y: 252 }, { x: 98, y: 248 }]))).kind).toBe('square');
    expect(recognizeShape(shaky(along([{ x: 100, y: 100 }, { x: 350, y: 100 }, { x: 350, y: 200 }, { x: 100, y: 200 }]))).kind).toBe('rectangle');
  });
  it('a pentagon stays a pentagon (5 corners)', () => {
    const pent = Array.from({ length: 5 }, (_, i) => ({ x: 200 + Math.cos(i * 1.2566 - 1.57) * 100, y: 200 + Math.sin(i * 1.2566 - 1.57) * 100 }));
    expect(recognizeShape(shaky(along(pent))).label).toMatch(/pentagon/);
  });
  it('a shaky straight stroke becomes a straight line', () => {
    const r = recognizeShape(shaky(along([{ x: 50, y: 50 }, { x: 300, y: 70 }], false)));
    expect(r.kind).toBe('line');
  });
  it('perfect shapes are closed and keep the size', () => {
    const r = recognizeShape(shaky(ellipse(200, 200, 80, 80)));
    const xs = r.points.map((p) => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(150);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(170);
  });
  it('ignores tiny scribbles', () => {
    expect(recognizeShape([{ x: 0, y: 0 }, { x: 3, y: 2 }, { x: 5, y: 1 }])).toBeNull();
  });
});

describe('closing the shape', () => {
  it('an overshooting circle (past the start) is still a circle', () => {
    const pts = Array.from({ length: 76 }, (_, i) => ({ x: 200 + Math.cos((i / 64) * 2 * Math.PI) * 90, y: 200 + Math.sin((i / 64) * 2 * Math.PI) * 85 }));
    expect(recognizeShape(shaky(pts)).kind).toBe('circle');
  });
  it('an overshooting triangle is still a triangle', () => {
    const t = along([{ x: 100, y: 300 }, { x: 300, y: 300 }, { x: 200, y: 120 }]);
    expect(recognizeShape(shaky(t.concat(t.slice(1, 12)))).label).toMatch(/triangle/);
  });
});

describe('uneven hand speed', () => {
  it('a circle drawn fast on one side and slow on the other is still a round circle', () => {
    const pts = [];
    for (let i = 0; i <= 120; i++) { const u = i / 120; const t = (u + 0.12 * Math.sin(u * 2 * Math.PI)) * 2 * Math.PI; pts.push({ x: 200 + Math.cos(t) * 80, y: 200 + Math.sin(t) * 80 }); }
    const r = recognizeShape(shaky(pts));
    expect(r.kind).toBe('circle');
    const xs = r.points.map((p) => p.x);
    expect((Math.max(...xs) + Math.min(...xs)) / 2).toBeCloseTo(200, -1);
  });
});

describe('corners', () => {
  it('a triangle whose start/end corner got rounded off is still a triangle', () => {
    const t = along([{ x: 110, y: 300 }, { x: 300, y: 290 }, { x: 205, y: 140 }, { x: 100, y: 285 }], false);
    expect(recognizeShape(shaky(t)).label).toMatch(/triangle/);
  });
  it('the browser test triangle (start in a corner, end a bit short) is a triangle', () => {
    const tri = [[600, 620], [740, 610], [665, 500]], pts = [];
    for (let k = 0; k < 3; k++) { const a = tri[k], b = tri[(k + 1) % 3]; for (let j = 0; j < 25; j++) { const u = j / 25; pts.push({ x: (a[0] + (b[0] - a[0]) * u + Math.sin(j * 1.3 + k) * 4) * 3, y: (a[1] + (b[1] - a[1]) * u + Math.cos(j * 1.1) * 4) * 3 }); } }
    pts.push({ x: 606 * 3, y: 616 * 3 });
    expect(recognizeShape(pts).label).toMatch(/triangle/);
  });
});
