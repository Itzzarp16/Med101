import { arrayUnion, doc, updateDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { questionKeyFor } from './reviewQueue';

// Marks every question in a finished quiz as "seen" - arrayUnion means
// repeats across attempts dedupe automatically, no need to check first.
// Stored as plain keys (same stable hash as the wrong/flagged queues)
// rather than full question objects, since this list only needs to
// answer "have I seen this one before?", not reproduce the content.
export async function markQuestionsSeen(uid, mainSubject, questions) {
  if (!questions.length) return;
  const keys = questions.map((q) => questionKeyFor(mainSubject, q));
  const ref = doc(db, 'users', uid);
  try {
    await updateDoc(ref, { seenQuestions: arrayUnion(...keys) });
  } catch (e) {
    // updateDoc fails if the doc/field doesn't exist yet on a brand-new
    // account - fall back to a merge-set for that first-ever call.
    await setDoc(ref, { seenQuestions: keys }, { merge: true });
  }
}

// Filters a question pool down to only ones NOT in the student's seen
// list - this is what powers the "🆕 Unseen Only" quiz mode.
export function filterUnseen(pool, mainSubject, seenKeys) {
  const seen = new Set(seenKeys || []);
  return pool.filter((q) => !seen.has(questionKeyFor(mainSubject, q)));
}
