import { flushSync } from 'react-dom';

let current: ViewTransition | undefined;
/** Navigation only. Recording, saving and editing never wait for a visual transition. */
export function changeView(update: () => void): void {
  const reduced = document.documentElement.dataset.reducedMotion === 'true' || matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!document.startViewTransition || reduced) { current?.skipTransition(); current = undefined; delete document.documentElement.dataset.viewTransition; update(); return; }
  current?.skipTransition();
  document.documentElement.dataset.viewTransition = 'true';
  const transition = document.startViewTransition(() => { flushSync(update); });
  current = transition;
  // A hidden page or a superseding navigation may skip a transition; the DOM update still runs.
  void transition.ready.catch(() => undefined);
  void transition.finished.catch(() => undefined).finally(() => {
    if (current === transition) { current = undefined; delete document.documentElement.dataset.viewTransition; }
  });
}
