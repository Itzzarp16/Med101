// Two-screen navigation transition (the old screen slides out while the new
// one slides in) using the browser's View Transitions API, as a progressive
// enhancement: browsers without it, and people who ask for reduced motion,
// get the plain CSS fade/slide on `.screen-fade` instead (tokens.css).
//
// How the pieces fit:
//   - initViewTransitions() sets <html data-vt> when the effect is active.
//     tokens.css keys everything off that attribute: it switches the CSS
//     entrance animation off and styles ::view-transition-old/new(root).
//   - viewTransition(update) wraps a state change so the browser snapshots
//     the page before and after it.
import { flushSync } from 'react-dom';

const supported = typeof document !== 'undefined' && typeof document.startViewTransition === 'function';
const reduced = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  ? window.matchMedia('(prefers-reduced-motion: reduce)')
  : null;

const active = () => supported && !(reduced && reduced.matches);

function sync() {
  document.documentElement.toggleAttribute('data-vt', active());
}

export function initViewTransitions() {
  if (typeof document === 'undefined') return;
  sync();
  reduced?.addEventListener?.('change', sync);
}

// `update` makes the React state changes. It always runs - with the
// transition when supported, immediately otherwise.
export function viewTransition(update) {
  if (!active()) {
    update();
    return;
  }
  try {
    const t = document.startViewTransition(() => {
      // The browser needs the new screen in the DOM when this returns.
      flushSync(update);
    });
    // A skipped/interrupted transition rejects these; that's normal.
    t.ready.catch(() => {});
    t.finished.catch(() => {});
    t.updateCallbackDone.catch(() => {});
  } catch {
    update();
  }
}
