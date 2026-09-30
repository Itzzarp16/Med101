import { useEffect, useMemo, useState } from 'react';
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
function kyrgyzstanNow() {
  const utcMs = Date.now() + new Date().getTimezoneOffset() * 60000;
  return new Date(utcMs + 6 * 60 * 60 * 1000);
}

// One time-of-day slot each: 7 playful headings, an emoji, and 8 short
// nudges. Both are picked by day-of-year so they stay put all day (no
// flicker on re-render) but change daily. 7 and 8 share no factor, so a
// given heading+nudge pair only repeats every 56 days.
const SLOTS = [
  {
    from: 0, to: 5, emoji: '🦉',
    titles: [
      "Still up",
      "Night owl mode",
      "Burning the midnight oil",
      "Midnight mode",
      "Quiet hours",
      "Deep-night focus",
      "Nocturnal grind",
    ],
    nudges: [
      "Late-night grind? A short quiz, then get some sleep.",
      "Sleep locks in what you studied - wrap up soon.",
      "The hours are quiet - great for focus, but not for all-nighters.",
      "One short round, then rest. Your brain files memories while you sleep.",
      "Can't sleep? A few easy questions beat scrolling.",
      "Tired eyes miss details - keep it light and short tonight.",
      "Skim your flagged questions, then call it a night.",
      "Study smart, sleep smarter - just a few questions.",
    ],
  },
  {
    from: 5, to: 8, emoji: '🌅',
    titles: [
      "Rise and shine",
      "Early bird",
      "Up before the sun",
      "First light",
      "Sunrise session",
      "Early start",
      "Dawn patrol",
    ],
    nudges: [
      "Early-bird practice: 10 questions before the day begins?",
      "Early mornings are prime memory time - start with a quick test.",
      "Beat the rush: a few questions now, and your day is already a win.",
      "Quiet morning, sharp mind - try a topic you find tricky.",
      "Start with your weakest topic while your focus is fresh.",
      "A short round now sets the tone for the whole day.",
      "Coffee first, then five quick questions?",
      "Revise last night's topic while it is still settling in.",
    ],
  },
  {
    from: 8, to: 12, emoji: '☀️',
    titles: [
      "Fresh start",
      "Prime study time",
      "Let's get going",
      "Morning momentum",
      "Brain at full power",
      "Ready, set, study",
      "Big-focus hours",
    ],
    nudges: [
      "Fresh mind - a great time to tackle a tough topic.",
      "Warm up with a quick quiz before lectures.",
      "Pick a weak topic and knock it out this morning.",
      "Try a timed round while your focus is at its peak.",
      "Ten questions now, and the rest of the day feels lighter.",
      "Check your Weak Topics - mornings are made for them.",
      "Review yesterday's wrong answers before they fade.",
      "Stack a small win early: one topic, one round.",
    ],
  },
  {
    from: 12, to: 14, emoji: '🥪',
    titles: [
      "Lunch break",
      "Midday reset",
      "Refuel time",
      "Noon check-in",
      "Break-time brain boost",
      "Halfway there",
      "Lunchtime learning",
    ],
    nudges: [
      "Lunch break? A 10-question round fits right in.",
      "Quick midday revision keeps the morning's lectures fresh.",
      "Five minutes with your flagged questions while you eat?",
      "Recharge the body, then give the brain a little workout.",
      "A short quiz between lectures keeps knowledge warm.",
      "Halfway through the day - one quick round to keep your streak alive.",
      "Try a random 25 - light, quick and good for recall.",
      "Use the break to revisit a topic that felt shaky this morning.",
    ],
  },
  {
    from: 14, to: 17, emoji: '💪',
    titles: [
      "Afternoon push",
      "Power hour",
      "Stay in the zone",
      "Second wind",
      "Focus mode on",
      "Finish strong",
      "Afternoon grind",
    ],
    nudges: [
      "Afternoon slump? A short quiz wakes the brain up.",
      "Revise today's lecture while it is still fresh.",
      "Try a timed round - a little pressure sharpens recall.",
      "Lecture done? Test yourself on it right now.",
      "Small steps count: one topic, one round, then a break.",
      "Beat the slump with something active - a quick quiz works.",
      "Challenge a friend to a round - it's more fun together.",
      "Open your Weak Topics and pick just one to fix.",
    ],
  },
  {
    from: 17, to: 21, emoji: '🌆',
    titles: [
      "Evening session",
      "Golden hour",
      "Time to revise",
      "Sunset study",
      "Wrap-up time",
      "Quiet evening",
      "Evening focus",
    ],
    nudges: [
      "Evening revision: go over what you learned today.",
      "Review your wrong answers - that is where the marks are.",
      "A calm evening round beats a last-minute cram.",
      "Recap today's topics - spaced revision beats re-reading.",
      "Check the leaderboard, then earn your spot with a round.",
      "Ten good questions now will make tomorrow feel easier.",
      "Go through your Wrong & Flagged questions while today is fresh.",
      "Evenings are perfect for a full topic run - settle in.",
    ],
  },
  {
    from: 21, to: 24, emoji: '🌙',
    titles: [
      "Winding down",
      "One last round",
      "Before bed",
      "Night session",
      "Last stretch",
      "Late-evening focus",
      "Calm night study",
    ],
    nudges: [
      "A quick revision before bed helps it stick overnight.",
      "Wind down with a few questions, then rest well.",
      "Skim what you learned today - your brain sorts it while you sleep.",
      "Keep it light tonight: one short round and you are done.",
      "Review a few wrong answers, then switch off the screen.",
      "End the day on a win - a quick quiz, then sleep.",
      "Don't cram tonight - a short review beats a long slog.",
      "Tomorrow-you will thank you for a few questions tonight.",
    ],
  },
];

