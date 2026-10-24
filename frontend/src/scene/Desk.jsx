import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, events as pointerEvents, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { useStore, ZOOM_ANIM_MS } from '../store.js';
import { cardDims, CANVAS_PX_W, TAPE_PATTERNS } from '../config.js';
import { placeTextBox } from '../engine/paper.js';
import { Card, canvasToWorld, cardCutOnDesk, cardIsOpen, cardMeshes, putCardDown, tapeCutOnDesk } from './Card.jsx';
import { movePointer, pointer } from './pointer.js';
import { aimCamera, hitCardPlane, inZoomedView, offsetOf, SPLIT, startZoomPan, zoomView } from './zoom.js';
import {
  Brush, Crayon, Eraser, GlitterPen, Highlighter, HeldSticker, Marker, PaintBucket, PatternPen, Scissors, ShapeStencil, StickerSheet, TapeRoll, TextPad,
} from './models.jsx';

const Z = new THREE.Vector3(0, 0, 1);
const qHome = (yaw) => new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)).premultiply(new THREE.Quaternion().setFromAxisAngle(Z, yaw));
// eraser lies flat: long side along X, thin side up
const eraserHome = (yaw) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)))
  .premultiply(new THREE.Quaternion().setFromAxisAngle(Z, yaw));
const qFromDir = (dir) => new THREE.Quaternion().setFromUnitVectors(Z, dir.clone().normalize());

// Everything the user can pick up lives on the left side of the desk, with room between the tools.
const DEFS = [
  { id: 'crayon', tool: 'crayon', kind: 'pen', len: 1.95, home: [-11.2, 4.3], yaw: 0.04, r: 0.1, label: 'Crayon' },
  { id: 'marker', tool: 'marker', kind: 'pen', len: 1.98, home: [-11.2, 3.35], yaw: -0.03, r: 0.16, label: 'Marker' },
  { id: 'highlighter', tool: 'highlighter', kind: 'pen', len: 2.0, width: 0.5, home: [-11.2, 2.35], yaw: 0.03, r: 0.24, label: 'Highlighter' },
  { id: 'brush', tool: 'brush', kind: 'pen', len: 2.9, home: [-11.25, 1.35], yaw: -0.02, r: 0.12, label: 'Paint brush' },
  { id: 'pattern', tool: 'pattern', kind: 'pen', len: 2.2, home: [-11.2, -0.65], yaw: -0.04, r: 0.15, label: 'Pattern pen – hearts, stars, flowers, bubbles…' },
  { id: 'glitter', tool: 'glitter', kind: 'pen', len: 2.54, home: [-11.25, 0.35], yaw: 0.03, r: 0.14, label: 'Glitter gel pen' },
  ...TAPE_PATTERNS.map((p, i) => ({
    id: 'tape-' + p.id, tool: 'tape', variant: p.id, kind: 'roll', label: `Washi tape – ${p.label}`,
    home: [-7.0 + (i % 2) * 1.5, 4.0 - Math.floor(i / 2) * 1.45],
  })),
  { id: 'scissors', tool: 'scissors', kind: 'scissors', len: 2.2, width: 1.2, home: [-11.3, -1.95], yaw: 0.05, r: 0.1, scale: 0.85, label: 'Scissors – cut tape, or cut the card' },
  { id: 'eraser', tool: 'eraser', kind: 'eraser', len: 1.0, width: 0.6, home: [-6.6, -0.6], yaw: 0.1, r: 0.15, label: 'Eraser – removes drawing only' },
  { id: 'bucket', tool: 'bucket', kind: 'bucket', home: [-5.4, -1.95], yaw: 0, label: 'Paint bucket – fill an area with colour' },
  { id: 'sticker', tool: 'sticker', kind: 'sheet', home: [-10.0, -3.65], yaw: 1.5708, label: 'Stickers' },
  { id: 'text', tool: 'text', kind: 'pad', home: [-7.2, -3.0], yaw: -0.12, label: 'Text box' },
  { id: 'shapes', tool: 'shapes', kind: 'pad', home: [-5.5, -3.35], yaw: 0.1, label: 'Shapes – squares, circles, stars, hearts, presents…' },
];
const DESK_CENTRE_X = -3.2; // the camera looks between the tools and the card

/** Id of the desk item that is in the user's hand. */
export function heldToolId(s) {
  if (!s.tool) return null;
  if (s.tool === 'tape') return 'tape-' + s.tapePattern;
  return s.tool;
}

/**
 * A tool held `lift` above the desk at point p, placed on the line from the eye to p so that on
 * screen it sits exactly under the cursor (lifting straight up would make it look higher up the desk
 * than where it really is – and where it would be put down).
 */
function underCursor(out, p, lift, eye) {
  const dz = eye.z - p.z;
  const t = dz > 1e-3 ? Math.min(0.9, lift / dz) : 0;
  return out.set(p.x + (eye.x - p.x) * t, p.y + (eye.y - p.y) * t, p.z + (eye.z - p.z) * t);
}

function restPose(def, spot) {
  const flat = def.kind === 'roll' || def.kind === 'sheet' || def.kind === 'pad' || def.kind === 'bucket';
  const x = spot ? spot.x : def.home[0], y = spot ? spot.y : def.home[1];
  const yaw = (def.yaw || 0) + (spot ? spot.yaw : 0);
  const pos = new THREE.Vector3(x, y, def.kind === 'roll' ? 0.18 : def.kind === 'bucket' ? 0 : flat ? 0.045 : def.r || 0.15);
  const quat = flat ? new THREE.Quaternion().setFromAxisAngle(Z, yaw) : def.kind === 'eraser' ? eraserHome(yaw) : qHome(yaw);
  return { pos, quat };
}

