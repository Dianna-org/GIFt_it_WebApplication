import { createContext, useContext, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { stickerCanvas, STICKERS } from '../engine/stickers.js';
import { tapePatternById } from '../engine/paper.js';
import { makeRng } from '../engine/random.js';
import { SHAPES, flatten } from '../engine/shapeLibrary.js';
import { useStore } from '../store.js';
import { skinOf, TOOL_SKINS } from '../shop/catalog.js';
const TOOL_CLASSIC = TOOL_SKINS.classic;

/** The tools' look (round 40): Classic, or a tool design pack bought in the gift shop. */
export const SkinOverride = createContext(null); // the shop's pictures show a given look (round 42)
const useSkin = () => {
  const forced = useContext(SkinOverride);
  const mine = useStore((s) => skinOf(s.user, s.toolSkin));
  return forced || mine;
};
/** Body plastic in the skin's colour; the golden look is shiny like metal. */
const SkinPlastic = ({ skin, color, ...p }) => <Plastic color={color} metalness={skin.shiny} rough={skin.shiny > 0.5 ? 0.22 : p.rough ?? 0.32} {...p} />;
import { cardboard, crayonLabel, eraserSleeve, markerLabel, patternBarrel, tapeLayers, tapeSide } from './textures.js';

// Every tool is modelled with its working tip at the origin and its body running along +Z.
const PI2 = Math.PI / 2;

/** Revolved shape from [radius, z] pairs (bottom to top). */
function Lathe({ pts, seg = 40, children, scale, ...rest }) {
  const geo = useMemo(() => new THREE.LatheGeometry(pts.map(([r, z]) => new THREE.Vector2(r, z)), seg), [JSON.stringify(pts), seg]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <mesh geometry={geo} rotation={[PI2, 0, 0]} scale={scale} castShadow receiveShadow {...rest}>
      {children}
    </mesh>
  );
}

const Plastic = ({ color, rough = 0.32, coat = 0.6, ...p }) => (
  <meshPhysicalMaterial color={color} roughness={rough} clearcoat={coat} clearcoatRoughness={0.25} {...p} />
);
const Metal = ({ color = '#d3d8de', rough = 0.22 }) => <meshStandardMaterial color={color} metalness={1} roughness={rough} />;
const Glass = ({ tint = '#ffffff', opacity = 0.28 }) => (
  <meshPhysicalMaterial color={tint} roughness={0.04} metalness={0} clearcoat={1} clearcoatRoughness={0.05}
    transparent opacity={opacity} depthWrite={false} side={THREE.DoubleSide} envMapIntensity={1.4} />
);

/** Open tube of radius r from z0 to z1 (for labels and wrappers). */
function Tube({ r, z0, z1, children, seg = 40 }) {
  return (
    <mesh position={[0, 0, (z0 + z1) / 2]} rotation={[PI2, 0, 0]} castShadow receiveShadow>
      <cylinderGeometry args={[r, r, z1 - z0, seg, 1, true]} />
      {children}
    </mesh>
  );
}

// ----------------------------------------------------------------------------- drawing tools
export function Crayon({ color }) {
  const label = useMemo(() => crayonLabel(color), [color]);
  return (
    <group>
      <Lathe pts={[[0, 0], [0.02, 0.008], [0.06, 0.12], [0.088, 0.22], [0.09, 0.44]]}><meshStandardMaterial color={color} roughness={0.55} /></Lathe>
      <Tube r={0.094} z0={0.42} z1={1.76}><meshStandardMaterial map={label} roughness={0.8} /></Tube>
      <Lathe pts={[[0.09, 1.75], [0.09, 1.9], [0.07, 1.94], [0, 1.95]]}><meshStandardMaterial color={color} roughness={0.55} /></Lathe>
    </group>
  );
}

export function Marker({ color }) {
  const label = useMemo(() => markerLabel(color), [color]);
  const skin = useSkin();
  return (
    <group>
      <Lathe pts={[[0, 0], [0.022, 0.006], [0.042, 0.06], [0.048, 0.17]]}><meshStandardMaterial color={color} roughness={0.95} /></Lathe>
      <Lathe pts={[[0.048, 0.16], [0.085, 0.2], [0.125, 0.33], [0.13, 0.42]]}><SkinPlastic skin={skin} color={skin.trim} /></Lathe>
      <Lathe pts={[[0.13, 0.41], [0.152, 0.46], [0.155, 0.6], [0.155, 1.84], [0.15, 1.9], [0.125, 1.96], [0, 1.975]]}><SkinPlastic skin={skin} color={skin.body} /></Lathe>
      <Tube r={0.157} z0={0.75} z1={1.35}><meshPhysicalMaterial map={label} roughness={0.35} clearcoat={0.6} /></Tube>
      <Lathe pts={[[0.157, 1.84], [0.159, 1.9], [0.134, 1.965], [0, 1.98]]}><Plastic color={color} /></Lathe>
    </group>
  );
}

export function Highlighter({ color }) {
  const skin = useSkin();
  return (
    <group>
      <mesh position={[0, 0, 0.14]} rotation={[0.25, 0, 0]} castShadow>
        <boxGeometry args={[0.24, 0.07, 0.28]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
      <Lathe pts={[[0.05, 0.26], [0.12, 0.32], [0.16, 0.48], [0.17, 0.55]]} scale={[1.25, 0.85, 1]}><SkinPlastic skin={skin} color={skin.grip} rough={0.2} /></Lathe>
      <Lathe pts={[[0.17, 0.54], [0.19, 0.6], [0.19, 1.84], [0.175, 1.94], [0.1, 1.98], [0, 1.99]]} scale={[1.25, 0.85, 1]}>
        <Plastic color={color} rough={0.25} coat={1} transparent opacity={0.88} />
      </Lathe>
    </group>
  );
}

export function Brush({ color }) {
  const skin = useSkin();
  return (
    <group>
      <Lathe pts={[[0, 0], [0.03, 0.035], [0.07, 0.16], [0.078, 0.2]]}><meshStandardMaterial color={color} roughness={0.5} /></Lathe>
      <Lathe pts={[[0.078, 0.19], [0.09, 0.26], [0.1, 0.4], [0.1, 0.5]]}><meshStandardMaterial color={skin.wood} roughness={0.95} /></Lathe>
      <Lathe pts={[[0.1, 0.48], [0.112, 0.5], [0.112, 0.9], [0.1, 0.96]]}><Metal color={skin.metal} /></Lathe>
      {[0.62, 0.7].map((z) => (
        <mesh key={z} position={[0, 0, z]} castShadow><torusGeometry args={[0.112, 0.009, 8, 32]} /><Metal color={skin.metal} /></mesh>
      ))}
      <Lathe pts={[[0.1, 0.95], [0.118, 1.08], [0.108, 2.2], [0.065, 2.8], [0.048, 2.88], [0, 2.9]]}><SkinPlastic skin={skin} color={skin.handle} rough={0.18} coat={1} /></Lathe>
    </group>
  );
}

/** Clear gel pen: you can see the coloured gel (always the same amount – it never runs out). */
export function GlitterPen({ color }) {
  const skin = useSkin();
  const flecks = useMemo(() => {
    const rng = makeRng(5), pos = [];
    for (let i = 0; i < 140; i++) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 0.024;
      pos.push(Math.cos(a) * r, Math.sin(a) * r, 0.32 + rng() * 1.1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return g;
  }, []);
  return (
    <group>
      <Lathe pts={[[0, 0], [0.012, 0.01], [0.018, 0.07], [0.04, 0.18], [0.055, 0.25]]}><Metal color={skin.metal} rough={0.15} /></Lathe>
      <Lathe pts={[[0.055, 0.24], [0.09, 0.3], [0.11, 0.42], [0.115, 0.5]]}><Glass /></Lathe>
      {/* the refill: gel, then empty tube */}
      <Tube r={0.032} z0={0.3} z1={1.45}><meshStandardMaterial color={color} roughness={0.25} emissive={color} emissiveIntensity={0.15} /></Tube>
      {/* decoration only: never catches the pointer (points are "hit" from far away by default) */}
      <points geometry={flecks} raycast={() => null}><pointsMaterial color="#ffffff" size={0.03} sizeAttenuation transparent opacity={0.95} /></points>
      <Tube r={0.034} z0={1.45} z1={1.98}><Glass tint="#eef6ff" opacity={0.35} /></Tube>
      <Lathe pts={[[0.115, 0.48], [0.118, 0.55], [0.118, 2.0], [0.112, 2.06]]}><Glass /></Lathe>
      <Lathe pts={[[0.1, 2.04], [0.1, 2.15], [0.085, 2.2], [0, 2.21]]}><Plastic color={color} transparent opacity={0.75} /></Lathe>
      {/* cap posted on the back end, with its clip */}
      <Lathe pts={[[0.128, 1.82], [0.134, 1.86], [0.134, 2.46], [0.12, 2.53], [0, 2.54]]}><Plastic color={color} transparent opacity={0.42} rough={0.12} coat={1} depthWrite={false} /></Lathe>
      <mesh position={[0, 0.16, 2.12]} castShadow>
        <boxGeometry args={[0.07, 0.035, 0.62]} />
        <Plastic color={color} transparent opacity={0.7} />
      </mesh>
    </group>
  );
}

/** Pattern pen: a fun stamping pen – coloured tip, rainbow barrel with tiny shapes, a star on the cap. */
export function PatternPen({ color }) {
  const barrel = useMemo(() => patternBarrel(), []);
  const star = useMemo(() => {
    const sh = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = (i * Math.PI) / 5 - Math.PI / 2, r = i % 2 ? 0.07 : 0.16;
      if (i === 0) sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); else sh.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2 });
    g.translate(0, 0, -0.025);
    return g;
  }, []);
  return (
    <group>
      <Lathe pts={[[0, 0], [0.04, 0.01], [0.075, 0.08], [0.085, 0.2]]}><meshStandardMaterial color={color} roughness={0.6} /></Lathe>
      <Lathe pts={[[0.085, 0.19], [0.12, 0.26], [0.14, 0.4]]}><Plastic color="#ffffff" /></Lathe>
      <Tube r={0.14} z0={0.39} z1={1.9}><meshPhysicalMaterial map={barrel} roughness={0.35} clearcoat={0.6} /></Tube>
      <Lathe pts={[[0.14, 1.88], [0.142, 1.98], [0.12, 2.04], [0, 2.06]]}><Plastic color={color} /></Lathe>
      <mesh geometry={star} position={[0, 0, 2.12]} rotation={[0, 0, 0]} castShadow>
        <meshPhysicalMaterial color="#ffd166" metalness={0.3} roughness={0.3} clearcoat={1} />
      </mesh>
    </group>
  );
}

