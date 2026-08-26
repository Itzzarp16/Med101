import { useMemo } from 'react';
import SubjectCard from './SubjectCard';
import './Dashboard.css';

// Now receives semester data as props (lifted to App level) instead of
// fetching its own copy — TopicPicker/QuizScreen need the same data.
export default function Dashboard({ mainSubjectMeta, subjectGroup, questions, onSelectSubject }) {
  // topic + question counts per main subject, derived from the real data
  const subjectStats = useMemo(() => {
    const topicsBySubject = {};
    const countsBySubject = {};
    for (const q of questions) {
      const main = subjectGroup[q.s];
      if (!main) continue;
      countsBySubject[main] = (countsBySubject[main] || 0) + 1;
      if (!topicsBySubject[main]) topicsBySubject[main] = new Set();
      topicsBySubject[main].add(q.s);
    }
    const result = {};
    for (const main in mainSubjectMeta) {
      result[main] = {
        questionCount: countsBySubject[main] || 0,
        topicCount: topicsBySubject[main] ? topicsBySubject[main].size : 0,
      };
    }
    return result;
  }, [questions, subjectGroup, mainSubjectMeta]);

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1 className="dashboard-title">Year 1 · Semester 2</h1>
        <p className="dashboard-sub">Pick a subject to start practicing</p>
      </div>

      <div className="dashboard-grid">
        {Object.entries(mainSubjectMeta).map(([name, meta]) => (
          <SubjectCard
            key={name}
            emoji={meta.emoji}
            name={name}
            desc={meta.desc}
            accent={meta.accent}
            questionCount={subjectStats[name]?.questionCount}
            topicCount={subjectStats[name]?.topicCount}
            onClick={() => onSelectSubject?.(name)}
          />
        ))}
      </div>
    </div>
  );
}
