import { describe, it, expect } from 'vitest';
import { cutTapeStrip, applyStraightness, fitBoxInside, pointInPolygon } from './geometry.js';
import { containsProfanity } from '../moderation.js';

describe('tape cutting', () => {
  const S = { x: 0, y: 0 }, E = { x: 200, y: 0 };
  it('cuts a straight piece with a perpendicular line', () => {
    const poly = cutTapeStrip(S, E, 40, { x: 100, y: -50 }, { x: 100, y: 50 });
    expect(poly).toHaveLength(4);
    expect(poly[1].x).toBeCloseTo(100);
    expect(poly[2].x).toBeCloseTo(100);
  });
  it('allows an angled (irregular) cut', () => {
    const poly = cutTapeStrip(S, E, 40, { x: 80, y: -50 }, { x: 120, y: 50 });
    expect(poly[1].x).not.toBeCloseTo(poly[2].x);
  });
  it('can extend a snip that went into the tape', () => {
    const poly = cutTapeStrip(S, E, 40, { x: 100, y: -50 }, { x: 100, y: 5 }, { mustSpan: false });
    expect(poly).toHaveLength(4);
    expect(poly[2].y).toBeCloseTo(-20);
  });
  it('rejects a cut that does not cross the whole strip', () => {
    expect(cutTapeStrip(S, E, 40, { x: 100, y: 30 }, { x: 100, y: 80 })).toBeNull();
    expect(cutTapeStrip(S, E, 40, { x: 300, y: -50 }, { x: 300, y: 50 })).toBeNull();
  });
});

describe('straightness', () => {
  const pts = [{ x: 0, y: 0 }, { x: 50, y: 20 }, { x: 100, y: 0 }];
  it('is untouched at 50', () => expect(applyStraightness(pts, 50)).toEqual(pts));
  it('flattens to a ruler line at 100', () => {
    const out = applyStraightness(pts, 100);
    expect(out[1].y).toBeCloseTo(0);
  });
});

describe('fitBoxInside', () => {
  it('keeps text inside the card', () => {
    const r = fitBoxInside(5, 5, 300, 100, 200, 100);
    expect(r.scale).toBeCloseTo(200 / 300);
    expect(r.x).toBeGreaterThanOrEqual((300 * r.scale) / 2 - 1e-9);
  });
  it('clamps position', () => {
    const r = fitBoxInside(-50, 500, 40, 20, 200, 100);
    expect(r.x).toBe(20);
    expect(r.y).toBe(90);
  });
});

describe('pointInPolygon', () => {
  it('works', () => {
    const sq = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    expect(pointInPolygon({ x: 5, y: 5 }, sq)).toBe(true);
    expect(pointInPolygon({ x: 15, y: 5 }, sq)).toBe(false);
  });
});

describe('profanity', () => {
  it('passes clean text', () => {
    expect(containsProfanity('Happy birthday, Anna!')).toBe(false);
    expect(containsProfanity('Class of 2026, grape juice, cocktail')).toBe(false);
  });
  it('blocks bad words and simple disguises', () => {
    expect(containsProfanity('what the fuck')).toBe(true);
    expect(containsProfanity('sh1t')).toBe(true);
    expect(containsProfanity('fuuuck')).toBe(true);
  });
});

import { isExplicit } from '../imageModeration.js';
describe('image moderation decision', () => {
  it('blocks explicit classes only', () => {
    expect(isExplicit([{ className: 'Porn', probability: 0.9 }, { className: 'Drawing', probability: 0.1 }])).toBe(true);
    expect(isExplicit([{ className: 'Drawing', probability: 0.95 }, { className: 'Sexy', probability: 0.04 }])).toBe(false);
  });
});

import { labelPieces } from './pieces.js';
describe('card pieces after a cut', () => {
  const grid = (rows) => {
    const h = rows.length, w = rows[0].length, a = new Uint8Array(w * h);
    rows.forEach((r, y) => [...r].forEach((c, x) => { a[y * w + x] = c === '#' ? 255 : 0; }));
    return { a, w, h };
  };
  it('a cut straight across splits the card in two', () => {
    const { a, w, h } = grid(['###.####', '###.####', '###.####']);
    const r = labelPieces(a, w, h);
    expect(r.pieces.map((p) => p.area)).toEqual([12, 9]);
  });
  it('a closed loop makes a hole piece', () => {
    const { a, w, h } = grid(['#######', '#.....#', '#.###.#', '#.....#', '#######']);
    expect(labelPieces(a, w, h).pieces).toHaveLength(2);
  });
  it('a slit that does not go through keeps one piece', () => {
    const { a, w, h } = grid(['###.###', '###.###', '#######']);
    expect(labelPieces(a, w, h).pieces).toHaveLength(1);
  });
  it('drops crumbs', () => {
    const { a, w, h } = grid(['####.#', '####..', '######']);
    const r = labelPieces(a, w, h, 2);
    expect(r.pieces).toHaveLength(1);
  });
});

