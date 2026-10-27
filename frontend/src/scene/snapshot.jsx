/**
 * Pictures for the gift shop (round 42): the real 3D models (tools in each design, tape rolls, a standing card
 * in each paper colour, the new tools on a sheet they drew on) are rendered once into an image by one hidden
 * renderer, one item after the other, and kept for the rest of the visit.
 */
import { useEffect, useLayoutEffect, useMemo } from 'react';
import { createRoot, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { TOOL_SKINS } from '../shop/catalog.js';
import {
  Brush, CalligraphyPen, Eraser, GlitterPen, Marker, PaintBucket, Scissors, SkinOverride, SprayCan, TapeRoll,
} from './models.jsx';

const W = 460, H = 240;
const cache = new Map(); // key -> data URL
let queue = Promise.resolve();
let root = null, canvas = null, idle = 0;

const Z = new THREE.Vector3(0, 0, 1);
// a long tool lying on the desk: its body (built along +Z) turned to run along +X, then turned by `yaw`
const lying = (yaw) => new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)).premultiply(new THREE.Quaternion().setFromAxisAngle(Z, yaw));
const flatEraser = (yaw) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)))
  .premultiply(new THREE.Quaternion().setFromAxisAngle(Z, yaw));

/** Lights, the desk's shadow and the camera: `dist` away from `look`, looking down at `tilt` (radians). */
function Studio({ look, dist = 6, tilt = 1.02 }) {
  const { gl, scene, camera } = useThree();
  useLayoutEffect(() => {
    const [x, y, z] = look;
    camera.position.set(x, y - dist * Math.cos(tilt), z + dist * Math.sin(tilt));
    camera.lookAt(x, y, z);
    camera.updateProjectionMatrix();
  }, [camera, look, dist, tilt]);
  useEffect(() => {
    const pm = new THREE.PMREMGenerator(gl);
    const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.5;
    return () => { env.dispose(); pm.dispose(); };
  }, [gl, scene]);
  return (
    <>
      <ambientLight intensity={0.9} />
      <hemisphereLight args={['#fff7e8', '#d9c08a', 0.4]} />
      <directionalLight position={[-4, -4, 9]} intensity={1.9} castShadow shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-5} shadow-camera-right={5} shadow-camera-top={4} shadow-camera-bottom={-4} shadow-bias={-0.0003} shadow-normalBias={0.02} />
      <directionalLight position={[6, 3, 5]} intensity={0.35} />
      <mesh receiveShadow><planeGeometry args={[30, 20]} /><shadowMaterial opacity={0.22} /></mesh>
    </>
  );
}

const Lying = ({ x, y, yaw = 0, r = 0.15, children }) => <group position={[x, y, r]} quaternion={lying(yaw)}>{children}</group>;
const open = { current: 0.35 };

/** A tool design pack: the marker, brush, glitter pen, scissors, eraser and paint bucket in that look. */
function SkinScene({ id }) {
  return (
    <SkinOverride.Provider value={TOOL_SKINS[id]}>
      <Studio look={[-0.55, -0.05, 0]} dist={6.3} />
      <Lying x={-2.5} y={1.05} yaw={-0.08} r={0.16}><Marker color="#e63946" /></Lying>
      <Lying x={-2.7} y={0.35} yaw={0.04} r={0.12}><Brush color="#4d96ff" /></Lying>
      <Lying x={-2.5} y={-0.35} yaw={-0.03} r={0.14}><GlitterPen color="#f15bb5" /></Lying>
      <group position={[-2.3, -1.25, 0.1]} quaternion={lying(0.08)} scale={0.85}><Scissors openRef={open} /></group>
      <group position={[0.75, 0.8, 0.15]} quaternion={flatEraser(0.25)}><Eraser /></group>
      <group position={[1.3, -0.6, 0]}><PaintBucket color="#2a9d8f" /></group>
    </SkinOverride.Provider>
  );
}

/** A pack of tape: its rolls lying on the desk, with a strip of each pulled out. */
function TapeScene({ patterns }) {
  return (
    <>
      <Studio look={[0, -0.05, 0.1]} dist={4.4} tilt={0.85} />
      {patterns.map((p, i) => (
        <group key={p.id} position={[-2.1 + i * 1.4, 0.35 - (i % 2) * 0.35, 0.18]}><TapeRoll pattern={p} /></group>
      ))}
    </>
  );
}

