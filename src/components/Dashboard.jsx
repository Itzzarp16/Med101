import { useMemo } from 'react';
import { useAuth } from '../lib/AuthContext';
import SubjectCard from './SubjectCard';
import HomeNoticeBanner from './HomeNoticeBanner';
import PendingInvites from './PendingInvites';
import './Dashboard.css';

// Matches the old site's #screen-subject layout: centered icon+title+sub
// header, then the scrolling notice, then a centered max-width subj-grid.
export default function Dashboard({ mainSubjectMeta, subjectGroup, questions, onSelectSubject, onPracticeTopic, onAcceptInvite }) {
  const { profile } = useAuth();
  const streakCount = profile?.streakCount || 0;
  const subjectStats = useMemo(() => {
    const topicsBySubject = {};
    const countsBySubject = {};
    const subtopicCounts = {}; // { mainSubject: { subtopicName: count } }
    for (const q of questions) {
      const main = subjectGroup[q.s];
      if (!main) continue;
      countsBySubject[main] = (countsBySubject[main] || 0) + 1;
      if (!topicsBySubject[main]) topicsBySubject[main] = new Set();
      topicsBySubject[main].add(q.s);
      if (!subtopicCounts[main]) subtopicCounts[main] = {};
      subtopicCounts[main][q.s] = (subtopicCounts[main][q.s] || 0) + 1;
    }
    const result = {};
    for (const main in mainSubjectMeta) {
      const subtopics = Object.entries(subtopicCounts[main] || {})
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => a.name.localeCompare(b.name));
      result[main] = {
        questionCount: countsBySubject[main] || 0,
        topicCount: topicsBySubject[main] ? topicsBySubject[main].size : 0,
        subtopics,
      };
    }
    return result;
  }, [questions, subjectGroup, mainSubjectMeta]);

  return (
    <div className="screen-subject">
      <div className="subj-header">
        <div className="subj-icon">🩺</div>
        <div className="subj-title">Choose a Subject</div>
        <div className="subj-sub">Choose your subject to begin</div>
        {streakCount > 0 && (
          <div className="streak-badge">🔥 {streakCount} day{streakCount === 1 ? '' : 's'} streak</div>
        )}
      </div>

      <HomeNoticeBanner />
      <PendingInvites onAccept={onAcceptInvite} />

      <div className="subj-grid">
        {Object.entries(mainSubjectMeta).map(([name, meta]) => (
          <SubjectCard
            key={name}
            emoji={meta.emoji}
            name={name}
            desc={meta.desc}
            questionCount={subjectStats[name]?.questionCount}
            topicCount={subjectStats[name]?.topicCount}
            subtopics={subjectStats[name]?.subtopics}
            onClick={() => onSelectSubject?.(name)}
          />
        ))}
      </div>
    </div>
  );
}
