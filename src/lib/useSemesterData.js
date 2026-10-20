import { useCallback, useEffect, useRef, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

const SEMESTER_MANIFEST = [
  { id: 'y1s1', file: '/data/y1s1.json' },
  { id: 'y1s2', file: '/data/y1s2.json' },
  { id: 'y2s1', file: '/data/y2s1.json' },
  { id: 'y2s2', file: '/data/y2s2.json' },
];

async function loadY1S1ForeignLatinSupplement() {
  const files = [
    '/data/foreign-latin-1.json',
    '/data/foreign-latin-2.json',
    '/data/foreign-latin-3.json',
    '/data/foreign-latin-4.json',
  ];
  const responses = await Promise.all(files.map((file) => fetch(file, { cache: 'no-store' })));
  const bad = responses.find((res) => !res.ok);
  if (bad) throw new Error(`Foreign/Latin supplement responded ${bad.status}`);
  const parts = await Promise.all(responses.map((res) => res.json()));
  return {
    mainSubjectMeta: {
      'Foreign and Latin language': {
        emoji: '🌐',
        desc: 'Latin Language & Foreign Language · 389 questions',
        accent: 'var(--violet)',
      },
    },
    subjectMeta: {
      'Latin Language': { emoji: '📜', desc: '201 questions' },
      'Foreign Language': { emoji: '🇬🇧', desc: '188 questions' },
    },
    subjectGroup: {
      'Latin Language': 'Foreign and Latin language',
      'Foreign Language': 'Foreign and Latin language',
    },
    questions: parts.flatMap((part) => part.questions || []),
  };
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
