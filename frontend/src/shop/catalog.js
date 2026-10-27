/**
 * Gift shop contents (round 40). The server (backend/CardApi/Rules.cs, GiftShop) owns the item ids and the
 * prices; this file describes what each item looks like / gives. Bought items belong to the account, so they
 * are there in every card that account makes.
 */
import { STICKER_PACKS } from '../engine/stickers.js';

export const WHITE_PAPER = '#fffdf8';

/** Paper colours: one colour each, or "All colours" = choose any colour with the colour wheel. */
export const PAPERS = [
  { id: 'paper-pink', name: 'Blush pink paper', color: '#f9c6d6' },
  { id: 'paper-purple', name: 'Lavender purple paper', color: '#c9b3f0' },
  { id: 'paper-red', name: 'Cherry red paper', color: '#e5484d' },
  { id: 'paper-blue', name: 'Ocean blue paper', color: '#3f7fd8' },
  { id: 'paper-sky', name: 'Sky blue paper', color: '#b9dcf7' },
  { id: 'paper-mint', name: 'Mint green paper', color: '#bfe8d2' },
  { id: 'paper-yellow', name: 'Sunny yellow paper', color: '#fbe27a' },
  { id: 'paper-orange', name: 'Tangerine paper', color: '#f9a35c' },
  { id: 'paper-kraft', name: 'Kraft brown paper', color: '#c9a77c' },
  { id: 'paper-black', name: 'Midnight black paper', color: '#26232b' },
];
export const ALL_PAPER = 'paper-all';

/** Extra tape designs: every tape roll on the desk can wear any design you own. */
export const TAPE_PACKS = {
  'tapes-pastel': [
    { id: 'pastel-lilac-dots', label: 'Lilac dots', base: '#efe6ff', ink: '#a98be0', kind: 'dots' },
    { id: 'pastel-mint-stripes', label: 'Mint stripes', base: '#e3f7ee', ink: '#86cfae', kind: 'stripes' },
    { id: 'pastel-peach-hearts', label: 'Peach hearts', base: '#fff0e6', ink: '#f6a582', kind: 'hearts' },
    { id: 'pastel-sky-check', label: 'Baby-blue check', base: '#e8f4ff', ink: '#8fc3ee', kind: 'check' },
  ],
  'tapes-bright': [
    { id: 'bright-red-zigzag', label: 'Red zigzag', base: '#ffd9d6', ink: '#e5332a', kind: 'zigzag' },
    { id: 'bright-navy-stars', label: 'Navy stars', base: '#25307a', ink: '#ffd23f', kind: 'stars' },
    { id: 'bright-orange-stripes', label: 'Orange stripes', base: '#ffe1c2', ink: '#ff7a1a', kind: 'stripes' },
    { id: 'bright-green-dots', label: 'Lime dots', base: '#e6ffc2', ink: '#3aa02c', kind: 'dots' },
  ],
};
export const EXTRA_TAPES = Object.values(TAPE_PACKS).flat();

/**
 * Tool design packs ("looks"): the colours / materials of the tools' bodies (the ink parts always show
 * your chosen colour). classic = how they always looked.
 */
export const TOOL_SKINS = {
  classic: { name: 'Classic', body: '#f3efe6', trim: '#2f3a3d', handle: '#b9433a', wood: '#d9b37b', metal: '#d3d8de', grip: '#e7ecef', eraser: '#f4a7b4', scissors: '#e0604f', shiny: 0 },
  'tools-golden': { name: 'Golden luxe', body: '#f7e7b4', trim: '#b8892b', handle: '#c9a227', wood: '#e8cf8a', metal: '#e3b341', grip: '#f3e2b0', eraser: '#f6d9a0', scissors: '#d4a73a', shiny: 0.85 },
  'tools-pastel': { name: 'Pastel dream', body: '#fde2ec', trim: '#b8a4e3', handle: '#9fd8cb', wood: '#f6d6e4', metal: '#e8e1f7', grip: '#dff3fb', eraser: '#cdeee4', scissors: '#f9b6c9', shiny: 0.15 },
  'tools-wooden': { name: 'Wooden workshop', body: '#c99a62', trim: '#6b4423', handle: '#8b5a2b', wood: '#b07a42', metal: '#b08d57', grip: '#d9b98c', eraser: '#e9d3a9', scissors: '#7a4b23', shiny: 0.1 },
};

