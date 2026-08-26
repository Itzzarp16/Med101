import {
  addDoc, collection, deleteDoc, doc, getDocs, orderBy, query,
  serverTimestamp, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';

const COL = 'questions';

// Fetch every migrated question for a given main subject within a
// semester, in display order. Returns [] if that subject hasn't been
// migrated yet — callers should fall back to the static JSON in that
// case (see useSemesterData.js).
export async function fetchFirestoreQuestions(semesterId, mainSubject) {
  const q = query(
    collection(db, COL),
    where('term', '==', semesterId),
    where('mainSubject', '==', mainSubject),
    orderBy('order', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Which main subjects (within a semester) have already been migrated
// to Firestore. Cheap-ish: one query per known subject name, called
// only from the admin panel, not the student-facing app.
export async function fetchMigratedSubjects(semesterId, candidateSubjects) {
  const migrated = new Set();
  await Promise.all(
    candidateSubjects.map(async (subj) => {
      const q = query(
        collection(db, COL),
        where('term', '==', semesterId),
        where('mainSubject', '==', subj)
      );
      const snap = await getDocs(q);
      if (!snap.empty) migrated.add(subj);
    })
  );
  return migrated;
}

// One-time move of a subject's questions from the static JSON into
// Firestore as individual documents (chunked into batches of 400,
// under Firestore's 500-writes-per-batch limit). Safe to call again
// later if you want to re-migrate — it does NOT delete existing docs
// first, so don't run it twice without clearing, or you'll duplicate.
export async function migrateSubjectToFirestore(semesterId, mainSubject, subtopicQuestions) {
  const chunks = [];
  for (let i = 0; i < subtopicQuestions.length; i += 400) {
    chunks.push(subtopicQuestions.slice(i, i + 400));
  }
  let order = 0;
  for (const chunk of chunks) {
    const batch = writeBatch(db);
    for (const q of chunk) {
      const ref = doc(collection(db, COL));
      batch.set(ref, {
        term: semesterId,
        mainSubject,
        subtopic: q.s,
        q: q.q,
        o: q.o,
        c: q.c,
        order: order++,
        createdAt: serverTimestamp(),
      });
    }
    await batch.commit();
  }
}

export async function createQuestion(semesterId, mainSubject, subtopic, data, order) {
  await addDoc(collection(db, COL), {
    term: semesterId,
    mainSubject,
    subtopic,
    q: data.q,
    o: data.o,
    c: data.c,
    order: order ?? Date.now(),
    createdAt: serverTimestamp(),
  });
}

export async function updateQuestion(id, data) {
  await updateDoc(doc(db, COL, id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteQuestion(id) {
  await deleteDoc(doc(db, COL, id));
}

// Swap the `order` value of two questions — used for the up/down
// reorder buttons in the admin panel.
export async function swapOrder(a, b) {
  const batch = writeBatch(db);
  batch.update(doc(db, COL, a.id), { order: b.order });
  batch.update(doc(db, COL, b.id), { order: a.order });
  await batch.commit();
}
