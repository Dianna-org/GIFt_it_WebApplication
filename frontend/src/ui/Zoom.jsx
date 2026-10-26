import { useLayoutEffect, useRef, useState } from 'react';
import { useStore, ZOOM_MAX } from '../store.js';
import { offsetOf, zoomView } from '../scene/zoom.js';
import { canvasToWorld } from '../scene/Card.jsx';

/** Top bar: "Zoom in" is always there; the zoom slider and "Zoom out" only while zoomed. */
export function ZoomControls() {
  const zoom = useStore((s) => s.zoom);
  const zoomIn = useStore((s) => s.zoomIn);
  const setZoom = useStore((s) => s.setZoom);
  const zoomOut = useStore((s) => s.zoomOut);
  return (
    <span className="zoom-ctl">
      <button className="btn" onClick={zoomIn} disabled={zoom >= ZOOM_MAX} title="Zoom in on the card (+)">🔍 Zoom in</button>
      {zoom > 0 && (
        <>
          <label className="zoom-slider" title="How much to zoom (mouse wheel over the card works too)">
            <input type="range" min={1} max={ZOOM_MAX} step={0.1} value={zoom} onChange={(e) => setZoom(+e.target.value)} aria-label="Zoom amount" />
            <b>{zoom.toFixed(1)}×</b>
          </label>
          <button className="btn" onClick={zoomOut} title="Back to the normal view (−)">↩ Zoom out</button>
        </>
      )}
    </span>
  );
}

/**
 * While zoomed: the divider of the right side and the zoom map – a picture of the side of the card you
 * are looking at, with a red frame for the part shown in the zoomed view. Click or drag it to move.
 * The renderer (scene/Desk.jsx) draws into the map and moves the divider every frame, so both follow
 * the zoom animation exactly.
 */
export function ZoomOverlay() {
  const zoom = useStore((s) => s.zoom);
  const mapHidden = useStore((s) => s.mapHidden);
  const dragging = useRef(false);
  // the map sits in the top-right corner (the logo is hidden while zoomed in), just below the top bar's
  // buttons, however many rows they take on this screen
  const [mapTop, setMapTop] = useState(14);
  useLayoutEffect(() => {
    if (!zoom) return undefined;
    const place = () => {
      const bar = document.querySelector('.topbar .center');
      setMapTop(bar ? Math.round(bar.getBoundingClientRect().bottom) + 10 : 14);
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [zoom]);
  if (!zoom) return null;

  const lookAt = (e) => {
    const m = zoomView.map;
    if (!m) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * e.currentTarget.width;
    const py = ((e.clientY - r.top) / r.height) * e.currentTarget.height;
    const cx = m.srcX + ((px - m.ix) / m.iw) * m.srcW;
    const cy = ((py - m.iy) / m.ih) * m.srcH;
    useStore.setState({ zoomOffset: offsetOf(canvasToWorld(m.face, cx, cy)) });
  };

  return (
    <>
      <div className="zoom-area" aria-hidden="true" />
      <div className={'zoom-map' + (mapHidden ? ' folded' : '')} style={{ top: mapTop }} title={mapHidden ? 'Show the zoom map' : 'Zoom map – the red frame is what you see. Click or drag to move around.'}>
        <span className="zoom-map-title">
          {mapHidden
            ? <button className="map-toggle" onClick={() => useStore.setState({ mapHidden: false })} aria-label="Show the zoom map">🗺 Map ▾</button>
            : <>Zoom map <small className="zoom-map-side" /><button className="map-toggle hide" onClick={() => useStore.setState({ mapHidden: true })} title="Hide the map so it doesn't cover the card" aria-label="Hide the zoom map">▴ Hide</button></>}
        </span>
        <canvas className="zoom-map-canvas" width={216} height={150}
          onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); lookAt(e); }}
          onPointerMove={(e) => { if (dragging.current) lookAt(e); }}
          onPointerUp={() => { dragging.current = false; }} />
      </div>
    </>
  );
}
