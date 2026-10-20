import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { useStore } from '../store.js';
import { cardDims, CANVAS_PX_W, TAPE_PATTERNS } from '../config.js';
import { placeTextBox } from '../engine/paper.js';
import { Card, canvasToWorld, putCardDown } from './Card.jsx';
import { movePointer, pointer } from './pointer.js';
import {
  Brush, Crayon, Eraser, GlitterPen, Highlighter, HeldSticker, Marker, Pipette, Scissors, StickerSheet, TapeRoll, TextPad,
} from './models.jsx';

const Z = new THREE.Vector3(0, 0, 1);
const qHome = (yaw) => new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)).premultiply(new THREE.Quaternion().setFromAxisAngle(Z, yaw));
// eraser lies flat: long side along X, thin side up
const eraserHome = (yaw) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)))
  .premultiply(new THREE.Quaternion().setFromAxisAngle(Z, yaw));
const qFromDir = (dir) => new THREE.Quaternion().setFromUnitVectors(Z, dir.clone().normalize());

// Everything the user can pick up lives on the left side of the desk, with room between the tools.
const DEFS = [
  { id: 'crayon', tool: 'crayon', kind: 'pen', home: [-11.2, 4.3], yaw: 0.04, r: 0.1, label: 'Crayon' },
  { id: 'marker', tool: 'marker', kind: 'pen', home: [-11.2, 3.35], yaw: -0.03, r: 0.16, label: 'Marker' },
  { id: 'highlighter', tool: 'highlighter', kind: 'pen', home: [-11.2, 2.35], yaw: 0.03, r: 0.24, label: 'Highlighter' },
  { id: 'brush', tool: 'brush', kind: 'pen', home: [-11.25, 1.35], yaw: -0.02, r: 0.12, label: 'Paint brush' },
  { id: 'glitter', tool: 'glitter', kind: 'pen', home: [-11.25, 0.35], yaw: 0.03, r: 0.14, label: 'Glitter gel pen' },
  { id: 'picker', tool: 'picker', kind: 'pen', home: [-11.2, -0.65], yaw: -0.04, r: 0.14, label: 'Colour picker – take a colour from the card' },
  ...TAPE_PATTERNS.map((p, i) => ({
    id: 'tape-' + p.id, tool: 'tape', variant: p.id, kind: 'roll', label: `Washi tape – ${p.label}`,
    home: [-7.0 + (i % 2) * 1.5, 4.0 - Math.floor(i / 2) * 1.45],
  })),
  { id: 'scissors', tool: 'scissors', kind: 'scissors', home: [-11.3, -1.95], yaw: 0.05, r: 0.1, scale: 0.85, label: 'Scissors – cut tape, or cut the card' },
  { id: 'eraser', tool: 'eraser', kind: 'eraser', home: [-6.6, -0.6], yaw: 0.1, r: 0.15, label: 'Eraser – removes drawing only' },
  { id: 'sticker', tool: 'sticker', kind: 'sheet', home: [-10.0, -3.65], yaw: 1.5708, label: 'Stickers' },
  { id: 'text', tool: 'text', kind: 'pad', home: [-7.2, -3.0], yaw: -0.12, label: 'Text box' },
];
const DESK_CENTRE_X = -3.2; // the camera looks between the tools and the card

/** Id of the desk item that is in the user's hand. */
export function heldToolId(s) {
  if (!s.tool) return null;
  if (s.tool === 'tape') return 'tape-' + s.tapePattern;
  return s.tool;
}

