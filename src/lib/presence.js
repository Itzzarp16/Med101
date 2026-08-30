import { collection, doc, getDocs, query, serverTimestamp, setDoc, Timestamp, where } from 'firebase/firestore';
import { db } from './firebase';

const HEARTBEAT_MS = 30000;      // how often each open tab pings its own status
const ONLINE_WINDOW_MS = 90000;  // a student counts as "online" if seen within this window

async function pingPresence(uid) {
  try {
    await setDoc(doc(db, 'presence', uid), { lastSeen: serverTimestamp() }, { merge: true });
  } catch (e) {
    console.warn('Presence ping failed:', e);
  }
}

// Starts a heartbeat for the current session — pings immediately, then
// every HEARTBEAT_MS while the tab stays open. Returns a cleanup
// function to stop it (call on sign-out/unmount).
export function startPresenceHeartbeat(uid) {
  pingPresence(uid);
  const interval = setInterval(() => pingPresence(uid), HEARTBEAT_MS);
  return () => clearInterval(interval);
}

// No onSnapshot here on purpose — the "online" cutoff is a moving
// target (now minus 90s), so a live listener would need to be re-run
// on a timer anyway. A plain poll is simpler and just as accurate for
// a rough headcount.
export async function countOnlineUsers() {
  const cutoff = Timestamp.fromMillis(Date.now() - ONLINE_WINDOW_MS);
  const q = query(collection(db, 'presence'), where('lastSeen', '>', cutoff));
  const snap = await getDocs(q);
  return snap.size;
}

export { HEARTBEAT_MS };
