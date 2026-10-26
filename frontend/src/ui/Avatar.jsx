import { useRef, useState } from 'react';
import { useStore } from '../store.js';
import { api } from '../api.js';
import { checkDrawing } from '../imageModeration.js';

export const AVATAR_PX = 256;

/** The user's profile photo, or their initial in a coloured circle when they have none. */
export function Avatar({ user, size = 40 }) {
  const style = { width: size, height: size, fontSize: Math.round(size / 2) };
  if (user?.avatar) return <img className="avatar photo" src={user.avatar} alt="" style={style} />;
  return <span className="avatar" style={style}>{(user?.displayName || '?').trim().charAt(0).toUpperCase()}</span>;
}

/** A picture from the computer -> a square (centre crop) 256 px JPEG data URL, checked like the artwork. */
async function toAvatar(file) {
  if (!/^image\/(jpeg|png|webp|gif|bmp)$/.test(file.type)) throw new Error('Please choose a picture (JPEG, PNG, WebP, GIF or BMP).');
  if (file.size > 15 * 1024 * 1024) throw new Error('That picture is too big (15 MB at most).');
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const c = document.createElement('canvas');
  c.width = c.height = AVATAR_PX;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, AVATAR_PX, AVATAR_PX);
  g.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, AVATAR_PX, AVATAR_PX);
  const check = await checkDrawing(c); // the same free, in-browser picture check as for the cards
  if (!check.ok) throw new Error('That picture can’t be used as a profile photo. Please choose another one.');
  return c.toDataURL('image/jpeg', 0.85);
}

/** Menu: big profile photo with "Change photo" / "Remove photo" (round 31). */
export function AvatarEditor({ user }) {
  const input = useRef();
  const [busy, setBusy] = useState(false);
  const save = async (avatar) => {
    const s = useStore.getState();
    setBusy(true);
    try {
      const r = await api.setAvatar(avatar);
      s.setSession(r.user, s.token);
      s.showToast(avatar ? 'Your profile photo is changed.' : 'Profile photo removed – your initial is shown again.', 'success');
    } catch (e) { s.showToast(e.message, 'error'); }
    finally { setBusy(false); }
  };
  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // choosing the same file again still works
    if (!file) return;
    setBusy(true);
    try { await save(await toAvatar(file)); } catch (err) { useStore.getState().showToast(err.message, 'error'); setBusy(false); }
  };
  return (
    <div className="avatar-edit">
      <button className="avatar-btn" onClick={() => input.current.click()} disabled={busy} title="Change your profile photo">
        <Avatar user={user} size={72} />
        <span className="avatar-cam" aria-hidden="true">📷</span>
      </button>
      <input ref={input} type="file" accept="image/*" hidden onChange={pick} />
      <div className="avatar-actions">
        <button className="link" onClick={() => input.current.click()} disabled={busy}>{busy ? 'Saving…' : user.avatar ? 'Change photo' : 'Add a photo'}</button>
        {user.avatar && !busy && <button className="link danger" onClick={() => save('')}>Remove photo</button>}
      </div>
    </div>
  );
}
