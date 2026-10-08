import { useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { fetchQuizHistory, deleteQuizHistoryEntry } from '../lib/quizHistory';
import { playTapSound } from '../lib/sounds';
import './HistoryScreen.css';
import LoadingLine from './LoadingLine';

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

// One row of the detail review: collapsed to a single line (number, question,
// status) and expands to show the options on tap - a 25-question attempt is
// scannable instead of a wall of cards.
function ReviewItem({ qq, i, ua }) {
  const [open, setOpen] = useState(false);
  const isSkipped = ua === -1;
  const isTimedOut = ua === -2;
  const isCorrect = ua === qq.c;
  const state = isCorrect ? 'ok' : (isSkipped || isTimedOut) ? 'skip' : 'bad';
  const icon = isCorrect ? '✓' : isTimedOut ? '⏰' : isSkipped ? '–' : '✕';
  return (
    <div className={`hd-item ${state}${open ? ' open' : ''}`}>
      <button className="hd-item-head" onClick={() => { playTapSound(); setOpen((v) => !v); }} aria-expanded={open}>
        <span className="hd-item-num">{i + 1}</span>
        <span className="hd-item-q">{qq.q}</span>
        <span className="hd-item-status" aria-label={isCorrect ? 'Correct' : isTimedOut ? 'Timed out' : isSkipped ? 'Skipped' : 'Wrong'}>{icon}</span>
      </button>
      {open && (
        <div className="hd-item-body">
          <div className="hd-item-topic">{qq.s}</div>
          {qq.o.map((opt, oi) => {
            const isCorrectOpt = oi === qq.c;
            const isUserPick = oi === ua;
            return (
              <div key={oi} className={isCorrectOpt ? 'hd-opt correct' : (isUserPick ? 'hd-opt wrong' : 'hd-opt')}>
                <span className="hd-opt-label">{LABELS[oi]}</span>
                <span className="hd-opt-text">{opt}</span>
                {isCorrectOpt && <span className="hd-opt-tag">Correct</span>}
                {isUserPick && !isCorrectOpt && <span className="hd-opt-tag">Your answer</span>}
              </div>
            );
          })}
          {isTimedOut && <div className="hd-opt-note">⏰ Timed out - no answer selected</div>}
          {isSkipped && <div className="hd-opt-note">Skipped</div>}
        </div>
      )}
    </div>
  );
}

// Full breakdown for one past attempt, rebuilt from what's saved in the
// history entry (not live quiz state). Per-question timing isn't stored per
// attempt, only the total, so the time card shows Total / Avg / Pace.
function QuizResultDetail({ entry, onBack, onRetry }) {
  const [tab, setTab] = useState('all');
  const total = entry.total || 0;
  const correctCount = entry.correct || 0;
  const answeredCount = entry.answered || 0;
  const skippedCount = Math.max(0, total - answeredCount);
  const incorrectCount = Math.max(0, answeredCount - correctCount);
  const pct = entry.pct || 0;
  const timeMs = entry.timeMs || 0;
  const avgMsPerQ = total ? timeMs / total : 0;
  const paceQPerMin = timeMs > 0 ? total / (timeMs / 60000) : 0;
  const grade = gradeFor(pct);
  const questions = entry.questions || [];
  const answers = entry.answers || [];
  const hasSet = questions.length > 0;
  const wrongCount = hasSet ? wrongQuestions(entry).length : 0;
  const skipCount = hasSet ? skippedQuestions(entry).length : 0;

  // Ring sweeps up from 0 (CSS transition, disabled for reduced motion).
  const [ringPct, setRingPct] = useState(0);
  useEffect(() => {
    setRingPct(0);
    const t = setTimeout(() => setRingPct(pct), 80);
    return () => clearTimeout(t);
  }, [pct, entry.id]);
  const ringR = 44;
  const ringC = 2 * Math.PI * ringR;

  const items = questions.map((qq, i) => ({ qq, i, ua: answers[i] }));
  const counts = {
    all: items.length,
    wrong: items.filter((x) => x.ua !== -1 && x.ua !== x.qq.c).length,
    skipped: items.filter((x) => x.ua === -1).length,
    correct: items.filter((x) => x.ua === x.qq.c).length,
  };
  const shownItems = items.filter((x) => (
    tab === 'wrong' ? (x.ua !== -1 && x.ua !== x.qq.c) :
    tab === 'skipped' ? x.ua === -1 :
    tab === 'correct' ? x.ua === x.qq.c : true
  ));
  const seg = (n) => (total ? `${(n / total) * 100}%` : '0%');

  return (
    <div className="std-screen hd">
      <div className="hist-head">
        <button className="hist-back" onClick={() => { playTapSound(); onBack(); }} aria-label="Back to History">←</button>
        <div>
          <h1 className="hist-title">Attempt review</h1>
          <div className="hist-sub">{formatWhen(entry.ts)}</div>
        </div>
      </div>

      <div className="hd-summary glass">
        <div className="hd-sum-top">
          <div className="hd-ring" aria-label={`${pct}% accuracy`}>
            <svg viewBox="0 0 100 100">
              <circle cx="50" cy="50" r={ringR} className="hd-ring-track" />
              <circle
                cx="50" cy="50" r={ringR}
                className="hd-ring-fill"
                style={{ stroke: pctColor(pct) }}
                strokeDasharray={ringC}
                strokeDashoffset={ringC - (ringPct / 100) * ringC}
              />
            </svg>
            <div className="hd-ring-center">
              <span className="hd-ring-pct" style={{ color: pctColor(pct) }}>{pct}%</span>
              <span className="hd-ring-label">accuracy</span>
            </div>
          </div>
          <div className="hd-sum-main">
            <div className="hist-badges">
              <span className="badge badge-cyan">{entry.mainSubject || 'Mixed'}</span>
              {entry.topic && <span className="badge">{entry.topic}</span>}
            </div>
            <div className="hd-score"><b>{correctCount}</b><span>/{total} correct</span></div>
            <div className="hd-sub">
              {answeredCount} answered{skippedCount > 0 ? ` · ${skippedCount} skipped` : ''}
            </div>
            <span className="hd-grade" style={{ color: grade.color, borderColor: grade.color }}>Grade {grade.letter}</span>
          </div>
        </div>

        <div className="hd-bar" aria-hidden="true">
          <span style={{ width: seg(correctCount), background: 'var(--green)' }} />
          <span style={{ width: seg(incorrectCount), background: 'var(--red)' }} />
          <span style={{ width: seg(skippedCount), background: 'var(--pink)' }} />
        </div>
        <div className="hd-legend">
          <span><i style={{ background: 'var(--green)' }} />Correct {correctCount}</span>
          <span><i style={{ background: 'var(--red)' }} />Wrong {incorrectCount}</span>
          <span><i style={{ background: 'var(--pink)' }} />Skipped {skippedCount}</span>
        </div>

        {timeMs > 0 && (
          <div className="hd-stats">
            <div className="hd-stat"><div className="hd-stat-val">{formatDuration(timeMs)}</div><div className="hd-stat-label">Total time</div></div>
            <div className="hd-stat"><div className="hd-stat-val" style={{ color: 'var(--cyan)' }}>{(avgMsPerQ / 1000).toFixed(1)}s</div><div className="hd-stat-label">Avg / question</div></div>
            <div className="hd-stat"><div className="hd-stat-val" style={{ color: 'var(--green)' }}>{paceQPerMin.toFixed(1)}</div><div className="hd-stat-label">Questions / min</div></div>
          </div>
        )}
      </div>

      {hasSet && (
        <div className="hist-actions hd-actions">
          <button className="btn-glow hist-act-main" disabled={wrongCount === 0 && questions.length === 0} onClick={() => onRetry(entry, wrongCount > 0 ? 'wrong' : 'all')}>
            {wrongCount > 0 ? `Retry Wrong (${wrongCount})` : `Retry All (${questions.length})`}
          </button>
          {wrongCount > 0 && (
            <button className="btn-ghost hist-act" onClick={() => onRetry(entry, 'all')}>All ({questions.length})</button>
          )}
          {skipCount > 0 && (
            <button className="btn-ghost hist-act" onClick={() => onRetry(entry, 'skipped')}>Skipped ({skipCount})</button>
          )}
        </div>
      )}

      {hasSet && (
        <>
          <div className="hd-tabs" role="tablist" aria-label="Filter questions">
            {[['all', 'All'], ['wrong', 'Wrong'], ['skipped', 'Skipped'], ['correct', 'Correct']].map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                className={tab === key ? 'hist-filter on' : 'hist-filter'}
                onClick={() => { playTapSound(); setTab(key); }}
              >
                {label} <span className="hd-tab-n">{counts[key]}</span>
              </button>
            ))}
          </div>
          <div className="hd-list">
            {shownItems.length === 0 ? (
              <div className="hd-empty">Nothing here.</div>
            ) : shownItems.map((x) => <ReviewItem key={x.i} qq={x.qq} i={x.i} ua={x.ua} />)}
          </div>
        </>
      )}
    </div>
  );
}

