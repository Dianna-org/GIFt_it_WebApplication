import { changeKbdRow, focusedKbdRow, moveKbdRow } from './ui/keys.js';
import { useEffect } from 'react';
import { Desk } from './scene/Desk.jsx';
import { TopBar, ToolOptions, HoverLabel, Toast } from './ui/Toolbar.jsx';
import { Menu } from './ui/Menu.jsx';
import { AuthModal, ConfirmDialog, ExportModal, PortfolioModal } from './ui/Modals.jsx';
import { ZoomOverlay } from './ui/Zoom.jsx';
import { ShopPage } from './ui/Shop.jsx';
import { useStore } from './store.js';
import { putCardDown, turnCardPage } from './scene/Card.jsx';
import { heldToolId, putBackTool } from './scene/Desk.jsx';

export function App() {
  const panel = useStore((s) => s.panel);
  const tool = useStore((s) => s.tool);
  // "Pick from card" (palette button) is not a tool in the hand: the pointer simply becomes a crosshair
  useEffect(() => { document.body.classList.toggle('picking', tool === 'picker'); }, [tool]);
  // latest gift points + bought items for a saved session (round 40)
  useEffect(() => { useStore.getState().refreshAccount(); }, []);

  useEffect(() => {
    const key = (e) => {
      // typing in a text box or using a drop-down keeps its own keys (sliders and the colour wheel don't)
      if (e.target.closest?.('textarea, select, input:not([type=range]):not([type=color])')) return;
      if (useStore.getState().dialog) return;
      const s = useStore.getState();
      // shapes tool: Delete removes the selected shape, Esc first just finishes editing it
      if ((s.tool === 'shapes' || s.tool === 'text') && s.paper.selected && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        if (s.paper.deleteShape(s.paper.selected.face, s.paper.selected.id)) s.markDirty();
        return;
      }
      if (e.key === 'Escape' && (s.tool === 'shapes' || s.tool === 'text') && s.paper.selected) { s.paper.selectShape(null); return; }
      if (e.key === 'Escape') { if (s.tool) putBackTool(heldToolId(s)); else s.clearTool(); s.setMenu(false); if (s.cardHeld) putCardDown(); }
      if (e.key === 'h' || e.key === 'H') useStore.setState({ panelHidden: !s.panelHidden }); // hide / show the tool panel
      if (e.key === 'o') turnCardPage(-1);
      if (e.key === '+' || e.key === '=') s.zoomIn();
      if (e.key === '-' && s.zoom) s.zoomOut();
      // W A S D and the arrows: zoomed in -> move around (Shift: tool settings instead);
      // otherwise W/S (↑/↓) choose a setting in the tool panel and A/D (←/→) change it
      const dir = { w: 'up', s: 'down', a: 'left', d: 'right', ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key.length === 1 ? e.key.toLowerCase() : e.key];
      if (dir && !s.panel && !e.ctrlKey && !e.metaKey && !e.altKey) { // not while a window or page (log in, portfolio…) is open
        e.preventDefault();
        focusedKbdRow(e.target); // a slider you clicked is the one the keys change
        if (s.zoom && !e.shiftKey) {
          const step = 1.2 / s.zoom, o = s.zoomOffset;
          const d = { left: [-step, 0], right: [step, 0], up: [0, step], down: [0, -step] }[dir];
          s.setZoomOffset({ x: o.x + d[0], y: o.y + d[1] });
        } else if (dir === 'up' || dir === 'down') moveKbdRow(dir === 'up' ? -1 : 1);
        else changeKbdRow(dir === 'left' ? -1 : 1);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (s.paper.undo()) s.markDirty(); }
      if (e.key === 'q') s.turnCard('v', -15);
      if (e.key === 'e') s.turnCard('v', 15);
    };
    const ctx = (e) => { if (e.target.tagName === 'CANVAS') { e.preventDefault(); const s = useStore.getState(); if (s.tool) putBackTool(heldToolId(s)); } };
    const unload = (e) => { if (useStore.getState().dirtySinceSave && useStore.getState().user) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('keydown', key);
    window.addEventListener('contextmenu', ctx);
    window.addEventListener('beforeunload', unload);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('contextmenu', ctx); window.removeEventListener('beforeunload', unload); };
  }, []);

  return (
    <>
      <Desk />
      <TopBar />
      <ToolOptions />
      <HoverLabel />
      <Menu />
      <Toast />
      {panel === 'auth' && <AuthModal />}
      {panel === 'portfolio' && <PortfolioModal />}
      {panel === 'export' && <ExportModal />}
      {panel === 'shop' && <ShopPage />}
      <ConfirmDialog />
      <ZoomOverlay />
    </>
  );
}
