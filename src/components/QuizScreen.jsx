import { useEffect, useRef, useState } from 'react';
import { playCorrectSound, playWrongSound, playTapSound } from '../lib/sounds';
import { useAuth } from '../lib/AuthContext';
import { addQuizHistoryEntry, updateTopicStats } from '../lib/quizHistory';
import { submitLeaderboardResult } from '../lib/leaderboard';
import { submitRoomResult } from '../lib/rooms';
import './QuizScreen.css';

const LABELS = ['A', 'B', 'C', 'D', 'E'];

function formatElapsed(ms) {
  const totalSec = Math.floor(ms / 1000);
  const m = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const s = String(totalSec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

// questions arrives already in the exact order/subset QuizModeScreen
// decided (Random 25, All Sequential, Custom Range, etc.) — this
// component just renders that sequence, it doesn't reorder anything.
// autoAdvance/timerSeconds are settings chosen on that same screen.
// roomCode/totalTimeLimitMs are set only for Challenge Room quizzes —
// a whole-quiz countdown (not per-question) that auto-finishes when it
// hits zero, and reports the result to the room's shared leaderboard.
export default function QuizScreen({ mainSubject, topic, semesterId, questions, autoAdvance, timerSeconds, roomCode, totalTimeLimitMs, onExit, onViewRoomResults }) {
  const { user } = useAuth();
  const quizQuestions = questions;
  const [cur, setCur] = useState(0);
  const [answers, setAnswers] = useState(() => new Array(quizQuestions.length).fill(-1));
  const [finished, setFinished] = useState(false);
  const [timeLeft, setTimeLeft] = useState(timerSeconds || null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [totalTimeLeftMs, setTotalTimeLeftMs] = useState(totalTimeLimitMs || null);
  const startedAtRef = useRef(Date.now());
  const savedRef = useRef(false); // guards against double-save (StrictMode / re-renders)
  const advanceTimeoutRef = useRef(null);

  const q = quizQuestions[cur];
  const total = quizQuestions.length;
  const answeredCount = answers.filter((a) => a !== -1).length;
  const correctCount = answers.filter((a, i) => a >= 0 && a === quizQuestions[i].c).length;
  const pct = answeredCount ? Math.round((correctCount / answeredCount) * 100) : 0;

  // Elapsed stopwatch, ticking every second while the quiz is in progress.
  useEffect(() => {
    if (finished) return;
    const t = setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 1000);
    return () => clearInterval(t);
  }, [finished]);

  // Whole-quiz countdown for Challenge Rooms — auto-finishes (keeping
  // whatever was answered so far) the moment it hits zero.
  useEffect(() => {
    if (!totalTimeLimitMs || finished) return;
    const t = setInterval(() => {
      setTotalTimeLeftMs((ms) => {
        const next = ms - 1000;
        if (next <= 0) {
          setFinished(true);
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [totalTimeLimitMs, finished]);

  function nav(dir) {
    playTapSound();
    const nx = cur + dir;
    if (nx >= total) {
      setFinished(true);
      return;
    }
    if (nx < 0) return;
    setCur(nx);
  }

  function answerQ(idx) {
    if (answers[cur] !== -1) return; // already answered — locked
    const next = [...answers];
    next[cur] = idx;
    setAnswers(next);
    if (idx === q.c) playCorrectSound();
    else playWrongSound();

    if (autoAdvance) {
      advanceTimeoutRef.current = setTimeout(() => nav(1), 550);
    }
  }

  // Reset the per-question timer whenever a new question is shown.
  useEffect(() => {
    if (!timerSeconds) return;
    setTimeLeft(timerSeconds);
  }, [cur, timerSeconds]);

  // Countdown + auto-submit-as-wrong when it hits zero.
  useEffect(() => {
    if (!timerSeconds || finished || answers[cur] !== -1) return;
    if (timeLeft <= 0) {
      const next = [...answers];
      next[cur] = -2; // -2 = "timed out", distinct from -1 (unanswered) and any real option index
      setAnswers(next);
      playWrongSound();
      if (autoAdvance) advanceTimeoutRef.current = setTimeout(() => nav(1), 550);
      return;
    }
    const t = setTimeout(() => setTimeLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, timerSeconds, cur, finished]);

  useEffect(() => () => clearTimeout(advanceTimeoutRef.current), []);

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

    // Per-subtopic breakdown for weak-topic detection — grouped by each
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
    return (
      <div className="quiz-results">
        <div className="quiz-results-card glass-hi">
          <div className="quiz-results-pct">{pct}%</div>
          <div className="quiz-results-sub">
            {correctCount} correct out of {answeredCount} answered ({total} total questions)
          </div>
          {roomCode ? (
            <button className="btn-glow" onClick={onViewRoomResults}>View Room Results →</button>
          ) : (
            <button className="btn-glow" onClick={onExit}>Back to Topics</button>
          )}
        </div>
      </div>
    );
  }

  const ua = answers[cur];
  const answered = ua !== -1;

  return (
    <div className="screen-quiz">
      {/* Hero header — back, elapsed stopwatch (or room countdown), mode label, score */}
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
            <div className="stat-value" style={{ color: 'var(--violet)' }}>{answeredCount ? `${pct}%` : '—'}</div>
          </div>
        </div>

        {/* Question card */}
        <div className="q-card">
          <div className="q-card-top">
            <span className="badge badge-cyan">{q.s}</span>
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