function getGreeting(kgNow, questionsToday) {
  const hour = kgNow.getHours();
  const slot = SLOTS.find((x) => hour >= x.from && hour < x.to) || SLOTS[0];
  const dayOfYear = Math.floor((kgNow - new Date(kgNow.getFullYear(), 0, 0)) / 86400000);
  let nudge = slot.nudges[dayOfYear % slot.nudges.length];
  if (questionsToday >= 30) nudge = 'You are on fire today - keep the momentum going! 🔥';
  else if (questionsToday >= 10) nudge = 'Nice pace today - one more round?';
  const title = slot.titles[(dayOfYear + SLOTS.indexOf(slot)) % slot.titles.length];
  return { title, emoji: slot.emoji, nudge };
}

// Matches the old site's #screen-subject layout: centered icon+title+sub
// header, then the scrolling notice, then a centered max-width subj-grid.
export default function Dashboard({ resumeCard, mainSubjectMeta, subjectGroup, questions, onSelectSubject, onComingSoon, onPracticeTopic, onAcceptInvite, semesterId }) {
  const { user, profile } = useAuth();
  // Re-check the clock every minute so the greeting flips at the hour
  // boundary even if the page has been left open.
  const [kgNow, setKgNow] = useState(kyrgyzstanNow);
  useEffect(() => {
    const id = setInterval(() => setKgNow(kyrgyzstanNow()), 60000);
    return () => clearInterval(id);
  }, []);
  const firstName = (profile?.displayName || user?.displayName || user?.email?.split('@')[0] || 'there').split(' ')[0];
  // questionsToday is only meaningful if it was actually written today -
  // same stale-until-next-quiz-finishes gap as streak.js's own
  // questionsTodayDate check, so a fresh calendar day starts back at 0
  // here rather than showing yesterday's leftover count.
  const questionsToday = profile?.questionsTodayDate === todayStr() ? (profile?.questionsToday || 0) : 0;

  const greeting = getGreeting(kgNow, questionsToday);

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

  // Per-subject practice summary from the same topicStats the Weak
  // Topics screen reads ({ [subtopic]: { mainSubject, answered, correct } }).
  const subjectProgress = useMemo(() => {
    const out = {};
    for (const s of Object.values(profile?.topicStats || {})) {
      if (!s?.mainSubject) continue;
      const p = out[s.mainSubject] || (out[s.mainSubject] = { answered: 0, correct: 0 });
      p.answered += s.answered || 0;
      p.correct += s.correct || 0;
    }
    return out;
  }, [profile]);

  return (
    <>
      <div className="screen-subject">
        <div className="dashboard-greeting">
          <div className="dashboard-greeting-text">{greeting.title}, {firstName} {greeting.emoji}</div>
          <div className="dashboard-nudge">{greeting.nudge}</div>
          {questionsToday > 0 && (
            <span className="dashboard-badge">📝 {questionsToday} question{questionsToday === 1 ? '' : 's'} today</span>
          )}
        </div>
        <div className="dash-top">
          {resumeCard}
          <HomeNoticeBanner semesterId={semesterId} />
          <PendingInvites onAccept={onAcceptInvite} />
        </div>

        <div className="subj-grid">
          {Object.entries(mainSubjectMeta).map(([name, meta]) => {
            const hasQuestions = (subjectStats[name]?.questionCount || 0) > 0;
            // The static "Content coming soon" desc lives in the semester
            // JSON (see y2s1/y2s2.json) - once an upload gives this subject
            // real questions, that label would be actively wrong, so drop
            // it here rather than requiring a JSON edit + redeploy just to
            // clear it. The real topic/question counts already render
            // below regardless.
            const rawDesc = hasQuestions && meta.desc === 'Content coming soon' ? '' : meta.desc;
            // The semester JSON bakes "– N topics, M questions" into the
            // desc, and the card's meta line shows the same counts, so
            // strip it here. Also hide a desc that just repeats the name.
            const stripped = (rawDesc || '').replace(/\s*[–—·-]\s*\d+\s+topics?\s*[,·]\s*\d+\s+questions?\s*$/i, '').trim();
            const desc = stripped.toLowerCase() === name.toLowerCase() ? '' : stripped;
            const prog = subjectProgress[name];
            return (
              <SubjectCard
                key={name}
                emoji={meta.emoji}
                name={name}
                desc={hasQuestions ? '' : desc}
                questionCount={subjectStats[name]?.questionCount}
                topicCount={subjectStats[name]?.topicCount}
                trace
                progress={prog && prog.answered > 0 ? { answered: prog.answered, pct: Math.round((prog.correct / prog.answered) * 100) } : null}
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
