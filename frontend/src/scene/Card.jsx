import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../store.js';
import { cardDims, DRAW_TOOLS } from '../config.js';
import { cutTapeStrip, pointInPolygon } from '../engine/geometry.js';
import { tapePatternById, tapePolygon } from '../engine/paper.js';
import { containsProfanity } from '../moderation.js';
import { movePointer, pointer } from './pointer.js';
import { paperBumpTexture } from './textures.js';
import { inZoomedView, startZoomPan } from './zoom.js';
import { boxFromDrag, defaultBox, resizeShape, rotateShape } from '../engine/shapeLibrary.js';

const FOLD = 0.03; // radians each half is raised, so the card looks folded open
const HELD_POS = new THREE.Vector3(0, 0.3, 2.3);
const FLAT_POS = new THREE.Vector3(0, 0, 0.03);
const Z = new THREE.Vector3(0, 0, 1);
const X = new THREE.Vector3(1, 0, 0);
const DEG = Math.PI / 180;

const st = () => useStore.getState();
let seedCounter = (Date.now() % 100000) | 0;

// The four card surfaces (inside/outside × left/right half) – used to place things in world space.
export const cardMeshes = {};

/** Orientation of the card from the three turning angles. */
export function cardQuaternion({ v, l, d }, dims) {
  const diag = new THREE.Vector3(dims.worldW, dims.worldH, 0).normalize();
  return new THREE.Quaternion().setFromAxisAngle(Z, v * DEG)
    .multiply(new THREE.Quaternion().setFromAxisAngle(X, l * DEG))
    .multiply(new THREE.Quaternion().setFromAxisAngle(diag, d * DEG));
}

/** World position of a point on a face, in canvas pixels. */
export function canvasToWorld(face, x, y) {
  const paper = st().paper;
  const u = x / paper.w;
  let mesh, uvx;
  if (face === 'inside') { if (u < 0.5) { mesh = cardMeshes['inside-left']; uvx = u * 2; } else { mesh = cardMeshes['inside-right']; uvx = (u - 0.5) * 2; } }
  else if (u >= 0.5) { mesh = cardMeshes['outside-left']; uvx = (u - 0.5) * 2; } else { mesh = cardMeshes['outside-right']; uvx = u * 2; }
  if (!mesh) return new THREE.Vector3();
  const { width, height } = mesh.geometry.parameters;
  return mesh.localToWorld(new THREE.Vector3((uvx - 0.5) * width, (0.5 - y / paper.h) * height, 0.01));
}

/**
 * A point on the desk (from a pointer ray) in canvas pixels of a face, measured in the plane of the
 * half of the card that holds the pulled-out tape. Points off the card give coordinates outside the
 * canvas – that is fine for cutting tape: the scissors may start and finish on the desk.
 */
function rayToCanvas(face, sx, ray) {
  const paper = st().paper;
  const half = face === 'inside' ? (sx < paper.w / 2 ? 'left' : 'right') : sx >= paper.w / 2 ? 'left' : 'right';
  const mesh = cardMeshes[`${face}-${half}`];
  if (!mesh) return null;
  const n = new THREE.Vector3(0, 0, 1).applyQuaternion(mesh.getWorldQuaternion(new THREE.Quaternion()));
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, mesh.getWorldPosition(new THREE.Vector3()));
  const hit = ray.intersectPlane(plane, new THREE.Vector3());
  if (!hit) return null;
  const local = mesh.worldToLocal(hit);
  const { width, height } = mesh.geometry.parameters;
  const offset = (face === 'inside') === (half === 'left') ? 0 : 0.5;
  return { x: (offset + (local.x / width + 0.5) * 0.5) * paper.w, y: (0.5 - local.y / height) * paper.h };
}

/**
 * Cutting the card's edges: the scissors' path over the desk is kept too, so a cut that leaves the
 * card and comes back follows the hand instead of jumping straight across.
 */
