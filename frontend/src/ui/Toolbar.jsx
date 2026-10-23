import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store.js';
import { DRAW_TOOLS, FONTS, PASTELS, TAPE_PATTERNS, TOOL_LABELS } from '../config.js';
import { STICKERS, stickerCanvas } from '../engine/stickers.js';
import { PATTERNS } from '../engine/patterns.js';
import { renderStroke } from '../engine/brushes.js';
import { cardIsOpen, putCardDown, turnCardPage } from '../scene/Card.jsx';
import { eraseAllWithConfirm } from '../actions.js';
import { ZoomControls } from './Zoom.jsx';
import { heldToolId, putBackTool } from '../scene/Desk.jsx';
import { SHAPES, drawShape } from '../engine/shapeLibrary.js';
import { pointer } from '../scene/pointer.js';

function Slider({ label, value, min, max, onChange, suffix = '', hint }) {
  return (
    <label className="slider">
      <span className="slider-label">{label}<b>{Math.round(value)}{suffix}</b></span>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(+e.target.value)} />
      {hint && <span className="slider-hint">{hint}</span>}
    </label>
  );
}

/** "My colours": empty slots the user fills with colours they like, plus the full colour wheel and the picker. */
function ColorPalette() {
  const color = useStore((s) => s.color);
  const myColors = useStore((s) => s.myColors);
  const setColor = useStore((s) => s.setColor);
  const addMyColor = useStore((s) => s.addMyColor);
  const setMyColor = useStore((s) => s.setMyColor);
  const removeMyColor = useStore((s) => s.removeMyColor);
  // a double-click starts with a click, which already switched to the slot's colour:
  // remember the colour you had before, that is the one that goes into the slot
  const before = useRef(color);
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const showToast = useStore((s) => s.showToast);

  const add = () => {
    const r = addMyColor(color);
    if (r === 'full') showToast('Your palette is full. Right-click a colour to remove it first.', 'error');
    if (r === 'exists') showToast('That colour is already in your palette.');
  };

  return (
    <div className="palette-wrap">
      <div className="palette" role="group" aria-label="My colours">
        <span className="palette-title">My colours</span>
        {myColors.map((c, i) => c ? (
          <button key={i} className={'swatch' + (c.toLowerCase() === color.toLowerCase() ? ' on' : '')}
            style={{ background: c }}
            onClick={(e) => { if (e.detail <= 1) { before.current = color; setColor(c); } }}
            onDoubleClick={() => { setMyColor(i, before.current); setColor(before.current); }}
            onContextMenu={(e) => { e.preventDefault(); removeMyColor(i); }}
            aria-label={`Colour ${c}`} title={`${c} – click to use · double-click to replace it with your current colour · right-click to empty`} />
        ) : (
          <button key={i} className="swatch empty" onClick={() => setMyColor(i, color)} aria-label="Empty slot – put the current colour here" title="Empty – click to put your current colour here" />
        ))}
      </div>
      <div className="palette">
        <label className="swatch custom" title="Colour wheel – any colour you like">
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Colour wheel" />
          <span style={{ background: color }} />
        </label>
        <span className="current" style={{ background: color }} title={`Current colour ${color}`} />
        <button className="btn small" onClick={add} title="Save the current colour in My colours">＋ Save colour</button>
        <button className={'btn small' + (tool === 'picker' ? ' active' : '')} onClick={() => setTool('picker')} title="Take a colour from the card">
          💧 Pick from card
        </button>
      </div>
    </div>
  );
}

/** A little preview of a pattern: shapes stamped along a gentle wave. */
function PatternPreview({ id, color, rainbow }) {
  const ref = useRef();
  useEffect(() => {
    const c = ref.current;
    const g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    const pts = Array.from({ length: 40 }, (_, i) => ({ x: 10 + i * 3.3, y: c.height / 2 + Math.sin(i / 6) * 6 }));
    renderStroke(g, 'pattern', pts, { size: 18, color, seed: 7, pattern: id, spacing: 100, rainbow });
  }, [id, color, rainbow]);
  return <canvas ref={ref} width={150} height={40} />;
}

