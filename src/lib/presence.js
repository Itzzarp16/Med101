import { onValue, onDisconnect, ref, serverTimestamp as rtdbServerTimestamp, set } from 'firebase/database';
import { rtdb } from './firebase';

// True instant presence via Realtime Database's onDisconnect - this is
// the one thing Firestore genuinely can't do: RTDB's server notices the
// socket drop itself (tab closed, phone died, network cut) and removes
// the presence entry server-side, with no heartbeat/timeout guessing.
//
// BUT: onDisconnect only fires on an actual socket drop. A backgrounded
// mobile tab (screen locked, app switched away, but not force-closed)
// can keep its underlying connection alive indefinitely, especially as
// an installed PWA - so it never "disconnects" and stays marked online
// long after anyone actually stopped using it (this is exactly what was
// reported: a device from the previous day still showing online).
//
// The fix is a heartbeat timestamp on top of onDisconnect, refreshed
// only while the tab is actually visible - readers (subscribeToOnlineCount
// /subscribeToOnlineNames) then also require that timestamp to be recent,
// so a backgrounded tab ages out of the count within one missed
// heartbeat interval even though its connection never technically drops.
const HEARTBEAT_INTERVAL_MS = 30_000;
const STALE_AFTER_MS = 90_000; // ~3 missed heartbeats before we call it offline

// Split into two separate top-level nodes because RTDB security rules
// can't hide a single field within an otherwise-readable node - once a
// parent path grants read access, that access applies to the whole
// subtree. So:
//   presence/{uid}      -> { ts } - no name, readable by EVERYONE
//                          signed in - this is what powers the public count.
//   presenceNames/{uid} -> { name, ts } - readable by ADMIN ONLY -
//                          this is what powers "who's online".
// Both are written together and removed together on disconnect, so
// presenceNames' keys are always exactly the currently-connected set
// (readers additionally filter both by staleness - see above).
export function startPresenceHeartbeat(uid, displayName) {
  const presenceRef = ref(rtdb, `presence/${uid}`);
  const nameRef = ref(rtdb, `presenceNames/${uid}`);
  const connectedRef = ref(rtdb, '.info/connected');
  let heartbeatId = null;

  function beat() {
    set(presenceRef, { ts: rtdbServerTimestamp() });
    set(nameRef, { name: displayName, ts: rtdbServerTimestamp() });
  }

  function startHeartbeat() {
    if (heartbeatId) return;
    beat();
    heartbeatId = setInterval(beat, HEARTBEAT_INTERVAL_MS);
  }

  function stopHeartbeat() {
    if (heartbeatId) { clearInterval(heartbeatId); heartbeatId = null; }
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'visible') startHeartbeat();
    else stopHeartbeat(); // stop refreshing - this device's entry will go stale on its own
  }

  const unsubConnected = onValue(connectedRef, (snap) => {
    if (snap.val() === false) return;

    Promise.all([
      onDisconnect(presenceRef).remove(),
      onDisconnect(nameRef).remove(),
    ]).then(() => {
      if (document.visibilityState === 'visible') startHeartbeat();
    });
  });

  document.addEventListener('visibilitychange', onVisibilityChange);

  return () => {
    unsubConnected();
    document.removeEventListener('visibilitychange', onVisibilityChange);
    stopHeartbeat();
    set(presenceRef, null); // leave immediately on a clean sign-out too
    set(nameRef, null);
  };
}

function isFresh(entryTs) {
  if (!entryTs) return false;
  return Date.now() - entryTs < STALE_AFTER_MS;
}

// Public - anyone signed in can see the headcount.
export function subscribeToOnlineCount(callback) {
  return onValue(ref(rtdb, 'presence'), (snap) => {
    const val = snap.val() || {};
    const freshCount = Object.values(val).filter((entry) => isFresh(entry?.ts)).length;
    callback(freshCount);
  });
}

// Admin-only - the actual list of who's online right now. Will fail
// with a permission error for non-admin callers, so only invoke this
// when isAdmin is true.
export function subscribeToOnlineNames(callback) {
  return onValue(ref(rtdb, 'presenceNames'), (snap) => {
    const val = snap.val() || {};
    const fresh = Object.entries(val)
      .filter(([, entry]) => isFresh(entry?.ts))
      .map(([uid, entry]) => ({ uid, name: entry.name }));
    callback(fresh);
  });
}
