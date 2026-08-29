import {
  EmailAuthProvider, reauthenticateWithCredential, updatePassword, updateProfile,
} from 'firebase/auth';
import { doc, getDoc, runTransaction, setDoc } from 'firebase/firestore';
import { db } from './firebase';

function normalize(name) {
  return name.trim().toLowerCase();
}

const USERNAME_RULES = /^[a-z0-9_]{3,20}$/;

export async function updateDisplayName(user, newName) {
  const trimmed = newName.trim();
  if (!trimmed) throw new Error('Name cannot be empty.');
  await updateProfile(user, { displayName: trimmed });
  await setDoc(doc(db, 'users', user.uid), { displayName: trimmed }, { merge: true });
}

export async function fetchMyUsername(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data().username || null : null;
}

// Uniqueness is enforced by usernames/{normalizedName} being the doc ID —
// Firestore can't have two documents with the same ID, so a transaction
// that reads-then-writes that exact path is race-condition-safe: two
// people claiming the same name at the same instant, one transaction
// wins and the other gets 'already-claimed' cleanly instead of both
// silently succeeding.
export async function claimUsername(user, rawName) {
  const display = rawName.trim();
  const normalized = normalize(display);
  if (!USERNAME_RULES.test(normalized)) {
    throw new Error('Username must be 3-20 characters: letters, numbers, or underscore only.');
  }

  const newRef = doc(db, 'usernames', normalized);
  const userRef = doc(db, 'users', user.uid);

  await runTransaction(db, async (tx) => {
    const newSnap = await tx.get(newRef);
    if (newSnap.exists() && newSnap.data().uid !== user.uid) {
      throw new Error('already-claimed');
    }

    const userSnap = await tx.get(userRef);
    const previousUsername = userSnap.exists() ? userSnap.data().usernameNormalized : null;

    if (previousUsername && previousUsername !== normalized) {
      tx.delete(doc(db, 'usernames', previousUsername));
    }

    tx.set(newRef, { uid: user.uid, username: display }, { merge: true });
    tx.set(userRef, { username: display, usernameNormalized: normalized }, { merge: true });
  }).catch((e) => {
    if (e.message === 'already-claimed') {
      throw new Error('That username is already taken — try another.');
    }
    throw e;
  });

  return display;
}

export async function changePassword(user, currentPassword, newPassword) {
  if (newPassword.length < 6) throw new Error('New password must be at least 6 characters.');
  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, newPassword);
}
