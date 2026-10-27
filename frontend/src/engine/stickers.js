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

// ----- sticker packs from the gift shop (round 40) -----
const circle = (ctx, x, y, r, c) => { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = c; ctx.fill(); };
const ell = (ctx, x, y, rx, ry, c, rot = 0) => { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, TAU); ctx.fillStyle = c; ctx.fill(); };
const eyes = (ctx, r, y = -r * 0.1, gap = 0.3, size = 0.09) => { circle(ctx, -r * gap, y, r * size, '#2b2a33'); circle(ctx, r * gap, y, r * size, '#2b2a33'); circle(ctx, -r * gap + r * 0.03, y - r * 0.03, r * size * 0.35, '#fff'); circle(ctx, r * gap + r * 0.03, y - r * 0.03, r * size * 0.35, '#fff'); };
const smile = (ctx, r, y = r * 0.12, w = 0.18) => { ctx.beginPath(); ctx.arc(0, y, r * w, 0.15 * Math.PI, 0.85 * Math.PI); ctx.strokeStyle = '#2b2a33'; ctx.lineWidth = r * 0.06; ctx.lineCap = 'round'; ctx.stroke(); };
const cheeks = (ctx, r, y = r * 0.12) => { ell(ctx, -r * 0.45, y, r * 0.11, r * 0.07, 'rgba(238,108,146,.55)'); ell(ctx, r * 0.45, y, r * 0.11, r * 0.07, 'rgba(238,108,146,.55)'); };

