// Checks the drawing for explicit imagery before it is saved or exported.
// Runs completely in the browser (nsfwjs + TensorFlow.js, both free and open source), so artwork
// never leaves the user's computer for this check. The model is loaded lazily on first use.
// If the model cannot be loaded (offline, very old browser) we fail open, as the spec says "if possible".

let modelPromise = null;

function loadModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      const [tf, nsfw] = await Promise.all([import('@tensorflow/tfjs'), import('nsfwjs')]);
      await tf.ready();
      return nsfw.load('MobileNetV2');
    })().catch((e) => { modelPromise = null; throw e; });
  }
  return modelPromise;
}

export const BLOCK_THRESHOLD = 0.6;

export function isExplicit(predictions) {
  const p = Object.fromEntries(predictions.map((x) => [x.className, x.probability]));
  return (p.Porn || 0) > BLOCK_THRESHOLD || (p.Hentai || 0) > BLOCK_THRESHOLD;
}

export async function checkDrawing(canvas) {
  try {
    const model = await loadModel();
    const small = document.createElement('canvas');
    small.width = 224; small.height = 224;
    const g = small.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, 224, 224);
    const k = Math.min(224 / canvas.width, 224 / canvas.height);
    g.drawImage(canvas, (224 - canvas.width * k) / 2, (224 - canvas.height * k) / 2, canvas.width * k, canvas.height * k);
    const predictions = await model.classify(small);
    if (isExplicit(predictions)) return { ok: false, reason: 'This drawing looks inappropriate, so it can’t be saved. Please change it and try again.' };
    return { ok: true };
  } catch (e) {
    console.warn('Image check unavailable:', e);
    return { ok: true, skipped: true };
  }
}
