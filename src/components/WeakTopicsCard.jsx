import { useMemo } from 'react';
import { useAuth } from '../lib/AuthContext';
import { playTapSound } from '../lib/sounds';
import './WeakTopicsCard.css';

// Only surface a subtopic once there's enough signal — a couple of
// unlucky guesses on 2 questions shouldn't brand something "weak".
const MIN_ANSWERED = 8;
const MAX_SHOWN = 4;

export default function WeakTopicsCard({ onPracticeTopic }) {
  const { profile } = useAuth();

  const weakest = useMemo(() => {
    const stats = profile?.topicStats || {};
    return Object.entries(stats)
      .map(([subtopic, s]) => ({
        subtopic,
        mainSubject: s.mainSubject,
        answered: s.answered,
        accuracyPct: s.answered ? Math.round((s.correct / s.answered) * 100) : 0,
      }))
      .filter((t) => t.answered >= MIN_ANSWERED)
      .sort((a, b) => a.accuracyPct - b.accuracyPct)
      .slice(0, MAX_SHOWN);
  }, [profile]);

  if (weakest.length === 0) return null;

  return (
    <div className="weak-topics-card glass">
      <div className="weak-topics-header">
        <span className="weak-topics-title">🎯 Focus Areas</span>
        <span className="weak-topics-sub">Your lowest-accuracy topics right now</span>
      </div>
      <div className="weak-topics-list">
        {weakest.map((t) => (
          <button
            key={t.subtopic}
            className="weak-topic-row"
            onClick={() => { playTapSound(); onPracticeTopic(t.mainSubject, t.subtopic); }}
          >
            <span className="weak-topic-name">{t.subtopic}</span>
            <span className="weak-topic-pct">{t.accuracyPct}%</span>
          </button>
        ))}
      </div>
    </div>
  );
}
