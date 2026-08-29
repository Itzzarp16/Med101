import {
  collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, serverTimestamp, setDoc,
} from 'firebase/firestore';
import { db } from './firebase';

function randomCode() {
  // 8-digit numeric code, e.g. "40928371" — kept as a string so a
  // leading zero doesn't get silently dropped.
  return String(Math.floor(10000000 + Math.random() * 90000000));
}

// Records a room under the student's own personal history
// (users/{uid}/myRooms/{code}) so it can be found again later even if
// they exit before finishing — this is what powers "My Rooms" in the
// Challenge screen.
async function recordMyRoom(uid, { roomCode, mainSubject, role }) {
  await setDoc(
    doc(db, 'users', uid, 'myRooms', roomCode),
    { roomCode, mainSubject, role, updatedAt: serverTimestamp() },
    { merge: true }
  );
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
    await recordMyRoom(hostUid, { roomCode: code, mainSubject, role: 'host' });
    return code;
  }
  throw new Error('Could not generate a unique room code — please try again.');
}

export async function fetchRoom(code) {
  const snap = await getDoc(doc(db, 'rooms', code));
  return snap.exists() ? { code, ...snap.data() } : null;
}

// Joining (and re-joining) just means having a participant doc — the
// room itself is never modified by joiners. Re-joining after already
// finishing must NOT reset their result, so this only sets the initial
// "finished: false" default the first time a participant doc is
// created — a second join (e.g. from "My Rooms" history) just refreshes
// their display name without touching an existing score.
export async function joinRoom(code, uid, displayName) {
  const room = await fetchRoom(code);
  if (!room) return null;

  const participantRef = doc(db, 'rooms', code, 'participants', uid);
  const existing = await getDoc(participantRef);
  if (existing.exists()) {
    await setDoc(participantRef, { displayName }, { merge: true });
  } else {
    await setDoc(participantRef, { displayName, joinedAt: serverTimestamp(), finished: false });
  }

  await recordMyRoom(uid, { roomCode: code, mainSubject: room.mainSubject, role: 'participant' });
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

// A student's own room history, most recent first — powers the "My
// Rooms" list in the Challenge screen so an accidentally-exited room
// is never actually lost.
export async function fetchMyRooms(uid) {
  const q = query(collection(db, 'users', uid, 'myRooms'), orderBy('updatedAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data());
}
