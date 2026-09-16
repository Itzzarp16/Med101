import {
  EmailAuthProvider, reauthenticateWithCredential, updatePassword, updateProfile,
} from 'firebase/auth';
import { doc, getDoc, runTransaction, setDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db, storage } from './firebase';

// ── Profile photo upload ────────────────────────────────────────────
// Raw phone photos can be several MB and arbitrary dimensions - we
// downscale to a small square-ish JPEG client-side before it ever
// touches the network, both to keep Storage cost/bandwidth low and so
// upload doesn't stall on a slow connection. AVATAR_MAX_DIMENSION caps
// the longer edge; Storage rules also enforce a hard server-side size
// ceiling as a backstop (a client can't be trusted to actually run
// this code before hitting the API directly).
const MAX_SOURCE_BYTES = 10 * 1024 * 1024; // reject absurdly large picks before even trying to decode them
const AVATAR_MAX_DIMENSION = 512;
const AVATAR_JPEG_QUALITY = 0.85;

function resizeImageToJpegBlob(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, AVATAR_MAX_DIMENSION / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Could not process that image.'))),
        'image/jpeg',
        AVATAR_JPEG_QUALITY
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('That file could not be read as an image.'));
    };
    img.src = objectUrl;
  });
}

// Fixed filename (not a unique name per upload) - re-uploading just
// overwrites the same Storage object instead of accumulating orphaned
// old photos that nothing ever cleans up.
export async function uploadProfilePhoto(user, file) {
  if (!file) throw new Error('Choose a photo first.');
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.');
  if (file.size > MAX_SOURCE_BYTES) throw new Error('That image is too large (max 10MB).');

  const blob = await resizeImageToJpegBlob(file);

  const fileRef = ref(storage, `avatars/${user.uid}/photo.jpg`);
  await uploadBytes(fileRef, blob, { contentType: 'image/jpeg' });
  const url = await getDownloadURL(fileRef);

  await updateProfile(user, { photoURL: url });
  await setDoc(doc(db, 'users', user.uid), { photoURL: url }, { merge: true });

  return url;
}

export function normalize(name) {
  return name.trim().toLowerCase();
}

export const USERNAME_RULES = /^[a-z0-9_]{3,20}$/;

// Checks whether a username is currently free, for live feedback on
// the signup form (step 1) before an account even exists. Only usable
// now that usernames/{name} allows public reads (see firestore.rules) -
// it used to require auth, which is exactly why this check didn't
// exist before and people only found out a name was taken after
// their account was already created.
export async function checkUsernameAvailable(rawName) {
  const snap = await getDoc(doc(db, 'usernames', normalize(rawName)));
  return !snap.exists();
}

// Format-only check, no network call - safe to use before the user is
// signed in (e.g. signup step 1), since Firestore rules require auth
// for reads on `usernames`. Real uniqueness is still only settled by
// claimUsername's transaction after the account exists.
export function usernameFormatError(rawName) {
  const normalized = normalize(rawName.trim());
  if (!USERNAME_RULES.test(normalized)) {
    return 'Username must be 3-20 characters: letters, numbers, or underscore only.';
  }
  return null;
}

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

// Uniqueness is enforced by usernames/{normalizedName} being the doc ID -
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
      throw new Error('That username is already taken - try another.');
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
