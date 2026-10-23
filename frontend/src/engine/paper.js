import { cardDims, PAPER_COLOR, TAPE_PATTERNS } from '../config.js';
import { BLEND, renderStroke, resample, drawSparkle } from './brushes.js';
import { applyStraightness, fitBoxInside, pointInPolygon } from './geometry.js';
import { smoothNoise } from './random.js';
import { stickerCanvas } from './stickers.js';
import { labelPieces } from './pieces.js';
import { floodRegion, growMask } from './fill.js';
import { recognizeShape } from './shapes.js';
import { drawShape, shapeBounds, handleAt, handlePositions, cleanShape } from './shapeLibrary.js';

// "Hold to perfect": keeping a drawing tool still (within HOLD_RADIUS px) for HOLD_MS at the end of a stroke
// turns the wobbly drawing into the perfect version of the same shape. Moving on afterwards undoes the snap.
export const HOLD_MS = 650;
const HOLD_RADIUS = 6;

// The card has two faces: the inside spread and the outside (back + front cover).
// Each face keeps three layers so the eraser can remove drawing but never stickers, tape or text:
//   objects – tape, stickers and text (only Undo / Erase all can remove them)
//   ink     – everything drawn with crayons, markers, brush, glitter, highlighter
//   protect – opaque where a sticker lies, so nothing can be drawn there
// Ink drawn before an object is placed is removed under that object (it is covered),
// so painting ink above objects is always correct.
// `cut` is the shape of the paper (opaque = paper still there), stored in inside coordinates;
// the outside face sees it mirrored.

export const FACES = ['inside', 'outside'];
const HISTORY_BYTES = 450 * 1024 * 1024;
const HISTORY_STEPS = 150;

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
const ctx2d = (c) => c.getContext('2d', { willReadFrequently: false });
function copyCanvas(src, w = src.width, h = src.height) {
  const c = makeCanvas(w, h);
  ctx2d(c).drawImage(src, 0, 0, w, h);
  return c;
}
function clampRect(r, w, h) {
  const x = Math.max(0, Math.floor(r.x)), y = Math.max(0, Math.floor(r.y));
  const x2 = Math.min(w, Math.ceil(r.x + r.w)), y2 = Math.min(h, Math.ceil(r.y + r.h));
  if (x2 <= x || y2 <= y) return null;
  return { x, y, w: x2 - x, h: y2 - y };
}
function unionRect(a, b) {
  if (!a) return b;
  if (!b) return a;
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}
function boundsOf(points, pad) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const p of points) { x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y); x2 = Math.max(x2, p.x); y2 = Math.max(y2, p.y); }
  return { x: x1 - pad, y: y1 - pad, w: x2 - x1 + pad * 2, h: y2 - y1 + pad * 2 };
}

// ----- tape pattern tiles -----
const tileCache = new Map();
function tapeTile(pattern) {
  if (tileCache.has(pattern.id)) return tileCache.get(pattern.id);
  const s = 56;
  const c = makeCanvas(s, s);
  const g = ctx2d(c);
  g.fillStyle = pattern.base; g.fillRect(0, 0, s, s);
  g.fillStyle = pattern.ink; g.strokeStyle = pattern.ink;
  switch (pattern.kind) {
    case 'dots':
      [[14, 14], [42, 42]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 6, 0, 6.3); g.fill(); });
      g.globalAlpha = 0.6;
      [[42, 14], [14, 42]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 3, 0, 6.3); g.fill(); });
      break;
    case 'zigzag':
      g.lineWidth = 6; g.lineJoin = 'round';
      for (let y = 8; y < s + 28; y += 28) {
        g.beginPath(); g.moveTo(-4, y);
        for (let x = 0; x <= s + 14; x += 14) g.lineTo(x, y + ((x / 14) % 2 ? -10 : 10));
        g.stroke();
      }
      break;
    case 'stripes':
      g.lineWidth = 12;
      for (let i = -s; i < s * 2; i += 28) { g.beginPath(); g.moveTo(i, s); g.lineTo(i + s, 0); g.stroke(); }
      break;
    case 'check':
      g.globalAlpha = 0.55;
      g.fillRect(0, 0, s / 2, s / 2); g.fillRect(s / 2, s / 2, s / 2, s / 2);
      break;
    case 'hearts':
      [[14, 18], [42, 44]].forEach(([x, y]) => {
        g.beginPath(); g.moveTo(x, y + 8);
        g.bezierCurveTo(x - 14, y, x - 8, y - 12, x, y - 5);
        g.bezierCurveTo(x + 8, y - 12, x + 14, y, x, y + 8); g.fill();
      });
      break;
    case 'stars':
      [[14, 14], [42, 42]].forEach(([x, y]) => {
        g.beginPath();
        for (let i = 0; i < 10; i++) {
          const a = (i * Math.PI) / 5 - Math.PI / 2, r = i % 2 ? 4 : 9;
          g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        }
        g.closePath(); g.fill();
      });
      break;
  }
  tileCache.set(pattern.id, c);
  return c;
}

export function tapePatternById(id) {
  return TAPE_PATTERNS.find((p) => p.id === id) || TAPE_PATTERNS[0];
}

function polyPath(g, poly) {
  g.beginPath();
  poly.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
  g.closePath();
}

/** Paints a tape polygon (strip direction `angle`, anchored at S) onto ctx. */
export function paintTape(ctx, poly, S, angle, pattern, alpha = 0.95) {
  ctx.save();
  polyPath(ctx, poly);
  ctx.shadowColor = 'rgba(40,30,0,.3)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
  ctx.fillStyle = pattern.base; ctx.globalAlpha = alpha; ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.clip();
  ctx.translate(S.x, S.y); ctx.rotate(angle);
  ctx.fillStyle = ctx.createPattern(tapeTile(pattern), 'repeat');
  ctx.fillRect(-4000, -4000, 8000, 8000);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const b = boundsOf(poly, 0);
  const g = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
  g.addColorStop(0, 'rgba(255,255,255,.22)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,.06)');
  ctx.globalAlpha = 1; ctx.fillStyle = g;
  ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.restore();
}

export function tapePolygon(S, E, width) {
  const dx = E.x - S.x, dy = E.y - S.y, len = Math.hypot(dx, dy) || 1;
  const n = { x: (-dy / len) * (width / 2), y: (dx / len) * (width / 2) };
  return [{ x: S.x + n.x, y: S.y + n.y }, { x: E.x + n.x, y: E.y + n.y }, { x: E.x - n.x, y: E.y - n.y }, { x: S.x - n.x, y: S.y - n.y }];
}

// ----- text -----
const fontOf = (spec) => `${spec.italic ? 'italic ' : ''}${spec.bold ? 'bold ' : ''}${spec.size}px ${spec.family}`;
export function measureText(spec) {
  const c = measureText.ctx || (measureText.ctx = ctx2d(makeCanvas(1, 1)));
  c.font = fontOf(spec);
  const lines = (spec.text || '').split('\n');
  const lineH = spec.size * 1.2;
  const w = Math.max(10, ...lines.map((l) => c.measureText(l).width));
  return { lines, lineH, w, h: lineH * lines.length };
}

