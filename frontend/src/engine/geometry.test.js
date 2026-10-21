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