/** Folded cards standing on the desk, a little open – in the paper's colour (several for "all colours"). */
function StandingCard({ color, x = 0, yaw = 0, s = 1 }) {
  const mat = <meshStandardMaterial color={color} roughness={0.88} />;
  const w = 1.25 * s, h = 1.75 * s, t = 0.014;
  return (
    <group position={[x, 0, 0]} rotation={[0, 0, yaw]}>
      {/* back half: standing, leaning back a little */}
      <group rotation={[-0.12, 0, 0]}>
        <mesh position={[w / 2, 0, h / 2]} castShadow receiveShadow><boxGeometry args={[w, t, h]} />{mat}</mesh>
      </group>
      {/* front cover: turned open about the fold on the left */}
      <group rotation={[0, 0, -1.2]}>
        <group rotation={[-0.12, 0, 0]}>
          <mesh position={[w / 2, -0.012, h / 2]} castShadow receiveShadow><boxGeometry args={[w, t, h]} />{mat}</mesh>
        </group>
      </group>
    </group>
  );
}
function PaperScene({ colors }) {
  const many = colors.length > 1;
  return (
    <>
      <Studio look={[many ? 0 : 0.35, -0.3, 0.8]} dist={many ? 7.2 : 4.9} tilt={0.45} />
      {colors.map((c, i) => <StandingCard key={i} color={c} x={many ? -2.9 + i * 1.15 : 0} yaw={many ? 0.5 - i * 0.04 : 0.5} s={many ? 0.85 : 1} />)}
    </>
  );
}

/** A new tool lying on a sheet of paper it has drawn on. */
function ToolScene({ tool, sample }) {
  const tex = useMemo(() => { const t = new THREE.CanvasTexture(sample); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }, [sample]);
  return (
    <>
      <Studio look={[0.2, 0, 0]} dist={5.4} />
      <mesh position={[-0.3, 0.1, 0.004]} rotation={[0, 0, 0.04]} receiveShadow castShadow>
        <boxGeometry args={[4.2, 2.0, 0.008]} />
        <meshStandardMaterial attach="material-0" color="#f4f1ea" /><meshStandardMaterial attach="material-1" color="#f4f1ea" />
        <meshStandardMaterial attach="material-2" color="#f4f1ea" /><meshStandardMaterial attach="material-3" color="#f4f1ea" />
        <meshStandardMaterial attach="material-4" map={tex} roughness={0.9} /><meshStandardMaterial attach="material-5" color="#f4f1ea" />
      </mesh>
      {tool === 'calligraphy'
        ? <Lying x={0.6} y={-0.95} yaw={0.5} r={0.1}><CalligraphyPen color="#3d2c6b" /></Lying>
        : <Lying x={0.55} y={-0.95} yaw={0.35} r={0.28}><SprayCan color="#f15bb5" /></Lying>}
    </>
  );
}

/** The scene for a shop item's preview (see catalog.js SHOP_SECTIONS `preview`). */
function sceneFor(preview) {
  if (preview.skin) return <SkinScene id={preview.skin} />;
  if (preview.tapes) return <TapeScene patterns={preview.tapes} />;
  if (preview.paper) return <PaperScene colors={[preview.paper]} />;
  if (preview.rainbow) return <PaperScene colors={['#f9c6d6', '#c9b3f0', '#3f7fd8', '#bfe8d2', '#fbe27a', '#f9a35c']} />;
  if (preview.tool) return <ToolScene tool={preview.tool} sample={preview.sample} />;
  return null;
}

async function draw(element) {
  if (!root) {
    canvas = document.createElement('canvas');
    root = createRoot(canvas);
  }
  root.configure({
    frameloop: 'never', dpr: 2, size: { width: W, height: H, top: 0, left: 0, updateStyle: false }, shadows: 'soft',
    camera: { fov: 30, near: 0.1, far: 80 },
    gl: { alpha: true, antialias: true, preserveDrawingBuffer: true, toneMapping: THREE.NeutralToneMapping },
  });
  const store = root.render(element);
  await new Promise((r) => setTimeout(r, 30)); // effects run (camera aimed, environment made)
  for (let i = 0; i < 2; i++) store.getState().advance(performance.now());
  return canvas.toDataURL('image/png');
}

/** The picture for `key` (made once). Resolves to a data URL, or null if 3D isn't available. */
export function shopPicture(key, preview) {
  if (cache.has(key)) return Promise.resolve(cache.get(key));
  const scene = sceneFor(preview);
  if (!scene) return Promise.resolve(null);
  queue = queue.then(async () => {
    if (cache.has(key)) return;
    clearTimeout(idle);
    try { cache.set(key, await draw(scene)); } catch { cache.set(key, null); }
    // nothing more to draw for a while: give the graphics memory back
    idle = setTimeout(() => { root?.unmount(); root = null; canvas = null; }, 3000);
  });
  return queue.then(() => cache.get(key));
}
export const cachedShopPicture = (key) => cache.get(key);
