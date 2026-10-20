import { create } from 'zustand';
import { DEFAULT_BG, DRAW_TOOLS, FONTS, TAPE_PATTERNS } from './config.js';
import { CardPaper } from './engine/paper.js';

const read = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; }
};
const write = (key, value) => {
  try { if (value == null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage may be blocked */ }
};

const saved = read('cardstudio.session', null);
export const MY_COLOR_SLOTS = 12;
const emptyPalette = () => Array(MY_COLOR_SLOTS).fill(null);
/** A saved design's palette, always MY_COLOR_SLOTS long. */
export function normalizePalette(list) {
  const out = emptyPalette();
  (Array.isArray(list) ? list : []).slice(0, MY_COLOR_SLOTS).forEach((c, i) => { out[i] = /^#[0-9a-f]{6}$/i.test(c || '') ? c : null; });
  return out;
}

const toolSettings = {
  ...Object.fromEntries(Object.entries(DRAW_TOOLS).map(([k, v]) => [k, { size: v.size, opacity: v.opacity, straight: v.straight }])),
  eraser: { size: 40 },
};

function newPaper(sizeId) {
  const paper = new CardPaper(sizeId);
  // keep the selected card size in sync with the paper (undoing a resize changes it back)
  paper.onChange(() => {
    const s = useStore.getState();
    if (s.paper === paper && s.cardSize !== paper.sizeId) useStore.setState({ cardSize: paper.sizeId });
  });
  return paper;
}

export const useStore = create((set, get) => ({
  // card
  cardSize: 'a4',
  paper: null,
  // Orientation of the card: v = spin around the desk's vertical axis, l = around the card's long axis,
  // d = around the card's diagonal. Degrees, not wrapped (so turning animates the short way you pressed).
  angles: { v: 0, l: 0, d: 0 },
  cardHeld: false,
  // Fold of the left and right half of the sheet (see scene/Card.jsx). [1, 0] = closed on the front cover.
  halves: [1, 0],
  bg: DEFAULT_BG,
  designId: null,
  title: '',
  dirtySinceSave: false,

  // tools
  tool: null, // crayon | marker | highlighter | brush | glitter | eraser | picker | tape | scissors | sticker | text
  prevTool: null, // tool to go back to after using the colour picker
  color: '#e63946',
  // "My colours" belong to the project: a new card starts with an empty palette, a saved design keeps its own.
  myColors: emptyPalette(),
  toolSettings,
  spots: {}, // where tools were left on the desk (tool id -> {x, y, yaw}); missing = their usual place
  tapePattern: TAPE_PATTERNS[0].id,
  tapeWidth: 70,
  stickerId: 'star',
  stickerSize: 220,
  stickerRot: 0,
  textSpec: { text: 'Happy Birthday!', family: FONTS[0].family, size: 120, color: '#e63946', bold: false, italic: false },

  // ui
  menuOpen: false,
  panel: null, // 'auth' | 'portfolio' | 'export' | null
  toast: null,
  busy: false,
  hover: null,
  dialog: null, // in-app confirmation (browser confirm() popups can be blocked)

  /** Ask a yes/no question in the app. Resolves to true or false. */
  ask: (message, { ok = 'Yes', cancel = 'Cancel', danger = false } = {}) => new Promise((resolve) => {
    set({ dialog: { message, ok, cancel, danger, resolve: (v) => { set({ dialog: null }); resolve(v); } } });
  }),

  // account
  user: saved?.user || null,
  token: saved?.token || null,

  setTool: (tool) => {
    const s = get();
    if (s.paper.choice) s.paper.cancelChoice();
    s.paper.cancelLive();
    set({ tool: s.tool === tool ? null : tool, prevTool: tool === 'picker' ? s.tool : null });
  },
  clearTool: () => {
    const s = get();
    if (s.paper.choice) s.paper.cancelChoice();
    s.paper.cancelLive();
    set({ tool: null });
  },
  /** Leave the tool in hand on the desk at (x, y). */
  dropTool: (id, x, y) => {
    const s = get();
    if (s.tool !== 'scissors') s.paper.cancelLive(); else s.paper.setGhost(null);
    set({ tool: null, spots: { ...s.spots, [id]: { x, y, yaw: (Math.random() - 0.5) * 0.6 } } });
  },
  /** "Put it back": the tool returns to its usual place. */
  putBack: (id) => {
    const s = get();
    if (s.paper.choice) s.paper.cancelChoice();
    s.paper.cancelLive();
    const spots = { ...s.spots };
    delete spots[id];
    set({ tool: null, spots });
  },
  setColor: (color) => set({ color }),
  addMyColor: (color) => {
    const list = get().myColors.slice();
    if (list.includes(color)) return 'exists';
    const i = list.indexOf(null);
    if (i < 0) return 'full';
    list[i] = color;
    set({ myColors: list, dirtySinceSave: true });
    return 'ok';
  },
  /** Put a colour into a slot, empty or not. */
  setMyColor: (i, color) => {
    const list = get().myColors.slice();
    list[i] = color;
    set({ myColors: list, dirtySinceSave: true });
  },
  removeMyColor: (i) => {
    const list = get().myColors.slice();
    list[i] = null;
    set({ myColors: list, dirtySinceSave: true });
  },
  setToolSetting: (tool, patch) =>
    set((s) => ({ toolSettings: { ...s.toolSettings, [tool]: { ...s.toolSettings[tool], ...patch } } })),
  setBg: (bg) => set({ bg }),
  turnCard: (axis, deg) => set((s) => {
    const angles = { ...s.angles, [axis]: s.angles[axis] + deg };
    // tilting a lying card would push it into the desk, so pick it up first
    return { angles, cardHeld: s.cardHeld || (axis !== 'v' && deg !== 0) };
  }),
  setAngle: (axis, value) => set((s) => ({
    angles: { ...s.angles, [axis]: value + 360 * Math.round((s.angles[axis] - value) / 360) },
    cardHeld: s.cardHeld || axis !== 'v',
  })),
  setCardHeld: (cardHeld) => set({ cardHeld }),
  /** Back to how the card started: flat, not turned, sheet face-up (open stays open, closed shows the front cover). */
  resetCard: () => set((s) => {
    const [a1, a2] = s.halves;
    const open = Math.abs(a1) > 0.5 === Math.abs(a2) > 0.5;
    return { angles: { v: 0, l: 0, d: 0 }, cardHeld: false, halves: open ? [0, 0] : [1, 0] };
  }),
  resetDesk: () => set({ spots: {} }),
  setTapePattern: (tapePattern) => set({ tapePattern }),
  setTapeWidth: (tapeWidth) => set({ tapeWidth }),
  setSticker: (patch) => set(patch),
  setTextSpec: (patch) => set((s) => ({ textSpec: { ...s.textSpec, ...patch } })),
  setMenu: (menuOpen) => set({ menuOpen }),
  setPanel: (panel) => set({ panel, menuOpen: panel ? false : get().menuOpen }),
  setTitle: (title) => set({ title }),
  markDirty: () => set({ dirtySinceSave: true }),

  showToast: (message, kind = 'info') => {
    set({ toast: { message, kind, id: Date.now() } });
    setTimeout(() => { if (get().toast && Date.now() - get().toast.id >= 3900) set({ toast: null }); }, 4000);
  },

  /** Change size at any time; the design is scaled to the new card (undo brings the old size back). */
  changeCardSize: (cardSize) => {
    get().paper.resize(cardSize);
    set({ cardSize, dirtySinceSave: true });
  },
  newCard: () => {
    get().paper.cancelLive();
    set({ paper: newPaper(get().cardSize), designId: null, title: '', dirtySinceSave: false, angles: { v: 0, l: 0, d: 0 }, cardHeld: false, halves: [1, 0], myColors: emptyPalette() });
  },
  async openDesign(d) {
    const paper = newPaper(d.cardSize);
    await paper.load(d);
    set({ cardSize: d.cardSize, paper, designId: d.id, title: d.title || '', bg: d.background || get().bg, myColors: normalizePalette(d.palette), angles: { v: 0, l: 0, d: 0 }, cardHeld: false, dirtySinceSave: false });
  },

  setSession: (user, token) => {
    write('cardstudio.session', user ? { user, token } : null);
    set({ user, token, designId: user ? get().designId : null });
  },
}));
useStore.setState({ paper: newPaper('a4') });
if (import.meta.env.DEV) window.__store = useStore;
