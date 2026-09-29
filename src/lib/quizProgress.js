// Unfinished-quiz persistence.
//
// Solo quizzes are saved to localStorage as a full snapshot (the exact
// questions with their already-shuffled option order, answers, position,
// time spent, settings) so they survive closing the tab/browser and can be
// resumed from the dashboard. Challenge-room quizzes are shared/timed, so
// they only get the old same-tab (sessionStorage) refresh protection.
//
// A small per-tab marker (sessionStorage) says "this tab is currently inside
// attempt X". It lets a plain refresh drop you back into the quiz, while a
// quiz started fresh after pressing Back never silently picks up an older
// attempt that happens to have the same questions.
const LOCAL_KEY = 'med101_resumeQuiz_v2';
const SESSION_KEY = 'med101_quizProgress';
const MARK_KEY = 'med101_quizAttempt';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function questionsSig(questions) {
  const s = questions.map((q) => q.q).join('|');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return `${questions.length}:${h}`;
}

export function newAttemptId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function saveQuizProgress(snapshot) {
  try {
    const store = snapshot.roomCode ? sessionStorage : localStorage;
    store.setItem(snapshot.roomCode ? SESSION_KEY : LOCAL_KEY, JSON.stringify(snapshot));
    sessionStorage.setItem(MARK_KEY, snapshot.attemptId);
  } catch {
    // Storage full/unavailable - resume just won't be offered this time.
  }
}

function readJson(store, key) {
  try {
    const raw = store.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Solo snapshot, or null if missing/expired/corrupt.
export function loadResumeSnapshot() {
  const snap = readJson(localStorage, LOCAL_KEY);
  if (!snap || !Array.isArray(snap.questions) || !Array.isArray(snap.answers)) return null;
  if (!snap.savedAt || Date.now() - snap.savedAt > MAX_AGE_MS) return null;
  return snap;
}

export function loadSessionSnapshot() {
  const snap = readJson(sessionStorage, SESSION_KEY);
  return snap && Array.isArray(snap.answers) ? snap : null;
}

export function getAttemptMark() {
  try { return sessionStorage.getItem(MARK_KEY); } catch { return null; }
}

// Leaving the quiz screen (Back etc.): the saved attempt stays, but this tab
// is no longer "inside" it.
export function detachAttemptFromTab() {
  try { sessionStorage.removeItem(MARK_KEY); } catch { /* ignore */ }
}

// Attempt finished or discarded - forget it entirely.
export function clearQuizProgress() {
  try {
    localStorage.removeItem(LOCAL_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(MARK_KEY);
  } catch {
    // ignore
  }
}
