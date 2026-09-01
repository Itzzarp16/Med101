import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase';

// Ported from the old site's window.__cloudHistory.add(). One doc per
// finished quiz attempt at users/{uid}/quizHistory/{autoId} - matches
// the collection path the Firestore rules already allow for.
//
// `entry.questions` (the exact set attempted, in order) and
// `entry.answers` (parallel array: option index picked, -1 = skipped,
// -2 = timed out) are stored alongside the aggregate stats so the
// History screen can rebuild "Retry All / Wrong / Skipped" sets later
// without needing to re-run any matching logic against the live
// question bank (which may have since changed).
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

// Most recent attempts first, for the History screen. Capped at 50 so
// a long-time user's list stays fast to load and render.
export async function fetchQuizHistory(uid) {
  if (!uid) return [];
  try {
    const col = collection(db, 'users', uid, 'quizHistory');
    const q = query(col, orderBy('ts', 'desc'), limit(50));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error('Cloud history fetch failed:', e);
    return [];
  }
}

export async function deleteQuizHistoryEntry(uid, entryId) {
  if (!uid || !entryId) return false;
  try {
    await deleteDoc(doc(db, 'users', uid, 'quizHistory', entryId));
    return true;
  } catch (e) {
    console.error('Cloud history delete failed:', e);
    return false;
  }
}

// Rolls per-subtopic accuracy into the student's own profile doc, so
// weak-topic detection works no matter whether they quizzed "All Topics"
// or a single one. breakdown: { [subtopicName]: { correct, answered } }
// for just this one quiz attempt - gets merged into the running total.
export async function updateTopicStats(uid, mainSubject, breakdown) {
  if (!uid || !breakdown || Object.keys(breakdown).length === 0) return false;
  try {
    const ref = doc(db, 'users', uid);
    const snap = await getDoc(ref);
    const existing = snap.exists() ? snap.data().topicStats || {} : {};
    const next = { ...existing };
    for (const [subtopic, stats] of Object.entries(breakdown)) {
      const prev = next[subtopic] || { correct: 0, answered: 0, mainSubject };
      next[subtopic] = {
        mainSubject,
        correct: prev.correct + stats.correct,
        answered: prev.answered + stats.answered,
      };
    }
    await setDoc(ref, { topicStats: next, topicStatsUpdatedAt: serverTimestamp() }, { merge: true });
    return true;
  } catch (e) {
    console.error('Topic stats update failed:', e);
    return false;
  }
}