/** Everything the shop shows, in order, with a short description (prices come from the server). */
export const SHOP_SECTIONS = [
  {
    title: 'Coloured paper', note: 'Your card can be made of coloured paper. Choose it with the 📄 Paper button at the top.',
    items: [
      ...PAPERS.map((p) => ({ id: p.id, name: p.name, desc: 'Cards in this colour.', preview: { paper: p.color } })),
      { id: ALL_PAPER, name: 'All coloured paper', desc: 'Any colour you like – pick it with the colour wheel.', preview: { rainbow: true }, big: true },
    ],
  },
  {
    title: 'Sticker packs', note: 'New stickers on the sticker sheet.',
    items: [
      { id: 'stickers-party', name: 'Party pack', desc: 'Party hat, present, popper, bunting, disco ball, sparkler.', preview: { stickers: STICKER_PACKS['stickers-party'] } },
      { id: 'stickers-animals', name: 'Cute animals', desc: 'Cat, dog, bunny, bear, chick and a fish.', preview: { stickers: STICKER_PACKS['stickers-animals'] } },
      { id: 'stickers-sweets', name: 'Sweet treats', desc: 'Donut, ice cream, lollipop, cupcake, candy, cherries.', preview: { stickers: STICKER_PACKS['stickers-sweets'] } },
    ],
  },
  {
    title: 'Tape packs', note: 'New designs for your washi tape – any roll can wear them (choose in the tape panel).',
    items: [
      { id: 'tapes-pastel', name: 'Pastel tapes', desc: 'Lilac dots, mint stripes, peach hearts, baby-blue check.', preview: { tapes: TAPE_PACKS['tapes-pastel'] } },
      { id: 'tapes-bright', name: 'Bright & bold tapes', desc: 'Red zigzag, navy stars, orange stripes, lime dots.', preview: { tapes: TAPE_PACKS['tapes-bright'] } },
    ],
  },
  {
    title: 'Tool designs', note: 'A new look for your pens, brush, eraser, scissors and paint bucket.',
    items: ['tools-golden', 'tools-pastel', 'tools-wooden'].map((id) => ({ id, name: TOOL_SKINS[id].name, desc: 'Change how your tools look – switch any time.', preview: { skin: id } })),
  },
  {
    title: 'New drawing tools', note: 'Brand-new tools for your desk – they wait there next to the pens, in your colour.',
    items: [
      { id: 'tool-calligraphy', name: 'Calligraphy pen', desc: 'A flat nib: thick and thin strokes depending on which way you move – beautiful lettering.', preview: { tool: 'calligraphy' } },
      { id: 'tool-spray', name: 'Spray can', desc: 'Soft, speckled spray paint – go over a spot again to make it stronger.', preview: { tool: 'spray' } },
    ],
  },
];

/** Bought by this account (what the shop shows as "✓ Yours"). */
export const owns = (user, id) => !!user?.owned?.includes(id);
/**
 * Round 42 "Try it": the shop item being tried on the practice card (set by store.startTrial). While it is
 * tried it works everywhere as if it were bought – canUse() – but it isn't owned.
 */
let trialId = null;
export function setTrialItem(id) { trialId = id || null; }
export const canUse = (user, id) => owns(user, id) || (!!id && id === trialId);
/** Shop ids this user can use right now (bought + the one being tried). */
export const usableIds = (user) => [...(user?.owned || []), ...(trialId && !owns(user, trialId) ? [trialId] : [])];
/** Paper colours this user can use (white is free). */
export const paperChoices = (user) => [{ id: 'paper-white', name: 'White paper', color: WHITE_PAPER }, ...PAPERS.filter((p) => canUse(user, p.id))];
/** Tape designs this user can use (besides each roll's own design). */
export const tapeChoices = (user) => Object.entries(TAPE_PACKS).filter(([id]) => canUse(user, id)).flatMap(([, list]) => list);
/** The tape a roll puts down: its own design, or a bought design it wears (it keeps the roll's id). */
export function rollPattern(s, variant) {
  const design = s.rollDesign?.[variant];
  const id = design && tapeChoices(s.user).some((t) => t.id === design) ? design : variant;
  return { ...tapePatternByIdLazy(id), id: variant };
}
let tapeLookup = null;
const tapePatternByIdLazy = (id) => (tapeLookup ? tapeLookup(id) : { id });
/** paper.js registers its lookup here (avoids an import cycle). */
export function registerTapeLookup(fn) { tapeLookup = fn; }
export const skinOf = (user, id) => (trialId && TOOL_SKINS[trialId]) // trying a look: you see it straight away
  || (id && id !== 'classic' && canUse(user, id) && TOOL_SKINS[id]) || TOOL_SKINS.classic;