const packArt = {
  // Party pack
  partyhat(ctx, r) {
    poly(ctx, [[0, -r * 0.85], [r * 0.6, r * 0.85], [-r * 0.6, r * 0.85]]); ctx.fillStyle = '#4d96ff'; ctx.fill();
    ctx.save(); poly(ctx, [[0, -r * 0.85], [r * 0.6, r * 0.85], [-r * 0.6, r * 0.85]]); ctx.clip();
    ctx.strokeStyle = '#f9c74f'; ctx.lineWidth = r * 0.14;
    [-0.4, 0.05, 0.5].forEach((y) => { ctx.beginPath(); ctx.moveTo(-r, y * r + r * 0.3); ctx.lineTo(r, y * r - r * 0.2); ctx.stroke(); });
    ctx.restore();
    circle(ctx, 0, -r * 0.88, r * 0.17, '#ee6c92');
  },
  present(ctx, r) {
    ctx.fillStyle = '#e63946'; ctx.fillRect(-r * 0.75, -r * 0.2, r * 1.5, r * 1.0);
    ctx.fillStyle = '#c92f3b'; ctx.fillRect(-r * 0.85, -r * 0.42, r * 1.7, r * 0.3);
    ctx.fillStyle = '#f9c74f'; ctx.fillRect(-r * 0.12, -r * 0.42, r * 0.24, r * 1.22);
    ell(ctx, -r * 0.3, -r * 0.6, r * 0.32, r * 0.16, '#f9c74f', 0.5); ell(ctx, r * 0.3, -r * 0.6, r * 0.32, r * 0.16, '#f9c74f', -0.5);
    circle(ctx, 0, -r * 0.5, r * 0.12, '#f4a623');
  },
  popper(ctx, r) {
    ctx.save(); ctx.rotate(-0.6);
    poly(ctx, [[-r * 0.2, -r * 0.1], [r * 0.2, -r * 0.1], [r * 0.1, r * 0.9], [-r * 0.1, r * 0.9]]); ctx.fillStyle = '#9b5de5'; ctx.fill();
    ctx.fillStyle = '#f15bb5'; ctx.fillRect(-r * 0.2, r * 0.15, r * 0.4, r * 0.1); ctx.fillRect(-r * 0.17, r * 0.45, r * 0.34, r * 0.1);
    ctx.restore();
    [['#f9c74f', -0.2, -0.75], ['#4d96ff', 0.35, -0.55], ['#90be6d', 0.6, -0.15], ['#ee6c92', -0.5, -0.5], ['#f4845f', 0.1, -0.95]].forEach(([c, x, y], i) => {
      ctx.save(); ctx.translate(x * r, y * r); ctx.rotate(i); ctx.fillStyle = c; ctx.fillRect(-r * 0.08, -r * 0.04, r * 0.16, r * 0.08); ctx.restore();
    });
  },
  bunting(ctx, r) {
    ctx.beginPath(); ctx.moveTo(-r, -r * 0.5); ctx.quadraticCurveTo(0, -r * 0.15, r, -r * 0.5); ctx.strokeStyle = '#6d6a73'; ctx.lineWidth = r * 0.05; ctx.stroke();
    ['#e63946', '#f9c74f', '#2a9d8f', '#4d96ff', '#ee6c92'].forEach((c, i) => {
      const x = -r * 0.8 + i * r * 0.4, y = -r * 0.5 + Math.sin((i / 4) * Math.PI) * r * 0.27;
      poly(ctx, [[x - r * 0.17, y], [x + r * 0.17, y], [x, y + r * 0.55]]); ctx.fillStyle = c; ctx.fill();
    });
  },
  discoball(ctx, r) {
    circle(ctx, 0, r * 0.1, r * 0.7, '#c3cad1');
    ctx.save(); ctx.beginPath(); ctx.arc(0, r * 0.1, r * 0.7, 0, TAU); ctx.clip();
    for (let y = -r; y < r; y += r * 0.18) for (let x = -r; x < r; x += r * 0.18) {
      const k = (Math.sin(x * 7.1 + y * 3.3) + 1) / 2; ctx.fillStyle = k > 0.75 ? '#ffffff' : k > 0.4 ? '#dfe5ea' : '#9aa5b1';
      ctx.fillRect(x + r * 0.01, y + r * 0.01, r * 0.16, r * 0.16);
    }
    ctx.restore();
    ctx.fillStyle = '#6d6a73'; ctx.fillRect(-r * 0.03, -r, r * 0.06, r * 0.4);
  },
  sparkler(ctx, r) {
    ctx.strokeStyle = '#8d949b'; ctx.lineWidth = r * 0.07; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-r * 0.6, r * 0.8); ctx.lineTo(r * 0.15, -r * 0.1); ctx.stroke();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU, l = r * (i % 2 ? 0.45 : 0.7);
      ctx.beginPath(); ctx.moveTo(r * 0.2, -r * 0.15); ctx.lineTo(r * 0.2 + Math.cos(a) * l, -r * 0.15 + Math.sin(a) * l);
      ctx.strokeStyle = i % 3 ? '#f9c74f' : '#f4845f'; ctx.lineWidth = r * 0.05; ctx.stroke();
    }
    circle(ctx, r * 0.2, -r * 0.15, r * 0.14, '#fff6c8');
  },
  // Animals pack
  cat(ctx, r) {
    poly(ctx, [[-r * 0.75, -r * 0.25], [-r * 0.6, -r * 0.95], [-r * 0.15, -r * 0.55]]); ctx.fillStyle = '#f4a261'; ctx.fill();
    poly(ctx, [[r * 0.75, -r * 0.25], [r * 0.6, -r * 0.95], [r * 0.15, -r * 0.55]]); ctx.fill();
    ell(ctx, 0, r * 0.05, r * 0.8, r * 0.68, '#f4a261');
    eyes(ctx, r); poly(ctx, [[-r * 0.08, r * 0.08], [r * 0.08, r * 0.08], [0, r * 0.18]]); ctx.fillStyle = '#ee6c92'; ctx.fill();
    smile(ctx, r, r * 0.2, 0.12); cheeks(ctx, r, r * 0.22);
    ctx.strokeStyle = '#7a4a24'; ctx.lineWidth = r * 0.03;
    [-1, 1].forEach((sx) => [0.12, 0.24].forEach((dy) => { ctx.beginPath(); ctx.moveTo(sx * r * 0.3, r * 0.12 + dy * r * 0.3); ctx.lineTo(sx * r * 0.85, r * dy); ctx.stroke(); }));
  },
  dog(ctx, r) {
    ell(ctx, 0, r * 0.05, r * 0.72, r * 0.7, '#d9a066');
    ell(ctx, -r * 0.68, r * 0.05, r * 0.24, r * 0.5, '#8b5a2b', 0.25); ell(ctx, r * 0.68, r * 0.05, r * 0.24, r * 0.5, '#8b5a2b', -0.25);
    ell(ctx, 0, r * 0.32, r * 0.35, r * 0.25, '#f3e0c4');
    eyes(ctx, r, -r * 0.1, 0.28); ell(ctx, 0, r * 0.2, r * 0.12, r * 0.08, '#2b2a33'); smile(ctx, r, r * 0.3, 0.12);
    ell(ctx, 0, r * 0.52, r * 0.08, r * 0.1, '#ee6c92');
  },
  bunny(ctx, r) {
    ell(ctx, -r * 0.28, -r * 0.55, r * 0.17, r * 0.45, '#f4f1ec', -0.15); ell(ctx, r * 0.28, -r * 0.55, r * 0.17, r * 0.45, '#f4f1ec', 0.15);
    ell(ctx, -r * 0.28, -r * 0.55, r * 0.08, r * 0.32, '#f7b6c8', -0.15); ell(ctx, r * 0.28, -r * 0.55, r * 0.08, r * 0.32, '#f7b6c8', 0.15);
    ell(ctx, 0, r * 0.3, r * 0.62, r * 0.55, '#f4f1ec');
    eyes(ctx, r, r * 0.22, 0.25, 0.08); ell(ctx, 0, r * 0.4, r * 0.07, r * 0.05, '#ee6c92'); cheeks(ctx, r, r * 0.45);
  },
  bear(ctx, r) {
    circle(ctx, -r * 0.55, -r * 0.5, r * 0.25, '#8b5a2b'); circle(ctx, r * 0.55, -r * 0.5, r * 0.25, '#8b5a2b');
    circle(ctx, -r * 0.55, -r * 0.5, r * 0.12, '#d9a066'); circle(ctx, r * 0.55, -r * 0.5, r * 0.12, '#d9a066');
    circle(ctx, 0, r * 0.05, r * 0.75, '#8b5a2b'); ell(ctx, 0, r * 0.3, r * 0.32, r * 0.24, '#d9a066');
    eyes(ctx, r, -r * 0.1, 0.3); ell(ctx, 0, r * 0.2, r * 0.11, r * 0.07, '#2b2a33'); smile(ctx, r, r * 0.3, 0.1);
  },
  chick(ctx, r) {
    circle(ctx, 0, r * 0.1, r * 0.75, '#f9d65c');
    ell(ctx, -r * 0.68, r * 0.25, r * 0.22, r * 0.14, '#f4c430', 0.6); ell(ctx, r * 0.68, r * 0.25, r * 0.22, r * 0.14, '#f4c430', -0.6);
    eyes(ctx, r, -r * 0.05, 0.25); poly(ctx, [[-r * 0.12, r * 0.12], [r * 0.12, r * 0.12], [0, r * 0.3]]); ctx.fillStyle = '#f4845f'; ctx.fill();
    cheeks(ctx, r, r * 0.18);
    ctx.beginPath(); ctx.moveTo(0, -r * 0.62); ctx.quadraticCurveTo(r * 0.1, -r * 0.95, r * 0.22, -r * 0.8); ctx.strokeStyle = '#f4c430'; ctx.lineWidth = r * 0.08; ctx.lineCap = 'round'; ctx.stroke();
  },
  fish(ctx, r) {
    poly(ctx, [[r * 0.45, 0], [r * 0.95, -r * 0.45], [r * 0.95, r * 0.45]]); ctx.fillStyle = '#4d96ff'; ctx.fill();
    ell(ctx, -r * 0.1, 0, r * 0.65, r * 0.45, '#5fb3f9');
    ctx.save(); ctx.beginPath(); ctx.ellipse(-r * 0.1, 0, r * 0.65, r * 0.45, 0, 0, TAU); ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = r * 0.06; [0, 0.25].forEach((x) => { ctx.beginPath(); ctx.arc(x * r, 0, r * 0.4, -0.9, 0.9); ctx.stroke(); });
    ctx.restore();
    circle(ctx, -r * 0.45, -r * 0.08, r * 0.1, '#2b2a33'); circle(ctx, -r * 0.42, -r * 0.11, r * 0.035, '#fff');
    [[0.45, -0.75, 0.07], [0.6, -0.95, 0.05]].forEach(([x, y, s]) => { ctx.beginPath(); ctx.arc(-x * r, y * r, s * r, 0, TAU); ctx.strokeStyle = '#7cc4f5'; ctx.lineWidth = r * 0.03; ctx.stroke(); });
  },
  // Sweets pack
  donut(ctx, r) {
    circle(ctx, 0, 0, r * 0.82, '#d9a066');
    ctx.beginPath(); for (let i = 0; i <= 24; i++) { const a = (i / 24) * TAU, rr = r * (0.72 + (i % 2 ? 0.05 : 0)); ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.fillStyle = '#f7a8c4'; ctx.fill();
    circle(ctx, 0, 0, r * 0.26, 'rgba(0,0,0,0)');
    ctx.save(); ctx.globalCompositeOperation = 'destination-out'; circle(ctx, 0, 0, r * 0.24, '#000'); ctx.restore();
    ['#4d96ff', '#f9c74f', '#90be6d', '#ffffff', '#9b5de5'].forEach((c, i) => {
      for (let k = 0; k < 2; k++) { const a = i * 1.3 + k * 3.1, d = r * 0.5; ctx.save(); ctx.translate(Math.cos(a) * d, Math.sin(a) * d); ctx.rotate(a * 2); ctx.fillStyle = c; ctx.fillRect(-r * 0.07, -r * 0.025, r * 0.14, r * 0.05); ctx.restore(); }
    });
  },
  icecream(ctx, r) {
    poly(ctx, [[-r * 0.42, r * 0.05], [r * 0.42, r * 0.05], [0, r * 0.98]]); ctx.fillStyle = '#e9b872'; ctx.fill();
    ctx.save(); poly(ctx, [[-r * 0.42, r * 0.05], [r * 0.42, r * 0.05], [0, r * 0.98]]); ctx.clip(); ctx.strokeStyle = '#c99550'; ctx.lineWidth = r * 0.04;
    for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(i * r * 0.2 - r * 0.6, 0); ctx.lineTo(i * r * 0.2 + r * 0.6, r); ctx.stroke(); ctx.beginPath(); ctx.moveTo(i * r * 0.2 + r * 0.6, 0); ctx.lineTo(i * r * 0.2 - r * 0.6, r); ctx.stroke(); }
    ctx.restore();
    circle(ctx, -r * 0.22, -r * 0.08, r * 0.3, '#f7a8c4'); circle(ctx, r * 0.22, -r * 0.08, r * 0.3, '#fff3c4'); circle(ctx, 0, -r * 0.42, r * 0.32, '#9ad6c4');
    circle(ctx, 0, -r * 0.8, r * 0.1, '#e63946');
  },
  lollipop(ctx, r) {
    ctx.fillStyle = '#f3efe6'; ctx.fillRect(-r * 0.05, 0, r * 0.1, r * 0.98);
    circle(ctx, 0, -r * 0.3, r * 0.62, '#ee6c92');
    ctx.beginPath(); for (let a = 0; a < TAU * 2.5; a += 0.2) { const rr = (a / (TAU * 2.5)) * r * 0.58; ctx.lineTo(Math.cos(a) * rr, -r * 0.3 + Math.sin(a) * rr); }
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = r * 0.09; ctx.stroke();
  },
  cupcake(ctx, r) {
    poly(ctx, [[-r * 0.55, r * 0.1], [r * 0.55, r * 0.1], [r * 0.4, r * 0.9], [-r * 0.4, r * 0.9]]); ctx.fillStyle = '#4d96ff'; ctx.fill();
    ctx.strokeStyle = '#3a7bd5'; ctx.lineWidth = r * 0.05; [-0.25, 0, 0.25].forEach((x) => { ctx.beginPath(); ctx.moveTo(x * r * 1.4, r * 0.12); ctx.lineTo(x * r, r * 0.88); ctx.stroke(); });
    ell(ctx, 0, r * 0.05, r * 0.65, r * 0.25, '#fbe3f0'); ell(ctx, 0, -r * 0.2, r * 0.48, r * 0.25, '#fbe3f0'); ell(ctx, 0, -r * 0.42, r * 0.28, r * 0.18, '#fbe3f0');
    circle(ctx, 0, -r * 0.68, r * 0.13, '#e63946');
    ['#f9c74f', '#90be6d', '#9b5de5', '#f4845f'].forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect((-0.35 + i * 0.22) * r, (i % 2 ? -0.15 : 0.02) * r, r * 0.09, r * 0.04); });
  },
  candy(ctx, r) {
    poly(ctx, [[-r * 0.45, 0], [-r * 0.95, -r * 0.35], [-r * 0.95, r * 0.35]]); ctx.fillStyle = '#f9c74f'; ctx.fill();
    poly(ctx, [[r * 0.45, 0], [r * 0.95, -r * 0.35], [r * 0.95, r * 0.35]]); ctx.fill();
    ell(ctx, 0, 0, r * 0.52, r * 0.38, '#f4845f');
    ctx.save(); ctx.beginPath(); ctx.ellipse(0, 0, r * 0.52, r * 0.38, 0, 0, TAU); ctx.clip(); ctx.strokeStyle = '#fff3e8'; ctx.lineWidth = r * 0.1;
    [-0.3, 0, 0.3].forEach((x) => { ctx.beginPath(); ctx.moveTo(x * r - r * 0.2, -r * 0.4); ctx.lineTo(x * r + r * 0.2, r * 0.4); ctx.stroke(); });
    ctx.restore();
  },
  cherry(ctx, r) {
    ctx.beginPath(); ctx.moveTo(-r * 0.35, r * 0.25); ctx.quadraticCurveTo(-r * 0.1, -r * 0.5, r * 0.25, -r * 0.85); ctx.moveTo(r * 0.35, r * 0.2); ctx.quadraticCurveTo(r * 0.3, -r * 0.4, r * 0.25, -r * 0.85);
    ctx.strokeStyle = '#3f7d56'; ctx.lineWidth = r * 0.07; ctx.lineCap = 'round'; ctx.stroke();
    ell(ctx, r * 0.45, -r * 0.75, r * 0.3, r * 0.14, '#6aa57a', -0.4);
    circle(ctx, -r * 0.35, r * 0.45, r * 0.38, '#d62839'); circle(ctx, r * 0.38, r * 0.4, r * 0.38, '#e63946');
    ell(ctx, -r * 0.47, r * 0.33, r * 0.1, r * 0.06, 'rgba(255,255,255,.6)', -0.6); ell(ctx, r * 0.26, r * 0.28, r * 0.1, r * 0.06, 'rgba(255,255,255,.6)', -0.6);
  },
};
Object.assign(art, packArt);

/** Stickers in each pack sold in the gift shop (catalog ids "stickers-…"). */
export const STICKER_PACKS = {
  'stickers-party': ['partyhat', 'present', 'popper', 'bunting', 'discoball', 'sparkler'],
  'stickers-animals': ['cat', 'dog', 'bunny', 'bear', 'chick', 'fish'],
  'stickers-sweets': ['donut', 'icecream', 'lollipop', 'cupcake', 'candy', 'cherry'],
};
const inPack = new Set(Object.values(STICKER_PACKS).flat());
const label = (id) => ({ partyhat: 'Party hat', discoball: 'Disco ball', icecream: 'Ice cream' }[id] || id[0].toUpperCase() + id.slice(1));
/** The free stickers (everyone has these). */
export const STICKERS = Object.keys(art).filter((id) => !inPack.has(id)).map((id) => ({ id, label: label(id) }));
/** The stickers someone can use: the free ones + the packs they bought. */
export function stickersFor(owned = []) {
  return [...STICKERS, ...owned.filter((o) => STICKER_PACKS[o]).flatMap((o) => STICKER_PACKS[o].map((id) => ({ id, label: label(id), pack: o })))];
}

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
