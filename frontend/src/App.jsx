import { useEffect } from 'react';
import { Desk } from './scene/Desk.jsx';
import { TopBar, ToolOptions, HoverLabel, Toast } from './ui/Toolbar.jsx';
import { Menu } from './ui/Menu.jsx';
import { AuthModal, ConfirmDialog, ExportModal, PortfolioModal } from './ui/Modals.jsx';
import { ZoomOverlay } from './ui/Zoom.jsx';
import { useStore } from './store.js';
import { putCardDown, turnCardPage } from './scene/Card.jsx';
import { heldToolId, putBackTool } from './scene/Desk.jsx';

export function App() {
  const panel = useStore((s) => s.panel);
  const tool = useStore((s) => s.tool);
  // "Pick from card" (palette button) is not a tool in the hand: the pointer simply becomes a crosshair
  useEffect(() => { document.body.classList.toggle('picking', tool === 'picker'); }, [tool]);

  useEffect(() => {
    const key = (e) => {
      if (e.target.closest?.('input, textarea, select')) return;
      if (useStore.getState().dialog) return;
      const s = useStore.getState();
      if (e.key === 'Escape') { if (s.tool) putBackTool(heldToolId(s)); else s.clearTool(); s.setMenu(false); if (s.cardHeld) putCardDown(); }
      if (e.key === 'o') turnCardPage(-1);
      if (e.key === '+' || e.key === '=') s.zoomIn();
      if (e.key === '-' && s.zoom) s.zoomOut();
      if (s.zoom && e.key.startsWith('Arrow')) { // look around the zoomed card
        e.preventDefault();
        const step = 1.2 / s.zoom, o = s.zoomOffset;
        const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
        s.setZoomOffset({ x: o.x + d[0], y: o.y + d[1] });
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
      <ConfirmDialog />
      <ZoomOverlay />
    </>
  );
}
