import { useMemo } from 'react';
import { useAuth } from '../lib/AuthContext';
import { playTapSound } from '../lib/sounds';
import ScreenHeader from './ScreenHeader';
import './ListScreens.css';
import EmptyIllustration from './EmptyIllustration';

const MIN_ANSWERED = 5; // lower bar than the dashboard card since this is an intentional deep-dive

const toneOf = (pct) => (pct < 50 ? 'var(--red)' : pct < 75 ? 'var(--amber)' : 'var(--green)');

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
      <ScreenHeader onBack={onBack} title={<>🎯 Your Weak Topics</>}>
        Every topic you've practiced, ranked by accuracy, lowest first.
      </ScreenHeader>

      {topics.length === 0 ? (
        <div className="glass std-card empty-state">
          <EmptyIllustration kind="weak" />
          <div>Answer at least {MIN_ANSWERED} questions in a topic to see it ranked here.</div>
        </div>
      ) : (
        <>
          <div className="lu-chips">
            <span className="lu-chip"><b>{topics.length}</b> topic{topics.length === 1 ? '' : 's'}</span>
            <span className="lu-chip"><b style={{ color: toneOf(topics[0].accuracyPct) }}>{topics[0].accuracyPct}%</b> weakest</span>
            <span className="lu-chip"><b>{topics.filter((t) => t.accuracyPct < 50).length}</b> under 50%</span>
          </div>
          <div className="lu-list">
            {topics.map((t, i) => (
              <div key={t.subtopic} className="glass wk-card stagger-in" style={{ '--stagger-i': Math.min(i, 8) }}>
                <div className="wk-top">
                  <div className="wk-main">
                    <div className="wk-name">{t.subtopic}</div>
                    <div className="wk-meta">{t.mainSubject} · {t.correct}/{t.answered} correct</div>
                  </div>
                  <div className="wk-pct" style={{ color: toneOf(t.accuracyPct) }}>{t.accuracyPct}%</div>
                  <button className="tpreset sel wk-practice" onClick={() => { playTapSound(); onPracticeTopic(t.mainSubject, t.subtopic); }}>
                    Practice
                  </button>
                </div>
                <div className="wk-bar" aria-hidden="true"><span style={{ width: `${t.accuracyPct}%`, background: toneOf(t.accuracyPct) }} /></div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
