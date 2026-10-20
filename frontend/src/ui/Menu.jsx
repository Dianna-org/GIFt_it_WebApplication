import { useStore } from '../store.js';
import { CARD_SIZES } from '../config.js';
import { saveDesign, confirmDiscard, eraseAllWithConfirm } from '../actions.js';

export function Menu() {
  const open = useStore((s) => s.menuOpen);
  const setMenu = useStore((s) => s.setMenu);
  const setPanel = useStore((s) => s.setPanel);
  const cardSize = useStore((s) => s.cardSize);
  const changeCardSize = useStore((s) => s.changeCardSize);
  const user = useStore((s) => s.user);
  const setSession = useStore((s) => s.setSession);
  const title = useStore((s) => s.title);
  const setTitle = useStore((s) => s.setTitle);
  const busy = useStore((s) => s.busy);
  const designId = useStore((s) => s.designId);

  const hasWork = () => useStore.getState().paper.touched;

  // Size can change at any time: the design is scaled to fit, and Undo brings the old size back.
  const pickSize = (id) => { if (id !== cardSize) changeCardSize(id); };

  return (
    <aside className={'drawer' + (open ? ' open' : '')} aria-hidden={!open}>
      <div className="drawer-head">
        <h2>Menu</h2>
        <button className="btn icon" onClick={() => setMenu(false)} aria-label="Close menu">✕</button>
      </div>

      <section>
        <h3>Card size</h3>
        {CARD_SIZES.map((c) => (
          <label key={c.id} className={'radio' + (cardSize === c.id ? ' on' : '')}>
            <input type="radio" name="size" checked={cardSize === c.id} onChange={() => pickSize(c.id)} />
            <span>{c.label}<small>{c.note}</small></span>
          </label>
        ))}
      </section>

      <section>
        <h3>Account</h3>
        {user ? (
          <>
            <p className="muted">Signed in as <b>{user.displayName}</b></p>
            <button className="btn wide" onClick={() => setSession(null, null)}>Log out</button>
          </>
        ) : (
          <>
            <p className="muted">Without an account you can still make cards, but they won’t be saved when you leave.</p>
            <button className="btn primary wide" onClick={() => setPanel('auth')}>Create account / Log in</button>
          </>
        )}
      </section>

      <section>
        <h3>Portfolio</h3>
        {user ? (
          <>
            <input className="text" type="text" maxLength={40} placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
            <button className="btn primary wide" disabled={busy} onClick={saveDesign}>
              {busy ? 'Saving…' : designId ? 'Save changes (same slot)' : 'Save to my portfolio'}
            </button>
            <button className="btn wide" onClick={() => setPanel('portfolio')}>Open my portfolio</button>
          </>
        ) : (
          <p className="muted">Log in to save designs to your private portfolio (up to 20 cards).</p>
        )}
      </section>

      <section>
        <h3>Save to my computer</h3>
        <button className="btn wide" onClick={() => { useStore.getState().setPanel('export'); useStore.setState({ exportMode: 'picture' }); }}>🖼 As a picture…</button>
        <button className="btn wide" onClick={() => { useStore.getState().setPanel('export'); useStore.setState({ exportMode: 'animation' }); }}>✨ As an animation (GIF)…</button>
      </section>

      <section>
        <h3>This card</h3>
        <button className="btn wide" onClick={async () => { if (!hasWork() || await confirmDiscard('Start a new blank card? Unsaved changes will be lost.')) { useStore.getState().newCard(); setMenu(false); } }}>New blank card</button>
        <button className="btn wide danger" onClick={() => { setMenu(false); eraseAllWithConfirm(); }}>Erase all</button>
      </section>
    </aside>
  );
}
