import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

// Ported from the old site's window.__cloudHistory.add(). One doc per
// finished quiz attempt at users/{uid}/quizHistory/{autoId} — matches
// the collection path the Firestore rules already allow for.
export async function addQuizHistoryEntry(uid, entry) {
  if (!uid) return false;
  try {
    const col = collection(db, 'users', uid, 'quizHistory');
    await addDoc(col, { ...entry, createdAt: serverTimestamp() });
    return true;
  } catch (e) {
    console.error('Cloud history add failed:', e);
    return false;
  }
}
