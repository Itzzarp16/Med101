import { onValue, onDisconnect, ref, serverTimestamp as rtdbServerTimestamp, set } from 'firebase/database';
import { rtdb } from './firebase';

// True instant presence via Realtime Database's onDisconnect - this is
// the one thing Firestore genuinely can't do: RTDB's server notices the
// socket drop itself (tab closed, phone died, network cut) and removes
// the presence entry server-side, with no heartbeat/timeout guessing.
//
// Split into two separate top-level nodes because RTDB security rules
// can't hide a single field within an otherwise-readable node - once a
// parent path grants read access, that access applies to the whole
// subtree. So:
//   presence/{uid}      -> just a marker (no name), readable by EVERYONE
//                          signed in - this is what powers the public count.
//   presenceNames/{uid} -> the display name, readable by ADMIN ONLY -
//                          this is what powers "who's online".
// Both are written together and removed together on disconnect, so
// presenceNames' keys are always exactly the currently-online set.
export function startPresenceHeartbeat(uid, displayName) {
  const presenceRef = ref(rtdb, `presence/${uid}`);
  const nameRef = ref(rtdb, `presenceNames/${uid}`);
  const connectedRef = ref(rtdb, '.info/connected');

  const unsub = onValue(connectedRef, (snap) => {
    if (snap.val() === false) return;

    Promise.all([
      onDisconnect(presenceRef).remove(),
      onDisconnect(nameRef).remove(),
    ]).then(() => {
      set(presenceRef, true);
      set(nameRef, displayName);
    });
  });

  return () => {
    unsub();
    set(presenceRef, null); // leave immediately on a clean sign-out too
    set(nameRef, null);
  };
}

// Public - anyone signed in can see the headcount.
export function subscribeToOnlineCount(callback) {
  return onValue(ref(rtdb, 'presence'), (snap) => {
    const val = snap.val() || {};
    callback(Object.keys(val).length);
  });
}

// Admin-only - the actual list of who's online right now. Will fail
// with a permission error for non-admin callers, so only invoke this
// when isAdmin is true.
export function subscribeToOnlineNames(callback) {
  return onValue(ref(rtdb, 'presenceNames'), (snap) => {
    const val = snap.val() || {};
    callback(Object.entries(val).map(([uid, name]) => ({ uid, name })));
  });
}
