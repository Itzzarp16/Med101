import { useCallback, useEffect, useRef, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

const SEMESTER_MANIFEST = [
  { id: 'y1s1', file: '/data/y1s1.json' },
  { id: 'y1s2', file: '/data/y1s2.json' },
  { id: 'y2s1', file: '/data/y2s1.json' },
  { id: 'y2s2', file: '/data/y2s2.json' },
];

export function useSemesterData() {
  const [state, setState] = useState({
    loading: true,
    error: null,
    semesters: [],
    mainSubjectMeta: {},
    subjectMeta: {},
    subjectGroup: {},
    semesterMainSubjects: {},
    questions: [],
    subjectAddedAt: {},
  });

  const mountedRef = useRef(true);
  const loadRef = useRef(null);

  useEffect(() => {
    mountedRef.current = true;

    async function load(silent = false) {
      const semesters = [];
      const mainSubjectMeta = {};
      const subjectMeta = {};
      const subjectGroup = {};
      const semesterMainSubjects = {};
      let questions = [];

      // When questions were last ADDED, per main subject (newest wins). Three sources:
      // 1) public/data/question-dates.json (backfilled from git history, scripts/question-dates.py),
      // 2) subjectMeta[subtopic].addedAt (stamped when the admin saves questions to GitHub),
      // 3) Firestore uploads (updatedAt on each uploaded subtopic).
      const addedAtMs = {};
      const bump = (subject, ms) => {
        if (subject && Number.isFinite(ms) && ms > (addedAtMs[subject] || 0)) addedAtMs[subject] = ms;
      };
      try {
        const r = await fetch('/data/question-dates.json', { cache: 'no-store' });
        if (r.ok) Object.entries(await r.json()).forEach(([subject, iso]) => bump(subject, Date.parse(iso)));
      } catch { /* optional file - dates just won't show */ }

      for (const entry of SEMESTER_MANIFEST) {
        let data = null;

        try {
          const res = await fetch(entry.file, { cache: 'no-store' });
          if (!res.ok) throw new Error(`${entry.file} responded ${res.status}`);
          data = await res.json();
        } catch (err) {
          console.error('Failed to load question data:', entry.file, err);
          if (silent) return false;
          if (mountedRef.current) {
            setState((s) => ({ ...s, loading: false, error: 'connection' }));
          }
          return false;
        }

        data.questions.forEach((q) => {
          if (!q.term) q.term = data.id;
        });
        questions = questions.concat(data.questions);
        Object.assign(mainSubjectMeta, data.mainSubjectMeta || {});
        Object.assign(subjectMeta, data.subjectMeta || {});
        Object.assign(subjectGroup, data.subjectGroup || {});
        Object.entries(data.subjectMeta || {}).forEach(([sub, m]) => {
          if (m?.addedAt) bump((data.subjectGroup || {})[sub], Date.parse(m.addedAt));
        });
        semesterMainSubjects[data.id] = Object.keys(data.mainSubjectMeta || {});
        semesters.push({
          id: data.id,
          label: data.label,
          desc: data.desc,
          emoji: data.emoji,
          accent: data.accent,
        });

        try {
          const uploadSnap = await getDoc(doc(db, 'uploadedQuestions', entry.id));
          if (uploadSnap.exists()) {
            const subjects = uploadSnap.data().subjects || {};
            Object.values(subjects).forEach((u) => {
              const taggedQuestions = (u.questions || []).map((q) => ({ ...q, term: entry.id }));
              questions = questions.concat(taggedQuestions);
              subjectGroup[u.subtopic] = u.mainSubject;
              const uploadedMs = u.updatedAt?.toMillis ? u.updatedAt.toMillis() : (u.updatedAt?.seconds || 0) * 1000;
              if (uploadedMs) bump(u.mainSubject, uploadedMs);
              if (u.subtopicEmoji || u.subtopicDesc) {
                subjectMeta[u.subtopic] = {
                  ...(subjectMeta[u.subtopic] || {}),
                  emoji: u.subtopicEmoji || subjectMeta[u.subtopic]?.emoji,
                  desc: u.subtopicDesc || subjectMeta[u.subtopic]?.desc,
                };
              }
            });
          }
        } catch (err) {
          console.warn('Could not load uploaded questions for', entry.id, '- continuing without them:', err);
        }
      }

      if (mountedRef.current) {
        setState({
          loading: false,
          error: null,
          semesters,
          mainSubjectMeta,
          subjectMeta,
          subjectGroup,
          semesterMainSubjects,
          questions,
          subjectAddedAt: Object.fromEntries(Object.entries(addedAtMs).map(([k, ms]) => [k, new Date(ms).toISOString()])),
        });
      }
      return true;
    }

    loadRef.current = load;
    load();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(
    () => (loadRef.current ? loadRef.current(true) : Promise.resolve(false)),
    [],
  );

  return { ...state, refresh };
}
