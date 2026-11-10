import type { Sim } from './sim';

const SWIPE_PX = 26;

export function bindInput(sim: Sim, onStart: () => void) {
  addEventListener('keydown', e => {
    if (e.repeat) return;
    const action: Record<string, () => void> = {
      ArrowLeft: () => sim.move(-1), KeyA: () => sim.move(-1),
      ArrowRight: () => sim.move(1), KeyD: () => sim.move(1),
      ArrowUp: () => sim.jump(), KeyW: () => sim.jump(),
      ArrowDown: () => sim.slide(), KeyS: () => sim.slide(),
      Escape: () => sim.togglePause(), KeyP: () => sim.togglePause(),
    };
    if (e.code === 'Space' || e.code === 'Enter') {
      // On a focused button or link, let the browser press that control instead.
      if (sim.phase !== 'running' && (e.target as HTMLElement).closest?.('button, a')) return;
      e.preventDefault();
      if (sim.phase === 'running') { if (e.code === 'Space') sim.jump(); }
      else if (sim.phase === 'paused') sim.togglePause();
      else onStart();
      return;
    }
    if (action[e.code]) {
      e.preventDefault();
      action[e.code]();
    }
  });

  let start: { x: number; y: number } | null = null;
  addEventListener('pointerdown', e => { start = { x: e.clientX, y: e.clientY }; });
  addEventListener('pointerup', () => { start = null; });
  addEventListener('pointercancel', () => { start = null; });
  addEventListener('pointermove', e => {
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return;
    if (Math.abs(dx) > Math.abs(dy)) sim.move(dx > 0 ? 1 : -1);
    else if (dy < 0) sim.jump();
    else sim.slide();
    start = null;
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && sim.phase === 'running') sim.togglePause();
  });
}