// ------------------------------------------------------------------ keeping tools out from under the card
/** Points covering where a tool lies on the desk (x, y), from its resting place. */
function toolFootprint(def, spot) {
  const x = spot ? spot.x : def.home[0], y = spot ? spot.y : def.home[1];
  const yaw = (def.yaw || 0) + (spot ? spot.yaw : 0);
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  const pts = [];
  if (def.len) { // long tools: from the tip along their length
    const half = (def.width || 0.3) / 2;
    for (let t = 0; t <= def.len + 1e-6; t += 0.25) {
      for (const o of [-half, 0, half]) pts.push({ x: x + c * t - sn * o, y: y + sn * t + c * o });
    }
  } else if (def.kind === 'roll' || def.kind === 'bucket') { // round things: a roll of tape, the paint bucket
    pts.push({ x, y });
    for (const r of (def.kind === 'bucket' ? [0.25, 0.48] : [0.3, 0.56])) for (let k = 0; k < 14; k++) pts.push({ x: x + Math.cos((k / 14) * Math.PI * 2) * r, y: y + Math.sin((k / 14) * Math.PI * 2) * r });
  } else { // flat things: a rectangle around the centre
    const [hw, hh] = def.kind === 'sheet' ? [0.71, 0.99] : [0.55, 0.78];
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      const lx = (i / 2) * hw, ly = (j / 2) * hh;
      pts.push({ x: x + c * lx - sn * ly, y: y + sn * lx + c * ly });
    }
  }
  return { pts, centre: def.len ? { x: x + c * def.len / 2, y: y + sn * def.len / 2 } : { x, y } };
}

/**
 * Part of the desk you can see and click: inside the window and not under the panels or buttons
 * (checked on screen, so it works for every window size).
 */
const view = { camera: null };
let blockers = { t: 0, rects: [] };
function screenBlockers() {
  const now = performance.now();
  if (now - blockers.t > 200) {
    const els = document.querySelectorAll('.options, .options-pill, .topbar .btn, .topbar .logo, .topbar .zoom-ctl, .menu-btn, .toast, .zoom-area');
    blockers = { t: now, rects: [...els].map((e) => e.getBoundingClientRect()).map((r) => ({ l: r.left - 6, r: r.right + 6, t: r.top - 6, b: r.bottom + 6 })) };
  }
  return blockers.rects;
}
const tmpV = new THREE.Vector3();
function onVisibleDesk(p) {
  const cam = view.camera;
  if (!cam) return true;
  tmpV.set(p.x, p.y, 0.1).project(cam);
  const W = window.innerWidth, H = window.innerHeight;
  const x = ((tmpV.x + 1) / 2) * W, y = ((1 - tmpV.y) / 2) * H;
  if (x < 10 || y < 10 || x > W - 10 || y > H - 10) return false;
  return !screenBlockers().some((r) => x > r.l && x < r.r && y > r.t && y < r.b);
}

function insideOrNear(p, poly, margin) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  if (inside) return true;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j], dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    if (Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t)) < margin) return true;
  }
  return false;
}

/** The card's outline on the desk: one quadrilateral per half of the sheet. */
function cardOutline() {
  const out = [];
  for (const key of ['inside-left', 'inside-right']) {
    const m = cardMeshes[key];
    if (!m) continue;
    m.updateWorldMatrix(true, false);
    const { width: w, height: h } = m.geometry.parameters;
    out.push([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([lx, ly]) => {
      const v = m.localToWorld(new THREE.Vector3(lx, ly, 0));
      return { x: v.x, y: v.y };
    }));
  }
  return out;
}

/** Footprints (with bounding boxes) of the tools lying on the desk, except the ones listed. */
function lyingFootprints(s, exclude = [], spots = s.spots) {
  const inHand = heldToolId(s), pendingRoll = s.paper.pendingTape ? 'tape-' + s.paper.pendingTape.pattern.id : null;
  return DEFS.filter((d) => d.id !== inHand && d.id !== pendingRoll && !exclude.includes(d.id)).map((d) => {
    const pts = toolFootprint(d, spots[d.id]).pts;
    return { pts, box: boxOf(pts) };
  });
}
function boxOf(pts) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const p of pts) { x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y); x2 = Math.max(x2, p.x); y2 = Math.max(y2, p.y); }
  return { x1, y1, x2, y2 };
}
function touchesAny(pts, others, gap) {
  const b = boxOf(pts);
  return others.some((o) => {
    if (o.box.x1 > b.x2 + gap || o.box.x2 < b.x1 - gap || o.box.y1 > b.y2 + gap || o.box.y2 < b.y1 - gap) return false;
    return pts.some((p) => o.pts.some((q) => Math.abs(p.x - q.x) < gap && Math.abs(p.y - q.y) < gap));
  });
}

/** Why a tool can't lie at `spot` – 'offscreen', 'card' or 'tool' – or null when the place is free. */
export function placeProblem(def, spot, s = useStore.getState(), gap = 0.22) {
  const pts = toolFootprint(def, spot).pts;
  if (!pts.every(onVisibleDesk)) return 'offscreen';
  if (!s.cardHeld) {
    const outline = cardOutline();
    if (pts.some((p) => outline.some((poly) => insideOrNear(p, poly, 0.12)))) return 'card';
  }
  if (touchesAny(pts, lyingFootprints(s, [def.id]), gap)) return 'tool';
  return null;
}

/** A resting place whose middle is at (cx, cy) – long tools are placed by their tip. */
function spotAround(def, cx, cy, yaw) {
  const a = (def.yaw || 0) + yaw;
  const half = (def.len || 0) / 2;
  return { x: cx - Math.cos(a) * half, y: cy - Math.sin(a) * half, yaw };
}

/** Nearest free place around (cx, cy) that also passes `accept`, searching outwards in rings. */
function findFreeSpot(def, cx, cy, { accept = () => true, maxR = 6, yaws = [0], gap = 0.35 } = {}) {
  const s = useStore.getState();
  for (let r = 0; r <= maxR; r += 0.3) {
    const n = r === 0 ? 1 : Math.max(8, Math.round((2 * Math.PI * r) / 0.4));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      for (const yaw of yaws) {
        const spot = spotAround(def, cx + Math.cos(a) * r, cy + Math.sin(a) * r, yaw);
        if (accept(spot) && !placeProblem(def, spot, s, gap)) return spot;
      }
    }
  }
  return null;
}

/**
 * "Put it back": the tool goes to its usual place. If another tool lies there, it goes to the nearest
 * free place near it (left of the card), else to the mirrored place on the right of the card, else to
 * any free place on the desk.
 */
