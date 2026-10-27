import { useStore } from '../store.js';
import { saveDesign, confirmDiscard, eraseAllWithConfirm } from '../actions.js';
import { AvatarEditor } from './Avatar.jsx';

export function Menu() {
  const open = useStore((s) => s.menuOpen);
  const setMenu = useStore((s) => s.setMenu);
  const setPanel = useStore((s) => s.setPanel);
  const user = useStore((s) => s.user);
  const setSession = useStore((s) => s.setSession);
  const title = useStore((s) => s.title);
  const setTitle = useStore((s) => s.setTitle);
  const busy = useStore((s) => s.busy);
  const designId = useStore((s) => s.designId);

  const hasWork = () => useStore.getState().paper.touched;


  return (
    <aside className={'drawer' + (open ? ' open' : '')} aria-hidden={!open}>
      <div className="drawer-head">
        <h2>Menu</h2>
        <button className="btn icon" onClick={() => setMenu(false)} aria-label="Close menu">✕</button>
      </div>

      {/* the card size moved to the "📐" button in the top bar (round 30) */}
      <section>
        <h3>Account</h3>
        {user ? (
          <div className="account-card">
            <AvatarEditor user={user} />
            <div className="who">
              <small>Signed in as</small>
              <b>{user.displayName}</b>
              <span className="email">{user.email}</span>
            </div>
            <button className="btn wide" onClick={() => setSession(null, null)}>Log out</button>
          </div>
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
              {busy ? 'Saving…' : designId ? 'Save changes' : 'Save to my portfolio'}
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
