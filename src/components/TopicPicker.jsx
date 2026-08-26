import { useMemo } from 'react';
import { playTapSound } from '../lib/sounds';
import './TopicPicker.css';

export default function TopicPicker({ mainSubject, subjectMeta, subjectGroup, questions, onSelectTopic, onBack }) {
  const topics = useMemo(() => {
    const counts = {};
    for (const q of questions) {
      if (subjectGroup[q.s] !== mainSubject) continue;
      counts[q.s] = (counts[q.s] || 0) + 1;
    }
    return Object.entries(counts).map(([name, count]) => ({
      name,
      count,
      meta: subjectMeta[name] || {},
    }));
  }, [questions, subjectGroup, mainSubject, subjectMeta]);

  const totalCount = topics.reduce((sum, t) => sum + t.count, 0);

  function tap(fn) {
    playTapSound();
    fn();
  }

  return (
    <div className="topic-picker">
      <button className="topic-back" onClick={() => tap(onBack)}>← Back to Subjects</button>

      <div className="topic-header">
        <h1 className="topic-title">{mainSubject}</h1>
        <p className="topic-sub">Choose a topic within {mainSubject}</p>
      </div>

      <button
        className="topic-row topic-row-all glass"
        onClick={() => tap(() => onSelectTopic(null))}
      >
        <span className="topic-row-emoji">📚</span>
        <span className="topic-row-body">
          <span className="topic-row-name">All Topics</span>
          <span className="topic-row-count">{totalCount} questions</span>
        </span>
        <span className="topic-row-arrow">›</span>
      </button>

      {topics.map((t) => (
        <button
          key={t.name}
          className="topic-row glass"
          onClick={() => tap(() => onSelectTopic(t.name))}
        >
          <span className="topic-row-emoji">{t.meta.emoji || '📖'}</span>
          <span className="topic-row-body">
            <span className="topic-row-name">{t.name}</span>
            <span className="topic-row-count">{t.count} questions</span>
          </span>
          <span className="topic-row-arrow" style={{ color: t.meta.accent }}>›</span>
        </button>
      ))}
    </div>
  );
}
