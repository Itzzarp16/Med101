import { useMemo } from 'react';
import SubjectCard from './SubjectCard';
import HomeNoticeBanner from './HomeNoticeBanner';
import PendingInvites from './PendingInvites';
import LegalFooter from './LegalFooter';
import { useAuth } from '../lib/AuthContext';
import { todayStr } from '../lib/streak';
import './Dashboard.css';

// Osh/Bishkek is a fixed UTC+6 year-round (Kyrgyzstan doesn't observe
// DST), so this is deliberately NOT the visitor's device time zone -
// a student studying at 11pm from a device set to a different zone
// should still get "Good night", not whatever their phone thinks it
// is locally.
function kyrgyzstanGreeting() {
  const utcMs = Date.now() + new Date().getTimezoneOffset() * 60000;
  const kgHour = new Date(utcMs + 6 * 60 * 60 * 1000).getHours();
  if (kgHour >= 5 && kgHour < 12) return 'Good morning';
  if (kgHour >= 12 && kgHour < 17) return 'Good afternoon';
  if (kgHour >= 17 && kgHour < 21) return 'Good evening';
  return 'Good night';
}

// Matches the old site's #screen-subject layout: centered icon+title+sub
// header, then the scrolling notice, then a centered max-width subj-grid.
export default function Dashboard({ mainSubjectMeta, subjectGroup, questions, onSelectSubject, onComingSoon, onPracticeTopic, onAcceptInvite, semesterId }) {
  const { user, profile } = useAuth();
  const firstName = (profile?.displayName || user?.displayName || user?.email?.split('@')[0] || 'there').split(' ')[0];
  // questionsToday is only meaningful if it was actually written today -
  // same stale-until-next-quiz-finishes gap as streak.js's own
  // questionsTodayDate check, so a fresh calendar day starts back at 0
  // here rather than showing yesterday's leftover count.
  const questionsToday = profile?.questionsTodayDate === todayStr() ? (profile?.questionsToday || 0) : 0;

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
        <div className="dashboard-greeting">
          <div className="dashboard-greeting-text">{kyrgyzstanGreeting()}, {firstName} 👋</div>
          {questionsToday > 0 && (
            <span className="dashboard-badge">📝 {questionsToday} question{questionsToday === 1 ? '' : 's'} today</span>
          )}
        </div>
        <HomeNoticeBanner semesterId={semesterId} />
        <PendingInvites onAccept={onAcceptInvite} />

        <div className="subj-grid">
          {Object.entries(mainSubjectMeta).map(([name, meta]) => {
            const hasQuestions = (subjectStats[name]?.questionCount || 0) > 0;
            // The static "Content coming soon" desc lives in the semester
            // JSON (see y2s1/y2s2.json) - once an upload gives this subject
            // real questions, that label would be actively wrong, so drop
            // it here rather than requiring a JSON edit + redeploy just to
            // clear it. The real topic/question counts already render
            // below regardless.
            const desc = hasQuestions && meta.desc === 'Content coming soon' ? '' : meta.desc;
            return (
              <SubjectCard
                key={name}
                emoji={meta.emoji}
                name={name}
                desc={desc}
                questionCount={subjectStats[name]?.questionCount}
                topicCount={subjectStats[name]?.topicCount}
                trace
                onClick={() => (hasQuestions ? onSelectSubject?.(name) : onComingSoon?.(name))}
              />
            );
          })}
        </div>
      </div>
      <LegalFooter />
    </>
  );
}
