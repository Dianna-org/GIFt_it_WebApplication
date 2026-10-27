import { api } from './api.js';
import { useStore } from './store.js';
import { containsProfanity } from './moderation.js';
import { checkDrawing } from './imageModeration.js';

const st = () => useStore.getState();

/** Everything that must pass before artwork is saved or exported. */
export async function moderateArtwork() {
  const { paper, title } = st();
  if (containsProfanity(title)) return { ok: false, reason: 'The title contains words that are not allowed.' };
  if (paper.texts.some(containsProfanity)) return { ok: false, reason: 'The card contains words that are not allowed. Please remove them first (use Undo).' };
  for (const face of ['inside', 'outside']) {
    const img = await checkDrawing(paper.flatFace(face, 0));
    if (!img.ok) return { ok: false, reason: img.reason };
  }
  return { ok: true };
}

export async function saveDesign() {
  const s = st();
  if (!s.user) { s.showToast('Create an account or log in to save to your portfolio.', 'error'); s.setPanel('auth'); return; }
  useStore.setState({ busy: true });
  try {
    const mod = await moderateArtwork();
    if (!mod.ok) { s.showToast(mod.reason, 'error'); return; }
    const data = s.paper.serialize();
    const payload = {
      title: s.title.trim(), cardSize: s.cardSize, background: s.bg,
      image: data.image, layers: data.layers, thumbnail: s.paper.thumbnail(s.bg), texts: data.texts, shapes: data.shapes, // picture: the closed card on its background
      palette: s.myColors.map((c) => c || ''),
    };
    if (s.designId) {
      try { await api.updateDesign(s.designId, payload); }
      catch (e) {
        if (!/not found|404/i.test(e.message)) throw e;
        const r = await api.createDesign(payload); useStore.setState({ designId: r.id });
      }
    } else {
      const r = await api.createDesign(payload);
      useStore.setState({ designId: r.id });
    }
    useStore.setState({ dirtySinceSave: false });
    s.showToast('Saved to your portfolio.', 'success');
  } catch (e) {
    s.showToast(e.message, 'error');
  } finally {
    useStore.setState({ busy: false });
  }
}

export async function confirmDiscard(message = 'You have unsaved changes. Discard them?') {
  const s = st();
  return !s.dirtySinceSave || s.ask(message, { ok: 'Discard', danger: true });
}

export async function eraseAllWithConfirm() {
  const s = st();
  const yes = await s.ask('Erase EVERYTHING on the card – both sides, all drawings, tape, stickers, text and cuts? You can still undo it.', { ok: 'Erase all', danger: true });
  if (!yes) return;
  st().paper.eraseAll();
  st().markDirty();
  st().showToast('The card is blank again. Press Undo if you change your mind.', 'success');
}