let deskRays = [];
export function cardCutOnDesk(kind, ray) {
  const s = st(), paper = s.paper;
  if (s.tool !== 'scissors' || paper.pendingTape || paper.choice) return;
  if (kind === 'down') { deskRays = [ray.clone()]; return; }
  if (!pointer.down) return;
  const c = paper.cutting;
  if (c?.anchor) {
    const p = rayToCanvas(c.anchor.face, c.anchor.x, ray);
    if (p) paper.addCutPoint(c.anchor.face, p);
  } else if (deskRays.length < 500) deskRays.push(ray.clone());
}
/** Starts a card cut at a point on a face, adding the path already drawn over the desk in front of it. */
function startCardCut(face, pt) {
  const paper = st().paper;
  const before = pointer.down ? deskRays.map((r) => rayToCanvas(face, pt.x, r)).filter(Boolean) : [];
  deskRays = [];
  paper.beginCut(face, before[0] || pt);
  for (const p of before.slice(1)) paper.addCutPoint(face, p);
  paper.addCutPoint(face, pt);
  paper.cutting.anchor = { face, x: pt.x };
  pointer.drawing = true;
}

/** Cutting pulled-out tape with the scissors from the desk (outside the card). */
export function tapeCutOnDesk(kind, ray) {
  const s = st(), paper = s.paper, pt = paper.pendingTape;
  if (s.tool !== 'scissors' || !pt) return false;
  const p = rayToCanvas(pt.face, pt.S.x, ray);
  if (!p) return false;
  if (kind === 'down') {
    pointer.cutStart = p;
    paper.setGhost({ kind: 'tapecut', face: pt.face, A: p, B: p });
    pointer.drawing = true;
  } else if (kind === 'move' && pointer.drawing && paper.ghost?.kind === 'tapecut') {
    paper.setGhost({ ...paper.ghost, B: p });
  }
  return true;
}

// ---------------------------------------------------------------- tool handling
function finishTapeCut() {
  const s = st(), paper = s.paper;
  const g = paper.ghost;
  paper.setGhost(null);
  const pt = paper.pendingTape;
  if (!g || !pt || Math.hypot(g.B.x - g.A.x, g.B.y - g.A.y) < 12) return;
  // a snip that never touched the tape (only the desk) simply does nothing
  const strip = tapePolygon(pt.S, pt.E, pt.width);
  const touched = Array.from({ length: 81 }, (_, i) => ({ x: g.A.x + ((g.B.x - g.A.x) * i) / 80, y: g.A.y + ((g.B.y - g.A.y) * i) / 80 }))
    .some((q) => pointInPolygon(q, strip));
  pointer.snipUntil = performance.now() + 700;
  if (!touched) return;
  // a snip into the tape cuts it straight across along that line, even if it stopped short of the far side
  // (tape lying at the very edge of the card can always be cut)
  const poly = cutTapeStrip(pt.S, pt.E, pt.width, g.A, g.B) || cutTapeStrip(pt.S, pt.E, pt.width, g.A, g.B, { mustSpan: false });
  if (!poly) { s.showToast('Cut across the tape, not along it.', 'error'); return; }
  paper.placeTape(pt.face, poly, pt.S, Math.atan2(pt.E.y - pt.S.y, pt.E.x - pt.S.x), pt.pattern);
  s.markDirty();
  useStore.setState({ tool: 'tape', sameJob: true }); // the scissors go back, the roll goes back
}

// ---------------------------------------------------------------- shapes tool
// Choose a shape in the panel, then click the card (or drag a box on it, or drag the shape from the panel
// onto the card). The new shape is selected: drag it to move it, the square handles to make it bigger or
// smaller (Shift keeps the proportions), the round handle to rotate it (Shift: 15° steps). Click beside it
// to finish; click it again later to change it. Outlines only – colour them in with the bucket or the pens.
const DEFAULT_SHAPE_PX = 260;
const SHAPE_CURSOR = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', rotate: 'grab', move: 'move' };
if (typeof window !== 'undefined') {
  for (const t of ['pointerdown', 'pointermove']) window.addEventListener(t, (e) => { pointer.shift = e.shiftKey; }, { capture: true, passive: true });
}
const shapeStyle = (s) => ({ kind: s.toolSettings.shapes.kind, color: s.color, width: s.toolSettings.shapes.width });
const shapeGhostAt = (s, face, pt) => ({ kind: 'shape', face, shape: { ...shapeStyle(s), ...defaultBox(s.toolSettings.shapes.kind, pt.x, pt.y, DEFAULT_SHAPE_PX) } });

