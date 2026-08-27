import { useEffect, useMemo, useRef, useState } from 'react';
import { playCorrectSound, playWrongSound, playTapSound } from '../lib/sounds';
import { useAuth } from '../lib/AuthContext';
import { addQuizHistoryEntry, updateTopicStats } from '../lib/quizHistory';
import { submitLeaderboardResult } from '../lib/leaderboard';
import './QuizScreen.css';

const LABELS = ['A', 'B', 'C', 'D', 'E'];

// Fisher-Yates shuffle so repeated attempts of the same topic don't
// always show questions in the same order.
function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// mainSubject/subjectGroup are passed so results can be rolled up per
// subject and per semester for the leaderboard, same shape as the old
// site's subjTotals/semTotals.
export default function QuizScreen({ mainSubject, topic, semesterId, questions, onExit }) {
  const { user } = useAuth();
  const quizQuestions = useMemo(() => shuffled(questions), [questions]);
  const [cur, setCur] = useState(0);
  const [answers, setAnswers] = useState(() => new Array(quizQuestions.length).fill(-1));
  const [finished, setFinished] = useState(false);
  const startedAtRef = useRef(Date.now());
  const savedRef = useRef(false); // guards against double-save (StrictMode / re-renders)

  const q = quizQuestions[cur];
  const total = quizQuestions.length;
  const answeredCount = answers.filter((a) => a !== -1).length;
  const correctCount = answers.filter((a, i) => a >= 0 && a === quizQuestions[i].c).length;
  const pct = answeredCount ? Math.round((correctCount / answeredCount) * 100) : 0;

  function answerQ(idx) {
    if (answers[cur] !== -1) return; // already answered — locked
    const next = [...answers];
    next[cur] = idx;
    setAnswers(next);
    if (idx === q.c) playCorrectSound();
    else playWrongSound();
  }

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

    // Per-subtopic breakdown for weak-topic detection — grouped by each
    // question's own subtopic (q.s), so it works whether the student
    // quizzed one topic or "All Topics" at once.
    const breakdown = {};
    quizQuestions.forEach((question, i) => {
      if (answers[i] === -1) return;
      const entry = breakdown[question.s] || { correct: 0, answered: 0 };
      entry.answered += 1;
      if (answers[i] === question.c) entry.correct += 1;
      breakdown[question.s] = entry;
    });
    updateTopicStats(user.uid, mainSubject, breakdown);
  }, [finished, user, mainSubject, topic, semesterId, total, answeredCount, correctCount, pct]);

  if (total === 0) {
    return (
      <div className="quiz-empty">
        <p>No questions found for this topic.</p>
        <button className="quiz-back-btn" onClick={onExit}>Go back</button>
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
          <button className="quiz-primary-btn" onClick={onExit}>Back to Topics</button>
        </div>
      </div>
    );
  }

  const ua = answers[cur];

  return (
    <div className="quiz-screen">
      <div className="quiz-topbar">
        <button className="quiz-exit-btn" onClick={() => { playTapSound(); onExit(); }}>✕</button>
        <div className="quiz-progress-wrap">
          <div className="quiz-progress-fill" style={{ width: `${((cur + 1) / total) * 100}%` }} />
        </div>
        <div className="quiz-score">{correctCount}/{answeredCount}</div>
      </div>

      <div className="quiz-meta-row">
        <span className="quiz-counter">{cur + 1}/{total}</span>
        <span className="quiz-badge">{q.s}</span>
      </div>

      <div className="quiz-card glass">
        <p className="quiz-question">{q.q}</p>

        <div className="quiz-options">
          {q.o.map((opt, i) => {
            let cls = 'opt-btn';
            if (ua !== -1) {
              if (i === q.c) cls += ' correct';
              else if (i === ua) cls += ' wrong';
            }
            return (
              <button
                key={i}
                className={cls}
                disabled={ua !== -1}
                onClick={() => answerQ(i)}
              >
                <span className="opt-label">{LABELS[i]}</span>
                <span className="opt-text">{opt}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="quiz-nav">
        <button className="quiz-nav-btn" disabled={cur === 0} onClick={() => nav(-1)}>
          ← Prev
        </button>
        <button className="quiz-nav-btn quiz-nav-primary" onClick={() => nav(1)}>
          {cur === total - 1 ? 'Finish' : 'Next →'}
        </button>
      </div>
    </div>
  );
}
