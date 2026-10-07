import { useState } from 'react';
import { examStatus, parseExamDate } from '../lib/examDates';
import { playTapSound } from '../lib/sounds';
import './ExamCountdown.css';

// Calendar tile showing the exam's own month and day (the 📅 emoji always
// shows the same fixed date, so this replaces it).
function CalendarTile({ date }) {
  const d = parseExamDate(date);
  if (!d) return <span className="exam-card-icon">📅</span>;
  return (
    <span className="exam-cal" aria-hidden="true">
      <span className="exam-cal-month">{d.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase()}</span>
      <span className="exam-cal-day">{d.getDate()}</span>
    </span>
  );
}

// "Next exam" card for the dashboard, with the full list one tap away.
// Renders nothing once every exam date has passed (or none are set).
export default function ExamCountdown({ exams }) {
  const [open, setOpen] = useState(false);
  const upcoming = exams
    .map((exam) => ({ exam, status: examStatus(exam) }))
    .filter((x) => x.status);
  if (!upcoming.length) return null;
  const next = upcoming[0];

  return (
    <div className="exam-card">
      <button className="exam-card-main" onClick={() => { playTapSound(); setOpen((o) => !o); }} aria-expanded={open}>
        <CalendarTile date={next.exam.date} />
        <span className="exam-card-text">
          <span className="exam-card-kicker">Next exam</span>
          <span className="exam-card-name">{next.exam.label || next.exam.subject}</span>
          <span className="exam-card-date">{next.status.dateText}{next.exam.time ? ` · ${next.exam.time}` : ''}</span>
        </span>
        <span className={`exam-card-days${next.status.days <= 7 ? ' soon' : ''}`}>
          {next.status.days <= 1 ? next.status.daysText : <><b>{next.status.days}</b><small>days</small></>}
        </span>
      </button>
      {open && (
        <ul className="exam-card-list">
          {upcoming.map(({ exam, status }) => (
            <li key={`${exam.subject}-${exam.date}`}>
              <span className="exam-li-name">{exam.label || exam.subject}{exam.note ? <em> · {exam.note}</em> : null}</span>
              <span className="exam-li-date">{status.dateText} · {status.daysText}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