function shapeDown(face, pt) {
  const s = st(), paper = s.paper;
  const h = paper.shapeHandleAt(face, pt);
  if (h) {
    const sh = paper.selectedShape();
    pointer.shapeEdit = { face, id: sh.id, h, s0: { ...sh }, p0: pt, moved: false };
    paper.setGhost(null);
    return;
  }
  const hit = paper.shapeAt(face, pt);
  if (hit) {
    paper.selectShape(face, hit.id);
    pointer.shapeEdit = { face, id: hit.id, h: 'move', s0: { ...hit }, p0: pt, moved: false };
    paper.setGhost(null);
    return;
  }
  if (paper.selected) { paper.selectShape(null); paper.setGhost(shapeGhostAt(s, face, pt)); return; } // a click beside it: done editing
  if (!paper.isOnPaper(face, pt)) return;
  pointer.shapeCreate = { face, a: pt, dragging: false };
}

function shapeMove(face, pt) {
  const s = st(), paper = s.paper;
  const e = pointer.shapeEdit;
  if (e) {
    if (e.face !== face) return;
    if (!e.moved && Math.hypot(pt.x - e.p0.x, pt.y - e.p0.y) < 2 * paper.handlePx) return;
    let next;
    if (e.h === 'move') next = { x: e.s0.x + pt.x - e.p0.x, y: e.s0.y + pt.y - e.p0.y };
    else if (e.h === 'rotate') next = rotateShape(e.s0, pt, { snap: pointer.shift });
    else next = resizeShape(e.s0, e.h, pt, { keepRatio: pointer.shift });
    paper.updateShape(face, e.id, next, { undo: !e.moved, quiet: true }); // one undo step per drag
    e.moved = true;
    document.body.style.cursor = e.h === 'rotate' ? 'grabbing' : SHAPE_CURSOR[e.h];
    return;
  }
  const c = pointer.shapeCreate;
  if (c) {
    if (c.face !== face) return;
    if (!c.dragging && Math.hypot(pt.x - c.a.x, pt.y - c.a.y) < 4 * paper.handlePx) return;
    c.dragging = true;
    paper.setGhost({ kind: 'shape', face, shape: { ...shapeStyle(s), ...boxFromDrag(s.toolSettings.shapes.kind, c.a, pt, { keepRatio: pointer.shift }) } });
    return;
  }
  // hovering: the cursor shows what pressing would do; with nothing selected the shape follows the pointer
  const h = paper.shapeHandleAt(face, pt) || (paper.shapeAt(face, pt) ? 'move' : null);
  document.body.style.cursor = h ? SHAPE_CURSOR[h] : '';
  useStore.setState({ hover: h === 'rotate' ? 'Drag to rotate (Shift: 15° steps)' : h === 'move' ? (paper.selected ? 'Drag to move the shape' : 'Click to change this shape') : h ? 'Drag to make it bigger or smaller (Shift keeps the proportions)' : null });
  if (pointer.shapeFromPanel || (!h && !paper.selected)) paper.setGhost(shapeGhostAt(s, face, pt));
  else if (paper.ghost) paper.setGhost(null);
}

function shapeUp() {
  const s = st(), paper = s.paper;
  const e = pointer.shapeEdit;
  if (e) {
    pointer.shapeEdit = null;
    if (e.moved) { paper.emit(); s.markDirty(); }
    return;
  }
  const c = pointer.shapeCreate;
  if (c) {
    pointer.shapeCreate = null;
    const shape = c.dragging && paper.ghost?.kind === 'shape' ? paper.ghost.shape : shapeGhostAt(s, c.face, c.a).shape;
    paper.setGhost(null);
    paper.addShape(c.face, shape);
    pointer.placedAt = performance.now();
    s.markDirty();
    return;
  }
  if (pointer.shapeFromPanel) { // dragged from the panel and let go over the card
    pointer.shapeFromPanel = false;
    const gh = paper.ghost;
    if (gh?.kind === 'shape' && pointer.onCard) { paper.setGhost(null); paper.addShape(gh.face, gh.shape); s.markDirty(); }
  }
}