export function putBackTool(id) {
  const s = useStore.getState();
  const def = DEFS.find((d) => d.id === id);
  if (!def) { s.clearTool(); return; }
  const atHome = placeProblem(def, undefined, s, 0.3);
  if (!atHome || atHome === 'offscreen') { s.putBack(id); return; } // its usual place is free
  const home = toolFootprint(def, undefined).centre;
  const outline = cardOutline().flat();
  const minX = Math.min(...outline.map((p) => p.x)), maxX = Math.max(...outline.map((p) => p.x));
  const cardCx = (minX + maxX) / 2;
  const side = (dir) => (spot) => toolFootprint(def, spot).pts.every((p) => (dir < 0 ? p.x < minX - 0.3 : p.x > maxX + 0.3));
  const turns = [0, Math.PI / 2, -Math.PI / 2];
  const spot = findFreeSpot(def, home.x, home.y, { accept: side(-1), maxR: 5, yaws: [0, 0.35, -0.35] })
    || findFreeSpot(def, 2 * cardCx - home.x, home.y, { accept: side(1), maxR: 8, yaws: turns })
    || findFreeSpot(def, home.x, home.y, { maxR: 18, yaws: turns, gap: 0.25 });
  if (!spot) { s.putBack(id); return; }
  s.putBack(id);
  useStore.setState({ spots: { ...useStore.getState().spots, [id]: spot } });
}

/**
 * Tools may be left anywhere on the desk, but if the card ends up on top of one (it was opened,
 * turned or resized over it), the tool rolls out from under the card so it can still be picked up.
 */
function KeepToolsVisible() {
  const invalidate = useThree((st) => st.invalidate);
  const last = useRef(0);
  const prevOutline = useRef(null);
  useFrame(() => {
    const now = performance.now();
    if (now - last.current < 250) return;
    last.current = now;
    const s = useStore.getState();
    if (s.cardHeld) return; // a card in the hand is above the desk, not lying on the tools
    const outline = cardOutline();
    if (!outline.length) return;
    // wait until the card has stopped moving (opening, turning), then move each tool once
    const flatPts = outline.flat(), before = prevOutline.current;
    prevOutline.current = flatPts;
    if (!before || before.length !== flatPts.length || flatPts.some((p, i) => Math.hypot(p.x - before[i].x, p.y - before[i].y) > 0.01)) {
      invalidate(); // keep looking until it settles
      return;
    }
    const covered = (pts) => pts.some((p) => outline.some((poly) => insideOrNear(p, poly, 0.3)));
    const all = outline.flat();
    const cardCentre = { x: all.reduce((a, p) => a + p.x, 0) / all.length, y: all.reduce((a, p) => a + p.y, 0) / all.length };
    const inHand = heldToolId(s), pendingRoll = s.paper.pendingTape ? 'tape-' + s.paper.pendingTape.pattern.id : null;
    let spots = null;
    const lying = DEFS.filter((d) => d.id !== inHand && d.id !== pendingRoll);
    for (const def of lying) {
      const spot = (spots || s.spots)[def.id];
      const fp = toolFootprint(def, spot);
      if (!covered(fp.pts)) continue;
      // ...and it should not land on another tool either
      const others = lying.filter((d) => d !== def).map((d) => { const pts = toolFootprint(d, (spots || s.spots)[d.id]).pts; return { pts, box: boxOf(pts) }; });
      const bumps = (pts) => touchesAny(pts, others, 0.35);
      // find the nearest free, visible place, preferring the direction away from the card's middle
      let ax = fp.centre.x - cardCentre.x, ay = fp.centre.y - cardCentre.y;
      const l = Math.hypot(ax, ay);
      const away = l < 1e-3 ? Math.PI : Math.atan2(ay, ax);
      const dirs = Array.from({ length: 24 }, (_, k) => away + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 12));
      const base = spot || { x: def.home[0], y: def.home[1], yaw: 0 };
      search: for (let step = 0.25; step < 12; step += 0.25) {
        for (const a of dirs) {
          const moved = { ...base, x: base.x + Math.cos(a) * step, y: base.y + Math.sin(a) * step };
          const pts = toolFootprint(def, moved).pts;
          if (!pts.every(onVisibleDesk) || covered(pts) || bumps(pts)) continue;
          spots = spots || { ...s.spots };
          spots[def.id] = moved;
          break search;
        }
      }
    }
    if (spots) useStore.setState({ spots });
  });
  return null;
}

/**
 * Pens are thin: an invisible, slightly fatter body around each long tool makes it easy to grab.
 * It stays well inside the space between tools (they are never put down closer than 0.22 apart).
 */
function GrabArea({ def }) {
  const sc = def.scale || 1;
  const len = def.len / sc;
  const r = (Math.min(0.32, (def.width || 0.3) / 2) + 0.06) / sc;
  return (
    <mesh position={[0, 0, len / 2]} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[r, r, len, 10]} />
      <meshBasicMaterial colorWrite={false} depthWrite={false} transparent opacity={0} />
    </mesh>
  );
}

