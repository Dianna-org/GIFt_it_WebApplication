import { describe, expect, it } from 'vitest';
import { UNITS, drawStrokeRange, keepUnits } from './brushes.js';

// A pretend 2D context that writes down every drawing call (the tests run without a browser).
function recorder() {
  const calls = [];
  const ctx = new Proxy({}, {
    get: (o, k) => (k in o ? o[k] : k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : (...args) => { calls.push([k, ...args.map((a) => (typeof a === 'number' ? +a.toFixed(4) : typeof a))]); }),
    set: (o, k, v) => { calls.push(['set', k, v]); return true; },
  });
  return { ctx, calls };
}
const fakeCanvas = () => ({ width: 0, height: 0, getContext: () => recorder().ctx });
globalThis.document = globalThis.document || { createElement: fakeCanvas };

const wave = Array.from({ length: 200 }, (_, i) => ({ x: 20 + i * 3, y: 100 + Math.sin(i / 12) * 40 }));
const dots = (calls) => calls.filter(([k]) => k === 'fillRect' || k === 'arc' || k === 'drawImage').map((c) => c.join());

describe('gift shop brushes (round 41)', () => {
  for (const tool of ['calligraphy', 'spray']) {
    it(`${tool}: a growing stroke only adds units at the end`, () => {
      const opts = { size: 30 };
      const part = UNITS[tool](wave.slice(0, 120), opts), all = UNITS[tool](wave, opts);
      expect(all.slice(0, part.length - 1)).toEqual(part.slice(0, -1));
      expect(keepUnits(tool, opts)).toBeGreaterThan(2);
    });
  }

  it('spray: drawing the stroke in pieces puts down exactly the same speckles', () => {
    const opts = { size: 40, color: '#e63946', seed: 9 };
    const u = UNITS.spray(wave, opts);
    const whole = recorder(), pieces = recorder();
    drawStrokeRange(whole.ctx, 'spray', u, opts, 0, u.length, true);
    for (let a = 0; a < u.length; a += 17) drawStrokeRange(pieces.ctx, 'spray', u, opts, a, Math.min(u.length, a + 17), a + 17 >= u.length);
    expect(dots(pieces.calls)).toEqual(dots(whole.calls));
    expect(dots(whole.calls).length).toBeGreaterThan(u.length * 40);
  });

  it('calligraphy: the nib is broad across its angle and a hairline along it', () => {
    const opts = { size: 30, color: '#222222', seed: 1 };
    const quadWidth = (pts) => {
      const { ctx, calls } = recorder();
      const u = UNITS.calligraphy(pts, opts);
      drawStrokeRange(ctx, 'calligraphy', u, opts, 0, u.length, true);
      // first quad: moveTo a-n, lineTo a+n, lineTo b+n -> the swept width across the movement
      const [m, l1] = calls.filter(([k]) => k === 'moveTo' || k === 'lineTo');
      const dir = { x: pts[1].x - pts[0].x, y: pts[1].y - pts[0].y }, len = Math.hypot(dir.x, dir.y);
      const nx = l1[1] - m[1], ny = l1[2] - m[2];
      return Math.abs(nx * dir.y - ny * dir.x) / len;
    };
    const across = quadWidth([{ x: 0, y: 0 }, { x: 40, y: 40 }]); // moving ↘, across the 45° nib
    const along = quadWidth([{ x: 0, y: 40 }, { x: 40, y: 0 }]);  // moving ↗, along the nib
    expect(across).toBeCloseTo(30, 0);
    expect(along).toBeLessThan(1);
  });
});
