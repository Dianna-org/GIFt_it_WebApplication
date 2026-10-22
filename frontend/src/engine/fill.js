/**
 * Paint bucket: finds the area to fill, like the bucket in drawing apps.
 * Starting at (sx, sy) it spreads to neighbouring pixels of (almost) the same colour, and stops at
 * lines of another colour, at holes / cut-away paper (alpha < 128), at stickers (blocked[i] = 1)
 * and at the fold: only columns x0 <= x < x1 (one half of an open card) are filled.
 *
 * rgba: Uint8ClampedArray of the flattened face (w*h*4). Returns a Uint8Array mask (1 = fill) or null.
 */
export function floodRegion(rgba, w, h, sx, sy, { x0 = 0, x1 = w, tolerance = 24, blocked = null } = {}) {
  sx = Math.floor(sx); sy = Math.floor(sy);
  if (sx < x0 || sx >= x1 || sy < 0 || sy >= h) return null;
  const s = (sy * w + sx) * 4;
  if (rgba[s + 3] < 128 || (blocked && blocked[sy * w + sx])) return null;
  const r0 = rgba[s], g0 = rgba[s + 1], b0 = rgba[s + 2];
  // "same colour" = every channel within `tolerance` (so even pale pastel lines stop the paint)
  const match = (i) => {
    if (blocked && blocked[i]) return false;
    const o = i * 4;
    if (rgba[o + 3] < 128) return false;
    return Math.abs(rgba[o] - r0) <= tolerance && Math.abs(rgba[o + 1] - g0) <= tolerance && Math.abs(rgba[o + 2] - b0) <= tolerance;
  };
  const mask = new Uint8Array(w * h);
  const stack = [sy * w + sx];
  mask[sy * w + sx] = 1;
  while (stack.length) {
    const i = stack.pop();
    const x = i % w;
    // 4 neighbours, kept inside the allowed columns
    if (x > x0 && !mask[i - 1] && match(i - 1)) { mask[i - 1] = 1; stack.push(i - 1); }
    if (x < x1 - 1 && !mask[i + 1] && match(i + 1)) { mask[i + 1] = 1; stack.push(i + 1); }
    if (i >= w && !mask[i - w] && match(i - w)) { mask[i - w] = 1; stack.push(i - w); }
    if (i < w * (h - 1) && !mask[i + w] && match(i + w)) { mask[i + w] = 1; stack.push(i + w); }
  }
  return mask;
}

/** Grows a mask by `px` pixels (so the fill tucks under the soft edges of lines), within columns x0..x1. */
export function growMask(mask, w, h, px, { x0 = 0, x1 = w, allowed = null } = {}) {
  let cur = mask;
  for (let k = 0; k < px; k++) {
    const next = cur.slice();
    for (let i = 0; i < cur.length; i++) {
      if (!cur[i]) continue;
      const x = i % w;
      const add = (j) => { if (!next[j] && (!allowed || allowed[j])) next[j] = 1; };
      if (x > x0) add(i - 1);
      if (x < x1 - 1) add(i + 1);
      if (i >= w) add(i - w);
      if (i < w * (h - 1)) add(i + w);
    }
    cur = next;
  }
  return cur;
}