function ToolItem({ def }) {
  const ref = useRef();
  const spin = useRef(0);
  const open = useRef(0.3);
  const wasHeld = useRef(false);
  const [hover, setHover] = useState(false);
  const tool = useStore((s) => s.tool);
  const tapePattern = useStore((s) => s.tapePattern);
  const color = useStore((s) => s.color);
  const spot = useStore((s) => s.spots[def.id]);
  const pendingHere = useStore((s) => def.kind === 'roll' && s.paper.pendingTape?.pattern.id === def.variant);
  const [, bump] = useState(0);
  const paper = useStore((s) => s.paper);
  // only the tape rolls need to know when tape is pulled out
  useEffect(() => (def.kind === 'roll' ? paper.onChange(() => bump((n) => n + 1)) : undefined), [paper, def.kind]);
  const pending = def.kind === 'roll' && (pendingHere || paper.pendingTape?.pattern.id === def.variant);
  const held = (tool === def.tool && (!def.variant || tapePattern === def.variant)) || pending;

  const rest = useMemo(() => restPose(def, spot), [def, spot]);
  // The pose is only given to React once: after that the frame loop moves the tool, so a new resting
  // place is reached by animating there instead of React snapping the object to it.
  const startPose = useRef({ pos: rest.pos.toArray(), quat: rest.quat.clone() }).current;
  if (import.meta.env.DEV) { window.__tools = window.__tools || {}; window.__tools[def.id] = ref; }

  // Pushed out from under the card: round tools roll there, flat ones slide, easing to a stop.
  const anim = useRef(null);
  const rollAngle = useRef(0); // how far a pen has turned about its own length
  const lastPush = useRef(0);
  useEffect(() => {
    const g = ref.current;
    if (!g || lastPush.current === rest) return;
    const first = lastPush.current === 0;
    lastPush.current = rest;
    if (first || held) return;
    const from = g.position.clone(), to = rest.pos.clone();
    const d = to.clone().sub(from);
    const dist = Math.hypot(d.x, d.y);
    if (dist < 0.05) return;
    const yaw = (def.yaw || 0) + (spot?.yaw || 0);
    const rolls = def.kind === 'pen'; // pens, crayons, the brush and the pipette are round
    // rolling without slipping: only the movement across the pen turns it (along it, it slides)
    const across = d.x * -Math.sin(yaw) + d.y * Math.cos(yaw);
    anim.current = {
      from, to, t0: performance.now(),
      dur: Math.min(1600, 650 + dist * 220),
      roll0: rollAngle.current,
      roll: rolls ? -across / Math.max(0.08, def.r || 0.15) : 0,
      spin: def.kind === 'roll' ? (Math.random() < 0.5 ? -1 : 1) * dist * 0.35 : 0, // a flat roll twirls a little as it slides
      quatFrom: g.quaternion.clone(),
    };
  }, [rest, def, held]);
  const tmpPos = useRef(new THREE.Vector3()).current;
  const tmpQuat = useRef(new THREE.Quaternion()).current;
  const dir = useRef(new THREE.Vector3()).current;

  useFrame((state, dt) => {
    const g = ref.current;
    if (!g) return;
    let k = 1 - Math.exp(-dt * 16);
    const now = performance.now();
    const s = useStore.getState();
    const p = pointer.world;
    const inHand = held && def.kind !== 'sheet';
    if (inHand && !wasHeld.current) k = 1; // picked up: in the hand at once
    wasHeld.current = inHand;
    if (inHand) { anim.current = null; rollAngle.current = 0; }
    if (!inHand && anim.current) {
      const a = anim.current;
      const t = Math.min(1, (now - a.t0) / a.dur);
      const e = 1 - Math.pow(1 - t, 3); // ease out: quick start, gentle stop
      g.position.lerpVectors(a.from, a.to, e);
      g.position.z = a.to.z + Math.sin(Math.PI * t) * (def.kind === 'pen' ? 0 : 0.03);
      if (a.roll) {
        rollAngle.current = a.roll0 + a.roll * e;
        g.quaternion.copy(rest.quat).multiply(new THREE.Quaternion().setFromAxisAngle(Z, rollAngle.current));
      } else {
        g.quaternion.slerpQuaternions(a.quatFrom, rest.quat, e);
        if (a.spin) g.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(Z, a.spin * (1 - e) * e * 4));
      }
      if (t >= 1) anim.current = null;
      return;
    }
    if (!inHand) {
      tmpPos.copy(rest.pos); tmpQuat.copy(rest.quat);
      if (def.kind === 'pen' && rollAngle.current) tmpQuat.multiply(new THREE.Quaternion().setFromAxisAngle(Z, rollAngle.current));
      if (hover) tmpPos.z += 0.08;
    } else if (def.kind === 'pen' || def.kind === 'scissors' || def.kind === 'eraser') {
      const lift = pointer.drawing ? 0.02 : pointer.onCard ? 0.4 : 0.7;
      underCursor(tmpPos, p, lift, state.raycaster.ray.origin);
      const sway = THREE.MathUtils.clamp(pointer.vel.x * 2.2, -0.3, 0.3);
      if (def.kind === 'eraser') dir.set(0.15 + sway * 0.5, -0.3, 0.94);
      else dir.set(0.38 + sway, -0.5 + THREE.MathUtils.clamp(pointer.vel.y * 1.5, -0.2, 0.2), 0.78);
      tmpQuat.copy(qFromDir(dir));
      if (pointer.drawing && def.kind !== 'scissors') tmpPos.z += Math.sin(now / 55) * 0.012;
      k = Math.max(k, 1 - Math.exp(-dt * 30)); // tools follow the hand tightly
    } else if (def.kind === 'roll') {
      const pt = s.paper.pendingTape;
      if (pt && !pointer.pulling && pointer.tapeEnd) {
        // waiting for the scissors: the roll stays put at the end of the pulled tape
        tmpPos.copy(pointer.tapeEnd).addScaledVector(Z, 0.55);
        tmpQuat.copy(qFromDir(new THREE.Vector3(-pointer.tapeDir.y, pointer.tapeDir.x, 0)));
      } else {
        underCursor(tmpPos, p, pointer.pulling ? 0.55 : 0.8, state.raycaster.ray.origin);
        let ax = new THREE.Vector3(0, 1, 0);
        if (pt && pointer.pulling) {
          const a = canvasToWorld(pt.face, pt.S.x, pt.S.y), b = canvasToWorld(pt.face, pt.E.x, pt.E.y);
          const d = b.sub(a);
          if (d.lengthSq() > 1e-6) { d.normalize(); ax = new THREE.Vector3(-d.y, d.x, 0); }
        }
        tmpQuat.copy(qFromDir(ax));
        k = Math.max(k, 1 - Math.exp(-dt * 30));
      }
    } else if (def.kind === 'bucket') {
      // held tipped towards the card, ready to pour; tips further for a moment after each fill
      const pour = Math.max(0, 1 - (now - pointer.placedAt) / 450);
      underCursor(tmpPos, p, 0.95, state.raycaster.ray.origin);
      tmpQuat.setFromEuler(new THREE.Euler(-0.55 - pour * 0.6, 0.35, 0));
      k = Math.max(k, 1 - Math.exp(-dt * 30));
    } else if (def.kind === 'pad') {
      // keep the notepad beside the text box, never on top of it
      let ox = 0.9, oy = -0.4;
      const tg = pointer.textGhost;
      if (tg) {
        const box = placeTextBox({ ...s.textSpec }, tg.x, tg.y, s.paper.w, s.paper.h);
        const k2 = cardDims(s.cardSize).worldW / CANVAS_PX_W;
        ox = (box.w / 2) * k2 + 0.75; oy = -(box.h / 2) * k2 - 0.35;
      }
      underCursor(tmpPos, p, 1.0, state.raycaster.ray.origin);
      tmpPos.x += ox; tmpPos.y += oy;
      tmpQuat.setFromEuler(new THREE.Euler(-0.45, 0.1, -0.2));
      k = Math.max(k, 1 - Math.exp(-dt * 30));
    }
    g.position.lerp(tmpPos, k);
    g.quaternion.slerp(tmpQuat, k);
    if (def.kind === 'pad') { const sc = inHand ? 0.7 : 1; g.scale.setScalar(THREE.MathUtils.lerp(g.scale.x, sc, k)); }

    if (def.kind === 'roll' && held && pointer.pulling) spin.current = pointer.travel * 1.9;
    if (def.kind === 'scissors') {
      let o = 0.28;
      if (held && pointer.drawing) o = 0.5 + 0.5 * Math.sin(pointer.travel * 3.2);
      else if (held && now < pointer.snipUntil) o = 0.5 + 0.5 * Math.sin(now / 45);
      open.current += (o - open.current) * Math.min(1, dt * 30);
    }
  });

  const pick = (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const s = useStore.getState();
    pointer.down = true; // keep the button down and drag onto the card to use the tool straight away
    pointer.deskPress = null;
    movePointer(e.point);
    if (def.variant) {
      if (s.paper.pendingTape) s.paper.setPendingTape(null);
      s.setTapePattern(def.variant);
      if (s.tool !== 'tape') s.setTool('tape');
      return;
    }
    if (s.tool === def.tool) return;
    if (def.tool === 'scissors' && s.paper.pendingTape) { useStore.setState({ tool: 'scissors' }); return; }
    s.setTool(def.tool);
    pointer.drawing = false;
  };
  const events = {
    onPointerOver: (e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = 'pointer'; useStore.setState({ hover: def.label }); },
    onPointerOut: () => { setHover(false); document.body.style.cursor = ''; useStore.setState({ hover: null }); },
    onPointerDown: pick,
  };

  let model = null;
  switch (def.id) {
    case 'crayon': model = <Crayon color={color} />; break;
    case 'marker': model = <Marker color={color} />; break;
    case 'highlighter': model = <Highlighter color={color} />; break;
    case 'brush': model = <Brush color={color} />; break;
    case 'glitter': model = <GlitterPen color={color} />; break;
    case 'pattern': model = <PatternPen color={color} />; break;
    case 'bucket': model = <PaintBucket color={color} />; break;
    case 'eraser': model = <Eraser />; break;
    case 'scissors': model = <Scissors openRef={open} />; break;
    case 'sticker': model = <StickerSheet />; break;
    case 'text': model = <TextPad />; break;
    case 'shapes': model = <ShapeStencil />; break;
    default: model = <TapeRoll pattern={def.variant} spinRef={spin} />;
  }
  return (
    <group ref={ref} position={startPose.pos} quaternion={startPose.quat} scale={def.scale || 1} {...(held && def.kind !== 'sheet' ? {} : events)}>
      {model}
      {def.len && <GrabArea def={def} />}
    </group>
  );
}

