import { useEffect, useRef, useState } from 'react';
import { haptic } from '../lib/haptics';
import './PullToRefresh.css';

const THRESHOLD = 72;   // px of (damped) pull needed to trigger
const MAX_PULL = 110;   // visual cap
const MIN_SPIN_MS = 600; // keep the spinner up long enough to be seen

// Pull-to-refresh for a phone: only starts when the page is scrolled to the
// very top and the finger drags down. Phones in an installed/PWA window have
// no native gesture, and in a browser tab Chrome's own reload gesture is
// suppressed while this is mounted (overscroll-behavior), so the one in-app
// gesture refreshes the data instead of reloading the whole page.
export default function PullToRefresh({ onRefresh, disabled = false }) {
  const [pull, setPull] = useState(0);
  const [phase, setPhase] = useState('idle'); // idle | pulling | refreshing | done
  const state = useRef({ startY: 0, startX: 0, active: false, armed: false, pull: 0, busy: false });
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;

  useEffect(() => {
    if (disabled) return undefined;
    const root = document.documentElement;
    root.classList.add('ptr-active');
    const st = state.current;

    const atTop = () => (window.scrollY || document.documentElement.scrollTop || 0) <= 0;

    function onStart(e) {
      if (st.busy || e.touches.length !== 1 || !atTop()) { st.active = false; return; }
      // Ignore touches that begin inside something that scrolls on its own
      // (modals, drawers, the menu panel) or on form controls.
      const t = e.target;
      if (t && t.closest && t.closest('input, textarea, select, [role="dialog"], .modal, .menu-overlay, .menu-drawer, [class*="modal-overlay"], [data-no-ptr]')) { st.active = false; return; }
      st.active = true;
      st.armed = false;
      st.startY = e.touches[0].clientY;
      st.startX = e.touches[0].clientX;
      st.pull = 0;
    }

    function onMove(e) {
      if (!st.active || st.busy) return;
      const dy = e.touches[0].clientY - st.startY;
      const dx = e.touches[0].clientX - st.startX;
      if (dy <= 0 || !atTop()) {
        if (st.pull > 0) { st.pull = 0; setPull(0); setPhase('idle'); }
        if (dy <= 0) return;
      }
      // A mostly-sideways drag isn't a pull.
      if (st.pull === 0 && Math.abs(dx) > Math.abs(dy)) { st.active = false; return; }
      if (e.cancelable) e.preventDefault();
      const damped = Math.min(MAX_PULL, dy * 0.5);
      st.pull = damped;
      setPull(damped);
      setPhase('pulling');
      const ready = damped >= THRESHOLD;
      if (ready && !st.armed) haptic(12);
      st.armed = ready;
    }

    async function onEnd() {
      if (!st.active) return;
      st.active = false;
      if (st.busy) return;
      if (st.armed) {
        st.busy = true;
        setPhase('refreshing');
        setPull(THRESHOLD * 0.75);
        const t0 = Date.now();
        let ok = true;
        try { ok = (await refreshRef.current?.()) !== false; } catch { ok = false; }
        const wait = Math.max(0, MIN_SPIN_MS - (Date.now() - t0));
        await new Promise((r) => setTimeout(r, wait));
        haptic(ok ? [10, 40, 10] : 25);
        setPhase(ok ? 'done' : 'failed');
        await new Promise((r) => setTimeout(r, 650));
        st.busy = false;
      }
      st.pull = 0;
      st.armed = false;
      setPull(0);
      setPhase('idle');
    }

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      root.classList.remove('ptr-active');
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
    };
  }, [disabled]);

  if (disabled) return null;
  const progress = Math.min(1, pull / THRESHOLD);
  const spinning = phase === 'refreshing';
  const label =
    phase === 'refreshing' ? 'Refreshing…'
    : phase === 'done' ? 'Up to date ✓'
    : phase === 'failed' ? "Couldn't refresh - check your connection"
    : progress >= 1 ? 'Release to refresh'
    : 'Pull to refresh';
  const visible = phase !== 'idle';
  return (
    <div
      className={`ptr ${visible ? 'ptr-visible' : ''} ${phase === 'pulling' ? 'ptr-dragging' : ''}`}
      style={{ height: visible ? Math.max(pull, phase === 'done' || phase === 'failed' ? 44 : 0) : 0 }}
      aria-live="polite"
    >
      <div className="ptr-inner" style={{ opacity: visible ? Math.max(0.25, progress) : 0 }}>
        <span
          className={`ptr-spinner ${spinning ? 'ptr-spin' : ''}`}
          style={spinning ? undefined : { transform: `rotate(${progress * 270}deg)` }}
          aria-hidden="true"
        />
        <span className="ptr-label">{label}</span>
      </div>
    </div>
  );
}