function paintText(ctx, spec, cx, cy, scale) {
  const m = measureText(spec);
  ctx.save();
  ctx.translate(cx, cy); ctx.scale(scale, scale);
  ctx.font = fontOf(spec);
  ctx.fillStyle = spec.color; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  m.lines.forEach((l, i) => ctx.fillText(l, 0, (i - (m.lines.length - 1) / 2) * m.lineH));
  ctx.restore();
}

/** Where the text box really ends up: always completely inside the card. */
export function placeTextBox(spec, x, y, cardW, cardH) {
  const m = measureText(spec);
  const pad = 6;
  const f = fitBoxInside(x, y, m.w + pad * 2, m.h + pad * 2, cardW, cardH);
  return { x: f.x, y: f.y, scale: f.scale, w: (m.w + pad * 2) * f.scale, h: (m.h + pad * 2) * f.scale };
}

class Face {
  constructor(w, h) {
    this.objects = makeCanvas(w, h);
    this.ink = makeCanvas(w, h);
    this.protect = makeCanvas(w, h);
    this.compose = makeCanvas(w, h);
    this.glitter = [];
    this.texts = [];
    this.shapes = []; // shapes-tool outlines: stay separate objects, so they can be moved/resized/rotated later
    this.hasProtect = false;
    this.used = false;
  }
}

export class CardPaper {
  constructor(sizeId) {
    this.listeners = new Set();
    this.history = [];
    this.historyBytes = 0;
    this.epoch = 0;
    this.setup(sizeId);
  }

