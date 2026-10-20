// Small deterministic RNG so strokes re-render identically while being dragged.
export function makeRng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function smoothNoise(rng1d, x) {
  // value noise from a table-less hash: cheap, continuous
  const i = Math.floor(x);
  const f = x - i;
  const a = hash(i), b = hash(i + 1);
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u;
}
function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}
