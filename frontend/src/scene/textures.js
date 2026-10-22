import * as THREE from 'three';
import { makeRng } from '../engine/random.js';

function canvasTex(w, h, draw, { repeat, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}

let bump;
/** Fine paper fibre, used as a bump map so the card catches the light like real paper. */
export function paperBumpTexture() {
  if (bump) return bump;
  bump = canvasTex(512, 512, (g, w, h) => {
    const img = g.createImageData(w, h), d = img.data, rng = makeRng(42);
    for (let i = 0; i < w * h; i++) { const v = 118 + rng() * 22; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
    g.putImageData(img, 0, 0);
    g.globalAlpha = 0.08; g.strokeStyle = '#fff';
    for (let i = 0; i < 260; i++) {
      const x = rng() * w, y = rng() * h, a = rng() * Math.PI, l = 6 + rng() * 22;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
  }, { repeat: [3, 3], srgb: false });
  return bump;
}

/** Paper wrapper of a crayon, in the crayon's colour. u runs around the crayon, v along it. */
export function crayonLabel(color) {
  return canvasTex(128, 320, (g, w, h) => {
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,.18)';
    for (let x = 0; x < w; x += 16) {
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 8, 14); g.lineTo(x + 16, 0); g.fill();
      g.beginPath(); g.moveTo(x, h); g.lineTo(x + 8, h - 14); g.lineTo(x + 16, h); g.fill();
    }
    g.fillStyle = '#fbf5e6'; g.fillRect(w * 0.18, h * 0.12, w * 0.64, h * 0.76);
    g.save(); g.translate(w / 2, h / 2); g.rotate(-Math.PI / 2);
    g.fillStyle = '#2b2a33'; g.font = 'bold 40px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('CRAYON', 0, 0); g.restore();
  });
}

/** Printed band on a marker barrel (text runs along the barrel). */
export function markerLabel(color) {
  return canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, w, h);
    g.fillStyle = color; g.fillRect(0, 0, w, 16); g.fillRect(0, h - 16, w, 16);
    g.save(); g.translate(w * 0.5, h / 2); g.rotate(-Math.PI / 2);
    g.fillStyle = '#3a3a3a'; g.font = 'bold 30px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('ART MARKER', 0, 0); g.restore();
  });
}

/** Side of a tape roll: the pattern, wrapped around. */
export function tapeSide(p) {
  return canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = p.base; g.fillRect(0, 0, w, h);
    g.fillStyle = p.ink; g.strokeStyle = p.ink;
    if (p.kind === 'stripes') { g.lineWidth = 9; for (let i = -64; i < w + 64; i += 22) { g.beginPath(); g.moveTo(i, h); g.lineTo(i + 40, 0); g.stroke(); } }
    else if (p.kind === 'zigzag') { g.lineWidth = 5; g.beginPath(); for (let x = 0; x <= w; x += 12) g.lineTo(x, h / 2 + ((x / 12) % 2 ? -12 : 12)); g.stroke(); }
    else if (p.kind === 'check') { g.globalAlpha = 0.55; for (let x = 0; x < w; x += 32) for (let y = 0; y < h; y += 32) if (((x + y) / 32) % 2 === 0) g.fillRect(x, y, 16, 16); }
    else if (p.kind === 'hearts' || p.kind === 'stars' || p.kind === 'dots') {
      for (let x = 12; x < w; x += 32) for (let y = 14; y < h; y += 34) { g.beginPath(); g.arc(x + ((y / 34) % 2) * 16, y, p.kind === 'dots' ? 6 : 5, 0, 6.3); g.fill(); }
    }
  });
}

/** Top of a tape roll: many thin wound layers. */
export function tapeLayers(p) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = p.base; g.fillRect(0, 0, w, h);
    for (let r = 66; r < 128; r += 2.2) {
      g.strokeStyle = `rgba(0,0,0,${0.04 + ((r * 7) % 5) * 0.012})`;
      g.beginPath(); g.arc(w / 2, h / 2, r, 0, 6.3); g.stroke();
    }
    g.fillStyle = 'rgba(255,255,255,.15)'; g.fillRect(0, 0, w, h * 0.4);
  });
}

export function cardboard() {
  return canvasTex(128, 64, (g, w, h) => {
    g.fillStyle = '#c9a774'; g.fillRect(0, 0, w, h);
    const rng = makeRng(7);
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(90,60,20,${rng() * 0.12})`; g.fillRect(rng() * w, rng() * h, 2, 1); }
    g.strokeStyle = 'rgba(90,60,20,.25)'; g.beginPath(); g.moveTo(0, h * 0.3); g.lineTo(w, h * 0.7); g.stroke();
  }, { repeat: [2, 1] });
}

export function eraserSleeve() {
  return canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#3d6fb6'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff'; g.fillRect(0, h * 0.62, w, 6);
    g.font = 'bold 34px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('ERASER', w / 2, h * 0.4);
  });
}

/** Pattern pen barrel: little hearts, stars and dots on rainbow stripes. */
export function patternBarrel() {
  return canvasTex(256, 128, (g, w, h) => {
    const cols = ['#f9a8b8', '#fcd581', '#a8e0b5', '#9cc9f5', '#c9b2f0'];
    cols.forEach((c, i) => { g.fillStyle = c; g.fillRect((i * w) / cols.length, 0, w / cols.length + 1, h); });
    g.fillStyle = 'rgba(255,255,255,.9)';
    for (let y = 16; y < h; y += 32) for (let x = 14 + ((y / 32) % 2) * 22; x < w; x += 44) {
      g.save(); g.translate(x, y);
      if ((x + y) % 3 === 0) { g.beginPath(); for (let k = 0; k < 10; k++) { const a = (k * Math.PI) / 5 - Math.PI / 2, r = k % 2 ? 3 : 7; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.fill(); }
      else if ((x + y) % 3 === 1) { g.beginPath(); g.moveTo(0, 5); g.bezierCurveTo(-8, 0, -5, -7, 0, -3); g.bezierCurveTo(5, -7, 8, 0, 0, 5); g.fill(); }
      else { g.beginPath(); g.arc(0, 0, 3.5, 0, 6.3); g.fill(); }
      g.restore();
    }
  });
}