  setup(sizeId) {
    const d = cardDims(sizeId);
    this.sizeId = sizeId;
    this.w = d.pxW; this.h = d.pxH;
    this.faces = { inside: new Face(this.w, this.h), outside: new Face(this.w, this.h) };
    this.cut = makeCanvas(this.w, this.h);
    const cg = ctx2d(this.cut); cg.fillStyle = '#000'; cg.fillRect(0, 0, this.w, this.h);
    this.cutChanged(); // cached reads of the cut shape are rebuilt lazily
    this.isCut = false;
    this.stroke = makeCanvas(this.w, this.h);
    this.scratch = makeCanvas(this.w, this.h);
    this.scratch2 = makeCanvas(this.w, this.h);
    this.live = null;
    this.selected = null; // { face, id } of the shape being edited
    this.handlePx = 6; // canvas px per screen px (set by Card.jsx) – keeps the shape handles a usable size
    this.pendingTape = null;
    this.ghost = null;
    this.cutting = null;
    this.choice = null;
    this.fall = null;
    this.dirty = true;
    this.dirtyRects = new Map(); // face -> rect | 'full'
    this.touched = false;
  }
  /** Mark part of a face (or all of it when no rect is given) to be redrawn next frame. */
  cutChanged() { this.cutAlpha = null; this._cutShadow = null; }
  markFace(face, rect) {
    if (!face) return;
    const cur = this.dirtyRects.get(face);
    if (!rect || cur === 'full') { this.dirtyRects.set(face, 'full'); return; }
    this.dirtyRects.set(face, cur ? unionRect(cur, rect) : rect);
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { this.dirty = true; this.listeners.forEach((f) => f()); }
  face(id) { return this.faces[id]; }
  get texts() { return [...this.faces.inside.texts, ...this.faces.outside.texts]; }

  // ---------- cut shape helpers ----------
  /** Inside-face coordinates for a point on a face. */
  toInside(face, p) { return face === 'outside' ? { x: this.w - p.x, y: p.y } : p; }
  readCutAlpha() {
    if (!this.cutAlpha) {
      const d = ctx2d(this.cut).getImageData(0, 0, this.w, this.h).data;
      const a = new Uint8Array(this.w * this.h);
      for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
      this.cutAlpha = a;
    }
    return this.cutAlpha;
  }
  isOnPaper(face, p) {
    if (!this.isCut) return p.x >= 0 && p.y >= 0 && p.x < this.w && p.y < this.h;
    const q = this.toInside(face, p);
    const x = Math.floor(q.x), y = Math.floor(q.y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return false;
    return this.readCutAlpha()[y * this.w + x] > 127;
  }
  /** Draw the cut shape into ctx as seen from `face`. */
  drawCutShape(g, face) {
    g.save();
    if (face === 'outside') { g.translate(this.w, 0); g.scale(-1, 1); }
    g.drawImage(this.cut, 0, 0);
    g.restore();
  }

  // ---------- history (region snapshots keep memory low, so there can be many undo steps) ----------
  record(face, rect, extra = {}) {
    const r = rect && clampRect(rect, this.w, this.h);
    const entry = { face, rect: r, bytes: 0, ...extra };
    const F = face && this.faces[face];
    if (F && r) {
      entry.objects = ctx2d(F.objects).getImageData(r.x, r.y, r.w, r.h);
      entry.ink = ctx2d(F.ink).getImageData(r.x, r.y, r.w, r.h);
      entry.protect = ctx2d(F.protect).getImageData(r.x, r.y, r.w, r.h);
      entry.bytes += r.w * r.h * 12;
    }
    if (F) {
      entry.glitter = F.glitter.slice(); entry.texts = F.texts.slice(); entry.shapes = F.shapes.map((x) => ({ ...x })); entry.hasProtect = F.hasProtect; entry.used = F.used;
      entry.bytes += F.glitter.length * 48;
    }
    this.push(entry);
  }
  recordCut() {
    this.push({ kind: 'cut', cut: copyCanvas(this.cut), isCut: this.isCut, bytes: this.w * this.h * 4 });
  }
  recordAll(kind = 'all') {
    const snap = { kind, sizeId: this.sizeId, isCut: this.isCut, cut: copyCanvas(this.cut), faces: {}, bytes: this.w * this.h * 4 * 7 };
    for (const id of FACES) {
      const F = this.faces[id];
      snap.faces[id] = {
        objects: copyCanvas(F.objects), ink: copyCanvas(F.ink), protect: copyCanvas(F.protect),
        glitter: F.glitter.slice(), texts: F.texts.slice(), shapes: F.shapes.map((x) => ({ ...x })), hasProtect: F.hasProtect, used: F.used,
      };
    }
    this.push(snap);
  }
  push(entry) {
    this.history.push(entry);
    this.historyBytes += entry.bytes;
    while (this.history.length > HISTORY_STEPS || (this.historyBytes > HISTORY_BYTES && this.history.length > 1)) {
      this.historyBytes -= this.history.shift().bytes;
    }
  }
  get canUndo() { return this.history.length > 0; }

  undo() {
    if (this.choice) { this.cancelChoice(); return true; }
    const e = this.history.pop();
    if (!e) return false;
    this.historyBytes -= e.bytes;
    this.cancelLive();
    if (e.kind === 'cut') {
      const g = ctx2d(this.cut); g.clearRect(0, 0, this.w, this.h); g.drawImage(e.cut, 0, 0);
      this.isCut = e.isCut; this.cutChanged();
    } else if (e.kind === 'all' || e.kind === 'resize') {
      if (e.sizeId !== this.sizeId) this.resizeCanvases(e.sizeId);
      const g = ctx2d(this.cut); g.clearRect(0, 0, this.w, this.h); g.drawImage(e.cut, 0, 0);
      this.isCut = e.isCut; this.cutChanged();
      for (const id of FACES) {
        const F = this.faces[id], s = e.faces[id];
        for (const k of ['objects', 'ink', 'protect']) { const c = ctx2d(F[k]); c.clearRect(0, 0, this.w, this.h); c.drawImage(s[k], 0, 0); }
        F.glitter = s.glitter; F.texts = s.texts; F.shapes = s.shapes.map((x) => ({ ...x })); F.hasProtect = s.hasProtect; F.used = s.used;
      }
    } else {
      const F = this.faces[e.face];
      if (e.rect) {
        ctx2d(F.objects).putImageData(e.objects, e.rect.x, e.rect.y);
        ctx2d(F.ink).putImageData(e.ink, e.rect.x, e.rect.y);
        ctx2d(F.protect).putImageData(e.protect, e.rect.x, e.rect.y);
      }
      F.glitter = e.glitter; F.texts = e.texts; F.shapes = e.shapes.map((x) => ({ ...x })); F.hasProtect = e.hasProtect; F.used = e.used;
    }
    if (this.selected && !this.selectedShape()) this.selected = null;
    this.emit();
    return true;
  }

  cancelLive() {
    this.live = null; this.pendingTape = null; this.ghost = null; this.cutting = null;
    ctx2d(this.stroke).clearRect(0, 0, this.w, this.h);
    this.dirty = true;
  }

  /** Erase ALL: both faces, every layer, and the paper is whole again. Undoable. */
  eraseAll() {
    this.cancelLive();
    this.choice = null;
    this.recordAll();
    for (const id of FACES) {
      const F = this.faces[id];
      for (const k of ['objects', 'ink', 'protect']) ctx2d(F[k]).clearRect(0, 0, this.w, this.h);
      F.glitter = []; F.texts = []; F.shapes = []; F.hasProtect = false; F.used = false;
    }
    this.selected = null;
    const g = ctx2d(this.cut); g.fillStyle = '#000'; g.fillRect(0, 0, this.w, this.h);
    this.isCut = false; this.cutChanged();
    this.emit();
  }

  // ---------- resizing keeps the design (scaled to fit the new card) ----------
  resizeCanvases(sizeId) {
    const old = { w: this.w, h: this.h, faces: this.faces, cut: this.cut };
    const d = cardDims(sizeId);
    this.sizeId = sizeId; this.w = d.pxW; this.h = d.pxH;
    const sx = this.w / old.w, sy = this.h / old.h;
    this.faces = {};
    for (const id of FACES) {
      const o = old.faces[id], F = new Face(this.w, this.h);
      for (const k of ['objects', 'ink', 'protect']) ctx2d(F[k]).drawImage(o[k], 0, 0, this.w, this.h);
      F.glitter = o.glitter.map((s) => ({ ...s, x: s.x * sx, y: s.y * sy }));
      F.texts = o.texts; F.hasProtect = o.hasProtect; F.used = o.used;
      F.shapes = o.shapes.map((x) => ({ ...x, x: x.x * sx, y: x.y * sy, w: x.w * sx, h: x.h * sy }));
      this.faces[id] = F;
    }
    this.cut = copyCanvas(old.cut, this.w, this.h);
    this.cutChanged();
    for (const k of ['stroke', 'scratch', 'scratch2']) this[k] = makeCanvas(this.w, this.h);
    this.epoch++;
  }
  resize(sizeId) {
    if (sizeId === this.sizeId) return;
    this.cancelLive(); this.choice = null;
    this.recordAll('resize');
    this.resizeCanvases(sizeId);
    this.emit();
  }

  // ---------- strokes (drawing tools and the eraser) ----------
  beginStroke(face, tool, pt, opts) {
    this.touched = true;
    this.live = { face, tool, points: [pt], opts, sparkles: [], hold: { at: pt, since: performance.now() }, perfect: null };
    this.rerenderLive();
  }
  addPoint(pt) {
    if (!this.live) return;
    const pts = this.live.points, last = pts[pts.length - 1];
    if (Math.hypot(pt.x - last.x, pt.y - last.y) < 0.8) return;
    const { hold } = this.live;
    if (Math.hypot(pt.x - hold.at.x, pt.y - hold.at.y) > (this.live.perfect ? HOLD_RADIUS * 2 : HOLD_RADIUS)) {
      this.live.hold = { at: pt, since: performance.now() };
      if (this.live.perfect) this.live.perfect = null; // kept drawing after the snap: back to the hand-drawn line
    } else if (this.live.perfect) return; // small tremble while holding the perfect shape
    pts.push(pt);
    this.live.stale = true; // redrawn once per frame, however many pointer events arrive
  }
  /** Called every frame: after holding still long enough, swap the drawing for its perfect shape. */
  checkHold(now = performance.now()) {
    const L = this.live;
    if (!L || L.tool === 'eraser' || L.perfect || L.hold.tried || now - L.hold.since < HOLD_MS) return null;
    L.hold.tried = true; // one try per hold
    const shape = recognizeShape(L.points);
    if (!shape) return null;
    L.perfect = shape;
    this.rerenderLive();
    return shape;
  }
  shapePoints() {
    const { points, opts, tool, perfect } = this.live;
    if (tool === 'eraser') return points;
    if (perfect) return perfect.points; // perfect means perfect: no wobble, no straightening
    let pts = applyStraightness(points, opts.straight);
    if (opts.straight < 50 && pts.length > 1) {
      const amp = ((50 - opts.straight) / 50) * Math.max(3, opts.size * 0.45);
      pts = resample(pts, 6);
      pts = pts.map((p, i) => {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
        const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const n = smoothNoise(null, i * 0.35 + opts.seed * 0.013);
        return { x: p.x - ((b.y - a.y) / l) * n * amp, y: p.y + ((b.x - a.x) / l) * n * amp };
      });
    }
    return pts;
  }
  rerenderLive() {
    const g = ctx2d(this.stroke);
    g.clearRect(0, 0, this.w, this.h);
    const pts = this.shapePoints();
    this.live.shaped = pts;
    if (this.live.tool === 'eraser') {
      g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#000'; g.fillStyle = '#000'; g.lineWidth = this.live.opts.size;
      g.beginPath(); g.moveTo(pts[0].x, pts[0].y);
      if (pts.length === 1) g.lineTo(pts[0].x + 0.1, pts[0].y);
      pts.forEach((p) => g.lineTo(p.x, p.y));
      g.stroke();
      this.live.sparkles = [];
    } else {
      const out = renderStroke(g, this.live.tool, pts, this.live.opts);
      this.live.sparkles = out.sparkles || [];
    }
    const r = boundsOf(pts, this.live.opts.size * 1.6 + 16);
    this.markFace(this.live.face, unionRect(this.live.rect, r)); // old extent too: a straightened line can move
    this.live.rect = r;
  }
  endStroke() {
    if (!this.live) return;
    if (this.live.stale) this.rerenderLive();
    const { face, tool, opts, sparkles, shaped } = this.live;
    const F = this.faces[face];
    const pad = opts.size * 1.6 + 14;
    this.record(face, boundsOf(shaped || this.live.points, pad));
    if (tool === 'eraser') {
      const g = ctx2d(F.ink);
      g.save(); g.globalCompositeOperation = 'destination-out'; g.drawImage(this.stroke, 0, 0); g.restore();
      const r = opts.size / 2 + 2;
      F.glitter = F.glitter.filter((s) => !shaped.some((p) => Math.hypot(p.x - s.x, p.y - s.y) < r));
    } else {
      const blend = BLEND[tool];
      const s = ctx2d(this.scratch);
      s.clearRect(0, 0, this.w, this.h);
      s.drawImage(this.stroke, 0, 0);
      if (F.hasProtect) { s.globalCompositeOperation = 'destination-out'; s.drawImage(F.protect, 0, 0); s.globalCompositeOperation = 'source-over'; }
      const g = ctx2d(F.ink);
      g.save(); g.globalCompositeOperation = blend.op; g.globalAlpha = blend.alpha * opts.opacity; g.drawImage(this.scratch, 0, 0); g.restore();
      if (sparkles.length) {
        const prot = F.hasProtect ? ctx2d(F.protect).getImageData(0, 0, this.w, this.h).data : null;
        F.glitter.push(...(prot ? sparkles.filter((p) => prot[(Math.round(p.y) * this.w + Math.round(p.x)) * 4 + 3] < 20) : sparkles));
      }
      F.used = true;
    }
    ctx2d(this.stroke).clearRect(0, 0, this.w, this.h);
    this.live = null;
    this.emit();
  }

  // ---------- objects ----------
  /** Puts `paint(ctx)` onto the objects layer, hiding the ink below it. */
  placeObject(face, rect, paint, { protect = null, unprotect = null, cover = null } = {}) {
    const F = this.faces[face];
    this.record(face, rect);
    this.touched = true;
    const s = ctx2d(this.scratch);
    s.clearRect(0, 0, this.w, this.h);
    // ink below the new object is covered by it
    const ig = ctx2d(F.ink);
    ig.save(); ig.globalCompositeOperation = 'destination-out';
    if (cover) cover(ig); else { paint(s); ig.drawImage(this.scratch, 0, 0); s.clearRect(0, 0, this.w, this.h); }
    ig.restore();
    paint(s);
    ctx2d(F.objects).drawImage(this.scratch, 0, 0);
    const pg = ctx2d(F.protect);
    if (unprotect) { pg.save(); pg.globalCompositeOperation = 'destination-out'; unprotect(pg); pg.restore(); }
    if (protect) { protect(pg); F.hasProtect = true; }
    if (F.glitter.length) {
      const d = s.getImageData(0, 0, this.w, this.h).data;
      F.glitter = F.glitter.filter((p) => d[(Math.round(p.y) * this.w + Math.round(p.x)) * 4 + 3] < 40);
    }
    F.used = true;
  }

  setPendingTape(t) {
    const rect = (p) => p && boundsOf(tapePolygon(p.S, p.E, p.width), 20);
    if (this.pendingTape) this.markFace(this.pendingTape.face, rect(this.pendingTape));
    if (t) this.markFace(t.face, rect(t));
    this.pendingTape = t;
  }
  placeTape(face, poly, S, angle, pattern) {
    this.placeObject(face, boundsOf(poly, 16), (g) => paintTape(g, poly, S, angle, pattern),
      { unprotect: (pg) => { polyPath(pg, poly); pg.fill(); }, cover: (g) => { polyPath(g, poly); g.fill(); } }); // tape can be written on
    this.pendingTape = null;
    this.emit();
  }

  placeSticker(face, id, x, y, size, rot) {
    const art = stickerCanvas(id), sil = this.silhouette(id);
    const r = size * 0.75 + 16;
    const at = (g, img, shadow) => {
      g.save(); g.translate(x, y); g.rotate(rot);
      if (shadow) { g.shadowColor = 'rgba(40,30,0,.32)'; g.shadowBlur = 7; g.shadowOffsetY = 2; }
      g.drawImage(img, -size / 2, -size / 2, size, size); g.restore();
    };
    this.placeObject(face, { x: x - r, y: y - r, w: r * 2, h: r * 2 }, (g) => at(g, art, true), { protect: (pg) => at(pg, sil, false), cover: (g) => at(g, sil, false) });
    this.emit();
  }
  silhouette(id) {
    this._sil = this._sil || {};
    if (!this._sil[id]) {
      const c = copyCanvas(stickerCanvas(id));
      const g = ctx2d(c);
      g.globalCompositeOperation = 'source-in'; g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
      this._sil[id] = c;
    }
    return this._sil[id];
  }

  placeText(face, spec, x, y) {
    if (!spec.text || !spec.text.trim()) return false;
    const F = this.faces[face];
    const box = placeTextBox(spec, x, y, this.w, this.h);
    this.placeObject(face, { x: box.x - box.w / 2 - 8, y: box.y - box.h / 2 - 8, w: box.w + 16, h: box.h + 16 }, (g) => {
      paintText(g, spec, box.x, box.y, box.scale);
      // text can't be written over stickers either
      if (F.hasProtect) { g.save(); g.globalCompositeOperation = 'destination-out'; g.drawImage(F.protect, 0, 0); g.restore(); }
    });
    F.texts.push(spec.text);
    this.emit();
    return true;
  }

  setGhost(g) {
    if (this.ghost) this.markFace(this.ghost.face, this.ghostRect(this.ghost));
    if (g) this.markFace(g.face, this.ghostRect(g));
    this.ghost = g;
  }
  ghostRect(gh) {
    if (gh.kind === 'sticker') { const r = gh.size * 0.75 + 8; return { x: gh.x - r, y: gh.y - r, w: r * 2, h: r * 2 }; }
    if (gh.kind === 'text') { const b = placeTextBox(gh.spec, gh.x, gh.y, this.w, this.h); return { x: b.x - b.w / 2 - 12, y: b.y - b.h / 2 - 12, w: b.w + 24, h: b.h + 24 }; }
    if (gh.kind === 'tapecut') return boundsOf([gh.A, gh.B], 8);
    if (gh.kind === 'shape') return shapeBounds(gh.shape, gh.shape.width + 8);
    if (gh.kind === 'eraser') { const r = gh.size / 2 + 6; return { x: gh.x - r, y: gh.y - r, w: r * 2, h: r * 2 }; }
    return null;
  }

  // ---------- shapes tool (outline shapes that stay editable) ----------
  /** Shape outlines, never over stickers (like ink). */
  paintShapes(g, face, rect = null) {
    const F = this.faces[face];
    const s = ctx2d(this.scratch2);
    s.save();
    if (rect) { s.beginPath(); s.rect(rect.x, rect.y, rect.w, rect.h); s.clip(); } // only the part being redrawn
    s.clearRect(0, 0, this.w, this.h);
    for (const sh of F.shapes) drawShape(s, sh);
    if (F.hasProtect) { s.globalCompositeOperation = 'destination-out'; s.drawImage(F.protect, 0, 0); }
    s.restore();
    g.drawImage(this.scratch2, 0, 0);
  }
  get handleR() { return 9 * this.handlePx; }
  get handleGap() { return 30 * this.handlePx; }
  /** Area of a face that a shape (with its handles) covers – redrawn when it changes. */
  shapeRect(sh) { return shapeBounds(sh, sh.width + this.handleGap + this.handleR * 2 + 6); }
  findShape(face, id) { return this.faces[face]?.shapes.find((x) => x.id === id) || null; }
  selectedShape() { return this.selected ? this.findShape(this.selected.face, this.selected.id) : null; }
  /** Topmost shape whose box contains p. */
  shapeAt(face, p) {
    const list = this.faces[face].shapes;
    for (let i = list.length - 1; i >= 0; i--) if (handleAt(list[i], p, 0, 0, this.h) === 'move') return list[i];
    return null;
  }
  /** Which handle of the selected shape is at p ('nw'…'w', 'rotate', 'move' or null). */
  shapeHandleAt(face, p) {
    const sh = this.selected?.face === face ? this.selectedShape() : null;
    return sh ? handleAt(sh, p, this.handleR * 1.6, this.handleGap, this.h) : null;
  }
  selectShape(face, id) {
    const old = this.selectedShape();
    if (old) this.markFace(this.selected.face, this.shapeRect(old));
    this.selected = id ? { face, id } : null;
    const sh = this.selectedShape();
    if (sh) this.markFace(face, this.shapeRect(sh));
    this.emit();
  }
  addShape(face, spec) {
    const F = this.faces[face];
    this.record(face, null);
    const sh = cleanShape({ ...spec, id: Math.random().toString(36).slice(2, 10) });
    F.shapes.push(sh);
    F.used = true; this.touched = true;
    this.markFace(face, this.shapeRect(sh));
    this.selectShape(face, sh.id);
    return sh;
  }
  /**
   * Changes a shape (move/resize/rotate/colour/thickness). `undo`: make an undo step first (once per drag);
   * `quiet`: don't notify listeners (during a drag; call emit() when it ends).
   */
  updateShape(face, id, patch, { undo = false, quiet = false } = {}) {
    const sh = this.findShape(face, id);
    if (!sh) return;
    if (undo) this.record(face, null);
    this.markFace(face, this.shapeRect(sh));
    Object.assign(sh, cleanShape({ ...sh, ...patch }));
    this.markFace(face, this.shapeRect(sh));
    if (!quiet) this.emit();
  }
  deleteShape(face, id) {
    const F = this.faces[face], sh = this.findShape(face, id);
    if (!sh) return false;
    this.record(face, null);
    F.shapes = F.shapes.filter((x) => x !== sh);
    if (this.selected?.id === id) this.selected = null;
    this.markFace(face, this.shapeRect(sh));
    this.emit();
    return true;
  }
  /** Dashed box + handles around the selected shape (on screen only, never saved or exported). */
  paintHandles(g) {
    const sh = this.selectedShape();
    if (!sh) return;
    const px = this.handlePx, hs = handlePositions(sh, this.handleGap, this.h);
    const cs = hs.filter((h) => ['nw', 'ne', 'se', 'sw'].includes(h.id));
    const rot = hs.find((h) => h.id === 'rotate');
    const edge = hs.find((h) => h.id === (rot.below ? 's' : 'n'));
    g.save();
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    g.lineWidth = 1.6 * px; g.strokeStyle = '#2b8a8a'; g.setLineDash([6 * px, 4 * px]);
    g.beginPath(); cs.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); g.stroke();
    g.setLineDash([]);
    g.beginPath(); g.moveTo(edge.x, edge.y); g.lineTo(rot.x, rot.y); g.stroke();
    for (const h of hs) {
      g.fillStyle = h.id === 'rotate' ? '#2b8a8a' : '#ffffff';
      g.beginPath();
      if (h.id === 'rotate') g.arc(h.x, h.y, this.handleR * 1.1, 0, Math.PI * 2);
      else g.rect(h.x - this.handleR * 0.8, h.y - this.handleR * 0.8, this.handleR * 1.6, this.handleR * 1.6);
      g.fill(); g.stroke();
    }
    // a little turning arrow in the rotate handle
    g.strokeStyle = '#fff'; g.lineWidth = 1.4 * px;
    g.beginPath(); g.arc(rot.x, rot.y, this.handleR * 0.55, -Math.PI * 0.9, Math.PI * 0.5); g.stroke();
    g.restore();
  }

  // ---------- cutting the card ----------
  beginCut(face, pt) {
    const p = this.toInside(face, pt);
    // which half of the sheet the cut is made in (matters when the card is folded shut)
    this.cutting = { face, half: p.x < this.w / 2 ? 'left' : 'right', points: [p] };
    this.dirty = true;
  }
  addCutPoint(face, pt) {
    if (!this.cutting) return;
    const p = this.toInside(face, pt), pts = this.cutting.points, last = pts[pts.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) > 1.5) { pts.push(p); this.dirty = true; }
  }
  /** Lengthen the ends of the cut a little past where they stopped, so cuts that start or end at the edge go through it. */
  extendCutEnds() {
    const pts = this.cutting?.points;
    if (!pts || pts.length < 2) return;
    const ext = (a, b) => {
      const dx = a.x - b.x, dy = a.y - b.y, l = Math.hypot(dx, dy) || 1;
      return { x: a.x + (dx / l) * 40, y: a.y + (dy / l) * 40 };
    };
    const nearEdge = (p) => p.x < 40 || p.y < 40 || p.x > this.w - 40 || p.y > this.h - 40 || !this.isOnPaper('inside', p);
    if (nearEdge(pts[0])) pts.unshift(ext(pts[0], pts[Math.min(3, pts.length - 1)]));
    const n = pts.length;
    if (nearEdge(pts[n - 1])) pts.push(ext(pts[n - 1], pts[Math.max(0, n - 4)]));
  }
  /** Applies the cut. Returns the number of pieces the paper is now in (>1 means the user must choose). */
  /**
   * `onlyHalf`: when the card is folded shut the scissors only go through the layer being cut,
   * so the cut is kept inside that half of the sheet.
   */
  finishCut({ onlyHalf = false } = {}) {
    const c = this.cutting;
    if (!c || c.points.length < 2) { this.cutting = null; this.dirty = true; return 0; }
    this.extendCutEnds();
    this.cutting = null;
    // scissors that only went through the desk (never over paper) change nothing
    const pts = c.points;
    let touches = false;
    for (let i = 1; i < pts.length && !touches; i++) {
      const a = pts[i - 1], b = pts[i], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2));
      for (let k = 0; k <= n && !touches; k++) touches = this.isOnPaper('inside', { x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
    }
    if (!touches) { this.dirty = true; return 0; }
    this.recordCut();
    const g = ctx2d(this.cut);
    g.save(); g.globalCompositeOperation = 'destination-out';
    if (onlyHalf) { g.beginPath(); g.rect(c.half === 'left' ? 0 : this.w / 2, 0, this.w / 2, this.h); g.clip(); }
    g.lineWidth = 3; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); c.points.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.stroke();
    g.restore();
    this.isCut = true; this.cutChanged(); this.touched = true;
    const { labels, pieces } = labelPieces(this.readCutAlpha(), this.w, this.h, Math.round(this.w * this.h * 0.002));
    if (pieces.length <= 1) {
      this.keepPiece(labels, pieces[0]?.id ?? 1);
      this.emit();
      return pieces.length;
    }
    this.choice = { labels, pieces, hover: -1 };
    this.emit();
    return pieces.length;
  }
  pieceAt(face, pt) {
    if (!this.choice) return -1;
    const q = this.toInside(face, pt), x = Math.floor(q.x), y = Math.floor(q.y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return -1;
    return this.choice.labels[y * this.w + x] || -1;
  }
  hoverPiece(id) { if (this.choice && this.choice.hover !== id) { this.choice.hover = id; this.dirty = true; } }
  chooseCutPiece(id) {
    if (!this.choice || id < 1) return false;
    const { labels } = this.choice;
    const removed = this.flatFace('inside', 0);
    this.keepPiece(labels, id);
    // the cut-off piece drops away
    const rg = ctx2d(removed); rg.globalCompositeOperation = 'destination-out'; rg.drawImage(this.cut, 0, 0);
    this.fall = { canvas: removed, t0: performance.now() };
    this.choice = null;
    this.emit();
    return true;
  }
  /** Keep the biggest piece (used when the user walks away from the choice). */
  cancelChoice() {
    if (!this.choice) return;
    const best = this.choice.pieces.reduce((a, b) => (b.area > a.area ? b : a));
    this.chooseCutPiece(best.id);
  }
  keepPiece(labels, id) {
    const img = ctx2d(this.cut).createImageData(this.w, this.h);
    const d = img.data;
    for (let i = 0; i < labels.length; i++) if (labels[i] === id) d[i * 4 + 3] = 255;
    ctx2d(this.cut).putImageData(img, 0, 0);
    this.cutChanged();
  }

  // ---------- rendering ----------
  get animating() {
    return FACES.some((f) => this.faces[f].glitter.length > 0) || !!this.live?.sparkles?.length || !!this.fall || !!this.choice;
  }

  /** What the 3D card shows for a face. */
  render(face, t = 0, rect = null) {
    const F = this.faces[face];
    const g = ctx2d(F.compose);
    const s0 = ctx2d(this.scratch);
    // only the changed rectangle is redrawn
    g.save(); s0.save();
    if (rect) { for (const c of [g, s0]) { c.beginPath(); c.rect(rect.x, rect.y, rect.w, rect.h); c.clip(); } }
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, this.w, this.h);
    g.fillStyle = PAPER_COLOR; g.fillRect(0, 0, this.w, this.h);
    g.drawImage(F.objects, 0, 0);
    const live = this.live && this.live.face === face ? this.live : null;
    if (live && live.tool === 'eraser') {
      const s = ctx2d(this.scratch); s.clearRect(0, 0, this.w, this.h);
      s.drawImage(F.ink, 0, 0);
      s.globalCompositeOperation = 'destination-out'; s.drawImage(this.stroke, 0, 0); s.globalCompositeOperation = 'source-over';
      g.drawImage(this.scratch, 0, 0);
    } else {
      g.drawImage(F.ink, 0, 0);
    }
    if (live && live.tool !== 'eraser') {
      const s = ctx2d(this.scratch); s.clearRect(0, 0, this.w, this.h);
      s.drawImage(this.stroke, 0, 0);
      if (F.hasProtect) { s.globalCompositeOperation = 'destination-out'; s.drawImage(F.protect, 0, 0); s.globalCompositeOperation = 'source-over'; }
      const blend = BLEND[live.tool];
      g.save(); g.globalCompositeOperation = blend.op; g.globalAlpha = blend.alpha * live.opts.opacity; g.drawImage(this.scratch, 0, 0); g.restore();
    }
    if (F.shapes.length) this.paintShapes(g, face, rect);
    if (this.pendingTape && this.pendingTape.face === face) {
      const { S, E, width, pattern } = this.pendingTape;
      if (Math.hypot(E.x - S.x, E.y - S.y) > 2) paintTape(g, tapePolygon(S, E, width), S, Math.atan2(E.y - S.y, E.x - S.x), pattern, 0.97);
    }
    if (this.ghost && this.ghost.face === face) this.paintGhost(g);
    this.paintSparkles(g, t, F.glitter);
    if (live?.sparkles?.length) this.paintSparkles(g, t, live.sparkles);
    // the line left by folding the sheet in half (shown on screen; exports draw their own)
    this.paintCrease(g, face);
    // the paper's shape (cuts), with a soft shadow along every cut edge so holes are easy to see
    if (this.isCut) {
      this.paintCutShadow(g, face);
      g.globalCompositeOperation = 'destination-in';
      this.drawCutShape(g, face);
      g.globalCompositeOperation = 'source-over';
    }
    if (this.choice) this.paintChoice(g, face, t);
    if (this.selected?.face === face) this.paintHandles(g);
    if (this.cutting) {
      g.save();
      if (face === 'outside') { g.translate(this.w, 0); g.scale(-1, 1); }
      g.strokeStyle = '#3b3b3b'; g.lineWidth = 2.5; g.setLineDash([10, 7]);
      g.beginPath(); this.cutting.points.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.stroke();
      g.restore();
    }
    if (this.fall) {
      const k = (performance.now() - this.fall.t0) / 600;
      if (k >= 1) this.fall = null;
      else {
        g.save(); g.globalAlpha = 1 - k;
        if (face === 'outside') { g.translate(this.w, 0); g.scale(-1, 1); }
        g.drawImage(this.fall.canvas, 0, k * k * 160);
        g.restore();
      }
    }
    g.restore(); s0.restore();
    return F.compose;
  }
  renderAll(t) { this.render('inside', t); this.render('outside', t); this.dirty = false; this.dirtyRects.clear(); }

  /**
   * Re-draws only what changed this frame and returns the faces that were drawn
   * (so only their textures are uploaded to the GPU). Glitter twinkles at ~15 fps.
   */
  frame(t) {
    if (this.live?.stale) { this.live.stale = false; this.rerenderLive(); }
    const snapped = this.checkHold();
    if (snapped) this.onPerfect?.(snapped);
    const drawn = [];
    const now = performance.now();
    const sparkleTick = now - (this._lastSparkle || 0) > 90;
    const everything = this.dirty || !!this.fall || !!this.choice || !!this.cutting;
    for (const f of FACES) {
      const F = this.faces[f];
      let rect = everything ? 'full' : this.dirtyRects.get(f) || null;
      if (sparkleTick && rect !== 'full') {
        const list = this.live?.face === f ? F.glitter.concat(this.live.sparkles) : F.glitter;
        if (list.length) {
          let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
          for (const p of list) { x1 = Math.min(x1, p.x - p.r * 2); y1 = Math.min(y1, p.y - p.r * 2); x2 = Math.max(x2, p.x + p.r * 2); y2 = Math.max(y2, p.y + p.r * 2); }
          rect = unionRect(rect, { x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
        }
      }
      if (!rect) continue;
      const r = rect === 'full' ? null : clampRect({ x: rect.x - 2, y: rect.y - 2, w: rect.w + 4, h: rect.h + 4 }, this.w, this.h);
      if (rect !== 'full' && !r) continue;
      this.render(f, t, r);
      drawn.push({ face: f, rect: r });
    }
    if (sparkleTick) this._lastSparkle = now;
    this.dirty = false;
    this.dirtyRects.clear();
    return drawn;
  }

  /**
   * Shadows for cuts (built once per cut):
   *  - edge: a soft dark rim on the paper along every cut edge, so holes and trimmed edges stand out;
   *  - under: when the card is folded shut, the cover casts a shadow into the hole onto the page below
   *    (seen through the hole, it is the inside of the other half – the hole mirrored across the fold).
   */
  cutShadows() {
    if (this._cutShadow) return this._cutShadow;
    const W = this.w, H = this.h;
    const hole = makeCanvas(W, H), hg = ctx2d(hole);
    hg.fillStyle = '#000'; hg.fillRect(0, 0, W, H);
    hg.globalCompositeOperation = 'destination-out'; hg.drawImage(this.cut, 0, 0);

    const edge = makeCanvas(W, H), eg = ctx2d(edge);
    eg.filter = 'blur(16px)'; eg.globalAlpha = 0.55; eg.drawImage(hole, 4, 6);
    eg.filter = 'blur(4px)'; eg.globalAlpha = 0.75; eg.drawImage(hole, 1, 2);
    eg.filter = 'none';

    const under = makeCanvas(W, H), ug = ctx2d(under);
    ug.save(); ug.translate(W, 0); ug.scale(-1, 1);
    ug.filter = 'blur(18px)'; ug.globalAlpha = 0.85; ug.drawImage(this.cut, -8, 8); // the cover's paper, blurred
    ug.filter = 'none'; ug.globalAlpha = 1;
    ug.globalCompositeOperation = 'destination-in'; ug.drawImage(hole, 0, 0); // only inside the hole
    ug.restore();

    this._cutShadow = { edge, under };
    return this._cutShadow;
  }
  paintCutShadow(g, face) {
    const { edge, under } = this.cutShadows();
    g.save();
    g.globalCompositeOperation = 'source-over';
    if (face === 'inside' && this.layered) g.drawImage(under, 0, 0);
    if (face === 'outside') { g.translate(this.w, 0); g.scale(-1, 1); }
    g.drawImage(edge, 0, 0);
    g.restore();
  }

  paintCrease(g, face) {
    const x = this.w / 2;
    const gr = g.createLinearGradient(x - 14, 0, x + 14, 0);
    if (face === 'inside') { // valley fold: a soft shadow
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.45, 'rgba(60,45,20,.10)'); gr.addColorStop(0.5, 'rgba(60,45,20,.22)');
      gr.addColorStop(0.55, 'rgba(60,45,20,.10)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    } else { // mountain fold: light on one side, shade on the other
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.42, 'rgba(255,255,255,.35)'); gr.addColorStop(0.5, 'rgba(60,45,20,.18)');
      gr.addColorStop(0.6, 'rgba(60,45,20,.06)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    }
    g.fillStyle = gr; g.fillRect(x - 14, 0, 28, this.h);
  }

  paintChoice(g, face, t) {
    const { labels, pieces, hover } = this.choice;
    if (!this._choiceTint || this._choiceTint.key !== hover) {
      const c = makeCanvas(this.w, this.h);
      const img = ctx2d(c).createImageData(this.w, this.h), d = img.data;
      for (let i = 0; i < labels.length; i++) {
        const l = labels[i];
        if (!l) continue;
        if (l === hover) { d[i * 4] = 42; d[i * 4 + 1] = 157; d[i * 4 + 2] = 143; d[i * 4 + 3] = 70; }
        else { d[i * 4] = 60; d[i * 4 + 1] = 40; d[i * 4 + 2] = 0; d[i * 4 + 3] = 40; }
      }
      ctx2d(c).putImageData(img, 0, 0);
      this._choiceTint = { key: hover, canvas: c };
    }
    g.save();
    if (face === 'outside') { g.translate(this.w, 0); g.scale(-1, 1); }
    g.globalAlpha = 0.75 + 0.25 * Math.sin(t * 4);
    g.drawImage(this._choiceTint.canvas, 0, 0);
    g.restore();
    void pieces;
  }

  paintSparkles(g, t, list) {
    for (const s of list) {
      const a = 0.5 + 0.5 * Math.sin(t * s.speed + s.phase);
      if (a > 0.55) drawSparkle(g, s.x, s.y, s.r * (0.6 + a * 0.5), (a - 0.55) / 0.45);
    }
  }

  paintGhost(g) {
    const gh = this.ghost;
    if (gh.kind === 'sticker') {
      g.save(); g.globalAlpha = 0.75; g.translate(gh.x, gh.y); g.rotate(gh.rot);
      g.drawImage(stickerCanvas(gh.id), -gh.size / 2, -gh.size / 2, gh.size, gh.size); g.restore();
    } else if (gh.kind === 'text') {
      const box = placeTextBox(gh.spec, gh.x, gh.y, this.w, this.h);
      paintText(g, gh.spec, box.x, box.y, box.scale);
      g.save(); g.strokeStyle = 'rgba(42,157,143,.8)'; g.lineWidth = 2; g.setLineDash([8, 6]);
      g.strokeRect(box.x - box.w / 2, box.y - box.h / 2, box.w, box.h); g.restore();
    } else if (gh.kind === 'shape') {
      g.save(); g.globalAlpha = 0.6; drawShape(g, gh.shape); g.restore();
    } else if (gh.kind === 'tapecut') {
      g.save(); g.strokeStyle = '#e63946'; g.lineWidth = 2.5; g.setLineDash([10, 8]);
      g.beginPath(); g.moveTo(gh.A.x, gh.A.y); g.lineTo(gh.B.x, gh.B.y); g.stroke(); g.restore();
    } else if (gh.kind === 'eraser') {
      g.save(); g.strokeStyle = 'rgba(60,60,60,.7)'; g.lineWidth = 1.5; g.setLineDash([4, 4]);
      g.beginPath(); g.arc(gh.x, gh.y, gh.size / 2, 0, Math.PI * 2); g.stroke(); g.restore();
    }
  }

  /** The finished face: paper + objects + ink, transparent where the card was cut away. */
  flatFace(face, t = 0) {
    const F = this.faces[face];
    const c = makeCanvas(this.w, this.h);
    const g = ctx2d(c);
    g.fillStyle = PAPER_COLOR; g.fillRect(0, 0, this.w, this.h);
    g.drawImage(F.objects, 0, 0);
    g.drawImage(F.ink, 0, 0);
    if (F.shapes.length) this.paintShapes(g, face);
    this.paintSparkles(g, t, F.glitter);
    if (this.isCut) { this.paintCutShadow(g, face); g.globalCompositeOperation = 'destination-in'; this.drawCutShape(g, face); }
    return c;
  }
  flat(t = 0) { return this.flatFace('inside', t); }

  /** Colour on the card at a point (colour picker). Null when there is no paper there. */
  sampleColor(face, p) {
    if (!this.isOnPaper(face, p)) return null;
    const c = this.flatFace(face, 0);
    const d = ctx2d(c).getImageData(Math.floor(p.x), Math.floor(p.y), 1, 1).data;
    return '#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Paint bucket. Fills the area around p (same colour, up to `tolerance`) with `color`, inside the half of
   * the sheet that was clicked (the fold always separates the two halves; a closed card shows one half),
   * never over stickers and never outside the paper. The fill goes on the ink layer BEHIND existing ink,
   * so lines stay crisp on top and the eraser can remove the fill. The clicked area itself is painted on top,
   * so the bucket can re-colour an area it filled before, any number of times. Returns false if nothing was filled.
   */
  fill(face, p, color, { opacity = 1, tolerance = 24 } = {}) {
    if (!this.isOnPaper(face, p)) return false;
    const F = this.faces[face];
    const W = this.w, H = this.h;
    const half = p.x < W / 2 ? [0, Math.floor(W / 2)] : [Math.floor(W / 2), W];
    const rgba = ctx2d(this.flatFace(face, 0)).getImageData(0, 0, W, H).data;
    let blocked = null;
    if (F.hasProtect) {
      const pr = ctx2d(F.protect).getImageData(0, 0, W, H).data;
      blocked = new Uint8Array(W * H);
      for (let i = 0; i < blocked.length; i++) blocked[i] = pr[i * 4 + 3] > 20 ? 1 : 0;
    }
    const region = floodRegion(rgba, W, H, p.x, p.y, { x0: half[0], x1: half[1], tolerance, blocked });
    if (!region) return false;
    const allowed = new Uint8Array(W * H);
    for (let i = 0; i < allowed.length; i++) allowed[i] = rgba[i * 4 + 3] >= 128 && !(blocked && blocked[i]) ? 1 : 0;
    const mask = growMask(region, W, H, 2, { x0: half[0], x1: half[1], allowed });
    // the changed rectangle (for undo)
    let x1 = W, y1 = H, x2 = -1, y2 = -1;
    for (let i = 0; i < mask.length; i++) if (mask[i]) { const x = i % W, y = (i / W) | 0; if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y; }
    if (x2 < 0) return false;
    this.record(face, { x: x1, y: y1, w: x2 - x1 + 1, h: y2 - y1 + 1 });
    this.touched = true;
    // The clicked area itself is painted ON TOP (so filling an already filled area changes its colour);
    // only the thin rim grown under the soft edges of lines goes BEHIND the ink, so lines stay crisp.
    const n = parseInt(color.replace('#', ''), 16);
    const R = (n >> 16) & 255, G = (n >> 8) & 255, B = n & 255;
    const paintMask = (keep) => {
      const img = ctx2d(this.scratch).createImageData(W, H), d = img.data;
      for (let i = 0; i < mask.length; i++) {
        if (!keep(i)) continue;
        d[i * 4] = R; d[i * 4 + 1] = G; d[i * 4 + 2] = B; d[i * 4 + 3] = 255;
      }
      const sc = ctx2d(this.scratch);
      sc.clearRect(0, 0, W, H);
      sc.putImageData(img, 0, 0);
      return this.scratch;
    };
    const g = ctx2d(F.ink);
    g.save(); g.globalAlpha = opacity;
    g.globalCompositeOperation = 'destination-over';
    g.drawImage(paintMask((i) => mask[i] && !region[i]), 0, 0); // rim: behind the lines
    g.globalCompositeOperation = 'source-over';
    g.drawImage(paintMask((i) => region[i]), 0, 0); // the area: on top of any earlier fill
    g.restore();
    F.used = true;
    this.emit();
    return true;
  }

  // ---------- save / load ----------
  serialize() {
    const png = (c) => c.toDataURL('image/png');
    const layers = {};
    for (const id of FACES) {
      const F = this.faces[id];
      if (!F.used) continue;
      const k = id === 'inside' ? 'in' : 'out';
      layers[k + 'Objects'] = png(F.objects);
      layers[k + 'Ink'] = png(F.ink);
      if (F.hasProtect) layers[k + 'Protect'] = png(F.protect);
    }
    if (this.isCut) layers.cut = png(this.cut);
    const shapes = FACES.flatMap((f) => this.faces[f].shapes.map((x) => ({ ...cleanShape(x), face: f })));
    return { image: png(this.flatFace('inside')), layers, texts: this.texts, shapes };
  }
  thumbnail(maxW = 360) {
    const f = this.flatFace('inside', 0.3);
    const c = makeCanvas(maxW, Math.round((maxW * this.h) / this.w));
    const g = ctx2d(c);
    g.fillStyle = '#efe8d6'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(f, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.82);
  }
  async load(design) {
    const loadImg = (u) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = u; });
    this.cancelLive(); this.choice = null;
    this.history = []; this.historyBytes = 0;
    const L = design.layers || {};
    const put = async (canvas, url) => {
      const g = ctx2d(canvas); g.clearRect(0, 0, this.w, this.h);
      if (url) g.drawImage(await loadImg(url), 0, 0, this.w, this.h);
    };
    for (const id of FACES) {
      const F = this.faces[id], k = id === 'inside' ? 'in' : 'out';
      await put(F.objects, L[k + 'Objects'] || (id === 'inside' && !design.layers ? design.image : null));
      await put(F.ink, L[k + 'Ink']);
      await put(F.protect, L[k + 'Protect'] || (id === 'inside' ? design.mask : null));
      F.hasProtect = !!(L[k + 'Protect'] || (id === 'inside' && design.mask));
      F.used = !!(L[k + 'Objects'] || L[k + 'Ink'] || (id === 'inside' && design.image));
      F.glitter = []; F.texts = [];
      F.shapes = (design.shapes || []).filter((x) => x.face === id).map(cleanShape);
      if (F.shapes.length) F.used = true;
    }
    this.selected = null;
    this.faces.inside.texts = (design.texts || []).slice();
    const g = ctx2d(this.cut);
    if (L.cut) { g.clearRect(0, 0, this.w, this.h); g.drawImage(await loadImg(L.cut), 0, 0, this.w, this.h); this.isCut = true; }
    else { g.fillStyle = '#000'; g.fillRect(0, 0, this.w, this.h); this.isCut = false; }
    this.cutChanged();
    this.touched = true;
    this.emit();
  }
}
