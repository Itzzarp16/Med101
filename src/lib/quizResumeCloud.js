import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';

// Cross-device copy of the unfinished-quiz snapshot (see quizProgress.js for
// the local one). One doc per student at users/{uid}/quizResume/current. The
// snapshot is stored as a JSON string so Firestore never trips over
// undefined/nested-array quirks, and skipped entirely if it would be too
// close to the 1 MiB document limit (the local save still works then).
const MAX_PAYLOAD_CHARS = 600000;
const ref = (uid) => doc(db, 'users', uid, 'quizResume', 'current');

export async function saveCloudSnapshot(uid, snapshot) {
  try {
    const payload = JSON.stringify(snapshot);
    if (payload.length > MAX_PAYLOAD_CHARS) return false;
    await setDoc(ref(uid), { attemptId: snapshot.attemptId, savedAt: snapshot.savedAt, payload });
    return true;
  } catch {
    return false; // rules not deployed / offline - local save still covers this device
  }
}

export async function loadCloudSnapshot(uid) {
  try {
    const snap = await getDoc(ref(uid));
    if (!snap.exists()) return null;
    const data = JSON.parse(snap.data().payload);
    return data && Array.isArray(data.questions) && Array.isArray(data.answers) ? data : null;
  } catch {
    return null;
  }
}

export async function deleteCloudSnapshot(uid) {
  try {
    await deleteDoc(ref(uid));
  } catch {
    // ignore
  }
}
