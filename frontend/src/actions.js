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
  if (s.trial) { s.showToast('This is a practice card for trying – go “Back to my card” to save it.', 'error'); return; }
  useStore.setState({ busy: true });
  try {
    const mod = await moderateArtwork();
    if (!mod.ok) { s.showToast(mod.reason, 'error'); return; }
    const data = s.paper.serialize();
    const payload = {
      title: s.title.trim(), cardSize: s.cardSize, background: s.bg,
      image: data.image, layers: data.layers, thumbnail: s.paper.thumbnail(s.bg), texts: data.texts, shapes: data.shapes, paperColor: data.paperColor, cardKey: data.cardKey, // picture: the closed card on its background
      palette: s.myColors.map((c) => c || ''),
    };
    let r;
    if (s.designId) {
      try { r = await api.updateDesign(s.designId, payload); }
      catch (e) {
        if (!/not found|404/i.test(e.message)) throw e;
        r = await api.createDesign(payload); useStore.setState({ designId: r.id });
      }
    } else {
      r = await api.createDesign(payload);
      useStore.setState({ designId: r.id });
    }
    useStore.setState({ dirtySinceSave: false });
    s.showToast('Saved to your portfolio.', 'success'); // gift points come from downloading the card (round 42)
  } catch (e) {
    s.showToast(e.message, 'error');
  } finally {
    useStore.setState({ busy: false });
  }
}

/**
 * Round 42: gift points come from saving the card to your computer (picture or GIF) – 50 the first time a
 * decorated card is downloaded; the server makes sure each card pays only once. Returns the toast text.
 */
export async function rewardDownload(kind) {
  const s = st();
  if (!s.user) return 'Saved to your computer. Log in to earn gift points for your cards.';
  if (s.trial) return 'Saved to your computer.';
  if (!s.paper.isDecorated()) return 'Saved to your computer.';
  try {
    const r = await api.downloadPoints(s.paper.cardKey, kind);
    if (r.user && st().token === s.token) st().setSession(r.user, s.token);
    if (r.pointsEarned > 0) return `Saved to your computer! 🎁 +${r.pointsEarned} gift points – you have ${r.points} now. Spend them in the gift shop.`;
    if (r.why === 'limit') return 'Saved to your computer. (You have earned all the gift points you can for today – more tomorrow!)';
  } catch { /* points are a bonus: the file is saved anyway */ }
  return 'Saved to your computer.';
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
