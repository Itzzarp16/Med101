const KEY = 'med101_quizProgress';

// Companion to navPersistence.js — that one restores WHICH quiz you're
// in, this one restores exactly where you were inside it (current
// question, answers so far). Kept separate since this changes far more
// often (every answer) than overall navigation state.
export function saveQuizProgress(progress) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(progress));
  } catch {
    // ignore — worst case, a refresh mid-quiz restarts that attempt
  }
}

export function loadQuizProgress() {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearQuizProgress() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
