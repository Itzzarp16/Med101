import { useEffect, useState } from 'react';
import { deleteField, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import defaults from '../data/examSchedule.json';

// Exam dates per semester. src/data/examSchedule.json holds the built-in
// defaults (api/cron/exam-reminders.py reads the same file); an admin edit
// is stored at config/examSchedule as { exams: { y2s1: [...] } } and
// replaces that semester's defaults entirely.
//
// Each exam: { subject, date: 'YYYY-MM-DD', time?, note?, label? }
// `subject` must match the subject card's name to show the date on it;
// `label` is only for display (e.g. "Microbiology, Virology").

const REF = () => doc(db, 'config', 'examSchedule');
const CACHE_MS = 5 * 60 * 1000;
let cache = null; // { at, exams }

const sortByDate = (list) => [...list].sort((a, b) => String(a.date).localeCompare(String(b.date)));

export async function fetchExams(semesterId, { fresh = false } = {}) {
  if (!semesterId) return [];
  if (fresh || !cache || Date.now() - cache.at > CACHE_MS) {
    let remote = {};
    try {
      const snap = await getDoc(REF());
      remote = snap.exists() ? (snap.data().exams || {}) : {};
    } catch (e) {
      console.warn('Could not fetch exam schedule, using defaults:', e);
    }
    cache = { at: Date.now(), exams: remote };
  }
  const override = cache.exams[semesterId];
  return sortByDate(Array.isArray(override) ? override : (defaults[semesterId] || []));
}

// Whether an admin has replaced this semester's built-in dates.
export async function hasExamOverride(semesterId) {
  const snap = await getDoc(REF());
  return snap.exists() && Array.isArray((snap.data().exams || {})[semesterId]);
}

export async function saveExams(semesterId, exams) {
  await setDoc(REF(), { exams: { [semesterId]: sortByDate(exams) }, updatedAt: serverTimestamp() }, { merge: true });
  cache = null;
}

export async function resetExams(semesterId) {
  await setDoc(REF(), { exams: { [semesterId]: deleteField() }, updatedAt: serverTimestamp() }, { merge: true });
  cache = null;
}

export function useExams(semesterId) {
  const [exams, setExams] = useState(() => (semesterId ? sortByDate(defaults[semesterId] || []) : []));
  useEffect(() => {
    let cancelled = false;
    fetchExams(semesterId).then((list) => { if (!cancelled) setExams(list); });
    return () => { cancelled = true; };
  }, [semesterId]);
  return exams;
}
