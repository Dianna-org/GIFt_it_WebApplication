import * as THREE from 'three';

/**
 * Zooming on the card splits the screen: the left part keeps the normal view of the desk (cropped,
 * not squeezed), the right part shows the card through a second camera, and a third camera draws the
 * small "zoom map" of the whole card. Everything is one scene, so drawing works in the zoomed view.
 */
export const SPLIT = 0.46; // where the zoomed view starts, as a share of the window width

export const zoomView = {
  active: false,
  splitPx: 0,
  camera: new THREE.PerspectiveCamera(38, 1, 0.05, 80),
  mapCamera: new THREE.PerspectiveCamera(38, 1, 0.05, 80),
  centre: new THREE.Vector3(),   // middle of the card (world)
  plane: new THREE.Plane(),      // the card's surface
  extent: { hw: 1, hh: 1 },      // half size of the card as seen by the camera
  right: new THREE.Vector3(1, 0, 0),
  up: new THREE.Vector3(0, 1, 0),
};

const tmp = new THREE.Vector3();

/** Points a camera at the card: zoom 1 = the whole card fits. Returns the (clamped) offset used. */
export function aimCamera(cam, mainCam, aspect, zoom, offset) {
  const z = zoomView;
  const t = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
  const base = Math.max(z.extent.hh / t, z.extent.hw / (t * aspect)) * 1.12;
  const dist = base / zoom;
  // the view may wander over the card, but not off it
  const ox = THREE.MathUtils.clamp(offset.x, -z.extent.hw, z.extent.hw);
  const oy = THREE.MathUtils.clamp(offset.y, -z.extent.hh, z.extent.hh);
  const target = z.centre.clone().addScaledVector(z.right, ox).addScaledVector(z.up, oy);
  const dir = mainCam.getWorldDirection(tmp);
  cam.aspect = aspect;
  cam.up.copy(mainCam.up);
  cam.position.copy(target).addScaledVector(dir, -dist);
  cam.lookAt(target);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return { x: ox, y: oy, target };
}

/** Where a pointer ray hits the card's plane (world), or null. */
export function hitCardPlane(ray) {
  return ray.intersectPlane(zoomView.plane, new THREE.Vector3());
}

/** World point -> offset from the card's middle along the view's right/up directions. */
export function offsetOf(point) {
  const d = point.clone().sub(zoomView.centre);
  return { x: d.dot(zoomView.right), y: d.dot(zoomView.up) };
}
