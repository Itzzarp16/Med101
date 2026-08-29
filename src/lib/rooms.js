import {
  collection, doc, getDoc, onSnapshot, query, serverTimestamp, setDoc,
} from 'firebase/firestore';
import { db } from './firebase';

function randomCode() {
  // 8-digit numeric code, e.g. "40928371" — kept as a string so a
  // leading zero doesn't get silently dropped.
  return String(Math.floor(10000000 + Math.random() * 90000000));
}

// Freezes the exact question set at creation time so editing/migrating
// the source questions later never changes an in-progress room.
export async function createRoom({ hostUid, hostName, mainSubject, questions, timeLimitMinutes }) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = randomCode();
    const ref = doc(db, 'rooms', code);
    const existing = await getDoc(ref);
    if (existing.exists()) continue; // extremely unlikely, but retry on collision

    await setDoc(ref, {
      hostUid,
      hostName,
      mainSubject,
      questions, // frozen snapshot: [{ s, q, o, c }, ...]
      timeLimitMinutes,
      createdAt: serverTimestamp(),
    });
    return code;
  }
  throw new Error('Could not generate a unique room code — please try again.');
}

export async function fetchRoom(code) {
  const snap = await getDoc(doc(db, 'rooms', code));
  return snap.exists() ? { code, ...snap.data() } : null;
}

// Joining just means having a participant doc — the room itself is
// never modified by joiners, so there's nothing else to "claim".
export async function joinRoom(code, uid, displayName) {
  const room = await fetchRoom(code);
  if (!room) return null;
  await setDoc(
    doc(db, 'rooms', code, 'participants', uid),
    { displayName, joinedAt: serverTimestamp(), finished: false },
    { merge: true }
  );
  return room;
}

// Live subscription to every participant in a room — used for both the
// waiting-room list and the results leaderboard, which are really the
// same data at different points in time.
export function subscribeToParticipants(code, callback) {
  const q = query(collection(db, 'rooms', code, 'participants'));
  return onSnapshot(q, (snap) => {
    const rows = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
    callback(rows);
  });
}

export async function submitRoomResult(code, uid, { correct, answered, total, pct, timeMs }) {
  await setDoc(
    doc(db, 'rooms', code, 'participants', uid),
    { finished: true, correct, answered, total, pct, timeMs, finishedAt: serverTimestamp() },
    { merge: true }
  );
}