function PatternOptions() {
  const t = useStore((s) => s.toolSettings.pattern);
  const color = useStore((s) => s.color);
  const setToolSetting = useStore((s) => s.setToolSetting);
  return (
    <>
      <div className="patterns">
        {PATTERNS.map((p) => (
          <button key={p.id} className={'pat' + (t.pattern === p.id ? ' on' : '')} onClick={() => setToolSetting('pattern', { pattern: p.id })} title={p.label}>
            <PatternPreview id={p.id} color={color} rainbow={t.rainbow} />
            <span>{p.label}</span>
          </button>
        ))}
      </div>
      <div className="row">
        <button className={'chip wide-chip' + (!t.rainbow ? ' on' : '')} onClick={() => setToolSetting('pattern', { rainbow: false })}>My colour</button>
        <button className={'chip wide-chip' + (t.rainbow ? ' on' : '')} onClick={() => setToolSetting('pattern', { rainbow: true })}>🌈 Rainbow</button>
      </div>
      <Slider label="Spacing" value={t.spacing} min={40} max={250} suffix="%" onChange={(v) => setToolSetting('pattern', { spacing: v })} hint="how far apart the shapes are" />
    </>
  );
}

function StickerButton({ id }) {
  const stickerId = useStore((s) => s.stickerId);
  const setSticker = useStore((s) => s.setSticker);
  const url = stickerCanvas(id, 128).toDataURL();
  return (
    <button className={'stk' + (stickerId === id ? ' on' : '')} onClick={() => setSticker({ stickerId: id })} title={id}>
      <img src={url} alt={id} />
    </button>
  );
}

const shapeIcons = {};
function shapeIcon(kind) {
  if (!shapeIcons[kind]) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const def = SHAPES.find((x) => x.id === kind);
    const asp = def.aspect, w = asp >= 1 ? 50 : 50 * asp, h = asp >= 1 ? 50 / asp : 50;
    drawShape(c.getContext('2d'), { kind, x: 32, y: 32, w, h, rot: 0, color: '#2b2a33', width: 3 });
    shapeIcons[kind] = c.toDataURL();
  }
  return shapeIcons[kind];
}

function ShapeButton({ def }) {
  const kind = useStore((s) => s.toolSettings.shapes.kind);
  const pick = () => {
    const s = useStore.getState();
    s.setToolSetting('shapes', { kind: def.id });
    if (s.paper.selected) s.paper.selectShape(null); // the next click on the card adds this shape
  };
  return (
    <button className={'stk shape-btn' + (kind === def.id ? ' on' : '')} title={def.label + ' – click it, then click the card (or drag it onto the card)'}
      onPointerDown={(e) => { if (e.button === 0) { pick(); pointer.shapeFromPanel = true; } }}
      onClick={pick} draggable={false}>
      <img src={shapeIcon(def.id)} alt={def.label} draggable={false} />
    </button>
  );
}

let lastStyleEdit = { id: null, t: 0 };
function ShapeOptions() {
  const t = useStore((s) => s.toolSettings.shapes);
  const setToolSetting = useStore((s) => s.setToolSetting);
  const paper = useStore((s) => s.paper);
  const sel = paper.selectedShape();
  const setWidth = (width) => {
    setToolSetting('shapes', { width });
    if (!sel) return;
    // one undo step for one slider drag
    const now = performance.now(), fresh = lastStyleEdit.id !== sel.id || now - lastStyleEdit.t > 1500;
    lastStyleEdit = { id: sel.id, t: now };
    paper.updateShape(paper.selected.face, sel.id, { width }, { undo: fresh });
    useStore.getState().markDirty();
  };
  const remove = () => { if (paper.deleteShape(paper.selected.face, sel.id)) useStore.getState().markDirty(); };
  return (
    <>
      <div className="stickers shapes-grid">{SHAPES.map((d) => <ShapeButton key={d.id} def={d} />)}</div>
      <Slider label="Line thickness" value={sel ? sel.width : t.width} min={2} max={40} onChange={setWidth} />
      {sel ? (
        <>
          <p className="muted"><b>{SHAPES.find((d) => d.id === sel.kind)?.label}</b> selected: drag it to move it, drag the square handles to make it bigger or smaller (Shift keeps the proportions), drag the round handle to rotate it. A new colour or thickness changes it too.</p>
          <div className="row">
            <button className="chip wide-chip" onClick={() => paper.selectShape(null)}>✓ Done</button>
            <button className="chip wide-chip" onClick={remove}>🗑 Delete shape</button>
          </div>
        </>
      ) : (
        <p className="muted">Pick a shape, then click the card – or drag a box on the card, or drag the shape from here onto the card. Shapes are outlines: colour them in with the paint bucket or the pens. Click a shape on the card later to move, resize or rotate it.</p>
      )}
    </>
  );
}

