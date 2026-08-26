import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

// The order semesters progress in. A student never sees anything before
// the one they enrolled in, and — once the calendar says it's time —
// they automatically move forward, without anyone editing their profile.
export const SEMESTER_ORDER = ['y1s1', 'y1s2', 'y2s1', 'y2s2'];

// Fallback dates used until an admin sets real ones in Firestore at
// config/academicCalendar. Update these to your actual term dates —
// this is just a reasonable placeholder so gating works before the
// admin panel (which will let this be edited from the app) exists.
// Each semester is "active" from its date until the next one's date.
const DEFAULT_CALENDAR = {
  y1s1: '2025-09-01',
  y1s2: '2026-02-01',
  y2s1: '2026-09-01',
  y2s2: '2027-02-01',
};

let cachedCalendar = null;
let cachedAt = 0;
const CACHE_MS = 5 * 60 * 1000; // 5 min — this rarely changes

export async function fetchAcademicCalendar() {
  const now = Date.now();
  if (cachedCalendar && now - cachedAt < CACHE_MS) return cachedCalendar;
  try {
    const snap = await getDoc(doc(db, 'config', 'academicCalendar'));
    cachedCalendar = snap.exists() ? { ...DEFAULT_CALENDAR, ...snap.data() } : DEFAULT_CALENDAR;
  } catch (e) {
    console.warn('Could not fetch academic calendar, using defaults:', e);
    cachedCalendar = DEFAULT_CALENDAR;
  }
  cachedAt = now;
  return cachedCalendar;
}

// Given when a student enrolled (their chosen starting semester) and
// today's date, returns which semester they should actually see right
// now — never earlier than their enrolled one, and automatically
// advancing as calendar dates pass. Never advances past the last
// semester defined in SEMESTER_ORDER.
export function resolveCurrentSemester(enrolledYearSemester, calendar, now = new Date()) {
  const startIdx = Math.max(0, SEMESTER_ORDER.indexOf(enrolledYearSemester));
  let current = SEMESTER_ORDER[startIdx] || SEMESTER_ORDER[0];

  for (let i = startIdx; i < SEMESTER_ORDER.length; i++) {
    const semId = SEMESTER_ORDER[i];
    const startDate = calendar[semId];
    if (!startDate) break;
    if (new Date(startDate) <= now) {
      current = semId;
    } else {
      break;
    }
  }
  return current;
}

// Admin-only write — enforced by Firestore rules (config/{doc} write
// requires isAdmin()), this is just the client-side helper. dates is a
// partial or full { y1s1, y1s2, y2s1, y2s2 } object of 'YYYY-MM-DD'
// strings. Clears the in-memory cache so the change is picked up on
// next read instead of waiting out the 5-minute cache window.
export async function saveAcademicCalendar(dates) {
  await setDoc(
    doc(db, 'config', 'academicCalendar'),
    { ...dates, updatedAt: serverTimestamp() },
    { merge: true }
  );
  cachedCalendar = null;
  cachedAt = 0;
}
