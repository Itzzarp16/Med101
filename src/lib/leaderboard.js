import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

// A leaderboard rank only counts once a user has answered enough
// questions in that scope — otherwise one lucky question reads as
// "100%" at the top. Ported as-is from the old site.
const MIN_ANSWERED_FOR_ACCURACY = 100;

function rollupBucket(prev, correct, answered, timeMs) {
  const newCorrect = (prev?.totalCorrect || 0) + (correct || 0);
  const newAnswered = (prev?.totalAnswered || 0) + (answered || 0);
  const acc = newAnswered ? Math.round((newCorrect / newAnswered) * 100) : 0;
  const entry = {
    totalCorrect: newCorrect,
    totalAnswered: newAnswered,
    accuracyPct: acc,
    timeMs: (prev?.timeMs || 0) + (timeMs || 0),
  };
  // Left unset below the floor — Firestore orderBy() then naturally
  // excludes unqualified users with zero extra reads.
  if (newAnswered >= MIN_ANSWERED_FOR_ACCURACY) entry.qualifiedAccuracyPct = acc;
  return entry;
}

// subjTotals: { [mainSubjectName]: { correct, answered, timeMs } } — this quiz only
// semTotals:  { [semesterId]: { correct, answered, timeMs } } — this quiz only
export async function submitLeaderboardResult(user, subjTotals, semTotals, overall) {
  if (!user) return false;
  try {
    const ref = doc(db, 'leaderboard', user.uid);
    const snap = await getDoc(ref);
    const data = snap.exists() ? snap.data() : {};

    const subjects = { ...(data.subjects || {}) };
    for (const [subj, t] of Object.entries(subjTotals || {})) {
      subjects[subj] = rollupBucket(subjects[subj], t.correct, t.answered, t.timeMs);
    }

    const semesters = { ...(data.semesters || {}) };
    for (const [semId, t] of Object.entries(semTotals || {})) {
      if (!semId || semId === 'null') continue;
      semesters[semId] = rollupBucket(semesters[semId], t.correct, t.answered, t.timeMs);
    }

    const newGlobalCorrect = (data.totalCorrect || 0) + (overall.correct || 0);
    const newGlobalAnswered = (data.totalAnswered || 0) + (overall.answered || 0);
    const globalAcc = newGlobalAnswered ? Math.round((newGlobalCorrect / newGlobalAnswered) * 100) : 0;

    const payload = {
      displayName: user.displayName || (user.email ? user.email.split('@')[0] : 'Anonymous'),
      totalCorrect: newGlobalCorrect,
      totalAnswered: newGlobalAnswered,
      accuracyPct: globalAcc,
      timeMs: (data.timeMs || 0) + (overall.timeMs || 0),
      subjects,
      semesters,
      updatedAt: serverTimestamp(),
    };
    if (newGlobalAnswered >= MIN_ANSWERED_FOR_ACCURACY) payload.qualifiedAccuracyPct = globalAcc;

    await setDoc(ref, payload, { merge: true });
    return true;
  } catch (e) {
    console.error('Leaderboard update failed:', e);
    return false;
  }
}
