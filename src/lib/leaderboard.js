import { collection, doc, getCountFromServer, getDoc, getDocs, limit, orderBy, query, setDoc, serverTimestamp, where } from 'firebase/firestore';
import { db } from './firebase';

// A leaderboard rank only counts once a user has answered enough
// questions in that scope - otherwise one lucky question reads as
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
  // Left unset below the floor - Firestore orderBy() then naturally
  // excludes unqualified users with zero extra reads.
  if (newAnswered >= MIN_ANSWERED_FOR_ACCURACY) entry.qualifiedAccuracyPct = acc;
  return entry;
}

// Resolves a scope key (''/null = global, 'sem:<id>' = semester, else a
// subject name) into where in the leaderboard doc that scope's stats live.
function resolveScope(scopeKey) {
  if (!scopeKey) return { bucketField: null, bucketKey: null };
  if (typeof scopeKey === 'string' && scopeKey.startsWith('sem:')) {
    return { bucketField: 'semesters', bucketKey: scopeKey.slice(4) };
  }
  return { bucketField: 'subjects', bucketKey: scopeKey };
}

// subjTotals: { [mainSubjectName]: { correct, answered, timeMs } } - this quiz only
// semTotals:  { [semesterId]: { correct, answered, timeMs } } - this quiz only
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

// scopeKey: '' / null = global, 'sem:y1s2' = a semester, or a main subject
// name. metric: 'accuracyPct' | 'totalCorrect'. max: 0/null = no cap.
// Returns rows, or { error } if the query itself failed (surfaced in the
// UI rather than only logged, since students can't check devtools).
export async function fetchLeaderboardTop(scopeKey, metric, max) {
  try {
    const queryFieldName = metric === 'accuracyPct' ? 'qualifiedAccuracyPct' : metric;
    const { bucketField, bucketKey } = resolveScope(scopeKey);
    const field = bucketField ? `${bucketField}.${bucketKey}.${queryFieldName}` : queryFieldName;
    const col = collection(db, 'leaderboard');
    const constraints = [orderBy(field, 'desc')];
    if (max) constraints.push(limit(max));
    const snap = await getDocs(query(col, ...constraints));
    return snap.docs.map((d) => {
      const data = d.data();
      const s = (bucketField ? data[bucketField]?.[bucketKey] : data) || {};
      const correct = s.totalCorrect || 0;
      const answered = s.totalAnswered || 0;
      const timeMs = s.timeMs || 0;
      return {
        uid: d.id,
        displayName: data.displayName || 'Anonymous',
        value: s[metric] || 0,
        correct,
        incorrect: Math.max(0, answered - correct),
        avgTimeSec: answered ? timeMs / answered / 1000 : null,
      };
    });
  } catch (e) {
    console.error('Leaderboard fetch failed:', e);
    return { error: e.message || String(e) };
  }
}

// Returns { rank, total, value } for the current user in this scope/metric,
// or null if they have no entry yet (or haven't crossed the answered-
// question floor). Uses count aggregation so it doesn't download the
// whole leaderboard just to find one rank.
export async function fetchMyRank(uid, scopeKey, metric) {
  if (!uid) return null;
  try {
    const mySnap = await getDoc(doc(db, 'leaderboard', uid));
    if (!mySnap.exists()) return null;
    const data = mySnap.data();
    const { bucketField, bucketKey } = resolveScope(scopeKey);
    const s = (bucketField ? data[bucketField]?.[bucketKey] : data) || null;
    const queryFieldName = metric === 'accuracyPct' ? 'qualifiedAccuracyPct' : metric;
    if (!s || s[queryFieldName] === undefined) return null;
    const myValue = s[metric] || 0;
    const field = bucketField ? `${bucketField}.${bucketKey}.${queryFieldName}` : queryFieldName;
    const col = collection(db, 'leaderboard');
    const aheadSnap = await getCountFromServer(query(col, where(field, '>', s[queryFieldName])));
    const totalSnap = await getCountFromServer(query(col, where(field, '>=', 0)));
    return { rank: aheadSnap.data().count + 1, total: totalSnap.data().count, value: myValue };
  } catch (e) {
    console.error('Leaderboard rank lookup failed:', e);
    return null;
  }
}
