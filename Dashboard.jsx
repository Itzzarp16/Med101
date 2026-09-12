import { useMemo } from 'react';
import SubjectCard from './SubjectCard';
import HomeNoticeBanner from './HomeNoticeBanner';
import PendingInvites from './PendingInvites';
import LegalFooter from './LegalFooter';
import './Dashboard.css';

// Matches the old site's #screen-subject layout: centered icon+title+sub
// header, then the scrolling notice, then a centered max-width subj-grid.
export default function Dashboard({ mainSubjectMeta, subjectGroup, questions, onSelectSubject, onPracticeTopic, onAcceptInvite }) {
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
    <>
      <div className="screen-subject">
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
              trace
              onClick={() => onSelectSubject?.(name)}
            />
          ))}
        </div>
      </div>
      <LegalFooter />
    </>
  );
}