/** Calligraphy dip pen (gift shop): a flat, square-cut metal nib wet with your colour, in a slim holder. */
export function CalligraphyPen({ color }) {
  const skin = useSkin();
  const flat = [1, 1, 0.28]; // the nib is flattened (its broad edge runs across the pen)
  return (
    <group>
      <Lathe pts={[[0, 0], [0.074, 0], [0.076, 0.045], [0, 0.045]]} scale={flat}><meshStandardMaterial color={color} roughness={0.25} /></Lathe>
      <Lathe pts={[[0.076, 0.04], [0.07, 0.12], [0.06, 0.24], [0.052, 0.36]]} scale={flat}><Metal color={skin.metal} rough={0.18} /></Lathe>
      <Lathe pts={[[0.045, 0.34], [0.066, 0.37], [0.078, 0.42], [0.08, 0.55]]}><Metal color={skin.metal} /></Lathe>
      <Lathe pts={[[0.08, 0.54], [0.098, 0.62], [0.1, 0.8], [0.094, 1.05], [0.086, 1.15]]}><SkinPlastic skin={skin} color={skin.grip} rough={0.5} coat={0.2} /></Lathe>
      <Lathe pts={[[0.086, 1.14], [0.082, 1.6], [0.07, 2.05], [0.05, 2.32], [0.03, 2.38], [0, 2.4]]}><SkinPlastic skin={skin} color={skin.handle} rough={0.2} coat={1} /></Lathe>
    </group>
  );
}

