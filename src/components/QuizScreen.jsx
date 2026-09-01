import { useEffect, useRef, useState } from 'react';
import { playCorrectSound, playWrongSound, playTapSound, playAppreciationSound } from '../lib/sounds';
import { useAuth } from '../lib/AuthContext';
import { addQuizHistoryEntry, updateTopicStats } from '../lib/quizHistory';
import { updateStreakOnActivity } from '../lib/streak';
import { markQuestionsSeen } from '../lib/seenQuestions';
import { submitLeaderboardResult } from '../lib/leaderboard';
import { submitRoomResult } from '../lib/rooms';
import { recordWrongQuestion, toggleFlaggedQuestion } from '../lib/reviewQueue';
import { saveQuizProgress, loadQuizProgress, clearQuizProgress } from '../lib/quizProgress';
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

// questions arrives already in the exact order/subset QuizModeScreen
// decided (Random 25, All Sequential, Custom Range, etc.) - this
// component just renders that sequence, it doesn't reorder anything.
// autoAdvance/timerSeconds are settings chosen on that same screen.
// roomCode/totalTimeLimitMs are set only for Challenge Room quizzes -
// a whole-quiz countdown (not per-question) that auto-finishes when it
// hits zero, and reports the result to the room's shared leaderboard.
export default function QuizScreen({ mainSubject, topic, semesterId, questions, autoAdvance, timerSeconds, roomCode, totalTimeLimitMs, onExit, onViewRoomResults, onRestartSame, onRetryWrong }) {
  const { user } = useAuth();
  const quizQuestions = questions;

  // Restore in-progress position/answers from a prior page load if it
  // looks like the same attempt (same question count) - this is what
  // lets a refresh resume on question 12 instead of restarting at 1.
  const restoredRef = useState(() => {
    const saved = loadQuizProgress();
    return saved && saved.answers?.length === quizQuestions.length ? saved : null;
  })[0];

  const [cur, setCur] = useState(restoredRef?.cur ?? 0);
  const [answers, setAnswers] = useState(() => restoredRef?.answers ?? new Array(quizQuestions.length).fill(-1));
  const [finished, setFinished] = useState(false);
  const [timeLeft, setTimeLeft] = useState(timerSeconds || null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [flaggedKeys, setFlaggedKeys] = useState(() => new Set());
  const [showReview, setShowReview] = useState(false);
  // Per-question time, ms - -1 means "never visited" (quiz ended early).
  // Recorded the moment a question is answered/times-out/skipped-past,
  // so it reflects actual time-on-question, not just a global average.
  const [questionTimesMs, setQuestionTimesMs] = useState(() => restoredRef?.questionTimesMs ?? new Array(quizQuestions.length).fill(-1));
  const questionShownAtRef = useRef(Date.now());
  const startedAtRef = useRef(restoredRef?.startedAt ?? Date.now());
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
  useEffect(() => {
    if (finished) return;
    saveQuizProgress({ cur, answers, questionTimesMs, startedAt: startedAtRef.current, totalDeadline: totalDeadlineRef.current });
  }, [cur, answers, questionTimesMs, finished]);

  useEffect(() => () => clearQuizProgress(), []);

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

    if (autoAdvance) {
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
  useEffect(() => {
    if (!timerSeconds) return;
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
  useEffect(() => {
    if (!timerSeconds || finished || answers[cur] !== -1) return;
    if (timeLeft <= 0) {
      recordQuestionTime(cur);
      const next = [...answers];
      next[cur] = -2; // -2 = "timed out", distinct from -1 (unanswered) and any real option index
      setAnswers(next);
      playWrongSound();
      if (user) recordWrongQuestion(user.uid, mainSubject, q);
      if (autoAdvance) advanceTimeoutRef.current = setTimeout(() => nav(1), 550);
      return;
    }
    const t = setTimeout(() => setTimeLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, timerSeconds, cur, finished]);

  useEffect(() => () => clearTimeout(advanceTimeoutRef.current), []);

  // Appreciation sound - plays once, right when the results screen
  // appears, independent of the history/leaderboard save effect below
  // (which requires a signed-in user; this shouldn't).
  useEffect(() => {
    if (!finished || appreciationPlayedRef.current) return;
    appreciationPlayedRef.current = true;
    playAppreciationSound(pct);
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
    });

    if (roomCode) {
      submitRoomResult(roomCode, user.uid, { correct: correctCount, answered: answeredCount, total, pct, timeMs });
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
    updateStreakOnActivity(user.uid);
    markQuestionsSeen(user.uid, mainSubject, quizQuestions);
    clearQuizProgress();
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
    // thin rounded-cap ring look rather than a filled pie.
    const ringR = 54;
    const ringC = 2 * Math.PI * ringR;
    const ringOffset = ringC - (pct / 100) * ringC;

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
              <div className="results-ring-pct">{pct}%</div>
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
            <div className="results-summary-card" style={{ borderColor: 'rgba(0,229,255,0.35)' }}>
              <div className="results-summary-val" style={{ color: 'var(--cyan)' }}>{correctCount}/{total}</div>
              <div className="results-summary-label">Score</div>
            </div>
            <div className="results-summary-card" style={{ borderColor: 'rgba(48,242,138,0.35)' }}>
              <div className="results-summary-val" style={{ color: 'var(--green)' }}>{pct}%</div>
              <div className="results-summary-label">Accuracy</div>
            </div>
            <div className="results-summary-card" style={{ borderColor: 'rgba(255,204,42,0.35)' }}>
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
    <div className="screen-quiz">
      {/* Hero header - back, elapsed stopwatch (or room countdown), mode label, score */}
      <div className="hero quiz-hero">
        <div className="quiz-hero-inner">
          <div className="quiz-hero-left">
            <button className="btn-ghost quiz-back-btn" onClick={() => { playTapSound(); onExit(); }}>← Back</button>
            <div className="quiz-stopwatch">
              <div className="sw-dig" style={totalTimeLimitMs && totalTimeLeftMs <= 30000 ? { color: 'var(--red)' } : undefined}>
                {totalTimeLimitMs != null ? formatElapsed(totalTimeLeftMs) : formatElapsed(elapsedMs)}
              </div>
              <div className="sw-lbl">{totalTimeLimitMs != null ? 'time left' : 'elapsed'}</div>
            </div>
          </div>
          <div className="quiz-hero-center">
            <div className="quiz-hero-label">{mainSubject}</div>
            <div className="quiz-hero-mode">{roomCode ? `👥 Room ${roomCode}` : (topic || 'All Topics')}</div>
          </div>
          <div className="quiz-hero-right">
            <div className="quiz-hero-score-label">Score</div>
            <div className="quiz-hero-score">{correctCount}/{answeredCount}</div>
          </div>
        </div>
      </div>

      <div className="quiz-body">
        {/* Progress */}
        <div className="quiz-progress-row">
          <div className="quiz-counter">{cur + 1}/{total}</div>
          <div className="prog-track"><div className="prog-fill" style={{ width: `${((cur + 1) / total) * 100}%` }} /></div>
          <div className="quiz-pct">{pct}%</div>
        </div>

        {timerSeconds != null && (
          <div className="tbar">
            <div className="tbar-fill" style={{ width: `${(timeLeft / timerSeconds) * 100}%`, background: timeLeft <= 5 ? 'var(--red)' : 'var(--cyan)' }} />
          </div>
        )}

        {totalTimeLimitMs != null && (
          <div className="tbar">
            <div className="tbar-fill" style={{ width: `${(totalTimeLeftMs / totalTimeLimitMs) * 100}%`, background: totalTimeLeftMs <= 30000 ? 'var(--red)' : 'var(--cyan)' }} />
          </div>
        )}

        {/* Stats */}
        <div className="quiz-stats-grid">
          <div className="stat-card" style={{ '--accent': 'var(--cyan)' }}>
            <div className="stat-label">Question</div>
            <div className="stat-value">{cur + 1}</div>
          </div>
          <div className="stat-card" style={{ '--accent': 'var(--green)' }}>
            <div className="stat-label">Correct</div>
            <div className="stat-value" style={{ color: 'var(--green)' }}>{correctCount}</div>
          </div>
          <div className="stat-card" style={{ '--accent': 'var(--violet)' }}>
            <div className="stat-label">Accuracy</div>
            <div className="stat-value" style={{ color: 'var(--violet)' }}>{answeredCount ? `${pct}%` : '-'}</div>
          </div>
        </div>

        {/* Question card */}
        <div className="q-card">
          <div className="q-card-top">
            <span className="badge badge-cyan">{q.s}</span>
            <button
              onClick={toggleFlag}
              title="Flag for review"
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
