import { useMemo } from 'react';
import SubjectCard from './SubjectCard';
import HomeNoticeBanner from './HomeNoticeBanner';
import './Dashboard.css';

// Restores the old site's "Choose a Subtopic" step (was briefly
// removed under the mistaken belief the original design went straight
// from Subject to Quiz Mode - a screenshot of the real old site proved
// otherwise). Reuses SubjectCard + Dashboard's header/grid classes for
// exact visual consistency with "Choose a Subject", one level down.
export default function SubtopicScreen({ mainSubject, mainSubjectMeta, subjectMeta, subjectGroup, questions, onSelectTopic, onBack }) {
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
  const subjectEmoji = mainSubjectMeta[mainSubject]?.emoji || '📚';

  return (
    <div className="screen-subject">
      <div className="subj-header">
        <div className="subj-icon">🩺</div>
        <div className="subj-title">Choose a Subtopic</div>
        <div className="subj-sub">Select a topic within {mainSubject}</div>
      </div>

      <HomeNoticeBanner />

      <div className="subj-grid">
        <SubjectCard
          emoji={subjectEmoji}
          name={`All ${mainSubject}`}
          desc={`${totalCount} questions combined`}
          onClick={() => onSelectTopic(null)}
        />

        {topics.map((t) => (
          <SubjectCard
            key={t.name}
            emoji={t.meta.emoji || '📖'}
            name={t.name}
            desc={t.meta.desc ? `${t.count} questions · ${t.meta.desc}` : `${t.count} questions`}
            onClick={() => onSelectTopic(t.name)}
          />
        ))}
      </div>
    </div>
  );
}
