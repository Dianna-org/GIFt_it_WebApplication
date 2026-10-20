/**
 * Finds the separate pieces of paper after a cut (4-connected regions of alpha > 127).
 * Pieces smaller than `minArea` pixels are crumbs: they are dropped (label 0).
 * Returns labels (0 = no paper) and the list of pieces with their areas, biggest first.
 */
export function labelPieces(alpha, w, h, minArea = 0) {
  const labels = new Int32Array(w * h);
  const queue = new Int32Array(w * h);
  const areas = [0];
  let next = 1;
  for (let start = 0; start < labels.length; start++) {
    if (labels[start] || alpha[start] <= 127) continue;
    let head = 0, tail = 0, area = 0;
    queue[tail++] = start; labels[start] = next;
    while (head < tail) {
      const i = queue[head++]; area++;
      const x = i % w;
      const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w];
      for (const j of nb) {
        if (j < 0 || j >= labels.length || labels[j] || alpha[j] <= 127) continue;
        labels[j] = next; queue[tail++] = j;
      }
    }
    areas.push(area);
    next++;
  }
  const keep = new Set();
  const pieces = [];
  for (let id = 1; id < next; id++) if (areas[id] >= minArea) { keep.add(id); pieces.push({ id, area: areas[id] }); }
  if (pieces.length !== next - 1) for (let i = 0; i < labels.length; i++) if (labels[i] && !keep.has(labels[i])) labels[i] = 0;
  pieces.sort((a, b) => b.area - a.area);
  return { labels, pieces };
}