export function ToolOptions() {
  const tool = useStore((s) => s.tool);
  const settings = useStore((s) => s.toolSettings);
  const setToolSetting = useStore((s) => s.setToolSetting);
  const tapeWidth = useStore((s) => s.tapeWidth);
  const setTapeWidth = useStore((s) => s.setTapeWidth);
  const tapePattern = useStore((s) => s.tapePattern);
  const stickerSize = useStore((s) => s.stickerSize);
  const stickerRot = useStore((s) => s.stickerRot);
  const setSticker = useStore((s) => s.setSticker);
  const textSpec = useStore((s) => s.textSpec);
  const setTextSpec = useStore((s) => s.setTextSpec);
  const putBack = useStore((s) => s.putBack);
  const paper = useStore((s) => s.paper);
  const cardHeld = useStore((s) => s.cardHeld);
  const [, force] = useState(0);
  useEffect(() => paper.onChange(() => force((n) => n + 1)), [paper]);

  const draw = tool && DRAW_TOOLS[tool];
  const t = draw ? settings[tool] : null;

  if (paper.choice) {
    return (
      <div className="options choice">
        <strong>✂ The card is in {paper.choice.pieces.length} pieces</strong>
        <p className="muted">Click the piece you want to keep – the other pieces fall away. Undo puts them back.</p>
      </div>
    );
  }

  return (
    <div className="options">
      <div className="options-head">
        <strong>{tool ? TOOL_LABELS[tool] : cardHeld ? 'Holding the card' : 'Pick something from the desk'}</strong>
        <span className="head-actions">
          {tool && tool !== 'picker' && <button className="link" onClick={() => putBackTool(heldToolId(useStore.getState()))}>Put it back (Esc)</button>}
          {tool === 'picker' && <button className="link" onClick={() => useStore.getState().clearTool()}>Cancel (Esc)</button>}
        </span>
        {!tool && cardHeld && <button className="link" onClick={putCardDown}>Put the card down</button>}
      </div>

      {!tool && !cardHeld && <p className="muted">Press on a crayon, marker, tape, stickers… and drag straight onto the card, or click it and then draw. Click the desk to leave a tool there. Drag the card sideways to open or close it, from either side; click the card to pick it up and turn it.</p>}
      {!tool && cardHeld && <p className="muted">Drag on the card to turn it (hold Shift to turn it diagonally). Click it, or the desk, to put it down. You can also draw on it while holding it.</p>}

      {tool === 'pattern' && <PatternOptions />}

      {draw && (
        <div className="grid3">
          <Slider label={tool === 'pattern' ? 'Size' : 'Thickness'} value={t.size} min={DRAW_TOOLS[tool].minSize} max={DRAW_TOOLS[tool].maxSize} onChange={(v) => setToolSetting(tool, { size: v })} />
          <Slider label="Transparency" value={100 - t.opacity} min={0} max={85} suffix="%" onChange={(v) => setToolSetting(tool, { opacity: 100 - v })} hint="0% = solid" />
          <Slider label="Line shape" value={t.straight} min={0} max={100} onChange={(v) => setToolSetting(tool, { straight: v })} hint="0 wobbly · 50 natural · 100 ruler-straight" />
        </div>
      )}

      {tool === 'eraser' && (
        <>
          <Slider label="Eraser size" value={settings.eraser.size} min={8} max={140} onChange={(v) => setToolSetting('eraser', { size: v })} />
          <p className="muted">Rubs out anything drawn with the pens, crayons and brush. Stickers, tape and text stay – use Undo for those.</p>
        </>
      )}
      {tool === 'bucket' && (
        <>
          <p className="muted">Click the card to fill an area with your colour: an empty folded card fills the whole side you see, an open card fills the half you click, and a closed shape you drew gets filled inside. Lines and stickers stay on top; the eraser can remove the fill.</p>
          <div className="grid3">
            <Slider label="Transparency" value={100 - settings.bucket.opacity} min={0} max={85} suffix="%" onChange={(v) => setToolSetting('bucket', { opacity: 100 - v })} hint="0% = solid" />
            <Slider label="Tolerance" value={settings.bucket.tolerance} min={4} max={100} onChange={(v) => setToolSetting('bucket', { tolerance: v })} hint="higher = also fills similar colours" />
          </div>
        </>
      )}
      {tool === 'picker' && <p className="muted">The pointer is now a crosshair: click anywhere on the card to take that colour. It goes straight onto your tools; use “＋ Save colour” to keep it in your palette.</p>}

      {tool === 'tape' && (
        <>
          <p className="muted">Press on the card and drag to pull the tape out, then release. The roll waits there until you cut the tape with the scissors. Tape: {TAPE_PATTERNS.find((p) => p.id === tapePattern)?.label}.</p>
          <Slider label="Tape width" value={tapeWidth} min={30} max={160} onChange={setTapeWidth} />
        </>
      )}
      {tool === 'scissors' && (paper.pendingTape
        ? <p className="muted">Drag a straight line across the tape to cut it (any angle). The scissors only cut the tape now – the card is safe.</p>
        : <p className="muted">Cut the card any way you like: press and drag along the cut. Start from outside the card to cut in from an edge. If the card falls into pieces you choose which one to keep.</p>)}

      {tool === 'sticker' && (
        <>
          <div className="stickers">{STICKERS.map((s) => <StickerButton key={s.id} id={s.id} />)}</div>
          <div className="grid3">
            <Slider label="Size" value={stickerSize} min={80} max={520} onChange={(v) => setSticker({ stickerSize: v })} />
            <Slider label="Rotation" value={stickerRot} min={-180} max={180} suffix="°" onChange={(v) => setSticker({ stickerRot: v })} />
          </div>
          <p className="muted">Click the card to stick it. Stickers cover everything and can’t be drawn over.</p>
        </>
      )}

      {tool === 'shapes' && <ShapeOptions />}

      {tool === 'text' && (
        <>
          <textarea rows={2} maxLength={200} value={textSpec.text} placeholder="Type your message…" onChange={(e) => setTextSpec({ text: e.target.value })} />
          <div className="row">
            <select value={textSpec.family} onChange={(e) => setTextSpec({ family: e.target.value })} style={{ fontFamily: textSpec.family }}>
              {FONTS.map((f) => <option key={f.label} value={f.family} style={{ fontFamily: f.family }}>{f.label}</option>)}
            </select>
            <button className={'chip' + (textSpec.bold ? ' on' : '')} onClick={() => setTextSpec({ bold: !textSpec.bold })}><b>B</b></button>
            <button className={'chip' + (textSpec.italic ? ' on' : '')} onClick={() => setTextSpec({ italic: !textSpec.italic })}><i>I</i></button>
          </div>
          <Slider label="Text size" value={textSpec.size} min={20} max={400} onChange={(v) => setTextSpec({ size: v })} />
          <p className="muted">Move over the card to preview exactly how it will look, then click to place it. It always stays inside the card.</p>
        </>
      )}

      {(draw || tool === 'text' || tool === 'picker' || tool === 'bucket' || tool === 'shapes' || !tool) && <ColorPalette />}
    </div>
  );
}

