import { useStore } from '../store.js';

/**
 * Keyboard control of the tool panel: W/S (↑/↓) choose a setting row, A/D (←/→) change it.
 * Rows are the panel elements marked with data-kbd: "range" (a slider), "choice" (a group of buttons, the
 * one with class "on" is the current one), "select" (a drop-down) and "colors" (My colours).
 * The highlighted row index lives in the store (kbdRow, kbdOn) and is reset when the tool changes.
 */
const rows = () => [...document.querySelectorAll('.options [data-kbd]')];

/** Puts the highlight on the chosen row (called after every key press and every panel render). */
export function applyKbdHighlight() {
  const { kbdRow, kbdOn } = useStore.getState();
  const list = rows();
  list.forEach((el, i) => el.classList.toggle('kbd-focus', kbdOn && i === kbdRow));
}

export function moveKbdRow(dir) {
  const list = rows();
  if (!list.length) return false;
  const s = useStore.getState();
  // the first press only shows where you are
  const i = !s.kbdOn ? Math.min(s.kbdRow, list.length - 1) : (s.kbdRow + dir + list.length) % list.length;
  useStore.setState({ kbdRow: i, kbdOn: true });
  applyKbdHighlight();
  list[i].scrollIntoView({ block: 'nearest' });
  return true;
}

/** If the key was pressed on a slider in the panel, that slider becomes the chosen row. */
export function focusedKbdRow(target) {
  const row = target?.closest?.('.options [data-kbd]');
  if (!row) return;
  const i = rows().indexOf(row);
  if (i >= 0) { useStore.setState({ kbdRow: i, kbdOn: true }); applyKbdHighlight(); }
}

const setNative = (el, proto, v) => Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);

export function changeKbdRow(dir) {
  const list = rows();
  if (!list.length) return false;
  const s = useStore.getState();
  const row = list[Math.min(s.kbdRow, list.length - 1)];
  if (!s.kbdOn) { useStore.setState({ kbdOn: true }); applyKbdHighlight(); }
  const kind = row.dataset.kbd;
  if (kind === 'range') {
    const input = row.querySelector('input[type=range]');
    const min = +input.min, max = +input.max, step = Math.max(1, Math.round((max - min) / 50));
    const v = Math.min(max, Math.max(min, +input.value + dir * step));
    setNative(input, HTMLInputElement.prototype, String(v));
    input.dispatchEvent(new Event('input', { bubbles: true })); // React's onChange
  } else if (kind === 'choice') {
    const btns = [...row.querySelectorAll('button')];
    const cur = btns.findIndex((b) => b.classList.contains('on'));
    const next = btns[((cur < 0 ? (dir > 0 ? -1 : 0) : cur) + dir + btns.length) % btns.length];
    next?.click();
    next?.scrollIntoView({ block: 'nearest' });
  } else if (kind === 'select') {
    const sel = row.matches('select') ? row : row.querySelector('select');
    const i = (sel.selectedIndex + dir + sel.options.length) % sel.options.length;
    setNative(sel, HTMLSelectElement.prototype, sel.options[i].value);
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (kind === 'colors') {
    // only the colours saved in "My colours"
    const mine = s.myColors.filter(Boolean);
    if (!mine.length) { s.showToast('Save some colours in “My colours” first (＋ Save colour) to switch between them with A/D.'); return true; }
    const cur = mine.findIndex((c) => c.toLowerCase() === s.color.toLowerCase());
    s.setColor(mine[((cur < 0 ? (dir > 0 ? -1 : 0) : cur) + dir + mine.length) % mine.length]);
  }
  return true;
}

/** Everything the keyboard can do (shown by the "⌨ Keys" button). */
export const KEY_HELP = [
  { group: 'Tool settings' },
  { keys: ['W', 'S', '↑', '↓'], text: 'Choose a setting in the tool panel (it gets a green frame): thickness, transparency, line shape, pattern, sticker, shape, font, colour…' },
  { keys: ['A', 'D', '←', '→'], text: 'Change the chosen setting: smaller / bigger, previous / next pattern, sticker or shape, previous / next colour from “My colours”.' },
  { keys: ['H'], text: 'Hide / show the tool panel (it comes back when you take another tool).' },
  { keys: ['Esc'], text: 'Put the tool back · close an open pop-up · finish editing a shape · cancel colour picking.' },
  { group: 'Zoom' },
  { keys: ['+'], text: 'Zoom in (press again to zoom in more).' },
  { keys: ['−'], text: 'Zoom out.' },
  { keys: ['W', 'A', 'S', 'D', '↑', '←', '↓', '→'], text: 'While zoomed in: move up, left, down, right.' },
  { keys: ['Shift', '+', 'W A S D / arrows'], text: 'While zoomed in: choose and change tool settings instead of moving.' },
  { group: 'Card' },
  { keys: ['O'], text: 'Open / close the card.' },
  { keys: ['Q', 'E'], text: 'Turn the card left / right.' },
  { keys: ['Ctrl', '+', 'Z'], text: 'Undo.' },
  { group: 'Shapes and mouse helpers' },
  { keys: ['Delete', 'Backspace'], text: 'Delete the selected shape (Shapes tool).' },
  { keys: ['Shift', '+', 'drag'], text: 'Shapes: keep the proportions / rotate in 15° steps · holding the card: turn it diagonally.' },
  { keys: ['Right-click'], text: 'On the card: put the tool in your hand back.' },
];