import { PATTERNS, patternById, stampPattern, hslToHex } from './patterns.js';
import { makeRng } from './random.js';
describe('pattern pen', () => {
  // a do-nothing 2D context that counts transforms (one translate per stamped shape)
  const fakeCtx = () => {
    const calls = { translate: 0 };
    const ctx = new Proxy({}, {
      get: (t, k) => (k in t ? t[k] : k === 'translate' ? () => { calls.translate++; } : () => ({ addColorStop() {} })),
      set: (t, k, v) => { t[k] = v; return true; },
    });
    return { ctx, calls };
  };
  it('has unique patterns and falls back to the first one', () => {
    expect(new Set(PATTERNS.map((p) => p.id)).size).toBe(PATTERNS.length);
    expect(patternById('nope').id).toBe(PATTERNS[0].id);
  });
  it('stamps one shape per point for every pattern', () => {
    const pts = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 40, y: 5 }];
    for (const p of PATTERNS) {
      const { ctx, calls } = fakeCtx();
      stampPattern(ctx, pts, { size: 20, color: '#e63946', rainbow: p.id === 'stars' }, makeRng(1), p.id);
      expect(calls.translate).toBeGreaterThanOrEqual(pts.length);
    }
  });
  it('makes rainbow colours', () => {
    expect(hslToHex(0, 100, 50)).toBe('#ff0000');
    expect(hslToHex(120, 100, 50)).toBe('#00ff00');
  });
});

import { floodRegion, growMask } from './fill.js';
describe('paint bucket', () => {
  // white 10x8 picture; '#' = black line pixels
  const pic = (rows) => {
    const h = rows.length, w = rows[0].length, d = new Uint8ClampedArray(w * h * 4);
    rows.forEach((r, y) => [...r].forEach((ch, x) => { const v = ch === '#' ? 0 : 255; const o = (y * w + x) * 4; d[o] = d[o + 1] = d[o + 2] = v; d[o + 3] = 255; }));
    return { d, w, h };
  };
  const count = (m) => m.reduce((a, b) => a + b, 0);
  it('fills only the inside of a closed shape', () => {
    const { d, w, h } = pic(['..........', '..#####...', '..#...#...', '..#...#...', '..#####...', '..........']);
    expect(count(floodRegion(d, w, h, 4, 2))).toBe(6);
  });
  it('leaks out of a shape with a gap', () => {
    const { d, w, h } = pic(['..........', '..##.##...', '..#...#...', '..#####...', '..........']);
    expect(count(floodRegion(d, w, h, 4, 2))).toBeGreaterThan(20);
  });
  it('stays in one half of an open card', () => {
    const { d, w, h } = pic(['..........', '..........']);
    expect(count(floodRegion(d, w, h, 2, 0, { x0: 0, x1: 5 }))).toBe(10);
    expect(floodRegion(d, w, h, 7, 0, { x0: 0, x1: 5 })).toBeNull();
  });
  it('does not fill over stickers or holes', () => {
    const { d, w, h } = pic(['....', '....']);
    const blocked = new Uint8Array(8); blocked[2] = blocked[6] = 1; // a sticker wall down column 2
    expect(count(floodRegion(d, w, h, 0, 0, { blocked }))).toBe(4); // only the 2x2 on this side of it
    d[3] = 0; // pixel 0 is a hole (cut-away paper)
    expect(floodRegion(d, w, h, 0, 0)).toBeNull();
  });
  it('a pale pastel line on cream paper still stops the paint', () => {
    const w = 5, h = 1, d = new Uint8ClampedArray(w * 4);
    for (let x = 0; x < w; x++) { d[x * 4] = 255; d[x * 4 + 1] = 253; d[x * 4 + 2] = 248; d[x * 4 + 3] = 255; } // cream
    d[2 * 4] = 249; d[2 * 4 + 1] = 216; d[2 * 4 + 2] = 225; // light pink line pixel
    expect(count(floodRegion(d, w, h, 0, 0))).toBe(2);
  });
  it('grows a mask under line edges', () => {
    const m = new Uint8Array(25); m[12] = 1;
    expect(count(growMask(m, 5, 5, 1))).toBe(5);
  });
});
