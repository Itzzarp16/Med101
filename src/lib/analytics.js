import { collection, collectionGroup, getCountFromServer, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase';

const SEMESTER_ORDER = ['y1s1', 'y1s2', 'y2s1', 'y2s2'];

// Deliberately avoids reading every quiz-history document (that grows
// unbounded with usage) — instead leans on the leaderboard collection,
// which already has one compact rolled-up doc per student, plus a
// handful of cheap count() aggregations for totals that don't need
// per-document detail.
export async function fetchUsageAnalytics() {
  const [studentsSnap, quizzesTakenSnap, roomsSnap, leaderboardSnap] = await Promise.all([
    getCountFromServer(collection(db, 'users')),
    getCountFromServer(collectionGroup(db, 'quizHistory')),
    getCountFromServer(collection(db, 'rooms')),
    getDocs(collection(db, 'leaderboard')),
  ]);

  const semesterCounts = {};
  await Promise.all(
    SEMESTER_ORDER.map(async (semId) => {
      const snap = await getCountFromServer(query(collection(db, 'users'), where('enrolledYearSemester', '==', semId)));
      semesterCounts[semId] = snap.data().count;
    })
  );

  let totalAnswered = 0;
  let totalCorrect = 0;
  const subjectTotals = {}; // { subjectName: { answered, correct } }

  leaderboardSnap.forEach((doc) => {
    const data = doc.data();
    totalAnswered += data.totalAnswered || 0;
    totalCorrect += data.totalCorrect || 0;
    const subjects = data.subjects || {};
    for (const [name, s] of Object.entries(subjects)) {
      const bucket = subjectTotals[name] || { answered: 0, correct: 0 };
      bucket.answered += s.totalAnswered || 0;
      bucket.correct += s.totalCorrect || 0;
      subjectTotals[name] = bucket;
    }
  });

  const subjectPopularity = Object.entries(subjectTotals)
    .map(([name, s]) => ({
      name,
      answered: s.answered,
      accuracyPct: s.answered ? Math.round((s.correct / s.answered) * 100) : 0,
    }))
    .sort((a, b) => b.answered - a.answered);

  return {
    totalStudents: studentsSnap.data().count,
    totalQuizzesTaken: quizzesTakenSnap.data().count,
    totalRoomsCreated: roomsSnap.data().count,
    totalAnswered,
    totalCorrect,
    overallAccuracyPct: totalAnswered ? Math.round((totalCorrect / totalAnswered) * 100) : 0,
    semesterCounts,
    subjectPopularity,
    activeLeaderboardStudents: leaderboardSnap.size,
  };
}
