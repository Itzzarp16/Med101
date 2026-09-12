import { collection, getCountFromServer, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase';

const SEMESTER_ORDER = ['y1s1', 'y1s2', 'y2s1', 'y2s2'];

// Each piece is fetched independently and allowed to fail on its own
// (Promise.allSettled) - a permission hiccup or missing index on one
// stat shouldn't blank out the whole screen. Deliberately avoids
// collectionGroup queries (stricter/less predictable rule evaluation
// in practice) in favor of the leaderboard collection, which already
// has one compact rolled-up doc per student.
export async function fetchUsageAnalytics() {
  const results = await Promise.allSettled([
    getCountFromServer(collection(db, 'users')),
    getCountFromServer(collection(db, 'rooms')),
    getDocs(collection(db, 'leaderboard')),
    ...SEMESTER_ORDER.map((semId) =>
      getCountFromServer(query(collection(db, 'users'), where('enrolledYearSemester', '==', semId)))
    ),
  ]);

  const [studentsResult, roomsResult, leaderboardResult, ...semesterResults] = results;

  const errors = [];
  const totalStudents = studentsResult.status === 'fulfilled' ? studentsResult.value.data().count : null;
  if (studentsResult.status === 'rejected') errors.push('total student count');

  const totalRoomsCreated = roomsResult.status === 'fulfilled' ? roomsResult.value.data().count : null;
  if (roomsResult.status === 'rejected') errors.push('rooms created');

  const semesterCounts = {};
  SEMESTER_ORDER.forEach((semId, i) => {
    const r = semesterResults[i];
    semesterCounts[semId] = r.status === 'fulfilled' ? r.value.data().count : null;
    if (r.status === 'rejected') errors.push(`${semId} count`);
  });

  let totalAnswered = 0;
  let totalCorrect = 0;
  let activeLeaderboardStudents = 0;
  const subjectTotals = {};

  if (leaderboardResult.status === 'fulfilled') {
    activeLeaderboardStudents = leaderboardResult.value.size;
    leaderboardResult.value.forEach((doc) => {
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
  } else {
    errors.push('leaderboard data');
  }

  const subjectPopularity = Object.entries(subjectTotals)
    .map(([name, s]) => ({
      name,
      answered: s.answered,
      accuracyPct: s.answered ? Math.round((s.correct / s.answered) * 100) : 0,
    }))
    .sort((a, b) => b.answered - a.answered);

  return {
    totalStudents,
    totalRoomsCreated,
    totalAnswered,
    totalCorrect,
    overallAccuracyPct: totalAnswered ? Math.round((totalCorrect / totalAnswered) * 100) : 0,
    semesterCounts,
    subjectPopularity,
    activeLeaderboardStudents,
    errors,
  };
}
