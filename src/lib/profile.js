import {
  EmailAuthProvider, reauthenticateWithCredential, updatePassword, updateProfile,
} from 'firebase/auth';
import { doc, getDoc, runTransaction, setDoc } from 'firebase/firestore';
import { db } from './firebase';

// ── Profile photo upload (Firestore-only, no Firebase Storage) ─────
// TEMPORARY until the Firebase project is on the Blaze plan: Storage
// now requires Blaze even for tiny files (see the Sept 2024/Feb 2026
// Google Cloud Storage billing change), so this stores the resized
// photo directly as a base64 data URI on users/{uid}.photoURL instead
// of a Storage object. Firestore documents allow up to 1MB, and this
// avatar is downscaled hard enough to stay well under that.
//
// Deliberately NOT written to Firebase Auth's updateProfile({photoURL})
// - Auth profile fields ride along on every ID token, which gets sent
// as a header on essentially every Firestore/Storage/API call. A
// 20-30KB base64 string in there would bloat every request and risks
// hitting header-size limits. Firestore's own onSnapshot listener on
// users/{uid} (see AuthContext's `profile` state) already propagates
// this live to every screen without needing that.
//
// When Blaze is active: swap this back to uploading the resized blob
// to Storage (ref/uploadBytes/getDownloadURL) and writing the
// resulting URL to both Auth's photoURL and this same Firestore field
// - AVATAR_MAX_DIMENSION can also go back up since a real URL doesn't
// have this size pressure.
const MAX_SOURCE_BYTES = 10 * 1024 * 1024; // reject absurdly large picks before even trying to decode them
const AVATAR_MAX_DIMENSION = 200;
const AVATAR_JPEG_QUALITY = 0.7;
const MAX_DATA_URI_BYTES = 300 * 1024; // sanity ceiling, well under Firestore's 1MB doc limit

function resizeImageToJpegDataUri(file) {
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
      resolve(canvas.toDataURL('image/jpeg', AVATAR_JPEG_QUALITY));
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('That file could not be read as an image.'));
    };
    img.src = objectUrl;
  });
}

export async function uploadProfilePhoto(user, file) {
  if (!file) throw new Error('Choose a photo first.');
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.');
  if (file.size > MAX_SOURCE_BYTES) throw new Error('That image is too large (max 10MB).');

  const dataUri = await resizeImageToJpegDataUri(file);
  if (dataUri.length > MAX_DATA_URI_BYTES) {
    throw new Error('That photo is too complex to store this way - try a simpler/smaller image.');
  }

  await setDoc(doc(db, 'users', user.uid), { photoURL: dataUri }, { merge: true });

  // Keep the leaderboard's denormalized photo in sync right away too,
  // rather than waiting for their next quiz submission - but only if
  // they already have a leaderboard doc, so someone who has never
  // taken a quiz doesn't get a phantom zero-score entry created just
  // by uploading a photo.
  const lbRef = doc(db, 'leaderboard', user.uid);
  const lbSnap = await getDoc(lbRef);
  if (lbSnap.exists()) {
    await setDoc(lbRef, { photoURL: dataUri }, { merge: true });
  }

  return dataUri;
}

// Usernames have no length or character limit - anything the student
// types is allowed. Only two light clean-ups: a leading "@" is dropped
// (the UI already shows one) and case/Unicode-form differences don't
// count as different names, so "Sanjana" and "sanjana" can't both exist.
export function cleanUsername(name) {
  return String(name || '').trim().replace(/^@+/, '').trim();
}

export function normalize(name) {
  return cleanUsername(name).normalize('NFC').toLowerCase();
}

// Firestore document IDs can't contain "/", can't be "." or "..", and
// can't look like "__anything__", and are capped at 1500 bytes. So the
// name is percent-encoded into an ID that always satisfies those rules.
// Names made only of a-z, 0-9 and "_" (every name created before the
// limits were lifted) encode to themselves, so existing claims keep
// working unchanged.
const MAX_DOC_ID_LENGTH = 1400;

export function usernameDocId(name) {
  let id = encodeURIComponent(normalize(name)).replace(/\./g, '%2E');
  if (/^__.*__$/.test(id)) id = `%5F${id.slice(1)}`;
  return id;
}

// Checks whether a username is currently free, for live feedback on
// the signup form (step 1) before an account even exists. Only usable
// now that usernames/{name} allows public reads (see firestore.rules) -
// it used to require auth, which is exactly why this check didn't
// exist before and people only found out a name was taken after
// their account was already created.
export async function checkUsernameAvailable(rawName) {
  const snap = await getDoc(doc(db, 'usernames', usernameDocId(rawName)));
  return !snap.exists();
}

// Format-only check, no network call - safe to use before the user is
// signed in (e.g. signup step 1), since Firestore rules require auth
// for reads on `usernames`. Real uniqueness is still only settled by
// claimUsername's transaction after the account exists.
export function usernameFormatError(rawName) {
  const normalized = normalize(rawName);
  if (!normalized) return 'Please enter a username.';
  if (usernameDocId(rawName).length > MAX_DOC_ID_LENGTH) return 'That username is too long.';
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
  const display = cleanUsername(rawName);
  const normalized = normalize(display);
  const formatError = usernameFormatError(display);
  if (formatError) throw new Error(formatError);

  const newRef = doc(db, 'usernames', usernameDocId(display));
  const userRef = doc(db, 'users', user.uid);

  await runTransaction(db, async (tx) => {
    const newSnap = await tx.get(newRef);
    if (newSnap.exists() && newSnap.data().uid !== user.uid) {
      throw new Error('already-claimed');
    }

    const userSnap = await tx.get(userRef);
    const previousUsername = userSnap.exists() ? userSnap.data().usernameNormalized : null;

    if (previousUsername && previousUsername !== normalized) {
      tx.delete(doc(db, 'usernames', usernameDocId(previousUsername)));
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
