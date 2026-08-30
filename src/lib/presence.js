import { onValue, onDisconnect, ref, serverTimestamp as rtdbServerTimestamp, set } from 'firebase/database';
import { rtdb } from './firebase';

// True instant presence via Realtime Database's onDisconnect — this is
// the one thing Firestore genuinely can't do: RTDB's server notices the
// socket drop itself (tab closed, phone died, network cut) and removes
// the presence entry server-side, with no heartbeat/timeout guessing.
//
// The '.info/connected' special path is the standard Firebase pattern:
// every time this client's actual connection to RTDB toggles (initial
// connect, or a reconnect after a network blip), we re-register both
// "mark me online now" and "the server should mark me offline the
// moment this connection drops" — onDisconnect() only applies to the
// CURRENT connection, so it must be re-armed on every reconnect.
export function startPresenceHeartbeat(uid) {
  const myStatusRef = ref(rtdb, `presence/${uid}`);
  const connectedRef = ref(rtdb, '.info/connected');

  const unsub = onValue(connectedRef, (snap) => {
    if (snap.val() === false) return;

    onDisconnect(myStatusRef)
      .remove()
      .then(() => {
        set(myStatusRef, { online: true, lastSeen: rtdbServerTimestamp() });
      });
  });

  return () => {
    unsub();
    set(myStatusRef, null); // leave immediately on a clean sign-out too
  };
}

// Live subscription to the online headcount — updates instantly as
// people connect or disconnect, no polling needed.
export function subscribeToOnlineCount(callback) {
  const presenceRef = ref(rtdb, 'presence');
  return onValue(presenceRef, (snap) => {
    const val = snap.val() || {};
    callback(Object.keys(val).length);
  });
}