/** Spray can (gift shop): nozzle cap in your colour, metal shoulder, a body with a colour band. */
export function SprayCan({ color }) {
  const skin = useSkin();
  return (
    <group>
      <Lathe pts={[[0, 0], [0.035, 0], [0.04, 0.07]]}><meshStandardMaterial color="#2a2a2a" roughness={0.6} /></Lathe>
      <Lathe pts={[[0.04, 0.06], [0.11, 0.07], [0.12, 0.1], [0.12, 0.24], [0.13, 0.25]]}><Plastic color={color} /></Lathe>
      <Lathe pts={[[0.12, 0.24], [0.2, 0.27], [0.26, 0.33], [0.28, 0.42]]}><Metal color={skin.metal} rough={0.2} /></Lathe>
      <Lathe pts={[[0.28, 0.41], [0.282, 0.44], [0.282, 1.38], [0.28, 1.41]]}><SkinPlastic skin={skin} color={skin.body} /></Lathe>
      <Tube r={0.286} z0={0.62} z1={1.02}><Plastic color={color} /></Tube>
      <Lathe pts={[[0.28, 1.4], [0.284, 1.44], [0.27, 1.49], [0.2, 1.5], [0, 1.5]]}><Metal color={skin.metal} rough={0.3} /></Lathe>
    </group>
  );
}

