// Shared constants for GIFt it! (the birthday card maker).

export const PASTELS = [
  { name: 'Butter', color: '#fde9a0' },
  { name: 'Peach', color: '#fdd0b8' },
  { name: 'Blush', color: '#f9c6d4' },
  { name: 'Lilac', color: '#d9c8f0' },
  { name: 'Sky', color: '#bfdcf5' },
  { name: 'Mint', color: '#c4ecd6' },
  { name: 'Sage', color: '#d3e4b8' },
  { name: 'Lemon', color: '#f7f3b0' },
  { name: 'Coral', color: '#fbbfb4' },
  { name: 'Aqua', color: '#bdeae8' },
];
export const DEFAULT_BG = '#fde9a0';

// Folded sheets, drawn as an open spread. mm is the open spread (width x height).
export const CARD_SIZES = [
  { id: 'a4', label: 'A4 folded in half', note: '297 × 210 mm spread', w: 297, h: 210 },
  { id: 'a5', label: 'A5 folded in half', note: '210 × 148 mm spread', w: 210, h: 148 },
  { id: 'a6', label: 'A6 mini card', note: '148 × 105 mm spread', w: 148, h: 105 },
  { id: 'square', label: 'Square card', note: '300 × 150 mm spread', w: 300, h: 150 },
];
export const CANVAS_PX_W = 1500;
export const WORLD_PER_MM = 1 / 37; // A4 spread is ~8 world units wide

export function cardDims(sizeId) {
  const s = CARD_SIZES.find((c) => c.id === sizeId) || CARD_SIZES[0];
  const pxW = CANVAS_PX_W;
  const pxH = Math.round((CANVAS_PX_W * s.h) / s.w);
  return { ...s, pxW, pxH, worldW: s.w * WORLD_PER_MM, worldH: s.h * WORLD_PER_MM };
}

export const PAPER_COLOR = '#fffdf8';

// Drawing tools. `straight` is the default straightness (0 = wobbly, 50 = natural, 100 = ruler).
export const DRAW_TOOLS = {
  crayon: { label: 'Crayon', size: 12, minSize: 3, maxSize: 40, opacity: 90, straight: 45, hasOptions: true },
  marker: { label: 'Marker', size: 18, minSize: 4, maxSize: 60, opacity: 80, straight: 85, hasOptions: true },
  highlighter: { label: 'Highlighter', size: 44, minSize: 14, maxSize: 110, opacity: 55, straight: 80, hasOptions: true },
  brush: { label: 'Paint brush', size: 34, minSize: 4, maxSize: 120, opacity: 95, straight: 12, hasOptions: true },
  glitter: { label: 'Glitter pen', size: 16, minSize: 4, maxSize: 50, opacity: 85, straight: 50, hasOptions: true },
  pattern: { label: 'Pattern pen', size: 40, minSize: 10, maxSize: 100, opacity: 100, straight: 50, hasOptions: true },
};

export const TOOL_LABELS = {
  ...Object.fromEntries(Object.entries(DRAW_TOOLS).map(([k, v]) => [k, v.label])),
  eraser: 'Eraser',
  bucket: 'Paint bucket',
  picker: 'Pick a colour from the card',
  tape: 'Washi tape',
  scissors: 'Scissors',
  sticker: 'Stickers',
  text: 'Text box',
  shapes: 'Shapes',
};

export const TAPE_PATTERNS = [
  { id: 'dots', label: 'Gold dots', base: '#fff3d6', ink: '#e0a526', kind: 'dots' },
  { id: 'zigzag', label: 'Teal zigzag', base: '#8cc9bd', ink: '#2f7f74', kind: 'zigzag' },
  { id: 'stripes', label: 'Coral stripes', base: '#fbd9cc', ink: '#ee7b64', kind: 'stripes' },
  { id: 'check', label: 'Green check', base: '#cfe7c4', ink: '#4f8f56', kind: 'check' },
  { id: 'hearts', label: 'Pink hearts', base: '#ffe3ec', ink: '#ee6c92', kind: 'hearts' },
  { id: 'stars', label: 'Night stars', base: '#34476b', ink: '#ffd96b', kind: 'stars' },
];

export const FONTS = [
  { label: 'Friendly', family: '"Comic Sans MS", "Chalkboard SE", "Comic Neue", cursive' },
  { label: 'Classic serif', family: 'Georgia, "Times New Roman", serif' },
  { label: 'Clean sans', family: '"Helvetica Neue", Arial, sans-serif' },
  { label: 'Handwritten', family: '"Brush Script MT", "Segoe Script", "Snell Roundhand", cursive' },
  { label: 'Typewriter', family: '"Courier New", Courier, monospace' },
  { label: 'Bold impact', family: 'Impact, "Arial Black", sans-serif' },
];

export const SWATCHES = [
  '#1f1f1f', '#ffffff', '#e63946', '#f4845f', '#f9c74f', '#90be6d', '#2a9d8f', '#4d96ff',
  '#6a4c93', '#f15bb5', '#8d5a3b', '#9aa5b1',
];
