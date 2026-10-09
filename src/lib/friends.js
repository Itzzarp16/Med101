import {
  collection, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, setDoc, writeBatch,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { lookupUsername } from './invites';

// Friendship is mutual and needs the other student's approval:
//   1. You send a request. It lands in THEIR mailbox
//      (users/{theirUid}/friendRequests/{yourUid}) and they get a push + a badge.
//   2. They accept -> each of you appears in the other's friends list.
//      They decline -> the request is just deleted.
// The request doc id is the sender's uid, so there is at most one open request
// per sender, and the security rules can prove who asked (the doc can only be
// created with fromUid == the sender's own auth uid). Accepting is the only time
// one student writes into another's friends list, and the rules only allow it
// while that request exists.

// Step 1: resolve the typed username to a student you can add. Writes nothing,
// so the UI can ask "send a request to @name?" first.
export async function findFriendCandidate(uid, rawUsername) {
  const found = await lookupUsername(rawUsername);
  if (!found) throw new Error('No student has claimed that username.');
  if (found.uid === uid) throw new Error("You can't add yourself.");
  return found;
}

// Accepting: add each other to both lists and clear the request, in one batch.
export async function acceptFriendRequest(uid, myUsername, req) {
  if (!myUsername) throw new Error('Pick a username first, then try again.');
  const batch = writeBatch(db);
  batch.set(doc(db, 'users', uid, 'friends', req.fromUid), {
    username: req.fromName,
    addedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'users', req.fromUid, 'friends', uid), {
    username: myUsername,
    addedAt: serverTimestamp(),
  });
  batch.delete(doc(db, 'users', uid, 'friendRequests', req.fromUid));
  await batch.commit();
}

export async function declineFriendRequest(uid, fromUid) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'users', uid, 'friendRequests', fromUid));
  await batch.commit();
}

// Step 2: send the request. Returns 'accepted' if they had already asked you
// (the two requests cross, so it just completes), otherwise 'sent'.
export async function sendFriendRequest(uid, myUsername, found) {
  if (!myUsername) throw new Error('Pick a username first so they can see who is asking.');

  const theirs = await getDoc(doc(db, 'users', uid, 'friendRequests', found.uid));
  if (theirs.exists()) {
    await acceptFriendRequest(uid, myUsername, { fromUid: found.uid, fromName: theirs.data().fromName || found.username });
    return 'accepted';
  }

  try {
    await setDoc(doc(db, 'users', found.uid, 'friendRequests', uid), {
      fromUid: uid,
      fromName: myUsername,
      toUid: found.uid,
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    if (e?.code === 'permission-denied') {
      throw new Error(`You've already sent @${found.username} a request - they'll see it once they open Med101.`);
    }
    throw e;
  }
  notifyFriendRequest(found.uid, uid); // fire-and-forget: the request is already saved
  return 'sent';
}

// Asks the server to push a notification for this request. Best effort - if it
// fails (offline, they haven't enabled notifications) the request still shows
// up in the app, with a badge on their menu.
async function notifyFriendRequest(toUid, fromUid) {
  try {
    const idToken = await auth.currentUser.getIdToken();
    await fetch('/api/push/send-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ type: 'friendRequest', toUid, inviteId: fromUid }),
    });
  } catch { /* non-critical */ }
}

// Unfriending is mutual too: it removes you from their list as well as them
// from yours. (Older one-directional friendships have no entry on their side;
// deleting a missing doc is a no-op.)
export async function removeFriend(uid, friendUid) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'users', uid, 'friends', friendUid));
  batch.delete(doc(db, 'users', friendUid, 'friends', uid));
  await batch.commit();
}

export function subscribeToFriends(uid, callback) {
  return onSnapshot(collection(db, 'users', uid, 'friends'), (snap) => {
    callback(snap.docs.map((d) => ({ uid: d.id, ...d.data() })));
  });
}

export function subscribeToFriendRequests(uid, callback) {
  const q = query(collection(db, 'users', uid, 'friendRequests'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, () => callback([]));
}
