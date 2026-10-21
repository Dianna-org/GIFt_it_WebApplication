import { useRef } from 'react';
import * as THREE from 'three';
import { useStore, ZOOM_MAX } from '../store.js';
import { hitCardPlane, offsetOf, zoomView } from '../scene/zoom.js';

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

const ndc = new THREE.Vector2();
const ray = new THREE.Raycaster();

/** While zoomed: the right side of the screen and the zoom map (click or drag it to look elsewhere). */
export function ZoomOverlay() {
  const zoom = useStore((s) => s.zoom);
  const dragging = useRef(false);
  if (!zoom) return null;

  const lookAt = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, zoomView.mapCamera);
    const hit = hitCardPlane(ray.ray);
    if (hit) useStore.setState({ zoomOffset: offsetOf(hit) });
  };

  return (
    <>
      <div className="zoom-area" aria-hidden="true" />
      <div className="zoom-map" title="Zoom map – the red frame is what you see. Click or drag to move around.">
        <span className="zoom-map-title">Zoom map</span>
        <div className="zoom-map-view"
          onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); lookAt(e); }}
          onPointerMove={(e) => { if (dragging.current) lookAt(e); }}
          onPointerUp={() => { dragging.current = false; }}>
          <svg className="zoom-map-svg"><polygon className="zoom-map-rect" points="" /></svg>
        </div>
      </div>
    </>
  );
}
