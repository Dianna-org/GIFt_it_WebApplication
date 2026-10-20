import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { ANIM_SECONDS, renderLayout } from './layouts.js';

export const PICTURE_SIZE = [1600, 1200];
export const GIF_SIZE = [560, 420];
const FPS = 15;

function makeCanvas([w, h]) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

const other = (side) => (side === 'inside' ? 'outside' : 'inside');

export function renderPicture(layout, paper, bg, side = 'inside', canvas = makeCanvas(PICTURE_SIZE)) {
  renderLayout(canvas, layout, paper.flatFace(side, 0.6), bg, 0.6, paper.flatFace(other(side), 0.6));
  return canvas;
}

export function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function savePicture(layout, paper, bg, name, side = 'inside') {
  const c = renderPicture(layout, paper, bg, side);
  return new Promise((res) => c.toBlob((b) => { downloadBlob(b, `${name}.png`); res(); }, 'image/png'));
}

/** Renders every frame and encodes an endlessly looping GIF. onProgress gets 0..1. */
export async function encodeGif(layout, paper, bg, onProgress = () => {}, side = 'inside') {
  const canvas = makeCanvas(GIF_SIZE);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const frames = Math.round(ANIM_SECONDS * FPS);
  const gif = GIFEncoder();
  const artAt = (t) => paper.flatFace(side, t);
  const back = paper.flatFace(other(side), 0);
  for (let i = 0; i < frames; i++) {
    const t = (i / frames) * ANIM_SECONDS;
    renderLayout(canvas, layout, artAt(t), bg, t, back);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const palette = quantize(data, 256);
    gif.writeFrame(applyPalette(data, palette), canvas.width, canvas.height, { palette, delay: Math.round(1000 / FPS) });
    onProgress((i + 1) / frames);
    await new Promise((r) => setTimeout(r, 0));
  }
  gif.finish();
  return new Blob([gif.bytes()], { type: 'image/gif' });
}

export async function saveGif(layout, paper, bg, name, onProgress, side = 'inside') {
  const blob = await encodeGif(layout, paper, bg, onProgress, side);
  downloadBlob(blob, `${name}.gif`);
}