function handleDown(face, pt) {
  const s = st(), paper = s.paper, tool = s.tool;
  if (paper.choice) { if (paper.chooseCutPiece(paper.pieceAt(face, pt))) s.markDirty(); return; }
  if (!tool) return;
  if (tool === 'scissors' && !paper.pendingTape) { deskRays = []; startCardCut(face, pt); return; }
  if (tool === 'shapes') { shapeDown(face, pt); return; }
  if (!paper.isOnPaper(face, pt)) return;
  if (DRAW_TOOLS[tool] || tool === 'eraser') {
    const t = s.toolSettings[tool];
    paper.beginStroke(face, tool, pt, {
      size: t.size, opacity: (t.opacity ?? 100) / 100, straight: t.straight ?? 50, color: s.color, seed: ++seedCounter,
      pattern: t.pattern, spacing: t.spacing, rainbow: t.rainbow, // pattern pen only
    });
    pointer.drawing = true;
  } else if (tool === 'bucket') {
    const t = s.toolSettings.bucket;
    if (paper.fill(face, pt, s.color, { opacity: t.opacity / 100, tolerance: t.tolerance })) {
      pointer.placedAt = performance.now(); // the bucket tips a little more: pouring
      s.markDirty();
    }
  } else if (tool === 'picker') {
    const c = paper.sampleColor(face, pt);
    if (c) { s.setColor(c); s.showToast(`Colour ${c} picked – it is now on your tools.`, 'success'); }
    useStore.setState({ tool: s.prevTool && s.prevTool !== 'picker' ? s.prevTool : null, prevTool: null });
  } else if (tool === 'tape') {
    paper.setPendingTape({ face, S: pt, E: pt, width: s.tapeWidth, pattern: tapePatternById(s.tapePattern) });
    pointer.drawing = true; pointer.pulling = true; pointer.travel = 0;
  } else if (tool === 'scissors') {
    if (paper.pendingTape.face !== face) return;
    pointer.cutStart = pt;
    paper.setGhost({ kind: 'tapecut', face, A: pt, B: pt });
    pointer.drawing = true;
  } else if (tool === 'sticker') {
    paper.placeSticker(face, s.stickerId, pt.x, pt.y, s.stickerSize, (s.stickerRot * Math.PI) / 180);
    pointer.placedAt = performance.now();
    s.markDirty();
  } else if (tool === 'text') {
    const spec = { ...s.textSpec, color: s.color };
    if (!spec.text.trim()) return;
    if (containsProfanity(spec.text)) { s.showToast('That text contains words that are not allowed on cards.', 'error'); return; }
    if (paper.placeText(face, spec, pt.x, pt.y)) { pointer.placedAt = performance.now(); s.markDirty(); }
  }
}

function handleMove(face, pt) {
  const s = st(), paper = s.paper, tool = s.tool;
  if (paper.choice) { paper.hoverPiece(paper.pieceAt(face, pt)); return; }
  if (!tool) return;
  if (tool === 'scissors' && !paper.pendingTape) {
    if (paper.cutting) paper.addCutPoint(face, pt);
    else if (pointer.down) startCardCut(face, pt); // came in from the desk
    return;
  }
  if (tool === 'shapes') { shapeMove(face, pt); return; }
  const on = paper.isOnPaper(face, pt);
  if (!on) { handleLeave(); return; }
  if (DRAW_TOOLS[tool] || tool === 'eraser') {
    if (paper.live) paper.addPoint(pt);
    else if (pointer.down) handleDown(face, pt); // re-entered the card with the button held
    if (tool === 'eraser') paper.setGhost({ kind: 'eraser', face, x: pt.x, y: pt.y, size: s.toolSettings.eraser.size });
  } else if (tool === 'tape') {
    if (pointer.pulling && paper.pendingTape?.face === face) paper.setPendingTape({ ...paper.pendingTape, E: pt });
  } else if (tool === 'scissors') {
    if (pointer.drawing) paper.setGhost({ kind: 'tapecut', face, A: pointer.cutStart, B: pt });
  } else if (tool === 'sticker') {
    paper.setGhost({ kind: 'sticker', face, id: s.stickerId, x: pt.x, y: pt.y, size: s.stickerSize, rot: (s.stickerRot * Math.PI) / 180 });
  } else if (tool === 'text') {
    paper.setGhost({ kind: 'text', face, spec: { ...s.textSpec, color: s.color }, x: pt.x, y: pt.y });
    pointer.textGhost = { face, x: pt.x, y: pt.y };
  }
}

function handleLeave() {
  const s = st(), paper = s.paper;
  if (paper.live) { paper.endStroke(); s.markDirty(); }
  if (paper.ghost && paper.ghost.kind !== 'tapecut' && !pointer.shapeCreate) paper.setGhost(null);
  pointer.textGhost = null;
  if (paper.choice) paper.hoverPiece(-1);
}

