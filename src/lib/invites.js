import {
  addDoc, collection, deleteDoc, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';

function normalize(name) {
  return name.trim().toLowerCase();
}

// Looks up a uid + display username from a claimed username. Returns
// null if nobody has claimed that name.
export async function lookupUsername(rawName) {
  const snap = await getDoc(doc(db, 'usernames', normalize(rawName)));
  if (!snap.exists()) return null;
  return { uid: snap.data().uid, username: snap.data().username };
}

// Invites live under the RECIPIENT's own uid (users/{toUid}/invites/*) —
// like a mailbox. fromUid is required to match the sender's own auth
// uid (enforced by security rules) so an invite can't be spoofed as
// coming from someone else.
export async function sendInvite({ fromUid, fromName, toUid, roomCode, mainSubject }) {
  if (toUid === fromUid) throw new Error("You can't invite yourself.");
  await addDoc(collection(db, 'users', toUid, 'invites'), {
    fromUid,
    fromName,
    roomCode,
    mainSubject,
    createdAt: serverTimestamp(),
  });
}

export function subscribeToMyInvites(uid, callback) {
  const q = query(collection(db, 'users', uid, 'invites'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function dismissInvite(uid, inviteId) {
  await deleteDoc(doc(db, 'users', uid, 'invites', inviteId));
}
