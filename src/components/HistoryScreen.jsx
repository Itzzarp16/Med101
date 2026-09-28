import { useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { fetchQuizHistory, deleteQuizHistoryEntry } from '../lib/quizHistory';
import { playTapSound } from '../lib/sounds';

const LABELS = ['A', 'B', 'C', 'D', 'E'];

function gradeFor(pct) {
  if (pct >= 90) return { letter: 'A', color: 'var(--green)' };
  if (pct >= 80) return { letter: 'B', color: 'var(--cyan)' };
  if (pct >= 70) return { letter: 'C', color: 'var(--amber)' };
  if (pct >= 60) return { letter: 'D', color: 'var(--amber)' };
  return { letter: 'F', color: 'var(--red)' };
}

function formatWhen(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return `Today, ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
}

function formatDuration(ms) {
  if (!ms && ms !== 0) return null;
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// One finished attempt: the exact question set + per-question answers
// stored at save time (see QuizScreen). answers[i]: -1 = skipped,
// -2 = timed out, otherwise the option index the student picked.
function wrongQuestions(entry) {
  const { questions = [], answers = [] } = entry;
  return questions.filter((q, i) => answers[i] !== -1 && answers[i] !== q.c);
}
function skippedQuestions(entry) {
  const { questions = [], answers = [] } = entry;
  return questions.filter((q, i) => answers[i] === -1);
}

// The question-by-question breakdown - same markup/classes as
// QuizScreen's own "Detailed Review" so it looks identical whether
// you're looking at it right after finishing a quiz or later from
// History.
function QuestionReviewList({ entry }) {
  return (
    <div className="results-review-list">
      {entry.questions.map((qq, i) => {
        const ua = entry.answers?.[i];
        const isSkipped = ua === -1;
        const isTimedOut = ua === -2;
        const isCorrect = ua === qq.c;
        const borderColor = (isSkipped || isTimedOut) ? 'var(--pink)' : isCorrect ? 'var(--green)' : 'var(--red)';
        return (
          <div key={i} className="results-review-card" style={{ borderLeftColor: borderColor }}>
            <div className="results-review-card-head">
              <span className="results-review-qnum">{i + 1}. {qq.s}</span>
              <span className="results-review-status">
                {isSkipped || isTimedOut ? '⏭️' : isCorrect ? '✅' : '❌'}
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
              {isTimedOut && <div className="results-review-timeout">⏰ Timed out - no answer selected</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Full breakdown for one past attempt - same visual language as
// QuizScreen's post-quiz results (hero, accuracy ring, time card, pie
// chart, score/accuracy/grade cards) rebuilt from what's saved in the
// history entry rather than live quiz state. Per-question timing
// (fastest/slowest) isn't stored per attempt, only the total, so that
// row is Avg + Pace instead of Avg/Fastest/Slowest.
function QuizResultDetail({ entry, onBack, onRetry }) {
  const [showReview, setShowReview] = useState(false);
  const total = entry.total || 0;
  const correctCount = entry.correct || 0;
  const skippedCount = total - (entry.answered || 0);
  const incorrectCount = Math.max(0, (entry.answered || 0) - correctCount);
  const pct = entry.pct || 0;
  const timeMs = entry.timeMs || 0;
  const avgMsPerQ = total ? timeMs / total : 0;
  const paceQPerMin = timeMs > 0 ? total / (timeMs / 60000) : 0;
  const grade = gradeFor(pct);
  const hasSet = (entry.questions || []).length > 0;

  // Same sweep-up-from-0 ring animation as QuizScreen's live results
  // (see its ringAnimPct effect) - ~700ms ease-out, driven frame by
  // frame so the number and the ring stay in sync, rather than a
  // plain CSS transition.
  const [ringAnimPct, setRingAnimPct] = useState(0);
  useEffect(() => {
    setRingAnimPct(0);
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setRingAnimPct(pct);
      return;
    }
    let raf;
    const duration = 700;
    const start = performance.now() + 150;
    function tick(now) {
      const elapsed = now - start;
      if (elapsed < 0) { raf = requestAnimationFrame(tick); return; }
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setRingAnimPct(Math.round(eased * pct));
      if (t < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pct, entry.id]);

  const ringR = 54;
  const ringC = 2 * Math.PI * ringR;
  const ringOffset = ringC - (ringAnimPct / 100) * ringC;

  const wrongCount = hasSet ? wrongQuestions(entry).length : 0;
  const skipCount = hasSet ? skippedQuestions(entry).length : 0;

  return (
    <div className="std-screen">
      <button className="btn-ghost std-back" onClick={() => { playTapSound(); onBack(); }}>← Back to History</button>

      <div className="quiz-results" style={{ minHeight: 0, padding: 0 }}>
        <div className="quiz-results-card">
          <div className="results-hero-emoji">{pct > 70 ? '💪' : pct >= 40 ? '📚' : '🔁'}</div>
          <h2 className="results-hero-title">Quiz Review</h2>
          <div className="results-hero-sub">
            <span className="badge badge-cyan">{entry.mainSubject || 'Mixed'}</span>
            {entry.topic && <span className="badge" style={{ marginLeft: 6 }}>{entry.topic}</span>}
            <div style={{ marginTop: 6 }}>{formatWhen(entry.ts)} · {entry.answered || 0} of {total} answered</div>
          </div>

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

          {timeMs > 0 && (
            <div className="results-time-card">
              <div className="results-time-label">⏱ TOTAL TIME</div>
              <div className="results-time-big">{formatDuration(timeMs)}</div>
              <div className="results-time-subgrid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                <div className="results-time-sub">
                  <div className="results-time-sub-val" style={{ color: 'var(--cyan)' }}>{(avgMsPerQ / 1000).toFixed(1)}s</div>
                  <div className="results-time-sub-label">Avg / Question</div>
                </div>
                <div className="results-time-sub">
                  <div className="results-time-sub-val" style={{ color: 'var(--green)' }}>{paceQPerMin.toFixed(1)}</div>
                  <div className="results-time-sub-label">Q / Minute</div>
                </div>
              </div>
            </div>
          )}

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
            <div className="results-summary-card" style={{ borderColor: 'rgba(var(--cyan-rgb),0.35)' }}>
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

          {hasSet && (
            <div className="results-action-row">
              <button className="btn-glow" disabled={entry.questions.length === 0} onClick={() => onRetry(entry, 'all')}>
                Retry All ({entry.questions.length})
              </button>
              <button className="btn-ghost results-newquiz-btn" disabled={wrongCount === 0} onClick={() => onRetry(entry, 'wrong')}>
                Retry Wrong ({wrongCount})
              </button>
            </div>
          )}
          {hasSet && skipCount > 0 && (
            <button className="results-retry-wrong-btn" onClick={() => onRetry(entry, 'skipped')}>
              Retry Skipped ({skipCount})
            </button>
          )}

          {hasSet && (
            <button className="results-review-toggle" onClick={() => { playTapSound(); setShowReview((v) => !v); }}>
              {showReview ? 'Hide Detailed Review ▲' : 'Show Detailed Review ▼'}
            </button>
          )}
        </div>

        {showReview && hasSet && (
          <div style={{ width: '100%', maxWidth: 440 }}>
            <div className="results-review-heading">DETAILED REVIEW</div>
            <QuestionReviewList entry={entry} />
          </div>
        )}
      </div>
    </div>
  );
}

export default function HistoryScreen({ onRetry, onBack }) {
  const { user } = useAuth();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [detailEntry, setDetailEntry] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchQuizHistory(user.uid).then((rows) => {
      if (!cancelled) {
        setHistory(rows);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [user.uid]);

  async function handleDelete(id) {
    playTapSound();
    setHistory((prev) => prev.filter((h) => h.id !== id));
    await deleteQuizHistoryEntry(user.uid, id);
  }

  function toggleExpanded(id) {
    playTapSound();
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleRetry(entry, mode) {
    playTapSound();
    const set =
      mode === 'wrong' ? wrongQuestions(entry) :
      mode === 'skipped' ? skippedQuestions(entry) :
      entry.questions || [];
    if (set.length === 0) return;
    onRetry(set, entry.mainSubject, entry.topic);
  }

  if (detailEntry) {
    return (
      <QuizResultDetail
        entry={detailEntry}
        onBack={() => { playTapSound(); setDetailEntry(null); }}
        onRetry={handleRetry}
      />
    );
  }

  return (
    <div className="std-screen">
      <button className="btn-ghost std-back" onClick={() => { playTapSound(); onBack(); }}>← Back</button>

      <div className="std-header">
        <h1 className="std-title">🕘 History</h1>
        <p className="std-sub">Every question set you've attempted. Retry all, just the wrong ones, or the ones you skipped.</p>
      </div>

      {loading ? (
        <div className="std-loading">Loading…</div>
      ) : history.length === 0 ? (
        <div className="glass std-card empty-state">
          <div className="empty-state-icon">🗂️</div>
          <div>You haven't attempted any question sets yet. Finish a quiz to see it here.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {history.map((entry) => {
            const wrongCount = wrongQuestions(entry).length;
            const skippedCount = skippedQuestions(entry).length;
            const hasSet = (entry.questions || []).length > 0;
            const duration = formatDuration(entry.timeMs);
            return (
              <div
                key={entry.id}
                className="glass"
                style={{ padding: 14, cursor: 'pointer' }}
                onClick={() => { playTapSound(); setDetailEntry(entry); }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                  <div>
                    <span className="badge badge-cyan">{entry.mainSubject || 'Mixed'}</span>
                    {entry.topic && <span className="badge" style={{ marginLeft: 6 }}>{entry.topic}</span>}
                  </div>
                  <button
                    aria-label="Delete this attempt"
                    onClick={(e) => { e.stopPropagation(); handleDelete(entry.id); }}
                    style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 13 }}
                  >
                    ✕
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
                  <span style={{ fontSize: 20, fontWeight: 700, color: entry.pct >= 70 ? 'var(--green)' : entry.pct >= 40 ? 'var(--amber)' : 'var(--red)' }}>
                    {entry.pct}%
                  </span>
                  <span style={{ fontSize: 12.5, color: 'var(--text3)' }}>
                    {entry.correct}/{entry.answered} correct · {entry.total} question{entry.total === 1 ? '' : 's'}
                    {duration ? ` · ${duration}` : ''}
                  </span>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text3)', marginBottom: 10 }}>{formatWhen(entry.ts)}</div>

                {hasSet ? (
                  <>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} onClick={(e) => e.stopPropagation()}>
                      <button className="btn-glow" style={{ flex: '1 1 auto', fontSize: 12.5, padding: '8px 12px' }} onClick={() => handleRetry(entry, 'all')}>
                        Retry All ({entry.questions.length})
                      </button>
                      <button
                        className="btn-ghost"
                        style={{ flex: '1 1 auto', fontSize: 12.5, padding: '8px 12px' }}
                        disabled={wrongCount === 0}
                        onClick={() => handleRetry(entry, 'wrong')}
                      >
                        Retry Wrong ({wrongCount})
                      </button>
                      <button
                        className="btn-ghost"
                        style={{ flex: '1 1 auto', fontSize: 12.5, padding: '8px 12px' }}
                        disabled={skippedCount === 0}
                        onClick={() => handleRetry(entry, 'skipped')}
                      >
                        Retry Skipped ({skippedCount})
                      </button>
                    </div>

                    <button className="results-review-toggle" onClick={(e) => { e.stopPropagation(); toggleExpanded(entry.id); }}>
                      {expandedIds.has(entry.id) ? 'Hide Questions ▲' : `View Questions (${entry.questions.length}) ▼`}
                    </button>

                    {expandedIds.has(entry.id) && (
                      <div onClick={(e) => e.stopPropagation()}>
                        <QuestionReviewList entry={entry} />
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ fontSize: 11.5, color: 'var(--text3)', fontStyle: 'italic' }}>
                    This older attempt wasn't saved with retry data.
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
