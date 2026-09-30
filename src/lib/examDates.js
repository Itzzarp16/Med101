// Pure date helpers for the exam schedule (no Firebase here, so they
// can be unit-tested on their own).

// 'YYYY-MM-DD' -> local midnight Date (null if malformed).
export function parseExamDate(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(str || ''));
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function daysUntil(str, now = new Date()) {
  const d = parseExamDate(str);
  if (!d) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((d - today) / 86400000);
}

export function formatExamDate(str) {
  const d = parseExamDate(str);
  return d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}

export function daysText(days) {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `${days} days left`;
}

// Students only see an exam (countdown card, date on the subject card) once
// it is this many days away or fewer. Matches the first push reminder (7 days).
// The admin editor and the reminder cron don't use examStatus, so they still
// see every date.
export const SHOW_WITHIN_DAYS = 7;

// { days, dateText, daysText } for an exam that is within SHOW_WITHIN_DAYS
// and hasn't passed yet, otherwise null (too far away, past, or bad date).
export function examStatus(exam, now = new Date()) {
  const days = daysUntil(exam?.date, now);
  if (days === null || days < 0 || days > SHOW_WITHIN_DAYS) return null;
  return { days, dateText: formatExamDate(exam.date), daysText: daysText(days) };
}
