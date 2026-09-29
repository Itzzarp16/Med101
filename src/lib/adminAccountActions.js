import { doc, getDoc, getDocs, setDoc, deleteDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

// Subcollections under users/{uid} that need to be wiped when an
// account is deleted. (friends/invites point at OTHER users' data by
// uid reference only, so deleting this user's own copies is enough -
// nothing elsewhere references this uid in a way that would break.)
const SUBCOLLECTIONS = ['quizHistory', 'friends', 'wrongQuestions', 'flaggedQuestions', 'myRooms', 'invites', 'quizResume'];

async function deleteCollection(uid, name) {
  const snap = await getDocs(collection(db, 'users', uid, name));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
}

// Toggles whether a student can use the site at all. This is enforced
// in AuthContext.jsx's profile listener - the moment `disabled` flips
// to true, that student is signed out immediately (same mechanism as
// the existing single-device kick) and can't sign back in until an
// admin clears the flag. Their data is untouched either way.
export async function setAccountDisabled(uid, disabled) {
  await setDoc(doc(db, 'users', uid), { disabled, disabledAt: disabled ? serverTimestamp() : null }, { merge: true });
}

// Permanently wipes a student's data and blocks the account from ever
// being used again.
//
// Important limitation: this is a client-only app with no backend, so
// there is no way to delete the actual Firebase Authentication login
// (that requires the Admin SDK, which only runs on a server - e.g. a
// Cloud Function, which needs Firebase's paid Blaze plan). The email/
// password technically still exists and could sign in - which is
// exactly why we DON'T delete the users/{uid} doc outright: an empty
// doc would look like a "pre-feature account" to verifyDevice() and
// let them back in with a blank profile. Instead we overwrite it with
// disabled: true plus placeholder fields, so the moment they did sign
// in they'd be kicked out the same way a disabled account always is.
async function softDeleteAccount(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  const data = snap.exists() ? snap.data() : {};

  // Run every wipe even if one is rejected, so a single collection the
  // published Firestore rules don't cover yet (e.g. quizResume before
  // the latest firestore.rules is deployed) can't leave the rest of the
  // account's data behind - then report exactly which ones failed.
  const results = await Promise.allSettled(SUBCOLLECTIONS.map((name) => deleteCollection(uid, name)));
  const failed = SUBCOLLECTIONS.filter((_, i) => results[i].status === 'rejected');
  await deleteDoc(doc(db, 'leaderboard', uid)).catch(() => {}); // fine if they never had one
  if (data.username) {
    await deleteDoc(doc(db, 'usernames', data.username)).catch(() => {});
  }

  await setDoc(
    doc(db, 'users', uid),
    {
      displayName: '(deleted account)',
      email: data.email || null,
      disabled: true,
      deletedAt: serverTimestamp(),
    },
    { merge: false } // wipe everything else - topicStats, enrolledYearSemester, activeDeviceId, totalTimeMs, etc.
  );

  if (failed.length) {
    throw new Error(
      `Account disabled and profile wiped, but couldn't clear: ${failed.join(', ')}. ` +
      'Publish the latest firestore.rules in the Firebase console, then run Delete again.'
    );
  }
}

// Permanent delete: asks api/admin/delete-account.py (Firebase Admin SDK)
// to remove the Auth login and every Firestore doc for this student, so
// nothing is left in the Firebase console. If that endpoint isn't
// reachable/deployed, falls back to the older client-side wipe above,
// which disables the account and blanks the profile instead.
export async function deleteAccount(uid, adminUser) {
  if (adminUser) {
    try {
      const idToken = await adminUser.getIdToken();
      const res = await fetch('/api/admin/delete-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ uid }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) return;
      // Real refusals (admin account, bad session) shouldn't silently fall through.
      if (res.status === 400 || res.status === 401 || res.status === 403) {
        throw new Error(data.error || `Delete refused (${res.status}).`);
      }
    } catch (e) {
      if (/refused|can't delete|Admin|session|uid/i.test(e.message || '')) throw e;
      // network error / endpoint missing / 5xx -> fall back below
    }
  }
  return softDeleteAccount(uid);
}
