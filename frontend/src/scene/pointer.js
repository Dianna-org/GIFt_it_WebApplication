import * as THREE from 'three';

// Shared, mutable pointer state read every frame by the 3D tools (kept outside React state on purpose).
export const pointer = {
  world: new THREE.Vector3(0, 0, 0), // pointer on the desk / card, world units
  onCard: false,
  down: false,
  drawing: false,        // a stroke / cut is in progress
  travel: 0,             // distance travelled while pressed (drives roll spin and scissor snips)
  last: new THREE.Vector3(),
  vel: new THREE.Vector2(),
  snipUntil: 0,          // performance.now() until which scissors snip quickly after a cut
  placedAt: 0,           // when a sticker was last placed (for a little pop animation)
  hoverTool: null,
};

export function movePointer(p) {
  pointer.vel.set(p.x - pointer.world.x, p.y - pointer.world.y);
  if (pointer.down) pointer.travel += pointer.vel.length();
  pointer.world.copy(p);
}
