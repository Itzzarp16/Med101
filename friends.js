import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { lookupUsername } from './invites';

// Deliberately one-directional (like a watchlist), not a mutual
// request/accept flow — adding someone to your own friends list is
// purely a write to YOUR OWN subcollection, so it stays secure under
// simple "own data only" rules with no cross-user writes needed.
export async function addFriendByUsername(uid, rawUsername) {
  const found = await lookupUsername(rawUsername);
  if (!found) throw new Error('No student has claimed that username.');
  if (found.uid === uid) throw new Error("You can't add yourself.");
  await setDoc(doc(db, 'users', uid, 'friends', found.uid), {
    username: found.username,
    addedAt: serverTimestamp(),
  });
  return found;
}

export async function removeFriend(uid, friendUid) {
  await deleteDoc(doc(db, 'users', uid, 'friends', friendUid));
}

export function subscribeToFriends(uid, callback) {
  return onSnapshot(collection(db, 'users', uid, 'friends'), (snap) => {
    callback(snap.docs.map((d) => ({ uid: d.id, ...d.data() })));
  });
}