function handleUp() {
  const s = st(), paper = s.paper, tool = s.tool;
  const wasDrawing = pointer.drawing;
  pointer.drawing = false;
  pointer.pulling = false;
  if (!tool) return;
  if (tool === 'shapes') { shapeUp(); return; }
  if (DRAW_TOOLS[tool] || tool === 'eraser') {
    if (paper.live) { paper.endStroke(); s.markDirty(); }
  } else if (tool === 'tape' && wasDrawing && paper.pendingTape) {
    const { S, E, face } = paper.pendingTape;
    if (Math.hypot(E.x - S.x, E.y - S.y) < 30) { paper.setPendingTape(null); return; }
    // the roll stays at the end of the tape until the piece is cut
    const a = canvasToWorld(face, S.x, S.y), b = canvasToWorld(face, E.x, E.y);
    pointer.tapeEnd = b; pointer.tapeDir = b.clone().sub(a).normalize();
    useStore.setState({ tool: 'scissors', sameJob: true });
    s.showToast('Now drag the scissors across the tape to cut it.');
  } else if (tool === 'scissors' && paper.pendingTape && wasDrawing) {
    finishTapeCut();
  } else if (tool === 'scissors' && paper.cutting) {
    pointer.snipUntil = performance.now() + 700;
    // a folded card: only the layer being cut is cut, never the half underneath
    const n = paper.finishCut({ onlyHalf: Math.abs(Math.abs(fold.cur[0]) - Math.abs(fold.cur[1])) > 0.98 });
    if (n > 0) s.markDirty();
    if (n > 1) s.showToast('The card is in pieces – click the piece you want to keep.');
  }
}

// ---------------------------------------------------------------- picking up, opening and turning the card
let rotateDrag = null;
let coverDrag = null;

/*
 * Opening and closing. Each half of the sheet has a fold amount a (in half-turns):
 *   0 = lying flat in its own place, +1 = flipped over the fold through the inside's side (+z),
 *   -1 = flipped over through the outside's side (-z).
 * Closed card = exactly one half flipped (it lies on top of / under the other half).
 * Open card = both flat, or both flipped (the open sheet turned over).
 * A turn always moves the layer of paper nearest to the viewer, towards the viewer, so the card
 * opens and closes the same way from the front, from the back and in any rotation.
 */
export const fold = { cur: [1, 0], drag: null };
const view = { side: 1, screenX: 1 }; // which side of the card faces the camera; card +x on screen

const isFlipped = (a) => Math.abs(a) > 0.5;
/** Region (+1 = card's +x side, -1 = -x side) where a half lies. */
const regionOf = (i, a) => (i === 0 ? (isFlipped(a) ? 1 : -1) : isFlipped(a) ? -1 : 1);
export const cardIsOpen = (a) => isFlipped(a[0]) === isFlipped(a[1]);

/** Plan turning paper towards `toward` (+1/-1 along the card's x). Returns { i, from, to } or null. */
function planTurn(a, toward, s) {
  const region = -toward;
  const inR = [0, 1].filter((i) => regionOf(i, a[i]) === region);
  if (!inR.length) return null;
  let i;
  if (inR.length === 1) i = inR[0];
  else {
    const f = inR.find((j) => isFlipped(a[j])), b = inR.find((j) => !isFlipped(a[j]));
    i = Math.sign(a[f]) === s ? f : b; // the layer nearest to the viewer
  }
  let from = a[i], to;
  if (!isFlipped(from)) to = s; // fold it over towards the viewer
  else {
    if (inR.length === 1) from = s; // nothing under it: it can swing back on the viewer's side
    to = 0;
  }
  return { i, from, to };
}
function planAny(a, toward, s) { return planTurn(a, toward, s) || planTurn(a, -toward, s); }

function applyTurn(plan) {
  if (!plan) return;
  fold.cur[plan.i] = plan.from; // equivalent position, so this never jumps
  const halves = st().halves.slice();
  halves[plan.i] = plan.to;
  useStore.setState({ halves });
}
/** Button / O key: open a closed card, or close an open one towards `screenDir` (-1 = left, +1 = right on screen). */
export function turnCardPage(screenDir = -1) {
  const a = st().halves;
  applyTurn(planAny(a, screenDir * view.screenX, view.side));
}