// The sticker you picked peels off the sheet and follows the pointer. Over the card it lies flat exactly
// where and how it will be stuck (same spot, size and rotation as the result, also on a turned or flipped card).
const stk = { c: new THREE.Vector3(), ax: new THREE.Vector3(), ay: new THREE.Vector3(), az: new THREE.Vector3(), m: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), p: new THREE.Vector3() };
function PeeledSticker() {
  const ref = useRef();
  const tool = useStore((s) => s.tool);
  const id = useStore((s) => s.stickerId);
  useFrame((state, dt) => {
    const g = ref.current;
    if (!g) return;
    const s = useStore.getState();
    const k = 1 - Math.exp(-dt * 14);
    const scale = s.stickerSize * (cardDims(s.cardSize).worldW / CANVAS_PX_W);
    const pop = Math.max(0, 1 - (performance.now() - pointer.placedAt) / 250);
    const gh = s.paper.ghost;
    if (pointer.onCard && gh?.kind === 'sticker') {
      // the sticker's own axes on the card: image right = canvas (cos, sin), image up = canvas (sin, -cos)
      const { c, ax, ay, az } = stk;
      c.copy(canvasToWorld(gh.face, gh.x, gh.y));
      ax.copy(canvasToWorld(gh.face, gh.x + Math.cos(gh.rot) * 100, gh.y + Math.sin(gh.rot) * 100)).sub(c).normalize();
      ay.copy(canvasToWorld(gh.face, gh.x + Math.sin(gh.rot) * 100, gh.y - Math.cos(gh.rot) * 100)).sub(c).normalize();
      az.crossVectors(ax, ay).normalize();
      stk.q.setFromRotationMatrix(stk.m.makeBasis(ax, ay, az));
      // just above the paper on the side you are looking at (a little higher for a moment after sticking one)
      const toEye = stk.p.copy(state.camera.position).sub(c);
      const lift = (0.025 + pop * 0.2) * (az.dot(toEye) >= 0 ? 1 : -1);
      stk.p.copy(c).addScaledVector(az, lift);
      if (g.position.distanceTo(stk.p) > 0.6) g.position.copy(stk.p); // jumped onto the card: no slow slide
      else g.position.lerp(stk.p, k);
      g.quaternion.slerp(stk.q, k);
    } else {
      const p = pointer.world;
      g.position.lerp(underCursor(new THREE.Vector3(), p, 0.6, state.raycaster.ray.origin), k);
      const sheet = s.spots.sticker || { x: -10.0, y: -3.65 };
      const curl = (1 - Math.min(1, g.position.distanceTo(new THREE.Vector3(sheet.x, sheet.y, 0)) / 3)) * 0.9;
      // canvas angles turn clockwise, 3D angles anticlockwise; follow the card's own turn too
      stk.e.set(-0.35 - curl * 0.5, curl * 0.3, (-s.stickerRot + s.angles.v) * (Math.PI / 180));
      g.quaternion.slerp(stk.q.setFromEuler(stk.e), k);
    }
    g.scale.lerp(stk.p.set(scale, scale, 1), k);
  });
  if (tool !== 'sticker') return null;
  return (
    <group ref={ref} key={id} position={[(useStore.getState().spots.sticker?.x ?? -10.0), (useStore.getState().spots.sticker?.y ?? -3.65), 0.1]} scale={[0.5, 0.5, 1]}>
      <HeldSticker id={id} />
    </group>
  );
}

