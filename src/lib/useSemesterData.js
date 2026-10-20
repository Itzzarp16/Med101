import { useCallback, useEffect, useRef, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

const SEMESTER_MANIFEST = [
  { id: 'y1s1', file: '/data/y1s1.json' },
  { id: 'y1s2', file: '/data/y1s2.json' },
  { id: 'y2s1', file: '/data/y2s1.json' },
  { id: 'y2s2', file: '/data/y2s2.json' },
];

// Semester 1 has an additional Foreign and Latin Language bank supplied
// separately from the main y1s1 JSON. It uses the same {s,q,o,c,term}
// question shape as the normal static question banks.
async function loadY1S1ForeignLatinSupplement() {
  const res = await fetch('/data/y1s1-foreign-latin.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(`Foreign/Latin supplement responded ${res.status}`);
  return res.json();
}

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
        semesterMainSubjects[data.id] = Object.keys(data.mainSubjectMeta || {});
        semesters.push({
          id: data.id,
          label: data.label,
          desc: data.desc,
          emoji: data.emoji,
          accent: data.accent,
        });

        // IMPORTANT: y1s1 already contains the dashboard subject
        // "Foreign and Latin language" as a placeholder. Merge the real
        // question bank into that exact subject instead of creating a new
        // subject. This makes the existing subject card open the questions.
        if (entry.id === 'y1s1') {
          try {
            const supplement = await loadY1S1ForeignLatinSupplement();
            const taggedQuestions = (supplement.questions || []).map((q) => ({
              ...q,
              term: entry.id,
            }));
            questions = questions.concat(taggedQuestions);
            Object.assign(mainSubjectMeta, supplement.mainSubjectMeta || {});
            Object.assign(subjectMeta, supplement.subjectMeta || {});
            Object.assign(subjectGroup, supplement.subjectGroup || {});

            if (supplement.mainSubjectMeta?.['Foreign and Latin language']) {
              if (!semesterMainSubjects[data.id].includes('Foreign and Latin language')) {
                semesterMainSubjects[data.id].push('Foreign and Latin language');
              }
            }
          } catch (err) {
            console.error('Could not load Semester 1 Foreign/Latin questions:', err);
          }
        }

        // Admin-uploaded question bank: one known document per semester.
        try {
          const uploadSnap = await getDoc(doc(db, 'uploadedQuestions', entry.id));
          if (uploadSnap.exists()) {
            const subjects = uploadSnap.data().subjects || {};
            Object.values(subjects).forEach((u) => {
              const taggedQuestions = (u.questions || []).map((q) => ({ ...q, term: entry.id }));
              questions = questions.concat(taggedQuestions);
              subjectGroup[u.subtopic] = u.mainSubject;
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