export function HoverLabel() {
  const hover = useStore((s) => s.hover);
  return hover ? <div className="hover-label">{hover}</div> : null;
}

export function Toast() {
  const toast = useStore((s) => s.toast);
  if (!toast) return null;
  return <div className={'toast ' + toast.kind} role="status" key={toast.id}>{toast.message}</div>;
}

function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, []);
  return { open, setOpen, ref };
}

function BgPicker() {
  const bg = useStore((s) => s.bg);
  const setBg = useStore((s) => s.setBg);
  const { open, setOpen, ref } = usePopover();
  return (
    <div className="popwrap" ref={ref}>
      <button className="btn" onClick={() => setOpen(!open)} title="Background colour">
        <span className="dot" style={{ background: bg }} /> Background
      </button>
      {open && (
        <div className="pop">
          <div className="pop-grid">
            {PASTELS.map((p) => (
              <button key={p.color} className={'swatch' + (p.color === bg ? ' on' : '')} style={{ background: p.color }}
                title={p.name} aria-label={p.name} onClick={() => setBg(p.color)} />
            ))}
          </div>
          <label className="pick-any">
            <span className="swatch custom"><input type="color" value={bg} onChange={(e) => setBg(e.target.value)} aria-label="Any background colour" /><span style={{ background: bg }} /></span>
            Any colour…
          </label>
        </div>
      )}
    </div>
  );
}

