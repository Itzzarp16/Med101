import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

export function todayStr() {
  return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

function isYesterday(dateStr, today) {
  const d = new Date(dateStr);
  const t = new Date(today);
  const diffDays = Math.round((t - d) / (1000 * 60 * 60 * 24));
  return diffDays === 1;
}

// Called once per finished quiz. Same-day repeats are cheap no-ops
// for the streak fields (streakCount/lastActiveDate end up
// unchanged) - simpler than trying to dedupe client-side across tabs.
// questionsToday resets to 0 the first time this runs on a new day
// (tracked via questionsTodayDate, same day-boundary as
// lastActiveDate) and otherwise accumulates answeredCount across
// every quiz finished that day.
export async function updateStreakOnActivity(uid, answeredCount = 0) {
  const today = todayStr();
  const ref = doc(db, 'users', uid);

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists() ? snap.data() : {};
    const lastActiveDate = data.lastActiveDate || null;
    const prevStreak = data.streakCount || 0;
    const prevLongest = data.longestStreak || 0;
    const prevQuestionsToday = data.questionsTodayDate === today ? (data.questionsToday || 0) : 0;

    let nextStreak;
    if (lastActiveDate === today) {
      nextStreak = prevStreak; // already counted today
    } else if (lastActiveDate && isYesterday(lastActiveDate, today)) {
      nextStreak = prevStreak + 1;
    } else {
      nextStreak = 1; // gap in activity, or very first quiz ever
    }

    const nextLongest = Math.max(prevLongest, nextStreak);
    const nextQuestionsToday = prevQuestionsToday + answeredCount;

    tx.set(
      ref,
      {
        streakCount: nextStreak,
        longestStreak: nextLongest,
        lastActiveDate: today,
        lastActiveAt: serverTimestamp(),
        questionsToday: nextQuestionsToday,
        questionsTodayDate: today,
      },
      { merge: true }
    );

    return { streakCount: nextStreak, longestStreak: nextLongest, isNewDay: lastActiveDate !== today, questionsToday: nextQuestionsToday };
  });
}