/** Paint bucket: a little metal pail full of paint in the current colour, with a wire handle and a drip. */
export function PaintBucket({ color }) {
  const skin = useSkin();
  return (
    <group>
      {/* pail: outer wall, rim, inner wall (open at the top) */}
      <Lathe pts={[[0, 0.001], [0.36, 0.001], [0.37, 0.02], [0.44, 0.66], [0.465, 0.68], [0.465, 0.71], [0.43, 0.71], [0.405, 0.66], [0.34, 0.06], [0, 0.06]]} seg={48}>
        <meshStandardMaterial color={skin === TOOL_CLASSIC ? '#c3cad1' : skin.metal} metalness={0.75} roughness={0.32} side={THREE.DoubleSide} />
      </Lathe>
      {/* the paint */}
      <mesh position={[0, 0, 0.6]}>
        <circleGeometry args={[0.395, 40]} />
        <meshPhysicalMaterial color={color} roughness={0.15} clearcoat={1} />
      </mesh>
      {/* a drip running down the outside */}
      <Lathe pts={[[0, 0.36], [0.05, 0.4], [0.045, 0.66], [0, 0.7]]} position={[0.43, 0, 0]} seg={14}>
        <meshPhysicalMaterial color={color} roughness={0.15} clearcoat={1} />
      </Lathe>
      {/* wire handle */}
      <mesh position={[0, 0, 0.7]} rotation={[0, Math.PI / 2, 0]} castShadow>
        <torusGeometry args={[0.45, 0.018, 8, 32, Math.PI]} />
        <Metal color={skin === TOOL_CLASSIC ? '#8d949b' : skin.trim} />
      </mesh>
    </group>
  );
}

export function Eraser() {
  const skin = useSkin();
  const body = useMemo(() => new RoundedBoxGeometry(0.56, 0.3, 1.0, 4, 0.08), []);
  const sleeve = useMemo(() => eraserSleeve(), []);
  return (
    <group>
      <mesh geometry={body} position={[0, 0, 0.5]} castShadow receiveShadow>
        <meshStandardMaterial color={skin.eraser} roughness={0.75} />
      </mesh>
      <mesh position={[0, 0, 0.75]} castShadow>
        <boxGeometry args={[0.575, 0.315, 0.5]} />
        <meshStandardMaterial map={sleeve} roughness={0.7} />
      </mesh>
    </group>
  );
}

// ----------------------------------------------------------------------------- scissors
function extrude(shape, depth, bevel) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 24 });
  g.translate(0, 0, -depth / 2);
  return g;
}