function restPose(def, spot) {
  const flat = def.kind === 'roll' || def.kind === 'sheet' || def.kind === 'pad';
  const x = spot ? spot.x : def.home[0], y = spot ? spot.y : def.home[1];
  const yaw = (def.yaw || 0) + (spot ? spot.yaw : 0);
  const pos = new THREE.Vector3(x, y, def.kind === 'roll' ? 0.18 : flat ? 0.045 : def.r || 0.15);
  const quat = flat ? new THREE.Quaternion().setFromAxisAngle(Z, yaw) : def.kind === 'eraser' ? eraserHome(yaw) : qHome(yaw);
  return { pos, quat };
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
    if (!inHand) {
      tmpPos.copy(rest.pos); tmpQuat.copy(rest.quat);
      if (hover) tmpPos.z += 0.08;
    } else if (def.kind === 'pen' || def.kind === 'scissors' || def.kind === 'eraser') {
      const lift = pointer.drawing ? 0.02 : pointer.onCard ? 0.4 : 0.7;
      tmpPos.set(p.x, p.y, p.z + lift);
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
        tmpPos.set(p.x, p.y, p.z + (pointer.pulling ? 0.55 : 0.8));
        let ax = new THREE.Vector3(0, 1, 0);
        if (pt && pointer.pulling) {
          const a = canvasToWorld(pt.face, pt.S.x, pt.S.y), b = canvasToWorld(pt.face, pt.E.x, pt.E.y);
          const d = b.sub(a);
          if (d.lengthSq() > 1e-6) { d.normalize(); ax = new THREE.Vector3(-d.y, d.x, 0); }
        }
        tmpQuat.copy(qFromDir(ax));
        k = Math.max(k, 1 - Math.exp(-dt * 30));
      }
    } else if (def.kind === 'pad') {
      // keep the notepad beside the text box, never on top of it
      let ox = 0.9, oy = -0.4;
      const tg = pointer.textGhost;
      if (tg) {
        const box = placeTextBox({ ...s.textSpec }, tg.x, tg.y, s.paper.w, s.paper.h);
        const k2 = cardDims(s.cardSize).worldW / CANVAS_PX_W;
        ox = (box.w / 2) * k2 + 0.75; oy = -(box.h / 2) * k2 - 0.35;
      }
      tmpPos.set(p.x + ox, p.y + oy, p.z + 1.0);
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
    case 'picker': model = <Pipette color={color} />; break;
    case 'eraser': model = <Eraser />; break;
    case 'scissors': model = <Scissors openRef={open} />; break;
    case 'sticker': model = <StickerSheet />; break;
    case 'text': model = <TextPad />; break;
    default: model = <TapeRoll pattern={def.variant} spinRef={spin} />;
  }
  return (
    <group ref={ref} position={rest.pos.toArray()} quaternion={rest.quat} scale={def.scale || 1} {...(held && def.kind !== 'sheet' ? {} : events)}>
      {model}
    </group>
  );
}

// The sticker you picked peels off the sheet and follows the pointer.
function PeeledSticker() {
  const ref = useRef();
  const tool = useStore((s) => s.tool);
  const id = useStore((s) => s.stickerId);
  useFrame((state, dt) => {
    const g = ref.current;
    if (!g) return;
    const s = useStore.getState();
    const k = 1 - Math.exp(-dt * 9);
    const scale = s.stickerSize * (cardDims(s.cardSize).worldW / CANVAS_PX_W);
    const pop = Math.max(0, 1 - (performance.now() - pointer.placedAt) / 250);
    const p = pointer.world;
    g.position.lerp(new THREE.Vector3(p.x, p.y, p.z + (pointer.onCard ? 0.2 + pop * 0.25 : 0.6)), k);
    g.scale.lerp(new THREE.Vector3(scale, scale, 1), k);
    const sheet = s.spots.sticker || { x: -10.0, y: -3.65 };
    const curl = (1 - Math.min(1, g.position.distanceTo(new THREE.Vector3(sheet.x, sheet.y, 0)) / 3)) * 0.9;
    g.rotation.set(-0.35 - curl * 0.5, curl * 0.3, (s.stickerRot * Math.PI) / 180);
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
      onPointerMove={(e) => { movePointer(e.point); pointer.onCard = false; }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        pointer.down = true;
        movePointer(e.point);
        const s = useStore.getState();
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
      if (id) s.dropTool(id, press.point.x, press.point.y);
    };
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, []);
}

export function Desk() {
  const bg = useStore((s) => s.bg);
  useDropOnDesk();
  return (
    <div className="desk" style={{ background: bg }}>
      <div className="desk-light" />
      <Canvas
        shadows="soft"
        dpr={[1, 1.5]}
        camera={{ fov: 38, position: [0, -5, 11], near: 0.1, far: 80 }}
        gl={{ alpha: true, antialias: true, toneMapping: THREE.NeutralToneMapping, preserveDrawingBuffer: true }}
        onPointerMissed={() => { pointer.onCard = false; }}
      >
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
