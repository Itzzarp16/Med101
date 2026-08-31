import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

function todayStr() {
  return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

function isYesterday(dateStr, today) {
  const d = new Date(dateStr);
  const t = new Date(today);
  const diffDays = Math.round((t - d) / (1000 * 60 * 60 * 24));
  return diffDays === 1;
}

// Called once per finished quiz. Same-day repeats are cheap no-ops
// (the transaction still runs, but streakCount/lastActiveDate end up
// unchanged) — simpler than trying to dedupe client-side across tabs.
export async function updateStreakOnActivity(uid) {
  const today = todayStr();
  const ref = doc(db, 'users', uid);

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists() ? snap.data() : {};
    const lastActiveDate = data.lastActiveDate || null;
    const prevStreak = data.streakCount || 0;
    const prevLongest = data.longestStreak || 0;

    let nextStreak;
    if (lastActiveDate === today) {
      nextStreak = prevStreak; // already counted today
    } else if (lastActiveDate && isYesterday(lastActiveDate, today)) {
      nextStreak = prevStreak + 1;
    } else {
      nextStreak = 1; // gap in activity, or very first quiz ever
    }

    const nextLongest = Math.max(prevLongest, nextStreak);

    tx.set(
      ref,
      {
        streakCount: nextStreak,
        longestStreak: nextLongest,
        lastActiveDate: today,
        lastActiveAt: serverTimestamp(),
      },
      { merge: true }
    );

    return { streakCount: nextStreak, longestStreak: nextLongest, isNewDay: lastActiveDate !== today };
  });
}