function Rig() {
  const three = useThree();
  const { camera, size } = three;
  useFrame((st) => {
    view.camera = st.camera;
    if (import.meta.env.DEV) window.__three = st;
    const aspect = size.width / size.height;
    const fov = THREE.MathUtils.degToRad(camera.fov);
    const tanV = Math.tan(fov / 2);
    const dist = Math.max(8.6 / (tanV * aspect), 5.4 / tanV);
    const tilt = 0.4;
    const dbg = import.meta.env.DEV && window.__view; // dev-only close-up for checking models
    if (dbg) { camera.position.set(dbg.x, dbg.y - Math.sin(tilt) * dbg.d, Math.cos(tilt) * dbg.d); camera.lookAt(dbg.x, dbg.y, 0); return; }
    camera.position.set(DESK_CENTRE_X, -Math.sin(tilt) * dist, Math.cos(tilt) * dist);
    camera.lookAt(DESK_CENTRE_X, 0.1, 0);
  });
  return null;
}

/**
 * The scene is only drawn while something is happening (the user is working on it, something is
 * still moving into place, glitter is twinkling) and never while the app is in the background,
 * so the computer stays responsive for other apps.
 */
const ACTIVE_MS = 2000;
function RenderOnDemand() {
  const invalidate = useThree((s) => s.invalidate);
  const activeUntil = useRef(0);
  useEffect(() => {
    // in front = the app has focus; in the background nothing animates by itself any more
    let focused = !document.hidden;
    const wake = () => { if (document.hidden) return; activeUntil.current = performance.now() + ACTIVE_MS; invalidate(); };
    const sleep = () => {
      focused = false;
      activeUntil.current = 0;
      releasePointer();
    };
    const resume = () => { if (document.hidden) return; focused = true; wake(); };
    const visibility = () => (document.hidden ? sleep() : resume());
    const events = ['pointermove', 'pointerdown', 'pointerup', 'wheel', 'keydown', 'resize'];
    events.forEach((e) => window.addEventListener(e, wake, { passive: true }));
    window.addEventListener('blur', sleep);
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', visibility);
    const unsubStore = useStore.subscribe(wake);
    let unsubPaper = useStore.getState().paper.onChange(wake);
    const unsubPaperSwap = useStore.subscribe((st, prev) => {
      if (st.paper !== prev.paper) { unsubPaper(); unsubPaper = st.paper.onChange(wake); }
    });
    // glitter twinkles about 10 times a second, only while the app is in front
    const twinkle = setInterval(() => {
      if (!focused) return;
      const p = useStore.getState().paper;
      if (p.faces.inside.glitter.length || p.faces.outside.glitter.length || p.fall || p.choice) invalidate();
    }, 100);
    wake();
    return () => {
      events.forEach((e) => window.removeEventListener(e, wake));
      window.removeEventListener('blur', sleep);
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', visibility);
      unsubStore(); unsubPaper(); unsubPaperSwap();
      clearInterval(twinkle);
    };
  }, [invalidate]);
  // keep drawing frames while things are still moving into place after the last action
  useFrame(() => { if (performance.now() < activeUntil.current) invalidate(); });
  return null;
}


// ------------------------------------------------------------------ split view for zooming
const ndc = new THREE.Vector2();
const ray = new THREE.Raycaster();

/** Middle, size (as the camera sees it) and surface of the card, from its meshes. */
function measureCard(mainCam) {
  const pts = [];
  for (const key of ['inside-left', 'inside-right']) {
    const m = cardMeshes[key];
    if (!m) continue;
    m.updateWorldMatrix(true, false);
    const { width: w, height: h } = m.geometry.parameters;
    for (const [lx, ly] of [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]) pts.push(m.localToWorld(new THREE.Vector3(lx, ly, 0)));
  }
  if (!pts.length) return false;
  const z = zoomView;
  z.centre.set(0, 0, 0);
  pts.forEach((p) => z.centre.add(p));
  z.centre.multiplyScalar(1 / pts.length);
  mainCam.updateMatrixWorld();
  z.right.setFromMatrixColumn(mainCam.matrixWorld, 0).normalize();
  z.up.setFromMatrixColumn(mainCam.matrixWorld, 1).normalize();
  let hw = 0, hh = 0;
  for (const p of pts) { const d = p.clone().sub(z.centre); hw = Math.max(hw, Math.abs(d.dot(z.right))); hh = Math.max(hh, Math.abs(d.dot(z.up))); }
  z.extent.hw = Math.max(0.5, hw); z.extent.hh = Math.max(0.5, hh);
  const m = cardMeshes['inside-right'] || cardMeshes['inside-left'];
  const n = new THREE.Vector3(0, 0, 1).applyQuaternion(m.getWorldQuaternion(new THREE.Quaternion()));
  z.plane.setFromNormalAndCoplanarPoint(n, z.centre);
  return true;
}

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const MAP_W = 216;
const cardHit = new THREE.Raycaster();

/** Which card surface is in front of the zoomed view: tries the middle, then a few other points. */
function visibleSurface(cam) {
  const meshes = Object.values(cardMeshes).filter(Boolean);
  for (const [x, y] of [[0, 0], [-0.4, 0], [0.4, 0], [0, -0.4], [0, 0.4], [-0.7, 0.7], [0.7, -0.7]]) {
    ndc.set(x, y);
    cardHit.setFromCamera(ndc, cam);
    const hit = cardHit.intersectObjects(meshes, false)[0];
    if (hit) return Object.keys(cardMeshes).find((k) => cardMeshes[k] === hit.object);
  }
  return null;
}

/** Canvas pixels (of the mesh's face) for a world point, measured in that half of the card. */
function meshToCanvas(key, world, paper) {
  const m = cardMeshes[key];
  const local = m.worldToLocal(world.clone());
  const { width, height } = m.geometry.parameters;
  const offset = key === 'inside-left' || key === 'outside-right' ? 0 : 0.5;
  return { x: (offset + (local.x / width + 0.5) * 0.5) * paper.w, y: (0.5 - local.y / height) * paper.h };
}

