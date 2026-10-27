import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useStore } from '../store.js';
import { downloadBlob } from '../export/exporter.js';
import { containsProfanity } from '../moderation.js';

/**
 * Round 46: "📤 Send to someone" – the finished picture or GIF goes to another person instead of (or as well as)
 * this computer. Three ways, best first:
 *  1. the device's own share menu with the FILE (phones: WhatsApp, Instagram, Discord, Facebook, Gmail…),
 *     where the browser can do it (not e.g. Chrome on Linux);
 *  2. a public link to the card (logged-in users; /s/<id>, kept 30 days) for WhatsApp, Telegram, Facebook,
 *     Gmail, Discord, or copied;
 *  3. an email sent by GIFt it! itself, with the card attached.
 * Apps that can't take a file or a link from a web page (Instagram, and Discord for GIFs) get the file downloaded
 * / the picture copied, and the app opened, with a tip on what to do there.
 */
export function SendPanel({ file, onClose }) {
  const user = useStore((s) => s.user);
  const title = useStore((s) => s.title);
  const showToast = useStore((s) => s.showToast);
  const [link, setLink] = useState(null); // { id, url }
  const [linkErr, setLinkErr] = useState('');
  const [mail, setMail] = useState(null); // null | { to, message, busy }
  const preview = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(preview), [preview]);
  const gif = file.type === 'image/gif';
  const canShareFile = typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
  const local = /^(localhost|127\.|\[::1\])/.test(location.hostname);

  // logged in: the link is made straight away, so every button below can use it
  useEffect(() => {
    if (!user) return;
    let gone = false;
    (async () => {
      try {
        const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
        const r = await api.share(data, title.trim());
        if (!gone) setLink(r);
      } catch (e) { if (!gone) setLinkErr(e.message); }
    })();
    return () => { gone = true; };
  }, [file, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const text = `I made you a birthday card! 🎂${user ? ` – ${user.displayName}` : ''}`;
  const enc = encodeURIComponent;
  const open = (url) => window.open(url, '_blank', 'noopener,noreferrer');
  const save = () => downloadBlob(file, file.name);
  const copy = async (what) => {
    try {
      if (what === 'picture') await navigator.clipboard.write([new ClipboardItem({ [file.type]: file })]);
      else await navigator.clipboard.writeText(link.url);
      return true;
    } catch { return false; }
  };

  const nativeShare = async () => {
    try { await navigator.share({ files: [file], title: 'Birthday card', text }); }
    catch (e) { if (e.name !== 'AbortError') showToast('Sharing did not work here – try one of the buttons below.', 'error'); }
  };

  // each app: with a link where the app takes one, otherwise the file is saved / the picture copied for it
  const apps = [
    { id: 'whatsapp', label: 'WhatsApp', icon: '🟢', go: () => (link ? open(`https://wa.me/?text=${enc(`${text} ${link.url}`)}`) : viaFile('https://web.whatsapp.com/', 'WhatsApp')) },
    { id: 'telegram', label: 'Telegram', icon: '✈️', go: () => (link ? open(`https://t.me/share/url?url=${enc(link.url)}&text=${enc(text)}`) : viaFile('https://web.telegram.org/', 'Telegram')) },
    { id: 'facebook', label: 'Facebook', icon: '📘', go: () => (link ? open(`https://www.facebook.com/sharer/sharer.php?u=${enc(link.url)}`) : viaFile('https://www.facebook.com/messages/', 'Facebook')) },
    { id: 'gmail', label: 'Gmail', icon: '✉️', go: () => (link
      ? open(`https://mail.google.com/mail/?view=cm&fs=1&su=${enc('A birthday card for you! 🎂')}&body=${enc(`${text}\n\n${link.url}`)}`)
      : viaFile('https://mail.google.com/mail/?view=cm&fs=1', 'Gmail')) },
    { id: 'discord', label: 'Discord', icon: '🎮', go: () => pasteIn('https://discord.com/channels/@me', 'Discord') },
    { id: 'instagram', label: 'Instagram', icon: '📸', go: () => viaFile('https://www.instagram.com/direct/inbox/', 'Instagram') },
  ];
  async function viaFile(url, app) {
    open(url); // first, while the click still counts (pop-up blockers)
    save();
    showToast(`The card is saved on your computer – in ${app}, attach it to a message (📎 / 🖼) and send it.`, 'success');
  }
  async function pasteIn(url, app) {
    open(url);
    if (!gif && await copy('picture')) showToast(`The picture is copied – in ${app}, click a chat and paste it (Ctrl+V).`, 'success');
    else if (link && await copy('link')) showToast(`The link is copied – in ${app}, paste it (Ctrl+V) into a chat: it shows the card.`, 'success');
    else { save(); showToast(`The card is saved on your computer – in ${app}, drag it into a chat.`, 'success'); }
  }

  const sendMail = async (e) => {
    e.preventDefault();
    if (containsProfanity(mail.message)) { showToast('The message contains words that are not allowed.', 'error'); return; }
    setMail({ ...mail, busy: true });
    try {
      const r = await api.emailShare(link.id, mail.to.trim(), mail.message.trim());
      showToast(`📧 Sent to ${mail.to.trim()}! (${r.left} more emails today)`, 'success');
      setMail(null);
    } catch (ex) { showToast(ex.message, 'error'); setMail((m) => m && { ...m, busy: false }); }
  };

  return (
    <div className="send-panel">
      <div className="send-head">
        <img src={preview} alt="Your card" />
        <div>
          <h3>📤 Send your card</h3>
          <p className="muted">{gif ? 'Animated GIF' : 'Picture (PNG)'} · choose how it travels.</p>
        </div>
        <button className="btn" onClick={onClose} title="Back to the layouts and Download">← Back</button>
      </div>

      {canShareFile && (
        <button className="btn primary wide" onClick={nativeShare}>📲 Share the {gif ? 'GIF' : 'picture'}… <small>(WhatsApp, Instagram, Discord, Gmail…)</small></button>
      )}

      <div className="send-apps">
        {apps.map((a) => (
          <button key={a.id} className="btn send-app" onClick={a.go} disabled={!!user && !link && !linkErr} title={`Send it with ${a.label}`}>
            <span aria-hidden="true">{a.icon}</span> {a.label}
          </button>
        ))}
      </div>

      {user ? (
        <div className="send-link">
          {link ? (
            <>
              <label className="field-label" htmlFor="share-link">Link to your card <small className="muted">(anyone with it can see the card for 30 days)</small></label>
              <div className="row">
                <input id="share-link" className="text" readOnly value={link.url} onFocus={(e) => e.target.select()} />
                <button className="btn" onClick={async () => showToast(await copy('link') ? 'Link copied.' : 'Copy it by hand (Ctrl+C).', 'success')}>Copy</button>
                <button className="btn" onClick={() => open(link.url)} title="Open the card's page">Open</button>
              </div>
              {local && <p className="muted small">While GIFt it! runs on this computer (localhost) the link only opens here; once the app is online everyone can open it, and WhatsApp/Facebook show the card in the chat.</p>}
            </>
          ) : linkErr ? <p className="error">{linkErr}</p> : <p className="muted">Making a link to your card…</p>}

          {link && !mail && <button className="btn wide" onClick={() => setMail({ to: '', message: '', busy: false })}>📧 Email it from GIFt it! (the card is attached)</button>}
          {link && mail && (
            <form className="form send-mail" onSubmit={sendMail}>
              <label>To (email address)<input type="email" required maxLength={254} value={mail.to} onChange={(e) => setMail({ ...mail, to: e.target.value })} placeholder="friend@example.com" autoFocus /></label>
              <label>Message <small>(optional)</small><textarea rows={3} maxLength={500} value={mail.message} onChange={(e) => setMail({ ...mail, message: e.target.value })} placeholder="Happy birthday! 🎉" /></label>
              <div className="row end">
                <button type="button" className="btn" onClick={() => setMail(null)}>Cancel</button>
                <button className="btn primary" disabled={mail.busy}>{mail.busy ? 'Sending…' : 'Send email'}</button>
              </div>
            </form>
          )}
        </div>
      ) : (
        <p className="muted">
          <button className="link" onClick={() => useStore.getState().setPanel('auth')}>Log in</button> to get a link to your card and to email it straight from GIFt it!
          Without an account the buttons save the card on your computer and open the app, so you can attach it there.
        </p>
      )}
      <button className="link" onClick={save}>⬇ Also save it on my computer</button>
    </div>
  );
}
