// Procedurally drawn stickers (no external images, so everything is free and offline).

const TAU = Math.PI * 2;

function poly(ctx, pts) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

const art = {
  star(ctx, r) {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = (i * Math.PI) / 5 - Math.PI / 2;
      const rr = i % 2 ? r * 0.42 : r;
      pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
    }
    poly(ctx, pts);
    ctx.fillStyle = '#f9c74f'; ctx.fill();
    poly(ctx, pts.map(([x, y], i) => (i % 2 ? [x, y] : [x * 0.82, y * 0.82])));
    ctx.fillStyle = '#ffe08a'; ctx.fill();
  },
  heart(ctx, r) {
    ctx.beginPath();
    ctx.moveTo(0, r * 0.85);
    ctx.bezierCurveTo(-r * 1.3, r * 0.1, -r * 0.8, -r * 0.9, 0, -r * 0.35);
    ctx.bezierCurveTo(r * 0.8, -r * 0.9, r * 1.3, r * 0.1, 0, r * 0.85);
    ctx.fillStyle = '#ee6c92'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(-r * 0.4, -r * 0.3, r * 0.2, r * 0.12, -0.6, 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fill();
  },
  flower(ctx, r) {
    for (let i = 0; i < 6; i++) {
      ctx.save(); ctx.rotate((i * TAU) / 6);
      ctx.beginPath(); ctx.ellipse(0, -r * 0.55, r * 0.3, r * 0.45, 0, 0, TAU);
      ctx.fillStyle = i % 2 ? '#f4845f' : '#f9a58a'; ctx.fill(); ctx.restore();
    }
    ctx.beginPath(); ctx.arc(0, 0, r * 0.28, 0, TAU); ctx.fillStyle = '#f9c74f'; ctx.fill();
  },
  leaf(ctx, r) {
    ctx.beginPath();
    ctx.moveTo(0, r); ctx.bezierCurveTo(-r * 1.1, r * 0.3, -r * 0.6, -r * 0.9, 0, -r);
    ctx.bezierCurveTo(r * 0.6, -r * 0.9, r * 1.1, r * 0.3, 0, r);
    ctx.fillStyle = '#6aa57a'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, r * 0.9); ctx.lineTo(0, -r * 0.7);
    ctx.strokeStyle = '#3f7d56'; ctx.lineWidth = r * 0.07; ctx.stroke();
  },
  cake(ctx, r) {
    const rect = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
    rect(-r * 0.85, r * 0.2, r * 1.7, r * 0.7, '#2f8f83');
    rect(-r * 0.65, -r * 0.35, r * 1.3, r * 0.6, '#f4845f');
    rect(-r * 0.65, -r * 0.05, r * 1.3, r * 0.12, '#fbe3a0');
    [-0.35, 0, 0.35].forEach((x, i) => {
      rect(x * r - r * 0.05, -r * 0.8, r * 0.1, r * 0.45, ['#e63946', '#4d96ff', '#90be6d'][i]);
      ctx.beginPath(); ctx.ellipse(x * r, -r * 0.9, r * 0.07, r * 0.13, 0, 0, TAU);
      ctx.fillStyle = '#ffc233'; ctx.fill();
    });
  },
  balloon(ctx, r) {
    ctx.beginPath(); ctx.ellipse(0, -r * 0.15, r * 0.65, r * 0.8, 0, 0, TAU);
    ctx.fillStyle = '#e8506a'; ctx.fill();
    poly(ctx, [[0, r * 0.62], [-r * 0.1, r * 0.78], [r * 0.1, r * 0.78]]); ctx.fillStyle = '#c93a54'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, r * 0.78);
    ctx.bezierCurveTo(-r * 0.3, r * 0.9, r * 0.3, r * 0.95, 0, r);
    ctx.strokeStyle = '#6b6b6b'; ctx.lineWidth = r * 0.04; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(-r * 0.25, -r * 0.45, r * 0.12, r * 0.2, 0.5, 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fill();
  },
  gift(ctx, r) {
    ctx.fillStyle = '#4d96ff'; ctx.fillRect(-r * 0.8, -r * 0.2, r * 1.6, r);
    ctx.fillStyle = '#3a7de0'; ctx.fillRect(-r * 0.9, -r * 0.45, r * 1.8, r * 0.3);
    ctx.fillStyle = '#ffd166'; ctx.fillRect(-r * 0.1, -r * 0.45, r * 0.2, r * 1.25);
    ctx.beginPath(); ctx.ellipse(-r * 0.3, -r * 0.62, r * 0.28, r * 0.17, -0.4, 0, TAU);
    ctx.ellipse(r * 0.3, -r * 0.62, r * 0.28, r * 0.17, 0.4, 0, TAU); ctx.fill();
  },
  smiley(ctx, r) {
    ctx.beginPath(); ctx.arc(0, 0, r * 0.9, 0, TAU); ctx.fillStyle = '#ffd24a'; ctx.fill();
    ctx.fillStyle = '#5b3a1e';
    ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.2, r * 0.1, 0, TAU); ctx.arc(r * 0.3, -r * 0.2, r * 0.1, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(0, r * 0.05, r * 0.5, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.strokeStyle = '#5b3a1e'; ctx.lineWidth = r * 0.1; ctx.lineCap = 'round'; ctx.stroke();
  },
  crown(ctx, r) {
    poly(ctx, [[-r, r * 0.6], [-r, -r * 0.4], [-r * 0.5, r * 0.1], [0, -r * 0.7], [r * 0.5, r * 0.1], [r, -r * 0.4], [r, r * 0.6]]);
    ctx.fillStyle = '#f2b632'; ctx.fill();
    ctx.fillStyle = '#e0962a'; ctx.fillRect(-r, r * 0.4, r * 2, r * 0.2);
    [[-0.5, 0.25, '#e63946'], [0, 0.25, '#4d96ff'], [0.5, 0.25, '#90be6d']].forEach(([x, y, c]) => {
      ctx.beginPath(); ctx.arc(x * r, y * r, r * 0.09, 0, TAU); ctx.fillStyle = c; ctx.fill();
    });
  },
  sun(ctx, r) {
    for (let i = 0; i < 12; i++) {
      ctx.save(); ctx.rotate((i * TAU) / 12);
      poly(ctx, [[-r * 0.1, -r * 0.62], [r * 0.1, -r * 0.62], [0, -r]]); ctx.fillStyle = '#f4845f'; ctx.fill(); ctx.restore();
    }
    ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, TAU); ctx.fillStyle = '#ffc233'; ctx.fill();
  },
  moon(ctx, r) {
    ctx.beginPath(); ctx.arc(0, 0, r * 0.9, 0, TAU);
    ctx.fillStyle = '#ffe08a'; ctx.fill();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath(); ctx.arc(r * 0.45, -r * 0.2, r * 0.75, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  },
  rainbow(ctx, r) {
    ['#e63946', '#f9c74f', '#90be6d', '#4d96ff'].forEach((c, i) => {
      ctx.beginPath(); ctx.arc(0, r * 0.5, r * (0.95 - i * 0.2), Math.PI, 0);
      ctx.strokeStyle = c; ctx.lineWidth = r * 0.2; ctx.stroke();
    });
  },
  cloud(ctx, r) {
    ctx.fillStyle = '#e8f1fb';
    ctx.beginPath(); ctx.arc(-r * 0.4, r * 0.1, r * 0.4, 0, TAU); ctx.arc(0, -r * 0.15, r * 0.5, 0, TAU);
    ctx.arc(r * 0.45, r * 0.1, r * 0.4, 0, TAU); ctx.fill();
    ctx.fillRect(-r * 0.4, r * 0.1, r * 0.85, r * 0.4);
    ctx.strokeStyle = '#b6cde6'; ctx.lineWidth = r * 0.05; ctx.strokeRect(-r * 0.4, r * 0.5, r * 0.85, 0);
  },
  butterfly(ctx, r) {
    ctx.fillStyle = '#b185db';
    [[-1, 1], [1, 1]].forEach(([sx]) => {
      ctx.beginPath(); ctx.ellipse(sx * r * 0.45, -r * 0.25, r * 0.45, r * 0.35, sx * -0.4, 0, TAU); ctx.fill();
    });
    ctx.fillStyle = '#f48fb1';
    [[-1], [1]].forEach(([sx]) => {
      ctx.beginPath(); ctx.ellipse(sx * r * 0.32, r * 0.3, r * 0.3, r * 0.25, sx * 0.4, 0, TAU); ctx.fill();
    });
    ctx.fillStyle = '#4a3b52'; ctx.fillRect(-r * 0.06, -r * 0.55, r * 0.12, r * 1.1);
  },
};

