import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';

// Mirrors the old site's loadSemesterData(): fetches semester JSON files,
// merges their subject metadata, and exposes everything the dashboard
// and quiz screens need. Add an entry here once a new semester's data
// file exists (same shape as data/y1s2.json). A student whose calendar-
// resolved semester isn't in this list yet just sees a "coming soon"
// screen - see App.jsx.
const SEMESTER_MANIFEST = [
  { id: 'y1s2', file: '/data/y1s2.json' },
  { id: 'y2s1', file: '/data/y2s1.json' },
  { id: 'y2s2', file: '/data/y2s2.json' },
];

// Questions mainly come from the static JSON files above, PLUS a
// single Firestore read of the uploadedQuestions collection - the
// live target for api/upload-questions.py (the admin PDF-upload
// parser). Each doc there carries its own semesterId/mainSubject/
// subtopic, so it merges into the exact same mainSubjectMeta/
// subjectMeta/subjectGroup/questions shape as the JSON files: a
// subject already listed in a semester's JSON (even with 0 questions,
// like the current Y2 placeholders) starts showing real questions the
// moment a matching doc appears here, with no redeploy. (The old
// "migrated subjects" system that let admin live-edit EVERY question
// in Firestore was removed to cut down on read/write usage; this is
// deliberately narrower - just the newly-uploaded batches.)
//
// Deliberately no offline/localStorage fallback here: the site is
// meant to require a live connection, so a failed fetch surfaces as a
// real error (see App.jsx's offline screen) instead of silently
// continuing to work from a stale cached copy.
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
        let data = null;

        try {
          const res = await fetch(entry.file, { cache: 'no-store' });
          if (!res.ok) throw new Error(`${entry.file} responded ${res.status}`);
          data = await res.json();
        } catch (err) {
          console.error('Failed to load question data (no offline fallback):', entry.file, err);
          if (!cancelled) {
            setState((s) => ({ ...s, loading: false, error: 'connection' }));
          }
          return;
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

      // Merge in admin-uploaded question batches (see file header).
      // A doc here whose semesterId isn't in SEMESTER_MANIFEST yet is
      // silently skipped rather than erroring - it just hasn't been
      // scaffolded into a semester JSON file yet.
      try {
        const uploadedSnap = await getDocs(collection(db, 'uploadedQuestions'));
        uploadedSnap.forEach((docSnap) => {
          const u = docSnap.data();
          if (!u.semesterId || !semesterMainSubjects[u.semesterId]) return;
          const taggedQuestions = (u.questions || []).map((q) => ({ ...q, term: u.semesterId }));
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
      } catch (err) {
        console.error('Failed to load uploaded question batches:', err);
        if (!cancelled) {
          setState((s) => ({ ...s, loading: false, error: 'connection' }));
        }
        return;
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