function onCardDownNoTool(e) {
  const s = st();
  if (s.cardHeld) { rotateDrag = { x: e.clientX, y: e.clientY, moved: false }; return; }
  // not held: a drag sideways turns a page (opens/closes), a plain click picks the card up
  coverDrag = { x0: e.clientX, y0: e.clientY, active: false, plan: null };
}

function snapFlat() {
  const s = st();
  const q = cardQuaternion(s.angles, cardDims(s.cardSize));
  const n = Z.clone().applyQuaternion(q);
  const xa = X.clone().applyQuaternion(q);
  const phi = Math.atan2(xa.y, xa.x) / DEG;
  const near = (target, cur) => target + 360 * Math.round((cur - target) / 360);
  const faceUp = n.z >= 0;
  useStore.setState({
    angles: { v: near(phi, s.angles.v), l: near(faceUp ? 0 : 180, s.angles.l), d: near(0, s.angles.d) },
    cardHeld: false,
  });
}
export { snapFlat as putCardDown };

// ---------------------------------------------------------------- fast texture updates
const crop = document.createElement('canvas');
/**
 * Uploads only the changed rectangle of a card face to the GPU (a whole face is ~6 MB, a stroke's
 * area is usually a few KB). Returns false when the texture isn't on the GPU yet (then a full upload is used).
 */
