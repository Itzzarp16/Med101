import { useEffect, useState } from 'react';
import { fetchFirestoreQuestions, fetchMigratedSubjects } from './questionsService';

// Mirrors the old site's loadSemesterData(): fetches semester JSON files,
// merges their subject metadata, and exposes everything the dashboard
// and quiz screens need. Add an entry here once a new semester's data
// file exists (same shape as data/y1s2.json). A student whose calendar-
// resolved semester isn't in this list yet just sees a "coming soon"
// screen — see App.jsx.
const SEMESTER_MANIFEST = [
  { id: 'y1s2', file: '/data/y1s2.json' },
];

export function useSemesterData() {
  const [state, setState] = useState({
    loading: true,
    error: null,
    semesters: [],           // [{ id, label, desc, emoji, accent }]
    mainSubjectMeta: {},      // { subjectName: { emoji, desc, accent } }
    subjectMeta: {},          // { subtopicName: { emoji, desc, accent } }
    subjectGroup: {},         // { subtopicName: mainSubjectName }
    semesterMainSubjects: {}, // { semesterId: [mainSubjectName, ...] }
    questions: [],            // all questions, tagged with .term = semesterId
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const semesters = [];
      const mainSubjectMeta = {};
      const subjectMeta = {};
      const subjectGroup = {};
      const semesterMainSubjects = {};
      let questions = [];

      for (const entry of SEMESTER_MANIFEST) {
        try {
          const res = await fetch(entry.file);
          const data = await res.json();
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

          // For any subject that's been migrated to Firestore, that
          // becomes the source of truth — replace the JSON questions
          // for that subject with the live Firestore ones, so admin
          // edits/adds/deletes show up without a redeploy.
          try {
            const candidates = Object.keys(data.mainSubjectMeta || {});
            const migrated = await fetchMigratedSubjects(data.id, candidates);
            for (const subj of migrated) {
              const liveQuestions = await fetchFirestoreQuestions(data.id, subj);
              questions = questions.filter(
                (q) => !(q.term === data.id && subjectGroup[q.s] === subj)
              );
              const asQuizShape = liveQuestions.map((doc) => ({
                s: doc.subtopic,
                q: doc.q,
                o: doc.o,
                c: doc.c,
                term: data.id,
                firestoreId: doc.id,
              }));
              questions = questions.concat(asQuizShape);
            }
          } catch (err) {
            console.warn('Could not check/merge migrated subjects for', data.id, err);
          }
        } catch (err) {
          console.error('Failed to load semester data file:', entry.file, err);
        }
      }

      if (!cancelled) {
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
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
