import { useEffect, useRef, useState } from 'react';
import { playCorrectSound, playWrongSound, playTapSound, playAppreciationSound } from '../lib/sounds';
import { useAuth } from '../lib/AuthContext';
import { addQuizHistoryEntry, updateTopicStats } from '../lib/quizHistory';
import { updateStreakOnActivity } from '../lib/streak';
import { markQuestionsSeen } from '../lib/seenQuestions';
import { submitLeaderboardResult } from '../lib/leaderboard';
import { submitRoomResult } from '../lib/rooms';
import { recordWrongQuestion, toggleFlaggedQuestion } from '../lib/reviewQueue';
import { saveQuizProgress, loadResumeSnapshot, loadSessionSnapshot, getAttemptMark, detachAttemptFromTab, clearQuizProgress, questionsSig, newAttemptId } from '../lib/quizProgress';
import { getAIExplanation } from '../lib/aiExplanation';
import { saveCloudSnapshot, deleteCloudSnapshot } from '../lib/quizResumeCloud';
import './QuizScreen.css';

const LABELS = ['A', 'B', 'C', 'D', 'E'];

function formatElapsed(ms) {
  const totalSec = Math.floor(ms / 1000);
  const m = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const s = String(totalSec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function gradeFor(pct) {
  if (pct >= 90) return { letter: 'A', color: 'var(--green)' };
  if (pct >= 80) return { letter: 'B', color: 'var(--cyan)' };
  if (pct >= 70) return { letter: 'C', color: 'var(--amber)' };
  if (pct >= 60) return { letter: 'D', color: 'var(--amber)' };
  return { letter: 'F', color: 'var(--red)' };
}

// The source data for some subjects (Physiology in particular) lists
// the correct answer first almost every time - so without reshuffling,
// a student could score well just by always picking "A" instead of
// actually knowing the material. We shuffle each question's own option
// order once per quiz attempt (not on every render) and remap which
// index is correct to match, so answer position carries no signal.
function shuffleOptions(q) {
  const order = q.o.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { ...q, o: order.map((i) => q.o[i]), c: order.indexOf(q.c) };
}

// questions arrives already in the exact order/subset QuizModeScreen
// decided (Random 25, All Sequential, Custom Range, etc.) - this
// component just renders that sequence, it doesn't reorder which
// QUESTIONS appear or how many. It does shuffle each question's own
// OPTION order (see shuffleOptions above), once per attempt.
// autoAdvance/timerSeconds are settings chosen on that same screen.
// roomCode/totalTimeLimitMs are set only for Challenge Room quizzes -
// a whole-quiz countdown (not per-question) that auto-finishes when it
// hits zero, and reports the result to the room's shared leaderboard.
export default function QuizScreen({ mainSubject, topic, semesterId, questions, isPremium, autoAdvance, timerSeconds, roomCode, totalTimeLimitMs, resumeAttemptId, onExit, onViewRoomResults, onRestartSame, onRetryWrong }) {
  const { user, profile } = useAuth();
  // Work out once, on mount, whether this is a fresh attempt or a continuation
  // of a saved one: either the student tapped "Resume" on the dashboard
  // (resumeAttemptId), or this same tab was already inside that attempt and
  // just got refreshed. Only then is the saved snapshot adopted - and it
  // brings its own already-shuffled options, so saved answers still line up.
  const initRef = useState(() => {
    const snap = roomCode ? loadSessionSnapshot() : loadResumeSnapshot();
    const sameQuiz = !!snap && snap.sig === questionsSig(questions) && snap.answers.length === questions.length;
    const continues = sameQuiz && ((resumeAttemptId && snap.attemptId === resumeAttemptId) || getAttemptMark() === snap.attemptId);
    if (continues && Array.isArray(snap.questions) && snap.questions.length === questions.length) {
      return { restored: snap, attemptId: snap.attemptId, quizQuestions: snap.questions };
    }
    return { restored: null, attemptId: newAttemptId(), quizQuestions: questions.map(shuffleOptions) };
  })[0];
  const restoredRef = initRef.restored; // saved snapshot being continued, or null
  const quizQuestions = initRef.quizQuestions;
  const attemptIdRef = useRef(initRef.attemptId);

  const [cur, setCur] = useState(restoredRef?.cur ?? 0);
  const [answers, setAnswers] = useState(() => restoredRef?.answers ?? new Array(quizQuestions.length).fill(-1));
  const [finished, setFinished] = useState(false);
  const [timeLeft, setTimeLeft] = useState(timerSeconds || null);
  const questionDeadlineRef = useRef(null);
  const [navOpen, setNavOpen] = useState(false); // question-grid panel
  const pausedRemainingRef = useRef(null); // { cur, ms } - per-question timer paused while the grid is open
  const swipeRef = useRef(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [flaggedKeys, setFlaggedKeys] = useState(() => new Set());
  const [showReview, setShowReview] = useState(false);
  const [aiExplanations, setAiExplanations] = useState({});
  const [aiLoading, setAiLoading] = useState({});
  const [aiErrors, setAiErrors] = useState({});
  // Per-question time, ms - -1 means "never visited" (quiz ended early).
  // Recorded the moment a question is answered/times-out/skipped-past,
  // so it reflects actual time-on-question, not just a global average.
  const [questionTimesMs, setQuestionTimesMs] = useState(() => restoredRef?.questionTimesMs ?? new Array(quizQuestions.length).fill(-1));
  const questionShownAtRef = useRef(Date.now());
  // Solo resumes continue the stopwatch from the time already spent (not from
  // the original wall-clock start, which would count the time away). Rooms
  // keep the absolute start since their clock keeps running.
  const startedAtRef = useRef(
    restoredRef
      ? (roomCode ? (restoredRef.startedAt ?? Date.now()) : Date.now() - (restoredRef.elapsedMs ?? 0))
      : Date.now()
  );
  // Absolute deadline (not a decrementing counter) so the countdown
  // reflects real wall-clock time even after a refresh gap.
  const totalDeadlineRef = useRef(
    totalTimeLimitMs ? (restoredRef?.totalDeadline ?? Date.now() + totalTimeLimitMs) : null
  );
  const [totalTimeLeftMs, setTotalTimeLeftMs] = useState(
    totalDeadlineRef.current ? Math.max(0, totalDeadlineRef.current - Date.now()) : null
  );
  const savedRef = useRef(false); // guards against double-save (StrictMode / re-renders)
  const appreciationPlayedRef = useRef(false); // guards against double-play (StrictMode / re-renders)
  const advanceTimeoutRef = useRef(null);

  const q = quizQuestions[cur];
  const total = quizQuestions.length;
  const answeredCount = answers.filter((a) => a !== -1).length;
  const correctCount = answers.filter((a, i) => a >= 0 && a === quizQuestions[i].c).length;
  const pct = answeredCount ? Math.round((correctCount / answeredCount) * 100) : 0;

  // Persist position/answers on every change, and clean up entirely
  // once this attempt is over (finished, or the student navigates away).
  const latestSnapshotRef = useRef(null);
  latestSnapshotRef.current = () => ({
    attemptId: attemptIdRef.current,
    sig: questionsSig(questions),
    savedAt: Date.now(),
    uid: user?.uid ?? null,
    roomCode: roomCode ?? null,
    mainSubject,
    topic: topic ?? null,
    semesterId: semesterId ?? null,
    questions: quizQuestions,
    autoAdvance: !!autoAdvance,
    timerSeconds: timerSeconds ?? null,
    cur,
    answers,
    questionTimesMs,
    startedAt: startedAtRef.current,
    elapsedMs: Date.now() - startedAtRef.current,
    totalDeadline: totalDeadlineRef.current,
  });

  useEffect(() => {
    if (finished) return;
    saveQuizProgress(latestSnapshotRef.current());
  }, [cur, answers, questionTimesMs, finished]);

  // Refresh the saved elapsed time when the tab is hidden/closed.
  useEffect(() => {
    function flush() {
      if (!finished && latestSnapshotRef.current) saveQuizProgress(latestSnapshotRef.current());
    }
    function onVis() { if (document.visibilityState === 'hidden') flush(); }
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [finished]);

  // Cross-device copy: debounced Firestore save once at least 3 questions are
  // answered (so instantly-abandoned quizzes cost nothing). Solo quizzes only.
  const cloudPendingRef = useRef(false);
  useEffect(() => {
    if (roomCode || !user || finished || answeredCount < 3) return;
    cloudPendingRef.current = true;
    const t = setTimeout(() => {
      cloudPendingRef.current = false;
      saveCloudSnapshot(user.uid, latestSnapshotRef.current());
    }, 2500);
    return () => clearTimeout(t);
  }, [answers, finished]);

  // Push any not-yet-sent save immediately when the tab is hidden or the
  // student leaves the quiz.
  const flushCloudRef = useRef(null);
  flushCloudRef.current = () => {
    if (cloudPendingRef.current && user && !roomCode && !finished) {
      cloudPendingRef.current = false;
      saveCloudSnapshot(user.uid, latestSnapshotRef.current());
    }
  };
  useEffect(() => {
    function onHide() { if (document.visibilityState === 'hidden') flushCloudRef.current(); }
    document.addEventListener('visibilitychange', onHide);
    return () => { document.removeEventListener('visibilitychange', onHide); flushCloudRef.current(); };
  }, []);

  // Leaving the screen: rooms are forgotten (as before); solo attempts stay
  // saved so they can be resumed from the dashboard.
  useEffect(() => () => {
    if (roomCode) clearQuizProgress();
    else detachAttemptFromTab();
  }, []);

  // Elapsed stopwatch, ticking every second while the quiz is in progress.
  useEffect(() => {
    if (finished) return;
    const t = setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 1000);
    return () => clearInterval(t);
  }, [finished]);

  // Whole-quiz countdown for Challenge Rooms - recomputed from the
  // absolute deadline each tick (not a naive ms-1000 decrement), so it
  // stays accurate even if the page was closed/reloaded partway through.
  // Auto-finishes (keeping whatever was answered so far) at zero.
  useEffect(() => {
    if (!totalDeadlineRef.current || finished) return;
    const t = setInterval(() => {
      const remaining = Math.max(0, totalDeadlineRef.current - Date.now());
      setTotalTimeLeftMs(remaining);
      if (remaining <= 0) setFinished(true);
    }, 1000);
    return () => clearInterval(t);
  }, [finished]);

  function nav(dir) {
    playTapSound();
    if (answers[cur] === -1) recordQuestionTime(cur); // leaving unanswered - count time-on-question up to this point
    const nx = cur + dir;
    if (nx >= total) {
      setFinished(true);
      return;
    }
    if (nx < 0) return;
    setCur(nx);
  }

  // Opening the question grid pauses the per-question timer; closing resumes
  // it with the time that was left. Not offered in rooms (would be a free
  // pause in a competitive quiz) - the timer keeps running there.
  function toggleNav() {
    playTapSound();
    const opening = !navOpen;
    if (timerSeconds && !roomCode && answers[cur] === -1 && !finished) {
      if (opening) {
        pausedRemainingRef.current = { cur, ms: Math.max(0, questionDeadlineRef.current - Date.now()) };
      } else {
        const p = pausedRemainingRef.current;
        const ms = p && p.cur === cur ? p.ms : timerSeconds * 1000;
        questionDeadlineRef.current = Date.now() + ms;
        pausedRemainingRef.current = null;
      }
    } else if (!opening && timerSeconds) {
      // Closed after jumping to a different question - it starts fresh.
      questionDeadlineRef.current = Date.now() + timerSeconds * 1000;
      pausedRemainingRef.current = null;
      setTimeLeft(timerSeconds);
    }
    setNavOpen(opening);
  }

  // Horizontal swipe between questions (never past the ends, so a stray
  // swipe can't finish the quiz).
  function onSwipeStart(e) {
    if (e.target.closest && e.target.closest('.qchips, .qnav-wrap, .ai-explanation-card')) { swipeRef.current = null; return; }
    const t = e.touches[0];
    swipeRef.current = { x: t.clientX, y: t.clientY };
  }
  function onSwipeEnd(e) {
    const st = swipeRef.current;
    swipeRef.current = null;
    if (!st) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - st.x;
    const dy = t.clientY - st.y;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
    if (dx < 0 && cur < total - 1) nav(1);
    else if (dx > 0 && cur > 0) nav(-1);
  }

  // Jump straight to a question from the question grid.
  function goTo(i) {
    if (i === cur || i < 0 || i >= total) return;
    playTapSound();
    clearTimeout(advanceTimeoutRef.current);
    if (answers[cur] === -1) recordQuestionTime(cur);
    setCur(i);
  }

  async function loadAIExplanation(question) {
    const key = question.q;
    if (!isPremium || aiExplanations[key] || aiLoading[key]) return;

    setAiLoading((prev) => ({ ...prev, [key]: true }));
    setAiErrors((prev) => ({ ...prev, [key]: null }));

    try {
      const result = await getAIExplanation({
        subject: mainSubject,
        subtopic: question.s,
        question: question.q,
        options: question.o,
        correctIndex: question.c,
      });
      setAiExplanations((prev) => ({ ...prev, [key]: result.explanation }));
    } catch (error) {
      setAiErrors((prev) => ({ ...prev, [key]: error.message || 'Could not load AI explanation.' }));
    } finally {
      setAiLoading((prev) => ({ ...prev, [key]: false }));
    }
  }

  function answerQ(idx) {
    if (answers[cur] !== -1) return; // already answered - locked
    recordQuestionTime(cur);
    const next = [...answers];
    next[cur] = idx;
    setAnswers(next);
    if (idx === q.c) {
      playCorrectSound();
    } else {
      playWrongSound();
      if (user) recordWrongQuestion(user.uid, mainSubject, q);
    }


    // Explanation is now purely on-demand (the "✨ Explain with AI" /
    // "Explain with Gemini" buttons below) rather than firing for every
    // answered question automatically - that was burning through the
    // daily generation limit even for questions nobody wanted explained.

    // Auto-advance only applies to correct answers - a wrong answer
    // (or a timeout, handled separately below) always waits for the
    // student to hit Next themselves, so they actually see the
    // correct answer and have a chance to tap "Explain with AI"
    // instead of the screen moving on without them.
    if (autoAdvance && idx === q.c) {
      advanceTimeoutRef.current = setTimeout(() => nav(1), 550);
    }
  }

  function toggleFlag() {
    if (!user) return;
    playTapSound();
    const key = `${cur}`;
    const isFlagged = flaggedKeys.has(key);
    toggleFlaggedQuestion(user.uid, mainSubject, q, isFlagged);
    setFlaggedKeys((prev) => {
      const next = new Set(prev);
      if (isFlagged) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Reset the per-question timer whenever a new question is shown.
  // A wall-clock deadline is set at the same moment, so the countdown
  // can't drift or get throttled when the tab/phone sleeps.
  useEffect(() => {
    if (!timerSeconds) return;
    questionDeadlineRef.current = Date.now() + timerSeconds * 1000;
    setTimeLeft(timerSeconds);
  }, [cur, timerSeconds]);

  // Track wall-clock time spent per question - reset the moment the
  // student actually lands on a new question.
  useEffect(() => {
    questionShownAtRef.current = Date.now();
  }, [cur]);

  function recordQuestionTime(index) {
    const elapsed = Date.now() - questionShownAtRef.current;
    setQuestionTimesMs((prev) => {
      if (prev[index] !== -1) return prev; // already recorded - don't overwrite
      const next = [...prev];
      next[index] = elapsed;
      return next;
    });
  }

  // Countdown + auto-submit-as-wrong when it hits zero.
  // Deadline-based (not a decrementing state counter): the old version
  // read a stale timeLeft of 0 on the first render of the NEXT question
  // and instantly timed it out too, and it could stall in background tabs.
  useEffect(() => {
    if (!timerSeconds || finished || answers[cur] !== -1) return;
    if (navOpen && !roomCode) return; // paused while the question grid is open
    const id = setInterval(() => {
      const left = Math.max(0, Math.ceil((questionDeadlineRef.current - Date.now()) / 1000));
      setTimeLeft(left);
      if (left > 0) return;
      clearInterval(id);
      recordQuestionTime(cur);
      setAnswers((prev) => {
        if (prev[cur] !== -1) return prev;
        const next = [...prev];
        next[cur] = -2; // -2 = "timed out", distinct from -1 (unanswered) and any real option index
        return next;
      });
      playWrongSound();
      if (user) recordWrongQuestion(user.uid, mainSubject, q);
      // Timed out = always wrong - never auto-advances regardless of autoAdvance.
    }, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur, timerSeconds, finished, answers[cur], navOpen]);

  useEffect(() => () => clearTimeout(advanceTimeoutRef.current), []);

  // Appreciation sound - plays once, right when the results screen
  // appears, independent of the history/leaderboard save effect below
  // (which requires a signed-in user; this shouldn't).
  useEffect(() => {
    if (!finished || appreciationPlayedRef.current) return;
    appreciationPlayedRef.current = true;
    playAppreciationSound(pct);
  }, [finished, pct]);

  // Animates the accuracy ring (and the % it shows) sweeping up from 0
  // to the actual score over ~700ms, rather than just appearing at its
  // final value - driven frame-by-frame here rather than a plain CSS
  // transition so the number and the ring stay perfectly in sync.
  const [ringAnimPct, setRingAnimPct] = useState(0);
  useEffect(() => {
    if (!finished) { setRingAnimPct(0); return; }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setRingAnimPct(pct);
      return;
    }
    let raf;
    const duration = 700;
    const start = performance.now() + 150; // small pause before it starts, so it reads as a reveal
    function tick(now) {
      const elapsed = now - start;
      if (elapsed < 0) { raf = requestAnimationFrame(tick); return; }
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setRingAnimPct(Math.round(eased * pct));
      if (t < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [finished, pct]);

  // Save history + leaderboard once, the moment the results screen appears.
  useEffect(() => {
    if (!finished || savedRef.current || !user) return;
    savedRef.current = true;
    const timeMs = Date.now() - startedAtRef.current;

    addQuizHistoryEntry(user.uid, {
      mainSubject,
      topic: topic || null,
      total,
      answered: answeredCount,
      correct: correctCount,
      pct,
      timeMs,
      ts: Date.now(),
      // Full set + per-question answers, so History can rebuild
      // "Retry All / Wrong / Skipped" later without depending on the
      // live question bank still matching this exact attempt.
      questions: quizQuestions.map((qq) => ({ s: qq.s, q: qq.q, o: qq.o, c: qq.c })),
      answers,
    });

    const subjTotals = mainSubject
      ? { [mainSubject]: { correct: correctCount, answered: answeredCount, timeMs } }
      : {};
    const semTotals = semesterId
      ? { [semesterId]: { correct: correctCount, answered: answeredCount, timeMs } }
      : {};
    submitLeaderboardResult(user, subjTotals, semTotals, {
      correct: correctCount,
      answered: answeredCount,
      timeMs,
    }, profile?.photoURL);

    if (roomCode) {
      submitRoomResult(roomCode, user.uid, { correct: correctCount, answered: answeredCount, total, pct, timeMs, answers, displayName: user.displayName || user.email });
    }

    // Per-subtopic breakdown for weak-topic detection - grouped by each
    // question's own subtopic (q.s), so it works whether the student
    // quizzed one topic or "All Topics" at once.
    const breakdown = {};
    quizQuestions.forEach((question, i) => {
      if (answers[i] === -1) return; // -2 (timed out) still counts as answered-wrong
      const entry = breakdown[question.s] || { correct: 0, answered: 0 };
      entry.answered += 1;
      if (answers[i] === question.c) entry.correct += 1;
      breakdown[question.s] = entry;
    });
    updateTopicStats(user.uid, mainSubject, breakdown);
    updateStreakOnActivity(user.uid, answeredCount);
    markQuestionsSeen(user.uid, mainSubject, quizQuestions);
    clearQuizProgress();
    if (!roomCode) deleteCloudSnapshot(user.uid);
  }, [finished, user, mainSubject, topic, semesterId, total, answeredCount, correctCount, pct, roomCode]);

  if (total === 0) {
    return (
      <div className="quiz-empty">
        <p>No questions found for this topic.</p>
        <button className="btn-ghost" onClick={onExit}>Go back</button>
      </div>
    );
  }

  if (finished) {
    const incorrectCount = answeredCount - correctCount;
    const skippedCount = total - answeredCount;
    // elapsedMs stops updating the moment finished flips true (its
    // ticking interval is gated on !finished), so this is effectively
    // frozen at "total time taken" already - no extra state needed.
    const timeTakenMs = elapsedMs;
    const avgMsPerQ = total ? timeTakenMs / total : 0;
    const visitedTimes = questionTimesMs.filter((t) => t !== -1);
    const fastestMs = visitedTimes.length ? Math.min(...visitedTimes) : 0;
    const slowestMs = visitedTimes.length ? Math.max(...visitedTimes) : 0;
    const paceQPerMin = timeTakenMs > 0 ? (total / (timeTakenMs / 60000)) : 0;
    const grade = gradeFor(pct);

    const wrongQuestions = quizQuestions
      .map((qq, i) => ({ qq, i }))
      .filter(({ i }) => answers[i] !== -1 && answers[i] !== quizQuestions[i].c)
      .map(({ qq }) => ({ s: qq.s, q: qq.q, o: qq.o, c: qq.c }));

    // Circular accuracy ring - SVG stroke-dashoffset trick, matches the
    // thin rounded-cap ring look rather than a filled pie. Driven by
    // ringAnimPct (see the effect above) so it sweeps up from 0 rather
    // than appearing at its final position.
    const ringR = 54;
    const ringC = 2 * Math.PI * ringR;
    const ringOffset = ringC - (ringAnimPct / 100) * ringC;

    function handleRestartSame() {
      playTapSound();
      onRestartSame?.();
    }
    function handleNewQuiz() {
      playTapSound();
      onExit();
    }
    function handleRetryWrong() {
      playTapSound();
      onRetryWrong?.(wrongQuestions);
    }

    return (
      <div className="quiz-results">
        <div className="quiz-results-card">
          {pct > 70 && (
            <div className="results-confetti" aria-hidden="true">
              {['🎉', '✨', '⭐', '🎊', '💫', '✨', '🎉', '⭐'].map((emoji, i) => (
                <span key={i} className="confetti-piece" style={{ '--i': i }}>{emoji}</span>
              ))}
            </div>
          )}
          <div className="results-hero-emoji">{pct > 70 ? '💪' : pct >= 40 ? '📚' : '🔁'}</div>
          <h2 className="results-hero-title">Quiz Complete!</h2>
          <div className="results-hero-sub">{answeredCount} of {total} answered</div>

          <div className="results-ring-wrap">
            <svg viewBox="0 0 120 120" className="results-ring-svg">
              <circle cx="60" cy="60" r={ringR} className="results-ring-track" />
              <circle
                cx="60" cy="60" r={ringR}
                className="results-ring-progress"
                strokeDasharray={ringC}
                strokeDashoffset={ringOffset}
              />
            </svg>
            <div className="results-ring-center">
              <div className="results-ring-pct">{ringAnimPct}%</div>
              <div className="results-ring-label">ACCURACY</div>
            </div>
          </div>

          <div className="results-time-card">
            <div className="results-time-label">⏱ TOTAL TIME</div>
            <div className="results-time-big">{formatElapsed(timeTakenMs)}</div>
            <div className="results-time-subgrid">
              <div className="results-time-sub">
                <div className="results-time-sub-val" style={{ color: 'var(--cyan)' }}>{(avgMsPerQ / 1000).toFixed(1)}s</div>
                <div className="results-time-sub-label">Avg / Question</div>
              </div>
              <div className="results-time-sub">
                <div className="results-time-sub-val" style={{ color: 'var(--green)' }}>{(fastestMs / 1000).toFixed(1)}s</div>
                <div className="results-time-sub-label">Fastest</div>
              </div>
              <div className="results-time-sub">
                <div className="results-time-sub-val" style={{ color: 'var(--red)' }}>{(slowestMs / 1000).toFixed(1)}s</div>
                <div className="results-time-sub-label">Slowest</div>
              </div>
            </div>
            <div className="results-pace">📊 Pace: ~{paceQPerMin.toFixed(1)} questions per minute</div>
          </div>

          <div className="results-breakdown-card">
            <div className="results-time-label">🥧 BREAKDOWN</div>
            <div className="results-pie-row">
              <div
                className="results-pie"
                style={{
                  background: total
                    ? `conic-gradient(var(--green) 0deg ${(correctCount / total) * 360}deg, var(--red) ${(correctCount / total) * 360}deg ${((correctCount + incorrectCount) / total) * 360}deg, var(--pink) ${((correctCount + incorrectCount) / total) * 360}deg 360deg)`
                    : 'var(--surface2)',
                }}
              />
              <div className="results-legend">
                <div className="results-legend-item"><span className="results-legend-dot" style={{ background: 'var(--green)' }} />Correct: {correctCount}</div>
                <div className="results-legend-item"><span className="results-legend-dot" style={{ background: 'var(--red)' }} />Incorrect: {incorrectCount}</div>
                <div className="results-legend-item"><span className="results-legend-dot" style={{ background: 'var(--pink)' }} />Skipped: {skippedCount}</div>
              </div>
            </div>
          </div>

          <div className="results-summary-grid">
            <div className="results-summary-card stagger-in" style={{ '--stagger-i': 0, borderColor: 'rgba(var(--cyan-rgb),0.35)' }}>
              <div className="results-summary-val" style={{ color: 'var(--cyan)' }}>{correctCount}/{total}</div>
              <div className="results-summary-label">Score</div>
            </div>
            <div className="results-summary-card stagger-in" style={{ '--stagger-i': 1, borderColor: 'rgba(48,242,138,0.35)' }}>
              <div className="results-summary-val" style={{ color: 'var(--green)' }}>{pct}%</div>
              <div className="results-summary-label">Accuracy</div>
            </div>
            <div className="results-summary-card stagger-in" style={{ '--stagger-i': 2, borderColor: 'rgba(255,204,42,0.35)' }}>
              <div className="results-summary-val" style={{ color: grade.color }}>{grade.letter}</div>
              <div className="results-summary-label">Grade</div>
            </div>
          </div>

          {roomCode ? (
            <button className="btn-glow" onClick={onViewRoomResults}>View Room Results →</button>
          ) : (
            <>
              <div className="results-action-row">
                <button className="btn-glow" onClick={handleRestartSame}>↺ Restart Same</button>
                <button className="btn-ghost results-newquiz-btn" onClick={handleNewQuiz}>← New Quiz</button>
              </div>
              {wrongQuestions.length > 0 && (
                <button className="results-retry-wrong-btn" onClick={handleRetryWrong}>
                  ✕ Retry Wrong Questions ({wrongQuestions.length})
                </button>
              )}
            </>
          )}

          <button className="results-review-toggle" onClick={() => { playTapSound(); setShowReview((v) => !v); }}>
            {showReview ? 'Hide Detailed Review ▲' : 'Show Detailed Review ▼'}
          </button>
        </div>

        {showReview && (
          <div className="results-review-list">
            <div className="results-review-heading">DETAILED REVIEW</div>
            {quizQuestions.map((qq, i) => {
              const ua = answers[i];
              const isSkipped = ua === -1;
              const isCorrect = ua === qq.c;
              const timeS = questionTimesMs[i] === -1 ? null : (questionTimesMs[i] / 1000).toFixed(1);
              const borderColor = isSkipped ? 'var(--pink)' : isCorrect ? 'var(--green)' : 'var(--red)';
              return (
                <div key={i} className="results-review-card" style={{ borderLeftColor: borderColor }}>
                  <div className="results-review-card-head">
                    <span className="results-review-qnum">
                      {i + 1}. {qq.s}{timeS != null && <span className="results-review-time"> · ⏱ {timeS}s</span>}
                    </span>
                    <span className="results-review-status">
                      {isSkipped ? '⏭️' : isCorrect ? '✅' : '❌'}
                    </span>
                  </div>
                  <p className="results-review-question">{qq.q}</p>
                  <div className="results-review-options">
                    {qq.o.map((opt, oi) => {
                      const isCorrectOpt = oi === qq.c;
                      const isUserPick = oi === ua;
                      return (
                        <div
                          key={oi}
                          className={
                            isCorrectOpt ? 'results-review-opt correct' :
                            (isUserPick && !isCorrectOpt) ? 'results-review-opt wrong' :
                            'results-review-opt'
                          }
                        >
                          <span className="results-review-opt-label">{LABELS[oi]}.</span> {opt}
                          {isCorrectOpt && <span className="results-review-opt-tag correct-tag"> ✓</span>}
                          {isUserPick && !isCorrectOpt && <span className="results-review-opt-tag wrong-tag"> ← Your answer</span>}
                        </div>
                      );
                    })}
                    {ua === -2 && <div className="results-review-timeout">⏰ Timed out - no answer selected</div>}
                  </div>
                  {isPremium && (ua !== -1) && (
                    <div className="ai-explanation-card ai-explanation-review">
                      <div className="ai-explanation-title">✨ Gemini Explanation</div>
                      {aiLoading[qq.q] ? (
                        <div className="ai-explanation-loading">Generating explanation…</div>
                      ) : aiExplanations[qq.q] ? (
                        <div className="ai-explanation-text">{aiExplanations[qq.q]}</div>
                      ) : (
                        <>
                          <div className="ai-explanation-error">{aiErrors[qq.q] || 'Tap below to generate the explanation.'}</div>
                          <button className="btn-ghost ai-explanation-btn" onClick={() => loadAIExplanation(qq)}>Explain with Gemini</button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const ua = answers[cur];
  const answered = ua !== -1;

  return (
    <div className="screen-quiz" onTouchStart={onSwipeStart} onTouchEnd={onSwipeEnd}>
      {/* Compact top row - back, mode label, stopwatch (or room countdown), score */}
      <div className="qtop">
        <div className="qtop-inner">
          <button className="qtop-back" onClick={() => { playTapSound(); onExit(); }} aria-label="Back">←</button>
          <div className="qtop-mode">
            <div className="qtop-subject">{mainSubject}</div>
            <div className="qtop-topic">{roomCode ? `👥 Room ${roomCode}` : (topic || 'All Topics')}</div>
          </div>
          <div className="qtop-clock" style={totalTimeLimitMs && totalTimeLeftMs <= 30000 ? { color: 'var(--red)' } : undefined}>
            <span className="qtop-clock-dig">{totalTimeLimitMs != null ? formatElapsed(totalTimeLeftMs) : formatElapsed(elapsedMs)}</span>
            <span className="qtop-clock-lbl">{totalTimeLimitMs != null ? 'left' : 'elapsed'}</span>
          </div>
          <div className="qtop-score">
            <span className="qtop-score-num">{correctCount}<span className="qtop-score-of">/{answeredCount}</span></span>
            <span className="qtop-clock-lbl">score</span>
          </div>
        </div>
      </div>

      <div className="quiz-body">
        {/* Progress strip - one segment per question (small sets), plain bar otherwise */}
        {total <= 40 ? (
          <div className="qseg" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={cur + 1}>
            {quizQuestions.map((qq, i) => {
              const a = answers[i];
              let cls = 'qseg-bit';
              if (a === -1) cls += ' todo';
              else if (a === qq.c) cls += ' ok';
              else cls += ' bad';
              if (i === cur) cls += ' cur';
              return <span key={i} className={cls} />;
            })}
          </div>
        ) : (
          <div className="prog-track qprog-plain"><div className="prog-fill" style={{ width: `${((cur + 1) / total) * 100}%` }} /></div>
        )}

        {/* Stat chips + question-grid toggle */}
        <div className="qchips">
          <span className="qchip"><b>{cur + 1}</b>/{total}</span>
          <span className="qchip ok">✓ <b>{correctCount}</b></span>
          <span className="qchip acc"><b>{answeredCount ? `${pct}%` : '-'}</b> acc</span>
          <button
            type="button"
            className={navOpen ? 'qchip qchip-btn open' : 'qchip qchip-btn'}
            onClick={toggleNav}
            aria-expanded={navOpen}
            aria-controls="qnav-panel"
          >
            ▦ Grid <span className="qnav-chev" aria-hidden="true">▾</span>
          </button>
        </div>

        {/* Collapsible question grid */}
        <div className={navOpen ? 'qnav-wrap open' : 'qnav-wrap'} id="qnav-panel">
          <div className="qnav-inner">
            <div className="qnav-panel">
              <div className="qnav-grid">
                {quizQuestions.map((_, i) => {
                  const a = answers[i];
                  let cls = 'qnav-tile';
                  if (a === -1) cls += ' todo';
                  else if (a === quizQuestions[i].c) cls += ' ok';
                  else cls += ' bad';
                  if (i === cur) cls += ' cur';
                  return (
                    <button
                      key={i}
                      type="button"
                      className={cls}
                      onClick={() => goTo(i)}
                      tabIndex={navOpen ? 0 : -1}
                      aria-label={`Question ${i + 1}${a === -1 ? ', unanswered' : a === quizQuestions[i].c ? ', correct' : ', wrong'}${flaggedKeys.has(`${i}`) ? ', flagged' : ''}`}
                      aria-current={i === cur ? 'true' : undefined}
                    >
                      {i + 1}
                      {flaggedKeys.has(`${i}`) && <span className="qnav-flag" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
              <div className="qnav-legend">
                <span><i className="lg ok" />Correct</span>
                <span><i className="lg bad" />Wrong</span>
                <span><i className="lg todo" />Unanswered</span>
              </div>
            </div>
          </div>
        </div>

        {/* Timer bars - sit right under the stats cards */}
        {timerSeconds != null && (() => {
          const tookMs = questionTimesMs[cur];
          const timedOut = ua === -2;
          const usedFrac = tookMs >= 0 ? Math.min(1, tookMs / (timerSeconds * 1000)) : 1;
          return (
            <div className="tbar-row">
              <div className="tbar">
                <div
                  className="tbar-fill"
                  style={answered
                    ? { width: `${(timedOut ? 1 : usedFrac) * 100}%`, background: timedOut ? 'var(--red)' : 'var(--green)', opacity: 0.55 }
                    : { width: `${(timeLeft / timerSeconds) * 100}%`, background: timeLeft <= 5 ? 'var(--red)' : 'var(--cyan)' }}
                />
              </div>
              <span className="tbar-sec" style={answered ? { color: timedOut ? 'var(--red)' : 'var(--text2)' } : (timeLeft <= 5 ? { color: 'var(--red)' } : undefined)}>
                {answered ? (timedOut ? "Time's up" : (tookMs >= 0 ? `${Math.max(1, Math.round(tookMs / 1000))}s taken` : '')) : `${timeLeft}s`}
              </span>
            </div>
          );
        })()}

        {totalTimeLimitMs != null && (
          <div className="tbar">
            <div className="tbar-fill" style={{ width: `${(totalTimeLeftMs / totalTimeLimitMs) * 100}%`, background: totalTimeLeftMs <= 30000 ? 'var(--red)' : 'var(--cyan)' }} />
          </div>
        )}

        {/* Question card */}
        <div className="q-card">
          <div className="q-card-top">
            <span className="badge badge-cyan">{q.s}</span>
            <button
              onClick={toggleFlag}
              title="Flag for review"
              aria-label={flaggedKeys.has(`${cur}`) ? 'Remove flag from this question' : 'Flag this question for review'}
              style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: flaggedKeys.has(`${cur}`) ? 'var(--amber)' : 'var(--text3)' }}
            >
              {flaggedKeys.has(`${cur}`) ? '⭐' : '☆'}
            </button>
          </div>
          <p className="q-text">{q.q}</p>
        </div>

        {/* Options */}
        <div className="quiz-options">
          {q.o.map((opt, i) => {
            let cls = 'opt-btn';
            if (answered) {
              if (i === q.c) cls += ' correct';
              else if (i === ua) cls += ' wrong';
            }
            return (
              <button
                key={i}
                className={cls}
                disabled={answered}
                onClick={() => answerQ(i)}
              >
                <span className="opt-label">{LABELS[i]}</span>
                <span className="opt-text">{opt}</span>
              </button>
            );
          })}
        </div>

        {answered && isPremium && (
          aiExplanations[q.q] || aiLoading[q.q] || aiErrors[q.q] ? (
            <div className="ai-explanation-card">
              <div className="ai-explanation-title">✨ Gemini Explanation</div>
              {aiLoading[q.q] ? (
                <div className="ai-explanation-loading">Generating explanation…</div>
              ) : aiExplanations[q.q] ? (
                <div className="ai-explanation-text">{aiExplanations[q.q]}</div>
              ) : (
                <>
                  <div className="ai-explanation-error">{aiErrors[q.q]}</div>
                  <button className="btn-ghost ai-explanation-btn" onClick={() => loadAIExplanation(q)}>Try Again</button>
                </>
              )}
            </div>
          ) : (
            <button type="button" className="ai-chip-btn" onClick={() => loadAIExplanation(q)}>✨ Explain with AI</button>
          )
        )}

        {/* Nav */}
        <div className="quiz-nav">
          <button className="btn-ghost flex-1" disabled={cur === 0} onClick={() => nav(-1)}>
            ← Prev
          </button>
          <button className="btn-glow flex-1" onClick={() => nav(1)}>
            {cur === total - 1 ? 'Finish' : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  );
}
