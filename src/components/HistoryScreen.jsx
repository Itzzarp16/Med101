import { useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { fetchQuizHistory, deleteQuizHistoryEntry } from '../lib/quizHistory';
import { playTapSound } from '../lib/sounds';

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

export default function HistoryScreen({ onRetry, onBack }) {
  const { user } = useAuth();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

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

  function handleRetry(entry, mode) {
    playTapSound();
    const set =
      mode === 'wrong' ? wrongQuestions(entry) :
      mode === 'skipped' ? skippedQuestions(entry) :
      entry.questions || [];
    if (set.length === 0) return;
    onRetry(set, entry.mainSubject, entry.topic);
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
        <div className="glass std-card" style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
          You haven't attempted any question sets yet. Finish a quiz to see it here.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {history.map((entry) => {
            const wrongCount = wrongQuestions(entry).length;
            const skippedCount = skippedQuestions(entry).length;
            const hasSet = (entry.questions || []).length > 0;
            const duration = formatDuration(entry.timeMs);
            return (
              <div key={entry.id} className="glass" style={{ padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                  <div>
                    <span className="badge badge-cyan">{entry.mainSubject || 'Mixed'}</span>
                    {entry.topic && <span className="badge" style={{ marginLeft: 6 }}>{entry.topic}</span>}
                  </div>
                  <button onClick={() => handleDelete(entry.id)} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 13 }}>✕</button>
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
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
