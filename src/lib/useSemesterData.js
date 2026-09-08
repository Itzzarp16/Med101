import { useEffect, useState } from 'react';

// Mirrors the old site's loadSemesterData(): fetches semester JSON files,
// merges their subject metadata, and exposes everything the dashboard
// and quiz screens need. Add an entry here once a new semester's data
// file exists (same shape as data/y1s2.json). A student whose calendar-
// resolved semester isn't in this list yet just sees a "coming soon"
// screen - see App.jsx.
const SEMESTER_MANIFEST = [
  { id: 'y1s2', file: '/data/y1s2.json' },
];

const CACHE_PREFIX = 'med101_semester_cache_';

function loadFromCache(semesterId) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + semesterId);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveToCache(semesterId, data) {
  try {
    localStorage.setItem(CACHE_PREFIX + semesterId, JSON.stringify(data));
  } catch {
    // Quota exceeded or storage unavailable - offline fallback just
    // won't be available for this semester, nothing else breaks.
  }
}

// Questions are served entirely from the static JSON files above - no
// Firestore reads happen here. (The old "migrated subjects" system that
// let admin live-edit questions in Firestore has been removed to cut
// down on read/write usage; questions are edited by updating the JSON
// files and redeploying.)
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
    usingCachedData: false,   // true if any semester fell back to a local cache
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
      let usingCachedData = false;

      for (const entry of SEMESTER_MANIFEST) {
        let data = null;

        try {
          const res = await fetch(entry.file);
          data = await res.json();
          saveToCache(entry.id, data); // refresh the offline fallback on every successful load
        } catch (err) {
          console.warn('Network fetch failed, trying cached copy:', entry.file, err);
          data = loadFromCache(entry.id);
          if (data) {
            usingCachedData = true;
          } else {
            console.error('No cached copy available for', entry.file, err);
            continue;
          }
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
          usingCachedData,
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