function uploadRegion(renderer, tex, canvas, r) {
  const props = renderer.properties.get(tex);
  if (!props.__webglTexture || tex.version === 0 || props.__version !== tex.version) return false;
  const gl = renderer.getContext();
  if (crop.width !== r.w || crop.height !== r.h) { crop.width = r.w; crop.height = r.h; }
  const c = crop.getContext('2d');
  c.clearRect(0, 0, r.w, r.h);
  c.drawImage(canvas, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
  renderer.state.activeTexture(gl.TEXTURE0);
  renderer.state.bindTexture(gl.TEXTURE_2D, props.__webglTexture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, r.x, canvas.height - r.y - r.h, gl.RGBA, gl.UNSIGNED_BYTE, crop);
  if (tex.generateMipmaps) gl.generateMipmap(gl.TEXTURE_2D);
  return true;
}

// ---------------------------------------------------------------- the card
export function Card() {
  const paper = useStore((s) => s.paper);
  const cardSize = useStore((s) => s.cardSize);
  const tool = useStore((s) => s.tool);
  const [epoch, setEpoch] = useState(paper.epoch);
  useEffect(() => paper.onChange(() => setEpoch(paper.epoch)), [paper]);
  // "hold to perfect": tell the user which shape their drawing became
  useEffect(() => {
    paper.onPerfect = (shape) => useStore.getState().showToast(`Perfect ${shape.label}! Keep drawing to undo the snap, or lift the tool to keep it.`);
    return () => { paper.onPerfect = null; };
  }, [paper]);
  // putting the shapes tool away finishes editing the selected shape
  useEffect(() => { if (tool !== 'shapes' && paper.selected) paper.selectShape(null); }, [tool, paper]);
  const d = cardDims(cardSize);
  const group = useRef();
  const halfW = d.worldW / 2;
  const bump = useMemo(() => paperBumpTexture(), []);

  // One texture per face (each face is uploaded to the GPU only when it changed).
  const faceTex = useMemo(() => {
    const make = (canvas) => {
      const t = new THREE.CanvasTexture(canvas);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      return t;
    };
    return { inside: make(paper.faces.inside.compose), outside: make(paper.faces.outside.compose) };
  }, [paper, epoch]); // eslint-disable-line react-hooks/exhaustive-deps
  // [inside-left, inside-right, outside-left, outside-right]
  const textures = [faceTex.inside, faceTex.inside, faceTex.outside, faceTex.outside];
  // each half shows half of its face's texture: remap the plane's u coordinates
  const halfGeos = useMemo(() => [0, 0.5, 0.5, 0].map((offset) => {
    const g = new THREE.PlaneGeometry(halfW, d.worldH);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, offset + uv.getX(i) * 0.5);
    return g;
  }), [halfW, d.worldH]);
  const depthMats = useMemo(() => {
    const m = (map) => new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.5 });
    const i = m(faceTex.inside), o = m(faceTex.outside);
    return [i, i, o, o];
  }, [faceTex]);
  useEffect(() => () => { faceTex.inside.dispose(); faceTex.outside.dispose(); }, [faceTex]);
  useEffect(() => { paper.dirty = true; }, [faceTex, paper]);

  useEffect(() => {
    const up = (e) => {
      pointer.down = false;
      if (coverDrag) {
        const c = coverDrag;
        coverDrag = null;
        if (c.active && c.plan) {
          const k = fold.drag?.k ?? 0;
          fold.drag = null;
          const halves = st().halves.slice();
          halves[c.plan.i] = k > 0.5 ? c.plan.to : c.plan.from;
          useStore.setState({ halves });
        } else if (!c.active) st().setCardHeld(true);
        return;
      }
      if (rotateDrag) {
        const wasClick = !rotateDrag.moved;
        rotateDrag = null;
        if (wasClick && !st().tool) snapFlat();
        return;
      }
      handleUp(e);
    };
    const move = (e) => {
      if (coverDrag) {
        const dx = e.clientX - coverDrag.x0, dy = e.clientY - coverDrag.y0;
        if (!coverDrag.active && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
          coverDrag.active = true;
          // which paper moves depends on the drag direction and on which side of the card faces you
          coverDrag.plan = planAny(st().halves, Math.sign(dx) * view.screenX, view.side);
          if (coverDrag.plan) fold.cur[coverDrag.plan.i] = coverDrag.plan.from;
        }
        if (coverDrag.active && coverDrag.plan) {
          const k = Math.min(1, Math.abs(dx) / 260);
          fold.drag = { i: coverDrag.plan.i, k, value: coverDrag.plan.from + (coverDrag.plan.to - coverDrag.plan.from) * k };
        }
        return;
      }
      if (!rotateDrag) return;
      const dx = e.clientX - rotateDrag.x, dy = e.clientY - rotateDrag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) rotateDrag.moved = true;
      rotateDrag.x = e.clientX; rotateDrag.y = e.clientY;
      const s = st();
      if (e.shiftKey) s.turnCard('d', dx * 0.5);
      else {
        s.turnCard('v', dx * 0.5);
        s.turnCard('l', dy * 0.5);
      }
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('pointermove', move);
    return () => { window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); window.removeEventListener('pointermove', move); };
  }, []);

  const tmpQ = useRef(new THREE.Quaternion()).current;
  const tilt = useRef(new THREE.Quaternion().setFromAxisAngle(X, 0.42)).current;
  useFrame((state, dt) => {
    const s = st();
    const k = 1 - Math.exp(-dt * 9);
    tmpQ.copy(cardQuaternion(s.angles, d));
    if (s.cardHeld) tmpQ.premultiply(tilt);
    group.current.quaternion.slerp(tmpQ, k);
    group.current.position.lerp(s.cardHeld ? HELD_POS : FLAT_POS, k);
    if (s.tool === 'shapes') {
      // shape handles keep the same size on screen: how many canvas pixels one screen pixel is
      const f = paper.selected?.face || 'inside';
      const a = canvasToWorld(f, paper.w * 0.25, paper.h / 2).project(state.camera);
      const b = canvasToWorld(f, paper.w * 0.25 + 100, paper.h / 2).project(state.camera);
      const px = Math.hypot(((b.x - a.x) * state.size.width) / 2, ((b.y - a.y) * state.size.height) / 2);
      const hp = px > 0.5 ? THREE.MathUtils.clamp(100 / px, 1, 20) : paper.handlePx;
      if (Math.abs(hp - paper.handlePx) > 0.25) { paper.handlePx = hp; if (paper.selected) paper.markFace(paper.selected.face); }
    }
    for (const { face: f, rect } of paper.frame(state.clock.elapsedTime)) {
      if (!rect || !uploadRegion(state.gl, faceTex[f], paper.faces[f].compose, rect)) faceTex[f].needsUpdate = true;
    }

    // folding: the right half swings over onto the left half
    // where the camera is relative to the card (for opening/closing from any side and rotation)
    const g = group.current;
    const normal = Z.clone().applyQuaternion(g.quaternion);
    view.side = normal.dot(state.camera.position.clone().sub(g.position)) >= 0 ? 1 : -1;
    const p0 = g.position.clone().project(state.camera), p1 = g.position.clone().add(X.clone().applyQuaternion(g.quaternion)).project(state.camera);
    view.screenX = p1.x >= p0.x ? 1 : -1;

    const ease = 1 - Math.exp(-dt * 7);
    for (const i of [0, 1]) {
      if (fold.drag && fold.drag.i === i) fold.cur[i] = fold.drag.value;
      else fold.cur[i] += (s.halves[i] - fold.cur[i]) * ease;
    }
    const [c1, c2] = fold.cur;
    // folded shut: the page under a hole in the cover shows the cover's shadow
    const layered = Math.abs(Math.abs(c1) - Math.abs(c2)) > 0.9;
    if (paper.layered !== layered) { paper.layered = layered; if (paper.isCut) paper.dirty = true; }
    const valley = FOLD * (1 - Math.min(1, Math.abs(c1))) * (1 - Math.min(1, Math.abs(c2)));
    const turn = Math.PI - 0.006;
    leftHinge.current.rotation.y = c1 * turn + valley;
    leftHinge.current.position.z = 0.014 * c1;
    rightHinge.current.rotation.y = -(c2 * turn) - valley;
    rightHinge.current.position.z = 0.014 * c2;
    // keep the paper centred however it is folded
    const q = halfW / 2;
    centre.current.position.x = -((-q * Math.cos(c1 * Math.PI)) + (q * Math.cos(c2 * Math.PI))) / 2;
  });
  const leftHinge = useRef(), rightHinge = useRef(), centre = useRef();

  const half = (side, i) => {
    const sign = side === 'left' ? -1 : 1;
    const surface = (face, idx) => {
      const toCanvas = (uv) => ({ x: uv.x * paper.w, y: (1 - uv.y) * paper.h });
      const map = textures[idx];
      return (
        <mesh key={face} geometry={halfGeos[idx]}
          ref={(m) => { if (m) cardMeshes[`${face}-${side}`] = m; }}
          position={[sign * halfW / 2, 0, face === 'inside' ? 0.004 : -0.004]}
          rotation={[0, face === 'inside' ? 0 : Math.PI, 0]}
          receiveShadow castShadow
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.stopPropagation();
            pointer.down = true; movePointer(e.point);
            if (!st().tool && !st().paper.choice) {
              // zoomed in: dragging moves around the card instead of opening / picking up / turning it
              if (inZoomedView(e.nativeEvent)) { startZoomPan(e.nativeEvent, () => (st().cardHeld ? snapFlat() : st().setCardHeld(true))); return; }
              onCardDownNoTool(e.nativeEvent);
              return;
            }
            handleDown(face, toCanvas(e.uv));
          }}
          onPointerMove={(e) => { e.stopPropagation(); if (pointer.deskPress) pointer.deskPress.touchedCard = true; movePointer(e.point); pointer.onCard = true; handleMove(face, toCanvas(e.uv)); }}
          onPointerOut={() => {
            // crossing the fold moves from one half to the other: only a real exit ends the stroke
            pointer.onCard = false;
            requestAnimationFrame(() => { if (!pointer.onCard) handleLeave(); });
          }}
          onPointerOver={(e) => {
            if (st().tool) return;
            if (inZoomedView(e.nativeEvent)) { document.body.style.cursor = 'grab'; useStore.setState({ hover: 'Drag to move around the zoomed card' }); return; }
            document.body.style.cursor = st().cardHeld ? 'grab' : 'pointer';
            useStore.setState({ hover: st().cardHeld ? 'Drag to turn the card (Shift = diagonal) · click to put it down' : 'Click to pick up the card · drag sideways to open or close it (from either side)' });
          }}
          onPointerLeave={() => { document.body.style.cursor = ''; useStore.setState({ hover: null }); }}
          customDepthMaterial={depthMats[idx]}
        >
          <meshStandardMaterial map={map} alphaTest={0.5} roughness={0.92} bumpMap={bump} bumpScale={0.6} />
        </mesh>
      );
    };
    return (
      <group key={side} ref={side === 'left' ? leftHinge : rightHinge}>
        {surface('inside', i)}
        {surface('outside', i + 2)}
      </group>
    );
  };

  void tool;
  return (
    <group ref={group} position={[0, 0, 0.03]}>
      <group ref={centre}>
        {half('left', 0)}
        {half('right', 1)}
      </group>
    </group>
  );
}
