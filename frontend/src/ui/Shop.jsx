import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store.js';
import { api } from '../api.js';
import { stickerCanvas } from '../engine/stickers.js';
import { tapePatternById } from '../engine/paper.js';
import { renderStroke } from '../engine/brushes.js';
import { SHOP_SECTIONS, TOOL_SKINS, owns } from '../shop/catalog.js';
import { cachedShopPicture, shopPicture } from '../scene/snapshot.jsx';

/**
 * Gift shop (round 40): a page of its own, like the portfolio. Logged-in users earn gift points (50 for every
 * new card they decorate and download as a picture/GIF – round 42 –, 100 to start) and buy coloured paper, sticker packs, tape packs and tool
 * designs and new drawing tools here. Prices come from the server, which also checks the points; bought items stay with the account.
 */
export function ShopPage() {
  const setPanel = useStore((s) => s.setPanel);
  const user = useStore((s) => s.user);
  const toolSkin = useStore((s) => s.toolSkin);
  const [shop, setShop] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    api.shop().then(setShop).catch((e) => setErr(e.message));
    useStore.getState().refreshAccount();
  }, []);
  // a page of its own: Esc or the browser's Back button returns to the card
  useEffect(() => {
    const close = () => { if (useStore.getState().panel === 'shop') setPanel(null); };
    const key = (e) => { if (e.key === 'Escape' && !useStore.getState().dialog) close(); };
    history.pushState({ page: 'shop' }, '');
    window.addEventListener('popstate', close);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('popstate', close);
      window.removeEventListener('keydown', key);
      if (history.state?.page === 'shop') history.back();
    };
  }, []); // eslint-disable-line

  const price = useMemo(() => Object.fromEntries((shop?.items || []).map((i) => [i.id, i.price])), [shop]);

  const buy = async (item) => {
    setBusy(item.id);
    try { await buyItem(item, price[item.id]); } finally { setBusy(''); }
  };

  return (
    <div className="page shop-page" role="dialog" aria-modal="true" aria-label="Gift shop">
      <header className="page-head">
        <button className="btn back" onClick={() => setPanel(null)} title="Back to the card (Esc)">← Back to my card</button>
        <img className="page-logo" src="/logo.jpeg" alt="GIFt it!" />
        <div className="page-title">
          <h1>🎁 Gift shop</h1>
          {user
            ? <p>You have <b className="points-big">{user.points ?? 0}</b> gift points · every new card you decorate and save to your computer (picture or GIF) gives you {shop?.pointsPerCard ?? 50} more
                <br /><small className="muted">⌛ Points expire if you don't use GIFt it! for {shop?.expireDays ?? 30} days{user.pointsExpire ? <> – use it before <b>{expiryDate(user.pointsExpire)}</b> to keep them</> : null}.</small></p>
            : <p>Log in to collect gift points: {shop?.welcomePoints ?? 100} to start, and {shop?.pointsPerCard ?? 50} for every new card you decorate and save to your computer as a picture or GIF.</p>}
        </div>
      </header>
      <main className="page-body">
        {!user && (
          <div className="shop-login">
            <p>Gift points and the things you buy belong to your account, so you need to be logged in.</p>
            <button className="btn primary" onClick={() => setPanel('auth')}>Create account / Log in</button>
          </div>
        )}
        {err && <p className="error">{err}</p>}
        {!shop && !err && <p className="muted">Loading the shop…</p>}
        {shop && SHOP_SECTIONS.map((sec) => (
          <section key={sec.title} className="shop-section">
            <h2>{sec.title}</h2>
            <p className="muted">{sec.note}</p>
            <div className="shop-grid">
              {sec.items.filter((it) => price[it.id] != null).map((it) => {
                const have = owns(user, it.id), cost = price[it.id], short = cost - (user?.points ?? 0);
                const wearing = it.preview.skin && toolSkin === it.id && have;
                return (
                  <article key={it.id} className={'shop-item' + (have ? ' owned' : '') + (it.big ? ' big' : '')}>
                    <Preview id={it.id} preview={it.preview} />
                    <div className="shop-info">
                      <b>{it.name}</b>
                      <small>{it.desc}</small>
                    </div>
                    <div className="shop-buy">
                      {!have && (
                        <button className="btn small try-btn" onClick={() => useStore.getState().startTrial({ id: it.id, name: it.name, price: cost, stickers: it.preview.stickers })}
                          title="Play with it on a practice card before you buy it">▶ Try it</button>
                      )}
                      {have ? (
                        it.preview.skin ? (
                          <button className={'btn small' + (wearing ? ' primary' : '')} onClick={() => useStore.getState().setToolSkin(wearing ? 'classic' : it.id)}>
                            {wearing ? '✓ In use (back to Classic)' : 'Use this look'}
                          </button>
                        ) : <span className="owned-tag">✓ Yours</span>
                      ) : (
                        <>
                          <span className="price">{cost} 🎁</span>
                          <button className="btn small primary" disabled={!user || short > 0 || busy === it.id} onClick={() => buy(it)}
                            title={!user ? 'Log in first' : short > 0 ? `You need ${short} more gift points` : `Buy for ${cost} gift points`}>
                            {busy === it.id ? 'Buying…' : short > 0 && user ? `${short} more needed` : 'Buy'}
                          </button>
                        </>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}

/** "26 November 2026" (round 44: when the gift points expire if the app isn't used until then). */
export function expiryDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Ask, buy, and put a new look on straight away. Returns true when bought. */
async function buyItem(item, cost) {
  const s = useStore.getState();
  if (!(await s.ask(`Buy “${item.name}” for ${cost} gift points?`, { ok: `Buy for ${cost} 🎁` }))) return false;
  try {
    const r = await api.buy(item.id);
    s.setSession(r.user, s.token);
    if (item.id.startsWith('tools-')) s.setToolSkin(item.id); // a new look is put on straight away
    s.showToast(item.id.startsWith('tool-') ? `🎉 The ${item.name.toLowerCase()} is yours – it is waiting on your desk.` : `🎉 “${item.name}” is yours – in every card you make.`, 'success');
    return true;
  } catch (e) { s.showToast(e.message, 'error'); return false; }
}

/** What to do with each kind of item while trying it. */
function trialHint(id) {
  if (id.startsWith('paper-')) return id === 'paper-all' ? 'Pick any paper colour with “Paper” on the right.' : 'The practice card is made of this paper.';
  if (id.startsWith('stickers-')) return 'Pick up the sticker sheet – the new stickers are in its panel.';
  if (id.startsWith('tapes-')) return 'Pick up a tape roll and choose a “Tape design” in its panel.';
  if (id.startsWith('tools-')) return 'Your tools wear this look now – pick them up and use them.';
  return 'It is on your desk next to the pens – pick it up and draw.';
}

/**
 * "Try it" (round 42): while a shop item is tried, this bar sits on top of the screen. The card on the desk is a
 * practice card (it can't be saved or downloaded); "Back to my card" brings the real card back, untouched.
 */
export function TrialBar() {
  const trial = useStore((s) => s.trial);
  const user = useStore((s) => s.user);
  const [busy, setBusy] = useState(false);
  if (!trial) return null;
  const have = owns(user, trial.id), cost = trial.price, short = cost - (user?.points ?? 0);
  const buy = async () => {
    setBusy(true);
    try { await buyItem(trial, cost); } finally { setBusy(false); }
  };
  return (
    <div className="trial-bar" role="status">
      <span className="trial-text"><b>▶ Trying: {trial.name}</b> – a practice card, it can't be saved. {trialHint(trial.id)}</span>
      <span className="trial-actions">
        {have ? <span className="owned-tag">✓ Yours now</span> : cost != null && (
          <button className="btn small primary" disabled={busy || !user || short > 0} onClick={buy}
            title={!user ? 'Log in first' : short > 0 ? `You need ${short} more gift points` : `Buy for ${cost} gift points`}>
            {!user ? `${cost} 🎁 – log in to buy` : short > 0 ? `${short} more points needed` : `Buy for ${cost} 🎁`}
          </button>
        )}
        <button className="btn small" onClick={() => useStore.getState().setPanel('shop')}>Back to the shop</button>
        <button className="btn small" onClick={() => useStore.getState().endTrial()}>← Back to my card</button>
      </span>
    </div>
  );
}

/**
 * Picture of what an item gives (round 42: realistic). Paper, tapes, tool designs and the new tools are the real
 * 3D models rendered into an image (scene/snapshot.jsx) – the simple drawing below shows until it is ready.
 * Sticker packs are a sheet of die-cut stickers.
 */
function Preview({ id, preview }) {
  const [pic, setPic] = useState(() => cachedShopPicture(id));
  useEffect(() => {
    if (pic !== undefined || preview.stickers) return undefined;
    let alive = true;
    const p = preview.tool ? { ...preview, sample: sampleCanvas(preview.tool, true) } : preview;
    shopPicture(id, p).then((url) => { if (alive) setPic(url); });
    return () => { alive = false; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (preview.stickers) return <div className="pv pv-photo"><img src={stickerSheet(preview.stickers)} alt="" /></div>;
  if (pic) return <div className="pv pv-photo"><img src={pic} alt="" /></div>;
  return <div className="pv-loading"><SimplePreview preview={preview} /></div>;
}

/** A sheet of die-cut stickers: each with a white border and a soft shadow, on a slightly turned backing sheet. */
const sheets = {};
function stickerSheet(ids) {
  const key = ids.join();
  if (sheets[key]) return sheets[key];
  const c = document.createElement('canvas');
  c.width = 920; c.height = 480;
  const g = c.getContext('2d');
  g.save();
  g.translate(460, 240); g.rotate(-0.03);
  g.shadowColor = 'rgba(60,40,0,.28)'; g.shadowBlur = 22; g.shadowOffsetY = 8;
  g.fillStyle = '#fbfaf6';
  g.beginPath(); g.roundRect(-400, -205, 800, 410, 18); g.fill();
  g.shadowColor = 'transparent';
  g.strokeStyle = 'rgba(0,0,0,.06)'; g.lineWidth = 2; g.stroke();
  ids.forEach((sid, i) => {
    const art = stickerCanvas(sid, 220);
    const size = 190, x = -330 + (i % 3) * 245 + (Math.floor(i / 3) ? 40 : 0), y = -190 + Math.floor(i / 3) * 195;
    // white die-cut edge: the sticker's silhouette, grown in every direction, with a little shadow under it
    const edge = document.createElement('canvas');
    edge.width = edge.height = 220;
    const e = edge.getContext('2d');
    e.drawImage(art, 0, 0); e.globalCompositeOperation = 'source-in'; e.fillStyle = '#ffffff'; e.fillRect(0, 0, 220, 220);
    g.save();
    g.shadowColor = 'rgba(60,40,0,.3)'; g.shadowBlur = 6; g.shadowOffsetY = 3;
    for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; g.drawImage(edge, x + Math.cos(a) * 7, y + Math.sin(a) * 7, size, size); }
    g.restore();
    g.drawImage(art, x, y, size, size);
  });
  g.restore();
  sheets[key] = c.toDataURL();
  return sheets[key];
}

/** The simple pictures of round 40 (shown while the 3D picture is being made, or if 3D isn't available). */
function SimplePreview({ preview }) {
  if (preview.paper || preview.rainbow) {
    return <div className="pv"><div className={'pv-card' + (preview.rainbow ? ' rainbow' : '')} style={preview.paper ? { background: preview.paper } : undefined}><span className="pv-fold" /></div></div>;
  }
  if (preview.stickers) {
    return (
      <div className="pv pv-stickers">
        {preview.stickers.map((id) => <img key={id} src={stickerCanvas(id, 96).toDataURL()} alt="" />)}
      </div>
    );
  }
  if (preview.tapes) {
    return (
      <div className="pv pv-tapes">
        {preview.tapes.map((t) => <TapeSwatch key={t.id} id={t.id} />)}
      </div>
    );
  }
  if (preview.skin) {
    const k = TOOL_SKINS[preview.skin];
    return (
      <div className="pv pv-skin">
        {[k.body, k.trim, k.handle, k.metal, k.eraser, k.scissors].map((c, i) => <span key={i} style={{ background: c }} className={k.shiny > 0.5 ? 'shiny' : ''} />)}
      </div>
    );
  }
  if (preview.tool) return <div className="pv pv-tool"><img src={sampleCanvas(preview.tool).toDataURL()} alt="" /></div>;
  return <div className="pv" />;
}

/** A few strokes drawn with the real tool (on paper for the 3D picture's sheet). Cached. */
const samples = {};
function sampleCanvas(tool, onPaper = false) {
  const key = tool + (onPaper ? '|paper' : '');
  if (samples[key]) return samples[key];
  const c = document.createElement('canvas');
  c.width = 460; c.height = 220;
  const g = c.getContext('2d');
  if (onPaper) { g.fillStyle = '#f7f4ec'; g.fillRect(0, 0, c.width, c.height); }
  const wave = (y0, amp, turns) => Array.from({ length: 120 }, (_, i) => ({ x: 40 + i * 3.2, y: y0 + Math.sin((i / 119) * Math.PI * 2 * turns) * amp }));
  const loops = Array.from({ length: 160 }, (_, i) => { const t = i / 159; return { x: 50 + t * 330 + Math.cos(t * Math.PI * 8) * 34, y: 110 + Math.sin(t * Math.PI * 8) * 52 }; });
  const strokes = tool === 'calligraphy'
    ? [[loops, '#3d2c6b', 22]]
    : [[wave(80, 40, 1.5), '#f15bb5', 70], [wave(140, 34, 1.2), '#4d96ff', 60], [wave(110, 20, 2), '#f9c74f', 40]];
  strokes.forEach(([pts, color, size], i) => {
    const layer = document.createElement('canvas');
    layer.width = c.width; layer.height = c.height;
    renderStroke(layer.getContext('2d'), tool, pts, { size, color, seed: 11 + i });
    g.drawImage(layer, 0, 0);
  });
  samples[key] = c;
  return c;
}

function TapeSwatch({ id }) {
  const p = tapePatternById(id);
  const bg = p.kind === 'stripes' ? `repeating-linear-gradient(-45deg, ${p.base} 0 7px, ${p.ink} 7px 12px)`
    : p.kind === 'check' ? `conic-gradient(${p.ink} 25%, ${p.base} 0 50%, ${p.ink} 0 75%, ${p.base} 0) 0 0 / 14px 14px`
      : p.kind === 'zigzag' ? `linear-gradient(135deg, ${p.ink} 25%, transparent 25%) -6px 0 / 12px 12px, linear-gradient(225deg, ${p.ink} 25%, ${p.base} 25%) -6px 0 / 12px 12px`
        : `radial-gradient(${p.ink} 30%, transparent 32%) 0 0 / 12px 12px, ${p.base}`;
  return <span className="pv-tape" style={{ background: bg }} title={p.label} />;
}
