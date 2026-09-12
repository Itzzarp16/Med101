import { doc, updateDoc, increment } from 'firebase/firestore';
import { db } from './firebase';

// How often we flush accumulated foreground time to Firestore. Kept
// fairly long (3 min) since this is a per-active-user recurring write -
// the same read/write-cost concern that drove removing Firestore-backed
// questions earlier in this project. A 3-minute cadence means a typical
// study session only adds a handful of writes, not one per minute.
const FLUSH_INTERVAL_MS = 3 * 60 * 1000;

// Accumulates how long a student has had the tab open and in the
// foreground (time spent minimized/on another tab doesn't count) into
// users/{uid}.totalTimeMs, so admin can see total time spent on the
// site. Call once per signed-in session (see AuthContext.jsx); returns
// a cleanup function to stop tracking, e.g. on sign-out.
export function startTimeTracking(uid) {
  if (!uid) return () => {};
  let lastMark = Date.now();
  let active = document.visibilityState === 'visible';

  async function flush() {
    if (!active) return;
    const now = Date.now();
    const elapsed = now - lastMark;
    lastMark = now;
    if (elapsed <= 0) return;
    try {
      await updateDoc(doc(db, 'users', uid), { totalTimeMs: increment(elapsed) });
    } catch (e) {
      console.warn('Time tracking flush failed:', e);
    }
  }

  const interval = setInterval(flush, FLUSH_INTERVAL_MS);

  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      flush();
      active = false;
    } else {
      lastMark = Date.now(); // resume the clock fresh - don't count time away
      active = true;
    }
  }
  document.addEventListener('visibilitychange', onVisibilityChange);

  return () => {
    flush();
    clearInterval(interval);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}

// Formats milliseconds as e.g. "3h 24m", "12m", or "2d 5h" for display.
export function formatDuration(ms) {
  if (!ms || ms <= 0) return '0m';
  const totalMin = Math.floor(ms / 60000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