export const STICKERS = Object.keys(art).map((id) => ({ id, label: id[0].toUpperCase() + id.slice(1) }));

const cache = new Map();

/** Returns a canvas (size x size) with the die-cut sticker (art + white border). */
export function stickerCanvas(id, size = 256) {
  const key = id + size;
  if (cache.has(key)) return cache.get(key);
  const pad = Math.round(size * 0.06);
  const a = document.createElement('canvas');
  a.width = a.height = size;
  const actx = a.getContext('2d');
  actx.translate(size / 2, size / 2);
  art[id](actx, size / 2 - pad * 2);

  const tint = document.createElement('canvas');
  tint.width = tint.height = size;
  const tctx = tint.getContext('2d');
  tctx.drawImage(a, 0, 0);
  tctx.globalCompositeOperation = 'source-in';
  tctx.fillStyle = '#fffdf8';
  tctx.fillRect(0, 0, size, size);

  const out = document.createElement('canvas');
  out.width = out.height = size;
  const o = out.getContext('2d');
  const r = pad * 1.3;
  for (let i = 0; i < 20; i++) {
    const ang = (i / 20) * TAU;
    o.drawImage(tint, Math.cos(ang) * r, Math.sin(ang) * r);
  }
  o.drawImage(a, 0, 0);
  cache.set(key, out);
  return out;
}