// Shape coordinates: x runs along the scissors (towards the tips is negative), y across.
// Built relative to the pivot screw.
function scissorHalf(sign) {
  const blade = new THREE.Shape();
  blade.moveTo(0.12, -0.02 * sign);
  blade.lineTo(-0.95, -0.006 * sign);
  blade.quadraticCurveTo(-1.12, 0.0, -1.08, 0.07 * sign);
  blade.quadraticCurveTo(-1.0, 0.12 * sign, -0.75, 0.135 * sign);
  blade.lineTo(-0.02, 0.18 * sign);
  blade.lineTo(0.12, -0.02 * sign);

  const handle = new THREE.Shape();
  const cx = 0.78, cy = -0.36 * sign;
  handle.absellipse(cx, cy, 0.46, 0.31, 0, Math.PI * 2, false, 0.15 * sign);
  const hole = new THREE.Path();
  hole.absellipse(cx, cy, 0.3, 0.165, 0, Math.PI * 2, true, 0.15 * sign);
  handle.holes.push(hole);

  const neck = new THREE.Shape();
  neck.moveTo(-0.04, 0.07 * sign);
  neck.lineTo(0.12, 0.08 * sign);
  neck.lineTo(0.48, -0.16 * sign);
  neck.lineTo(0.4, -0.3 * sign);
  neck.lineTo(0.0, -0.08 * sign);
  neck.lineTo(-0.04, 0.07 * sign);
  return { blade: extrude(blade, 0.03, 0.012), handle: extrude(handle, 0.12, 0.04), neck: extrude(neck, 0.1, 0.035) };
}

const PIVOT_Z = 1.15;
/** `openRef.current` (0..1) is read every frame, so snipping never re-renders React. */
export function Scissors({ openRef }) {
  const a = useMemo(() => scissorHalf(1), []);
  const b = useMemo(() => scissorHalf(-1), []);
  const ra = useRef(), rb = useRef();
  const skin = useSkin();
  useFrame(() => {
    const angle = 0.03 + (openRef?.current ?? 0.3) * 0.34;
    if (ra.current) ra.current.rotation.x = angle;
    if (rb.current) rb.current.rotation.x = -angle;
  });
  // shape (x, y, extrusion) -> model (z, y, x): rotate the shape so its x runs along +Z
  const half = (geo, side, ref) => (
    <group ref={ref}>
      <group rotation={[0, -PI2, 0]} position={[side * 0.035, 0, 0]}>
        <mesh geometry={geo.blade} castShadow receiveShadow><meshStandardMaterial color="#8f9ba5" roughness={0.42} metalness={0.35} /></mesh>
        <mesh geometry={geo.neck} position={[0, 0, side * 0.03]} castShadow receiveShadow><SkinPlastic skin={skin} color={skin.scissors} rough={0.45} coat={0.3} /></mesh>
        <mesh geometry={geo.handle} position={[0, 0, side * 0.03]} castShadow receiveShadow><SkinPlastic skin={skin} color={skin.scissors} rough={0.45} coat={0.3} /></mesh>
      </group>
    </group>
  );
  return (
    <group position={[0, 0, PIVOT_Z]}>
      {half(a, 1, ra)}
      {half(b, -1, rb)}
      <mesh rotation={[0, 0, PI2]} castShadow>
        <cylinderGeometry args={[0.075, 0.075, 0.2, 24]} />
        <meshStandardMaterial color="#ead2b8" roughness={0.5} />
      </mesh>
    </group>
  );
}

