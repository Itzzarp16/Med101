import { doc, getDoc, getDocs, setDoc, deleteDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

// Subcollections under users/{uid} that need to be wiped when an
// account is deleted. (friends/invites point at OTHER users' data by
// uid reference only, so deleting this user's own copies is enough -
// nothing elsewhere references this uid in a way that would break.)
const SUBCOLLECTIONS = ['quizHistory', 'friends', 'wrongQuestions', 'flaggedQuestions', 'myRooms', 'invites'];

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
export async function deleteAccount(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  const data = snap.exists() ? snap.data() : {};

  await Promise.all(SUBCOLLECTIONS.map((name) => deleteCollection(uid, name)));
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
}
