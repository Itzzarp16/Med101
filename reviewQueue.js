import { collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase';

// Simple stable hash so the same question always maps to the same doc
// ID (letting repeated wrong answers update one entry instead of
// duplicating it), without needing a real question ID from the source
// JSON (which doesn't have one).
function hashQuestion(mainSubject, subtopic, questionText) {
  const str = `${mainSubject}|${subtopic}|${questionText}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

export async function recordWrongQuestion(uid, mainSubject, question) {
  const key = hashQuestion(mainSubject, question.s, question.q);
  const ref = doc(db, 'users', uid, 'wrongQuestions', key);
  await setDoc(
    ref,
    {
      mainSubject,
      s: question.s,
      q: question.q,
      o: question.o,
      c: question.c,
      lastWrongAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function toggleFlaggedQuestion(uid, mainSubject, question, isFlagged) {
  const key = hashQuestion(mainSubject, question.s, question.q);
  const ref = doc(db, 'users', uid, 'flaggedQuestions', key);
  if (isFlagged) {
    await deleteDoc(ref);
  } else {
    await setDoc(ref, {
      mainSubject,
      s: question.s,
      q: question.q,
      o: question.o,
      c: question.c,
      flaggedAt: serverTimestamp(),
    });
  }
}

export function questionKeyFor(mainSubject, question) {
  return hashQuestion(mainSubject, question.s, question.q);
}

export async function fetchWrongQuestions(uid) {
  const q = query(collection(db, 'users', uid, 'wrongQuestions'), orderBy('lastWrongAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function fetchFlaggedQuestions(uid) {
  const q = query(collection(db, 'users', uid, 'flaggedQuestions'), orderBy('flaggedAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function removeWrongQuestion(uid, id) {
  await deleteDoc(doc(db, 'users', uid, 'wrongQuestions', id));
}