const AXES = [
  { id: 'v', label: 'Vertical', hint: 'spin it around, like on a turntable' },
  { id: 'l', label: 'Longitudinal', hint: 'flip it top over bottom' },
  { id: 'd', label: 'Diagonal', hint: 'turn it corner to corner' },
];

function TurnCard() {
  const angles = useStore((s) => s.angles);
  const turnCard = useStore((s) => s.turnCard);
  const setAngle = useStore((s) => s.setAngle);
  const cardHeld = useStore((s) => s.cardHeld);
  const setCardHeld = useStore((s) => s.setCardHeld);
  const resetCard = useStore((s) => s.resetCard);
  const { open, setOpen, ref } = usePopover();
  const deg = (a) => ((Math.round(a) % 360) + 360) % 360;
  return (
    <div className="popwrap" ref={ref}>
      <button className="btn" onClick={() => setOpen(!open)} title="Turn the card">⟳ Turn card</button>
      {open && (
        <div className="pop turn">
          {AXES.map((a) => (
            <div key={a.id} className="axis">
              <span className="axis-label">{a.label}<small>{a.hint}</small></span>
              <div className="axis-ctl">
                <button className="btn icon" onClick={() => turnCard(a.id, -15)} aria-label={`${a.label} turn left`}>⟲</button>
                <input type="range" min={0} max={359} value={deg(angles[a.id])} onChange={(e) => setAngle(a.id, +e.target.value)} aria-label={`${a.label} angle`} />
                <button className="btn icon" onClick={() => turnCard(a.id, 15)} aria-label={`${a.label} turn right`}>⟳</button>
                <span className="deg">{deg(angles[a.id])}°</span>
              </div>
            </div>
          ))}
          <div className="row">
            <button className="btn small" onClick={() => (cardHeld ? putCardDown() : setCardHeld(true))}>{cardHeld ? 'Put the card down' : 'Pick the card up'}</button>
            <button className="btn small" onClick={resetCard}>Reset</button>
          </div>
          <p className="muted">Tip: click the card (with no tool in hand) to pick it up, then drag to turn it.</p>
        </div>
      )}
    </div>
  );
}

function OpenClose() {
  const halves = useStore((s) => s.halves);
  if (!cardIsOpen(halves)) {
    return <button className="btn" onClick={() => turnCardPage(-1)} title="Open the card (O) – or drag it sideways, from either side">📖 Open card</button>;
  }
  return (
    <span className="btn-pair">
      <button className="btn" onClick={() => turnCardPage(-1)} title="Fold the right part over to the left (O)">📕 Close ←</button>
      <button className="btn" onClick={() => turnCardPage(1)} title="Fold the left part over to the right">📘 Close →</button>
    </span>
  );
}

export function TopBar() {
  const paper = useStore((s) => s.paper);
  const setMenu = useStore((s) => s.setMenu);
  const menuOpen = useStore((s) => s.menuOpen);
  const markDirty = useStore((s) => s.markDirty);
  const [, force] = useState(0);
  useEffect(() => paper.onChange(() => force((n) => n + 1)), [paper]);

  const eraseAll = eraseAllWithConfirm;

  return (
    <header className="topbar">
      <div className="logo">🎂 <span>Card Studio</span></div>
      <div className="center">
        <button className="btn" disabled={!paper.canUndo && !paper.choice} onClick={() => { if (paper.undo()) markDirty(); }} title={`Undo (Ctrl+Z) – ${paper.history.length} step${paper.history.length === 1 ? '' : 's'} available`}>↶ Undo</button>
        <button className="btn danger-soft" onClick={eraseAll} title="Erase everything on the card">🧽 Erase all</button>
        <OpenClose />
        <TurnCard />
        <button className="btn" onClick={() => useStore.getState().resetCard()} title="Put the card back flat, the way it started">🎯 Reset rotation</button>
        <button className="btn" onClick={() => useStore.getState().putBackAll()} title="Every tool goes back to its usual place">🧹 Put all tools back</button>
        <ZoomControls />
        <BgPicker />
      </div>
      <button className="menu-btn" onClick={() => setMenu(!menuOpen)} aria-label="Open menu" aria-expanded={menuOpen}>☰</button>
    </header>
  );
}