/** Paints the zoom map: the side of the card you look at, with everything on it, and the red frame. */
function drawZoomMap(canvasEl, cam, s) {
  const key = visibleSurface(cam) || zoomView.mapKey;
  if (!key) return;
  zoomView.mapKey = key;
  const paper = s.paper;
  const face = key.startsWith('inside') ? 'inside' : 'outside';
  const leftHalfOfCanvas = key === 'inside-left' || key === 'outside-right';
  const open = cardIsOpen(s.halves);
  const srcX = open ? 0 : leftHalfOfCanvas ? 0 : paper.w / 2;
  const srcW = open ? paper.w : paper.w / 2;
  // the card with a margin of desk around it, so the red frame always fits on the map
  const pad = 0.14;
  const mw = MAP_W, mh = Math.round((MAP_W * paper.h * (1 + 2 * pad)) / (srcW * (1 + 2 * pad)));
  if (canvasEl.width !== mw || canvasEl.height !== mh) { canvasEl.width = mw; canvasEl.height = mh; canvasEl.style.height = mh + 'px'; }
  const ix = (mw * pad) / (1 + 2 * pad), iy = (mh * pad) / (1 + 2 * pad);
  const iw = mw - 2 * ix, ih = mh - 2 * iy; // where the card sits on the map
  zoomView.map = { face, srcX, srcW, srcH: paper.h, ix, iy, iw, ih };
  const g = canvasEl.getContext('2d');
  g.fillStyle = s.bg || '#fde9a0'; g.fillRect(0, 0, mw, mh); // the desk around the card
  g.save(); g.shadowColor = 'rgba(60,40,0,.35)'; g.shadowBlur = 6; g.shadowOffsetY = 2;
  g.fillStyle = '#cdbf9a'; g.fillRect(ix, iy, iw, ih); g.restore(); // shows through holes cut in the card
  g.drawImage(paper.faces[face].compose, srcX, 0, srcW, paper.h, ix, iy, iw, ih);
  // the part of the card in the zoomed view
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
    new THREE.Vector3(0, 0, 1).applyQuaternion(cardMeshes[key].getWorldQuaternion(new THREE.Quaternion())),
    cardMeshes[key].getWorldPosition(new THREE.Vector3()));
  const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => {
    ndc.set(x, y);
    cardHit.setFromCamera(ndc, cam);
    const w = cardHit.ray.intersectPlane(plane, new THREE.Vector3());
    if (!w) return null;
    const c = meshToCanvas(key, w, paper);
    return { x: ix + ((c.x - srcX) / srcW) * iw, y: iy + (c.y / paper.h) * ih };
  });
  if (pts.every(Boolean)) {
    g.save();
    g.beginPath(); g.rect(0, 0, mw, mh);
    pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath();
    g.fillStyle = 'rgba(40, 30, 10, 0.3)'; g.fill('evenodd'); // dim what is not in view
    g.beginPath(); g.rect(1.5, 1.5, mw - 3, mh - 3); g.clip(); // keep the frame inside the map
    g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath();
    g.lineWidth = 2.5; g.strokeStyle = '#e63946'; g.lineJoin = 'round'; g.stroke();
    g.restore();
  }
  const label = document.querySelector('.zoom-map-side');
  if (label) label.textContent = open ? (face === 'inside' ? '– inside' : '– outside') : face === 'outside' ? '– cover' : '– inside page';
}

/**
 * Draws the normal view, or the split view while zoomed. Zooming in plays an animation: the right
 * side slides in from the edge of the screen while its camera flies from the normal view into the
 * card; zooming out plays it backwards.
 */
function SplitRenderer() {
  const anim = useRef({ value: 0, from: 0, to: 0, t0: 0, want: false, zoom: 2, offset: { x: 0, y: 0 } });
  useFrame((state) => {
    const { gl, scene, camera, size, invalidate } = state;
    const s = useStore.getState();
    const z = zoomView, a = anim.current;
    const W = size.width, H = size.height, now = performance.now();
    const want = s.zoom > 0 && !s.zoomClosing;
    if (want !== a.want) { a.want = want; a.from = a.value; a.to = want ? 1 : 0; a.t0 = now; }
    const t = Math.min(1, (now - a.t0) / ZOOM_ANIM_MS);
    a.value = a.from + (a.to - a.from) * ease(t);
    if (t < 1) invalidate();
    if (s.zoom) { a.zoom = s.zoom; a.offset = s.zoomOffset; }

    gl.autoClear = false;
    gl.setScissorTest(false);
    gl.setViewport(0, 0, W, H);
    gl.clear();
    const area = document.querySelector('.zoom-area'), map = document.querySelector('.zoom-map');
    z.active = a.value > 0.001 && measureCard(camera);
    if (!z.active) {
      gl.render(scene, camera);
      if (area) area.style.left = W + 'px';
      return;
    }

    const e = a.value;
    const sx = Math.round(W - (W - W * SPLIT) * e); // the divider slides in from the right edge
    z.splitPx = sx;
    if (area) area.style.left = sx + 'px';
    if (map) map.style.opacity = String(Math.max(0, (e - 0.55) / 0.45));
    gl.setScissorTest(true);
    // left: exactly the normal picture of the desk, just cropped
    gl.setScissor(0, 0, sx, H);
    gl.render(scene, camera);
    const autoShadows = gl.shadowMap.autoUpdate;
    gl.shadowMap.autoUpdate = false; // shadows were already worked out for this frame
    // right: the magnified card – on the way in, the camera flies from the normal view to it
    const used = aimCamera(z.camera, camera, Math.max(0.1, (W - sx) / H), a.zoom, a.offset);
    if (e < 0.999) {
      const from = camera.position, to = z.camera.position.clone();
      const look0 = camera.position.clone().add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(camera.position.z / Math.max(0.2, -camera.getWorldDirection(new THREE.Vector3()).z)));
      z.camera.position.lerpVectors(from, to, e);
      z.camera.lookAt(look0.lerp(used.target, e));
      z.camera.updateMatrixWorld();
    }
    if (W - sx > 1) {
      gl.setViewport(sx, 0, W - sx, H);
      gl.setScissor(sx, 0, W - sx, H);
      gl.clear();
      gl.render(scene, z.camera);
    }
    gl.shadowMap.autoUpdate = autoShadows;
    gl.setScissorTest(false);
    gl.setViewport(0, 0, W, H);
    // the zoom map: a picture of the side you are looking at
    const mapCanvas = document.querySelector('.zoom-map-canvas');
    if (mapCanvas && mapCanvas.offsetParent && e > 0.5) drawZoomMap(mapCanvas, z.camera, s);
    if (s.zoom && (used.x !== s.zoomOffset.x || used.y !== s.zoomOffset.y)) useStore.setState({ zoomOffset: { x: used.x, y: used.y } });
  }, 1);
  return null;
}

