import { Avatar } from './Avatar.jsx';
import { DatePicker } from './DatePicker.jsx';
import { PaperField } from './PaperField.jsx';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useStore } from '../store.js';
import { ANIMATION_LAYOUTS, PICTURE_LAYOUTS } from '../export/layouts.js';
import { savePicture, saveGif, GIF_SIZE, pictureBlob, encodeGif } from '../export/exporter.js';
import { SendPanel } from './SendPanel.jsx';
import { renderLayout, ANIM_SECONDS } from '../export/layouts.js';
import { moderateArtwork, confirmDiscard, rewardDownload } from '../actions.js';

function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head"><h2>{title}</h2><button className="btn icon" onClick={onClose} aria-label="Close">✕</button></div>
        {children}
      </div>
    </div>
  );
}

function ageOf(dateStr) {
  const b = new Date(dateStr), n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--;
  return a;
}

export function AuthModal() {
  const setPanel = useStore((s) => s.setPanel);
  const setSession = useStore((s) => s.setSession);
  const showToast = useStore((s) => s.showToast);
  const [mode, setMode] = useState('login'); // 'login' | 'register' | 'code' (round 46: the emailed code)
  const [f, setF] = useState({ email: '', password: '', displayName: '', birthDate: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const setV = (k) => (v) => setF((cur) => ({ ...cur, [k]: v }));
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [wait, setWait] = useState(0); // seconds until "Send a new code" works again
  useEffect(() => {
    if (wait <= 0) return undefined;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const welcome = (r) => {
    setSession(r.user, r.token);
    useStore.getState().noticeExpired(r.user);
    showToast(`Welcome, ${r.user.displayName}!`, 'success');
    setPanel(null);
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (mode === 'register') {
      if (!f.birthDate) return setErr('Please enter your birth date.');
      if (ageOf(f.birthDate) < 14) return setErr('You must be at least 14 years old to create an account.');
    }
    setBusy(true);
    try {
      if (mode === 'login') welcome(await api.login({ email: f.email, password: f.password }));
      else if (mode === 'register') {
        // round 46: the account is made only after the code from the email is typed in
        const r = await api.register({ email: f.email, password: f.password, displayName: f.displayName, birthDate: f.birthDate });
        setSentTo(r.email); setCode(''); setWait(60); setMode('code');
      } else {
        const r = await api.verify(sentTo, code);
        welcome(r);
        showToast(`Welcome, ${r.user.displayName}! Your account is ready – we emailed you its details.`, 'success');
      }
    } catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  };
  const resend = async () => {
    setErr('');
    try { await api.resend(sentTo); setWait(60); setCode(''); showToast(`A new code is on its way to ${sentTo}.`, 'success'); }
    catch (ex) { setErr(ex.message); }
  };

  if (mode === 'code') {
    return (
      <Modal title="Check your email" onClose={() => setPanel(null)}>
        <form onSubmit={submit} className="form code-step">
          <p className="code-note">📬 We sent a {6}-digit code to <b>{sentTo}</b>. Write it on the strip below to finish creating your account. <small>(It works for 15 minutes. Not there? Look in Spam / Promotions too.)</small></p>
          <PaperField key="code" label="Code from the email" value={code} onChange={(v) => setCode(v.replace(/[^0-9 ]/g, '').slice(0, 7))} tilt={0.4}
            inputProps={{ required: true, inputMode: 'numeric', autoComplete: 'one-time-code', pattern: '[0-9 ]{6,7}', autoFocus: true, title: 'The 6 digits from the email' }} />
          {err && <p className="error" role="alert">{err}</p>}
          <button className="btn primary wide" disabled={busy || code.replace(/\D/g, '').length !== 6}>{busy ? 'Please wait…' : 'Create my account'}</button>
          <div className="row code-actions">
            <button type="button" className="link" onClick={() => { setMode('register'); setErr(''); }}>← Change my details</button>
            <button type="button" className="link" disabled={wait > 0} onClick={resend}>{wait > 0 ? `Send a new code (${wait} s)` : 'Send a new code'}</button>
          </div>
        </form>
      </Modal>
    );
  }

  return (
    <Modal title={mode === 'login' ? 'Log in' : 'Create your account'} onClose={() => setPanel(null)}>
      <form onSubmit={submit} className="form">
        {/* the three strips of paper: write on them, and a stamp prints what you wrote (round 33) */}
        {mode === 'register' && (
          <PaperField key="name" label="Display name" value={f.displayName} onChange={setV('displayName')} tilt={-0.6}
            inputProps={{ required: true, minLength: 2, maxLength: 30, autoComplete: 'nickname' }} />
        )}
        <PaperField key="email" label="Email" type="email" value={f.email} onChange={setV('email')} tilt={0.5}
          inputProps={{ required: true, autoComplete: 'email' }} />
        <PaperField key="password" label="Password" type="password" value={f.password} onChange={setV('password')} tilt={-0.4}
          hint={mode === 'register' ? 'At least 10 characters – a few words only you would put together is best (not your name or email).' : undefined}
          inputProps={{ required: true, minLength: mode === 'register' ? 10 : 1, maxLength: 128, autoComplete: mode === 'login' ? 'current-password' : 'new-password' }} />
        {mode === 'register' && (
          <div className="field">
            <span className="field-label">Birth date</span>
            <DatePicker value={f.birthDate} onChange={(birthDate) => setF((cur) => ({ ...cur, birthDate }))} />
            <small>You must be at least 14 to have an account. Younger kids can still make cards without one.</small>
          </div>
        )}
        {err && <p className="error" role="alert">{err}</p>}
        <button className="btn primary wide" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Next: check my email'}</button>
        <button type="button" className="link" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setErr(''); }}>
          {mode === 'login' ? 'New here? Create an account' : 'Already have an account? Log in'}
        </button>
      </form>
    </Modal>
  );
}

export function PortfolioModal() {
  const setPanel = useStore((s) => s.setPanel);
  const showToast = useStore((s) => s.showToast);
  const user = useStore((s) => s.user);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  const load = () => api.listDesigns().then(setData).catch((e) => setErr(e.message));
  useEffect(() => { if (user) load(); else setPanel('auth'); }, []); // eslint-disable-line
  // a page of its own (round 30): Esc or the browser's Back button returns to the card
  useEffect(() => {
    const close = () => { if (useStore.getState().panel === 'portfolio') setPanel(null); };
    const key = (e) => { if (e.key === 'Escape' && !useStore.getState().dialog) close(); };
    history.pushState({ page: 'portfolio' }, '');
    window.addEventListener('popstate', close);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('popstate', close);
      window.removeEventListener('keydown', key);
      if (history.state?.page === 'portfolio') history.back(); // closed with a button: drop the extra history step
    };
  }, []); // eslint-disable-line

  const open = async (id, thenExport) => {
    if (!(await confirmDiscard('Opening a design replaces the card you are working on. Discard unsaved changes?'))) return;
    try {
      const d = await api.getDesign(id);
      await useStore.getState().openDesign(d);
      setPanel(thenExport ? 'export' : null);
      if (thenExport) useStore.setState({ exportMode: 'picture' });
    } catch (e) { showToast(e.message, 'error'); }
  };
  const del = async (d) => {
    if (!(await useStore.getState().ask(`Delete “${d.title || 'Untitled card'}” for good?`, { ok: 'Delete', danger: true }))) return;
    try {
      await api.deleteDesign(d.id);
      if (useStore.getState().designId === d.id) useStore.setState({ designId: null });
      load();
    } catch (e) { showToast(e.message, 'error'); }
  };

  return (
    <div className="page portfolio-page" role="dialog" aria-modal="true" aria-label="My portfolio">
      <header className="page-head">
        <button className="btn back" onClick={() => setPanel(null)} title="Back to the card (Esc)">← Back to my card</button>
        <img className="page-logo" src="/logo.jpeg" alt="GIFt it!" />
        <div className="page-title">
          <h1>My portfolio</h1>
          {user && <p className="page-user"><Avatar user={user} size={28} />{user.displayName}{data ? ` · ${data.designs.length} of ${data.max} cards saved · only you can see these` : ''}</p>}
        </div>
      </header>
      <main className="page-body">
      {err && <p className="error">{err}</p>}
      {!data && !err && <p className="muted">Loading…</p>}
      {data && (
        <>
          {!data.designs.length && <p className="empty-note">Nothing saved yet. Make a card and use “Save to my portfolio” in the menu.</p>}
          <div className="portfolio">
            {data.designs.map((d) => (
              <figure key={d.id} className="slot">
                <img src={d.thumbnail} alt={d.title || 'Untitled card'} />
                <figcaption>
                  <b>{d.title || 'Untitled card'}</b>
                  <small>{new Date(d.updatedAt).toLocaleString()}</small>
                  <span className="slot-actions">
                    <button className="btn small" onClick={() => open(d.id, false)}>Open</button>
                    <button className="btn small" onClick={() => open(d.id, true)}>Download…</button>
                    <button className="btn small danger" onClick={() => del(d)}>Delete</button>
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </>
      )}
      </main>
    </div>
  );
}

export function ExportModal() {
  const setPanel = useStore((s) => s.setPanel);
  const showToast = useStore((s) => s.showToast);
  const paper = useStore((s) => s.paper);
  const bg = useStore((s) => s.bg);
  const title = useStore((s) => s.title);
  const initial = useStore((s) => s.exportMode) || 'picture';
  const [mode, setMode] = useState(initial);
  const layouts = mode === 'picture' ? PICTURE_LAYOUTS : ANIMATION_LAYOUTS;
  const [sel, setSel] = useState(layouts[0].id);
  const [progress, setProgress] = useState(null);
  const [side, setSide] = useState('inside');
  const [sendFile, setSendFile] = useState(null); // round 46: the finished file, being sent to someone
  const big = useRef();

  useEffect(() => { setSel((mode === 'picture' ? PICTURE_LAYOUTS : ANIMATION_LAYOUTS)[0].id); }, [mode]);

  // live preview (animated layouts play in a loop)
  useEffect(() => {
    const c = big.current;
    if (!c) return;
    let raf, stop = false;
    const other = side === 'inside' ? 'outside' : 'inside';
    const art0 = paper.flatFace(side, 0.6), back = paper.flatFace(other, 0.6);
    if (mode === 'picture') {
      c.width = 800; c.height = 600;
      renderLayout(c, sel, art0, bg, 0.6, back);
    } else {
      c.width = GIF_SIZE[0]; c.height = GIF_SIZE[1];
      const start = performance.now();
      const tick = () => {
        if (stop) return;
        const t = (((performance.now() - start) / 1000) % ANIM_SECONDS);
        renderLayout(c, sel, paper.flatFace(side, t), bg, t, back);
        raf = requestAnimationFrame(tick);
      };
      tick();
    }
    return () => { stop = true; cancelAnimationFrame(raf); };
  }, [mode, sel, paper, bg, side]);

  const name = (title.trim() || 'birthday-card').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'birthday-card';

  const download = async () => {
    setProgress(0);
    try {
      const mod = await moderateArtwork();
      if (!mod.ok) { showToast(mod.reason, 'error'); return; }
      if (mode === 'picture') await savePicture(sel, paper, bg, name, side);
      else await saveGif(sel, paper, bg, name, setProgress, side);
      showToast(await rewardDownload(mode === 'picture' ? 'picture' : 'gif'), 'success');
    } catch (e) { showToast('Could not create the file: ' + e.message, 'error'); } finally { setProgress(null); }
  };

  // round 46: the same file as the download, then the ways to send it (SendPanel)
  const send = async () => {
    setProgress(0);
    try {
      const mod = await moderateArtwork();
      if (!mod.ok) { showToast(mod.reason, 'error'); return; }
      const blob = mode === 'picture' ? await pictureBlob(sel, paper, bg, side) : await encodeGif(sel, paper, bg, setProgress, side);
      setSendFile(new File([blob], `${name}.${mode === 'picture' ? 'png' : 'gif'}`, { type: blob.type }));
      showToast(await rewardDownload(mode === 'picture' ? 'picture' : 'gif', 'Your card is ready to send'), 'success');
    } catch (e) { showToast('Could not create the file: ' + e.message, 'error'); } finally { setProgress(null); }
  };

  if (sendFile) {
    return (
      <Modal title="Send my card to someone" onClose={() => setPanel(null)} wide>
        <SendPanel file={sendFile} onClose={() => setSendFile(null)} />
      </Modal>
    );
  }

  return (
    <Modal title="Save or send my card" onClose={() => setPanel(null)} wide>
      <div className="tabs">
        <button className={mode === 'picture' ? 'on' : ''} onClick={() => setMode('picture')}>🖼 Picture</button>
        <button className={mode === 'animation' ? 'on' : ''} onClick={() => setMode('animation')}>✨ Animation</button>
      </div>
      <div className="tabs small">
        <button className={side === 'inside' ? 'on' : ''} onClick={() => setSide('inside')}>Show the inside</button>
        <button className={side === 'outside' ? 'on' : ''} onClick={() => setSide('outside')}>Show the outside (covers)</button>
      </div>
      <div className="export">
        <div className="layouts">
          {layouts.map((l) => (
            <LayoutThumb key={mode + l.id} layout={l} mode={mode} side={side} selected={sel === l.id} onClick={() => setSel(l.id)} />
          ))}
        </div>
        <div className="preview">
          <canvas ref={big} />
          <p className="muted">The background uses your current colour. {mode === 'picture' ? 'PNG, 1600×1200.' : `Looping GIF, ${GIF_SIZE[0]}×${GIF_SIZE[1]}.`}</p>
          {progress !== null ? (
            <button className="btn primary wide" disabled>{mode === 'picture' ? 'Preparing…' : `Making GIF… ${Math.round(progress * 100)}%`}</button>
          ) : (
            <div className="row save-send">
              <button className="btn primary" onClick={download}>⬇ Download {mode === 'picture' ? 'picture' : 'GIF'}</button>
              <button className="btn primary send-btn" onClick={send} title="WhatsApp, Instagram, Discord, Facebook, Gmail, a link, or an email from GIFt it!">📤 Send to someone</button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function LayoutThumb({ layout, mode, side, selected, onClick }) {
  const ref = useRef();
  const paper = useStore((s) => s.paper);
  const bg = useStore((s) => s.bg);
  useEffect(() => {
    const c = ref.current;
    c.width = 240; c.height = 180;
    renderLayout(c, layout.id, paper.flatFace(side, 0.6), bg, 0.6);
  }, [layout.id, paper, bg, mode, side]);
  return (
    <button className={'layout' + (selected ? ' on' : '')} onClick={onClick}>
      <canvas ref={ref} />
      <span><b>{layout.label}</b><small>{layout.hint}</small></span>
    </button>
  );
}

/** In-app yes/no question (replaces the browser's confirm(), which some browsers block). */
export function ConfirmDialog() {
  const dialog = useStore((s) => s.dialog);
  const okRef = useRef();
  useEffect(() => {
    if (!dialog) return undefined;
    okRef.current?.focus();
    const k = (e) => { if (e.key === 'Escape') dialog.resolve(false); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [dialog]);
  if (!dialog) return null;
  return (
    <div className="backdrop top" onPointerDown={(e) => e.target === e.currentTarget && dialog.resolve(false)}>
      <div className="modal confirm" role="alertdialog" aria-modal="true" aria-label="Please confirm">
        <p>{dialog.message}</p>
        <div className="row end">
          <button className="btn" onClick={() => dialog.resolve(false)}>{dialog.cancel}</button>
          <button ref={okRef} className={'btn ' + (dialog.danger ? 'danger-solid' : 'primary')} onClick={() => dialog.resolve(true)}>{dialog.ok}</button>
        </div>
      </div>
    </div>
  );
}
