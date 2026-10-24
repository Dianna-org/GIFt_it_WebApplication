import { describe, it, expect } from 'vitest';
import { SHAPES, flatten, resizeShape, rotateShape, boxFromDrag, defaultBox, handleAt, insideBox, cleanShape, shapeBounds, wrapText, textLayout } from './shapeLibrary.js';

describe('shapes tool library', () => {
  it('has many different shapes with unique ids', () => {
    expect(SHAPES.length).toBeGreaterThanOrEqual(30);
    expect(new Set(SHAPES.map((s) => s.id)).size).toBe(SHAPES.length);
    for (const id of ['square', 'rectangle', 'circle', 'star', 'heart', 'smiley', 'leaf', 'flower', 'present', 'speech', 'bubble']) expect(SHAPES.some((s) => s.id === id)).toBe(true);
  });
  it('every outline exactly fills its box (-1..1) with finite numbers', () => {
    for (const s of SHAPES) {
      const pts = flatten(s.cmds).flat();
      expect(pts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)), s.id).toBe(true);
      const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
      expect(Math.min(...xs), s.id).toBeCloseTo(-1, 2); expect(Math.max(...xs), s.id).toBeCloseTo(1, 2);
      expect(Math.min(...ys), s.id).toBeCloseTo(-1, 2); expect(Math.max(...ys), s.id).toBeCloseTo(1, 2);
    }
  });
  it('the main outline of every shape is closed (so the bucket can fill it)', () => {
    for (const s of SHAPES) {
      const first = flatten(s.cmds)[0];
      const a = first[0], b = first[first.length - 1];
      expect(Math.hypot(a.x - b.x, a.y - b.y), s.id).toBeLessThan(1e-6);
    }
  });
});

describe('editing a placed shape', () => {
  const s = { kind: 'square', x: 100, y: 100, w: 80, h: 40, rot: 0 };
  it('dragging a corner keeps the opposite corner in place', () => {
    const r = resizeShape(s, 'se', { x: 200, y: 160 });
    expect(r.w).toBeCloseTo(140); expect(r.h).toBeCloseTo(80);
    expect(r.x - r.w / 2).toBeCloseTo(60); expect(r.y - r.h / 2).toBeCloseTo(80);
  });
  it('a side handle changes only one direction, also when rotated', () => {
    const rot = { ...s, rot: Math.PI / 2 };
    const r = resizeShape(rot, 'e', { x: 100, y: 200 }); // local +x points down on the canvas now
    expect(r.h).toBeCloseTo(40);
    expect(r.w).toBeCloseTo(140);
  });
  it('Shift keeps the proportions', () => {
    const r = resizeShape(s, 'se', { x: 300, y: 130 }, { keepRatio: true });
    expect(r.w / r.h).toBeCloseTo(2);
  });
  it('never gets smaller than the minimum', () => {
    const r = resizeShape(s, 'se', { x: 0, y: 0 });
    expect(r.w).toBeGreaterThanOrEqual(16); expect(r.h).toBeGreaterThanOrEqual(16);
  });
  it('the rotate handle turns the shape and snaps to 15 degree steps', () => {
    expect(rotateShape(s, { x: 200, y: 100 }).rot).toBeCloseTo(Math.PI / 2);
    expect(rotateShape(s, { x: 200, y: 101 }).rot).toBeCloseTo(Math.PI / 2); // within 3° -> snapped
    expect(rotateShape(s, { x: 100, y: 0 }).rot).toBeCloseTo(0);
  });
  it('finds handles, the inside and nothing outside', () => {
    expect(handleAt(s, { x: 140, y: 120 }, 8, 30, 1000)).toBe('se');
    expect(handleAt(s, { x: 100, y: 50 }, 8, 30, 1000)).toBe('rotate');
    expect(handleAt(s, { x: 110, y: 105 }, 8, 30, 1000)).toBe('move');
    expect(handleAt(s, { x: 400, y: 400 }, 8, 30, 1000)).toBeNull();
    expect(handleAt({ ...s, y: 25 }, { x: 100, y: 75 }, 8, 30, 1000)).toBe('rotate'); // top off the card -> handle below
  });
  it('rotated boxes: inside test and bounds', () => {
    const r = { ...s, rot: Math.PI / 4 };
    expect(insideBox(r, { x: 100, y: 100 })).toBe(true);
    expect(insideBox(r, { x: 139, y: 119 })).toBe(false);
    expect(shapeBounds(r).w).toBeCloseTo(shapeBounds(r).h);
  });
  it('drag-to-size and the default size', () => {
    const b = boxFromDrag('square', { x: 10, y: 10 }, { x: 110, y: 60 });
    expect([b.x, b.y, b.w, b.h]).toEqual([60, 35, 100, 50]);
    const e = boxFromDrag('circle', { x: 100, y: 100 }, { x: 20, y: 70 }, { keepRatio: true });
    expect(e.w).toBeCloseTo(e.h);
    expect(defaultBox('rectangle', 0, 0, 160).h).toBeCloseTo(100);
  });
  it('cleans saved data', () => {
    const c = cleanShape({ kind: 'nope', x: 'a', w: -5, color: 'red', width: 999 });
    expect(c.kind).toBe(SHAPES[0].id); expect(c.x).toBe(0); expect(c.w).toBe(16); expect(c.color).toBe('#333333'); expect(c.width).toBe(60);
  });
});

describe('text boxes', () => {
  const measure = (t) => t.length * 10; // every letter 10 px wide
  it('wraps words to the box width like Word', () => {
    expect(wrapText('Happy birthday to you', 120, measure)).toEqual(['Happy', 'birthday to', 'you']);
    expect(wrapText('Happy birthday to you', 1000, measure)).toEqual(['Happy birthday to you']);
  });
  it('keeps new lines and breaks a word that is too long', () => {
    expect(wrapText('Hi\nthere', 1000, measure)).toEqual(['Hi', 'there']);
    expect(wrapText('Congratulations', 60, measure)).toEqual(['Congra', 'tulati', 'ons']);
  });
  it('the box needs room for all its lines', () => {
    const l = textLayout({ text: 'Happy birthday to you', w: 132, size: 20 }, measure);
    expect(l.lines.length).toBe(3);
    expect(l.needH).toBeCloseTo(3 * 24 + 12);
  });
  it('a corner drag with Shift keeps the proportions (letters scale with the box)', () => {
    const t = { kind: 'text', x: 100, y: 100, w: 200, h: 50, rot: 0 };
    const r = resizeShape(t, 'se', { x: 300, y: 125 }, { keepRatio: true });
    expect(r.w / r.h).toBeCloseTo(4);
  });
  it('cleans text boxes and keeps their fields', () => {
    const c = cleanShape({ kind: 'text', text: 'Hi', family: 'Georgia, serif', size: 3, bold: 1, x: 5, y: 6, w: 100, h: 40, color: '#112233' });
    expect(c).toMatchObject({ kind: 'text', text: 'Hi', family: 'Georgia, serif', size: 8, bold: true, italic: false, color: '#112233' });
  });
});