/** Pointer events use the zoomed camera on the right side of the split view. */
function splitEvents(store) {
  const base = pointerEvents(store);
  return {
    ...base,
    compute(event, state) {
      const z = zoomView;
      if (z.active && event.offsetX >= z.splitPx) {
        const w = state.size.width - z.splitPx;
        state.pointer.set(((event.offsetX - z.splitPx) / w) * 2 - 1, -(event.offsetY / state.size.height) * 2 + 1);
        state.raycaster.setFromCamera(state.pointer, z.camera);
      } else {
        state.pointer.set((event.offsetX / state.size.width) * 2 - 1, -(event.offsetY / state.size.height) * 2 + 1);
        state.raycaster.setFromCamera(state.pointer, state.camera);
      }
    },
  };
}

/** Mouse wheel over the zoomed card: zoom in/out around the pointer. */
function useWheelZoom() {
  useEffect(() => {
    const el = document.querySelector('.desk');
    if (!el) return undefined;
    const wheel = (e) => {
      const s = useStore.getState(), z = zoomView;
      if (!s.zoom || !z.active) return;
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      if (x < z.splitPx) return;
      e.preventDefault();
      const next = Math.max(1, Math.min(8, s.zoom * Math.exp(-e.deltaY * 0.0015)));
      ndc.set(((x - z.splitPx) / (r.width - z.splitPx)) * 2 - 1, -(y / r.height) * 2 + 1);
      ray.setFromCamera(ndc, z.camera);
      const hit = hitCardPlane(ray.ray);
      let off = s.zoomOffset;
      if (hit) { // keep the point under the pointer where it is
        const h = offsetOf(hit), k = s.zoom / next;
        off = { x: h.x + (off.x - h.x) * k, y: h.y + (off.y - h.y) * k };
      }
      useStore.setState({ zoom: next, zoomOffset: off });
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);
}

/** Leaving the app with the button held must not leave a stroke, drag or cut half-finished. */
function releasePointer() {
  if (!pointer.down && !pointer.drawing) return;
  pointer.deskPress = null;
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  pointer.down = false;
  pointer.drawing = false;
  pointer.pulling = false;
}

/** Soft studio reflections for glossy plastic, metal and glass. */
function Studio() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pm = new THREE.PMREMGenerator(gl);
    const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.5;
    return () => { env.dispose(); pm.dispose(); };
  }, [gl, scene]);
  return null;
}

function DeskPlane() {
  return (
    <mesh position={[0, 0, 0]} receiveShadow
      onPointerMove={(e) => { movePointer(e.point); pointer.onCard = false; tapeCutOnDesk('move', e.ray); cardCutOnDesk('move', e.ray); }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        pointer.down = true;
        movePointer(e.point);
        tapeCutOnDesk('down', e.ray); // scissors may start a tape cut on the desk, beside the card
        cardCutOnDesk('down', e.ray); // ...or start trimming the card from outside its edge
        const s = useStore.getState();
        // zoomed in, no tool: dragging the desk in the zoomed view moves around too
        if (!s.tool && inZoomedView(e.nativeEvent)) { startZoomPan(e.nativeEvent, () => { if (useStore.getState().cardHeld) putCardDown(); }); return; }
        if (!s.tool && s.cardHeld) putCardDown();
        // a click on the desk with a tool in hand leaves the tool there (decided on release, so dragging in to cut still works)
        if (s.tool && !s.paper.choice) pointer.deskPress = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY, point: e.point.clone(), touchedCard: false };
      }}>
      <planeGeometry args={[60, 40]} />
      <shadowMaterial opacity={0.2} />
    </mesh>
  );
}

function useDropOnDesk() {
  useEffect(() => {
    const up = (e) => {
      const press = pointer.deskPress;
      pointer.deskPress = null;
      if (!press || press.touchedCard) return;
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > 6) return;
      const s = useStore.getState();
      const id = heldToolId(s);
      const def = DEFS.find((d) => d.id === id);
      if (!def) return;
      // a little natural tilt if it fits, otherwise straight – whichever tilt has room
      const tilt = (Math.random() - 0.5) * 0.3;
      let spot = null, problem = null;
      for (const yaw of [tilt, 0, -tilt]) {
        const candidate = { x: press.point.x, y: press.point.y, yaw };
        const p = placeProblem(def, candidate, s);
        if (!p) { spot = candidate; break; }
        problem = problem || p;
      }
      if (!spot) {
        // the tool stays in the hand until an empty spot is clicked
        s.showToast({
          tool: 'Oops! This place is occupied by another tool. Please put it down in an empty spot :)',
          card: 'Oops! The tool would lie on the card there. Please put it down in an empty spot :)',
          offscreen: 'Oops! That spot is too close to the edge. Please put it down in an empty spot :)',
        }[problem], 'error');
        return;
      }
      s.dropTool(id, spot.x, spot.y, spot.yaw);
    };
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, []);
}

export function Desk() {
  const bg = useStore((s) => s.bg);
  useDropOnDesk();
  useWheelZoom();
  return (
    <div className="desk" style={{ background: bg }}>
      <div className="desk-light" />
      <Canvas
        shadows="soft"
        frameloop="demand"
        events={splitEvents}
        raycaster={{ params: { Points: { threshold: 0.01 }, Line: { threshold: 0.01 } } }}
        dpr={[1, 1.5]}
        camera={{ fov: 38, position: [0, -5, 11], near: 0.1, far: 80 }}
        gl={{ alpha: true, antialias: true, toneMapping: THREE.NeutralToneMapping, preserveDrawingBuffer: true }}
        onPointerMissed={() => { pointer.onCard = false; }}
      >
        <RenderOnDemand />
        <SplitRenderer />
        <KeepToolsVisible />
        <Rig />
        <Studio />
        <ambientLight intensity={0.9} />
        <hemisphereLight args={['#fff7e8', '#d9c08a', 0.4]} />
        <directionalLight position={[-6, -5, 12]} intensity={1.9} castShadow shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-11} shadow-camera-right={11} shadow-camera-top={8} shadow-camera-bottom={-8}
          shadow-bias={-0.0003} shadow-normalBias={0.02} />
        <directionalLight position={[7, 4, 6]} intensity={0.35} />
        <DeskPlane />
        <Card />
        {DEFS.map((d) => <ToolItem key={d.id} def={d} />)}
        <PeeledSticker />
      </Canvas>
    </div>
  );
}
