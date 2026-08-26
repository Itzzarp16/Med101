import { useEffect, useState } from 'react';

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
