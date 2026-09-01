import { useMemo } from 'react';
import { useAuth } from '../lib/AuthContext';
import { playTapSound } from '../lib/sounds';

const MIN_ANSWERED = 5; // lower bar than the dashboard card since this is an intentional deep-dive

export default function WeakTopicsScreen({ onPracticeTopic, onBack }) {
  const { profile } = useAuth();

  const topics = useMemo(() => {
    const stats = profile?.topicStats || {};
    return Object.entries(stats)
      .map(([subtopic, s]) => ({
        subtopic,
        mainSubject: s.mainSubject,
        answered: s.answered,
        correct: s.correct,
        accuracyPct: s.answered ? Math.round((s.correct / s.answered) * 100) : 0,
      }))
      .filter((t) => t.answered >= MIN_ANSWERED)
      .sort((a, b) => a.accuracyPct - b.accuracyPct);
  }, [profile]);

  return (
    <div className="std-screen">
      <button className="btn-ghost std-back" onClick={() => { playTapSound(); onBack(); }}>← Back</button>

      <div className="std-header">
        <h1 className="std-title">🎯 Your Weak Topics</h1>
        <p className="std-sub">Every topic you've practiced, ranked by accuracy, lowest first.</p>
      </div>

      {topics.length === 0 ? (
        <div className="glass std-card" style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
          Answer at least {MIN_ANSWERED} questions in a topic to see it ranked here.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {topics.map((t) => (
            <div key={t.subtopic} className="glass" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text)' }}>{t.subtopic}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                  {t.mainSubject} · {t.correct}/{t.answered} correct
                </div>
              </div>
              <div style={{ fontWeight: 800, fontSize: 15, color: t.accuracyPct < 50 ? 'var(--red)' : t.accuracyPct < 75 ? 'var(--amber)' : 'var(--green)' }}>
                {t.accuracyPct}%
              </div>
              <button className="tpreset sel" onClick={() => { playTapSound(); onPracticeTopic(t.mainSubject, t.subtopic); }}>
                Practice
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