// ----------------------------------------------------------------------------- tape, stickers, notepad
export function TapeRoll({ pattern, spinRef }) {
  const inner = useRef();
  useFrame(() => { if (inner.current && spinRef) inner.current.rotation.y = spinRef.current; });
  // a pattern id, or a pattern object (a roll wearing a design bought in the gift shop, round 40)
  const p = typeof pattern === 'string' ? tapePatternById(pattern) : pattern;
  const look = `${p.kind}|${p.base}|${p.ink}`;
  const side = useMemo(() => { const t = tapeSide(p); t.repeat.set(3, 1); t.wrapS = THREE.RepeatWrapping; return t; }, [look]); // eslint-disable-line react-hooks/exhaustive-deps
  const top = useMemo(() => tapeLayers(p), [look]); // eslint-disable-line react-hooks/exhaustive-deps
  const core = useMemo(() => cardboard(), []);
  return (
    <group rotation={[PI2, 0, 0]}><group ref={inner}>
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[0.55, 0.55, 0.34, 64, 1, true]} />
        <meshPhysicalMaterial map={side} roughness={0.38} clearcoat={0.5} />
      </mesh>
      {[0.17, -0.17].map((y) => (
        <mesh key={y} position={[0, y, 0]} rotation={[y > 0 ? -PI2 : PI2, 0, 0]} receiveShadow>
          <ringGeometry args={[0.3, 0.55, 64]} />
          <meshStandardMaterial map={top} roughness={0.5} />
        </mesh>
      ))}
      <mesh castShadow>
        <cylinderGeometry args={[0.3, 0.3, 0.355, 48, 1, true]} />
        <meshStandardMaterial map={core} roughness={0.9} side={THREE.DoubleSide} />
      </mesh>
      {[0.178, -0.178].map((y) => (
        <mesh key={y} position={[0, y, 0]} rotation={[y > 0 ? -PI2 : PI2, 0, 0]}>
          <ringGeometry args={[0.26, 0.3, 48]} />
          <meshStandardMaterial color="#b8925c" roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[0, 0, 0]} rotation={[0, 0, 0]}>
        <cylinderGeometry args={[0.26, 0.26, 0.355, 48, 1, true]} />
        <meshStandardMaterial map={core} roughness={0.9} side={THREE.BackSide} />
      </mesh>
      {/* invisible solid cylinder around the whole roll, so the hole can be clicked too */}
      <mesh>
        <cylinderGeometry args={[0.57, 0.57, 0.38, 24]} />
        <meshBasicMaterial colorWrite={false} depthWrite={false} transparent opacity={0} />
      </mesh>
    </group></group>
  );
}

function useCanvasTexture(w, h, draw, deps) {
  return useMemo(() => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'));
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}

export function StickerSheet() {
  const tex = useCanvasTexture(512, 720, (g) => {
    g.fillStyle = '#fbf8f0'; g.fillRect(0, 0, 512, 720);
    g.strokeStyle = 'rgba(0,0,0,.08)'; g.setLineDash([6, 6]); g.strokeRect(14, 14, 484, 692);
    STICKERS.slice(0, 12).forEach((s, i) => {
      const x = (i % 3) * 160 + 20, y = Math.floor(i / 3) * 172 + 26;
      g.drawImage(stickerCanvas(s.id, 256), x, y, 150, 150);
    });
  }, []);
  const base = useMemo(() => new RoundedBoxGeometry(1.42, 1.98, 0.03, 2, 0.012), []);
  return (
    <group>
      <mesh geometry={base} castShadow receiveShadow><meshStandardMaterial color="#e9e4d8" roughness={0.8} /></mesh>
      <mesh position={[0, 0, 0.0165]} receiveShadow>
        <planeGeometry args={[1.4, 1.96]} />
        <meshPhysicalMaterial map={tex} roughness={0.45} clearcoat={0.4} />
      </mesh>
    </group>
  );
}

export function HeldSticker({ id }) {
  const tex = useMemo(() => {
    const t = new THREE.CanvasTexture(stickerCanvas(id, 256));
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [id]);
  return (
    <mesh castShadow>
      <planeGeometry args={[1, 1]} />
      <meshPhysicalMaterial map={tex} transparent alphaTest={0.05} side={THREE.DoubleSide} roughness={0.4} clearcoat={0.5} />
    </mesh>
  );
}

export function TextPad() {
  const tex = useCanvasTexture(256, 360, (g) => {
    g.fillStyle = '#fff6c9'; g.fillRect(0, 0, 256, 360);
    g.fillStyle = '#2f3b44'; g.font = 'bold 120px Georgia, serif'; g.textAlign = 'center'; g.fillText('Aa', 128, 210);
    g.fillStyle = 'rgba(80,120,180,.35)'; for (let y = 250; y < 345; y += 22) g.fillRect(24, y, 208, 2);
    g.fillStyle = 'rgba(230,80,80,.35)'; g.fillRect(40, 30, 2, 320);
  }, []);
  const base = useMemo(() => new RoundedBoxGeometry(1.1, 1.55, 0.09, 3, 0.02), []);
  return (
    <group>
      <mesh geometry={base} castShadow receiveShadow><meshStandardMaterial color="#f0e6c0" roughness={0.85} /></mesh>
      <mesh position={[0, 0, 0.046]} receiveShadow>
        <planeGeometry args={[1.06, 1.5]} />
        <meshStandardMaterial map={tex} roughness={0.85} />
      </mesh>
      {Array.from({ length: 8 }, (_, i) => (
        <mesh key={i} position={[-0.42 + i * 0.12, 0.74, 0.05]} rotation={[0, PI2, 0]} castShadow>
          <torusGeometry args={[0.05, 0.011, 8, 20]} />
          <Metal color="#b9bec4" />
        </mesh>
      ))}
    </group>
  );
}

/** Shapes tool: a see-through plastic drawing stencil with shape cut-outs (like a geometry template). */
export function ShapeStencil() {
  const geo = useMemo(() => {
    const W = 1.1, H = 1.55, r = 0.1;
    const plate = new THREE.Shape();
    plate.moveTo(-W / 2 + r, -H / 2); plate.lineTo(W / 2 - r, -H / 2); plate.quadraticCurveTo(W / 2, -H / 2, W / 2, -H / 2 + r);
    plate.lineTo(W / 2, H / 2 - r); plate.quadraticCurveTo(W / 2, H / 2, W / 2 - r, H / 2); plate.lineTo(-W / 2 + r, H / 2);
    plate.quadraticCurveTo(-W / 2, H / 2, -W / 2, H / 2 - r); plate.lineTo(-W / 2, -H / 2 + r); plate.quadraticCurveTo(-W / 2, -H / 2, -W / 2 + r, -H / 2);
    // cut-outs: the shapes' own outlines (from the shapes library), 2 columns x 3 rows
    const holes = [['heart', -0.24, 0.47], ['star', 0.24, 0.47], ['circle', -0.24, 0.02], ['triangle', 0.24, 0.02], ['square', -0.24, -0.43], ['hexagon', 0.24, -0.43]];
    for (const [id, cx, cy] of holes) {
      const def = SHAPES.find((d) => d.id === id);
      const pts = flatten(def.cmds, 10)[0];
      const sz = 0.15;
      const path = new THREE.Path(pts.slice(0, -1).map((p) => new THREE.Vector2(cx + p.x * sz, cy - p.y * sz)).reverse());
      plate.holes.push(path);
    }
    const g = new THREE.ExtrudeGeometry(plate, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 16 });
    g.translate(0, 0, -0.02);
    return g;
  }, []);
  // little ruler ticks along one edge
  const ticks = useMemo(() => Array.from({ length: 14 }, (_, i) => i), []);
  return (
    <group>
      <mesh geometry={geo} castShadow receiveShadow>
        <meshPhysicalMaterial color="#7fd3c7" roughness={0.12} clearcoat={1} clearcoatRoughness={0.08} transparent opacity={0.72} />
      </mesh>
      {/* invisible solid plate, so clicking into a cut-out still picks the stencil up */}
      <mesh position={[0, 0, 0.03]}>
        <planeGeometry args={[1.1, 1.55]} />
        <meshBasicMaterial colorWrite={false} depthWrite={false} transparent opacity={0} />
      </mesh>
      {ticks.map((i) => (
        <mesh key={i} position={[0.5, -0.68 + i * 0.105, 0.03]}>
          <boxGeometry args={[i % 2 ? 0.05 : 0.09, 0.008, 0.004]} />
          <meshStandardMaterial color="#1f5f57" />
        </mesh>
      ))}
    </group>
  );
}