function pctColor(pct) {
  return pct >= 70 ? 'var(--green)' : pct >= 40 ? 'var(--amber)' : 'var(--red)';
}

function dayLabel(ts) {
  if (!ts) return 'Earlier';
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function timeOnly(ts) {
  return ts ? new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
}

// Small accuracy ring for each attempt card.
function ScoreRing({ pct }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pct || 0));
  return (
    <div className="hist-ring" aria-label={`${p}% accuracy`}>
      <svg viewBox="0 0 54 54">
        <circle cx="27" cy="27" r={r} className="hist-ring-track" />
        <circle
          cx="27" cy="27" r={r}
          className="hist-ring-fill"
          style={{ stroke: pctColor(p) }}
          strokeDasharray={c}
          strokeDashoffset={c - (p / 100) * c}
        />
      </svg>
      <span className="hist-ring-num" style={{ color: pctColor(p) }}>{p}%</span>
    </div>
  );
}

export default function HistoryScreen({ onRetry, onBack }) {
  const { user } = useAuth();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [detailEntry, setDetailEntry] = useState(null);
  const [subjectFilter, setSubjectFilter] = useState('all');

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
    if (!window.confirm('Delete this attempt from your history?')) return;
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

  const subjects = [...new Set(history.map((h) => h.mainSubject || 'Mixed'))];
  const shown = subjectFilter === 'all' ? history : history.filter((h) => (h.mainSubject || 'Mixed') === subjectFilter);
  const avgPct = shown.length ? Math.round(shown.reduce((a, h) => a + (h.pct || 0), 0) / shown.length) : 0;
  const totalAnswered = shown.reduce((a, h) => a + (h.answered || 0), 0);
  const groups = [];
  for (const entry of shown) {
    const label = dayLabel(entry.ts);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(entry);
    else groups.push({ label, items: [entry] });
  }

  return (
    <div className="std-screen hist">
      <div className="hist-head">
        <button className="hist-back" onClick={() => { playTapSound(); onBack(); }} aria-label="Back">←</button>
        <div>
          <h1 className="hist-title">History</h1>
          <div className="hist-sub">Retry everything, only the wrong ones, or the ones you skipped.</div>
        </div>
      </div>

      {loading ? (
        <LoadingLine />
      ) : history.length === 0 ? (
        <div className="glass std-card empty-state">
          <div className="empty-state-icon">🗂️</div>
          <div>You haven't attempted any question sets yet. Finish a quiz to see it here.</div>
        </div>
      ) : (
        <>
          <div className="hist-chips">
            <span className="hist-chip"><b>{shown.length}</b> attempt{shown.length === 1 ? '' : 's'}</span>
            <span className="hist-chip"><b style={{ color: pctColor(avgPct) }}>{avgPct}%</b> avg</span>
            <span className="hist-chip"><b>{totalAnswered}</b> answered</span>
          </div>

          {subjects.length > 1 && (
            <div className="hist-filters" role="tablist" aria-label="Filter by subject">
              {['all', ...subjects].map((sub) => (
                <button
                  key={sub}
                  role="tab"
                  aria-selected={subjectFilter === sub}
                  className={subjectFilter === sub ? 'hist-filter on' : 'hist-filter'}
                  onClick={() => { playTapSound(); setSubjectFilter(sub); }}
                >
                  {sub === 'all' ? 'All' : sub}
                </button>
              ))}
            </div>
          )}

          {groups.map((g) => (
            <div key={g.label} className="hist-group">
              <div className="hist-day">{g.label}</div>
              {g.items.map((entry) => {
                const wrongCount = wrongQuestions(entry).length;
                const skippedCount = skippedQuestions(entry).length;
                const hasSet = (entry.questions || []).length > 0;
                const duration = formatDuration(entry.timeMs);
                return (
                  <div
                    key={entry.id}
                    className="hist-card glass"
                    onClick={() => { playTapSound(); setDetailEntry(entry); }}
                  >
                    <div className="hist-card-top">
                      <ScoreRing pct={entry.pct} />
                      <div className="hist-card-main">
                        <div className="hist-badges">
                          <span className="badge badge-cyan">{entry.mainSubject || 'Mixed'}</span>
                          {entry.topic && <span className="badge">{entry.topic}</span>}
                        </div>
                        <div className="hist-line">
                          <b>{entry.correct}/{entry.answered}</b> correct · {entry.total} question{entry.total === 1 ? '' : 's'}{duration ? ` · ${duration}` : ''}
                        </div>
                        <div className="hist-time">{timeOnly(entry.ts)}</div>
                      </div>
                      <button
                        className="hist-del"
                        aria-label="Delete this attempt"
                        onClick={(e) => { e.stopPropagation(); handleDelete(entry.id); }}
                      >
                        ✕
                      </button>
                    </div>

                    {hasSet ? (
                      <>
                        <div className="hist-actions" onClick={(e) => e.stopPropagation()}>
                          {wrongCount > 0 ? (
                            <button className="btn-glow hist-act-main" onClick={() => handleRetry(entry, 'wrong')}>
                              Retry Wrong ({wrongCount})
                            </button>
                          ) : (
                            <button className="btn-glow hist-act-main" onClick={() => handleRetry(entry, 'all')}>
                              Retry All ({entry.questions.length})
                            </button>
                          )}
                          {wrongCount > 0 && (
                            <button className="btn-ghost hist-act" onClick={() => handleRetry(entry, 'all')}>
                              All ({entry.questions.length})
                            </button>
                          )}
                          {skippedCount > 0 && (
                            <button className="btn-ghost hist-act" onClick={() => handleRetry(entry, 'skipped')}>
                              Skipped ({skippedCount})
                            </button>
                          )}
                        </div>

                        <button className="hist-viewq" onClick={(e) => { e.stopPropagation(); toggleExpanded(entry.id); }}>
                          {expandedIds.has(entry.id) ? 'Hide questions ▲' : `View questions (${entry.questions.length}) ▼`}
                        </button>

                        {expandedIds.has(entry.id) && (
                          <div onClick={(e) => e.stopPropagation()}>
                            <QuestionReviewList entry={entry} />
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="hist-legacy">This older attempt wasn't saved with retry data.</div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
