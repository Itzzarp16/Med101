import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
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

// Questions mainly come from the static JSON files above, PLUS one
// Firestore document read PER SEMESTER (uploadedQuestions/{semesterId})
// - the live target for api/upload-questions.py (the admin PDF-upload
// parser). This is deliberately ONE doc per semester rather than one
// doc per upload/subtopic: reading a whole collection here would mean
// the read cost per app load grows with how much content has ever
// been uploaded (exactly the Firestore-cost problem the old "migrated
// subjects" system had, which is why it was removed). Fetching by a
// known doc ID instead keeps this fixed at exactly
// SEMESTER_MANIFEST.length reads, no matter how many subtopics end up
// inside each semester's doc.
//
// Each semester doc holds a `subjects` map keyed by a slug, so
// re-uploading one subtopic overwrites only that entry (see the
// Python function) - merges into the exact same mainSubjectMeta/
// subjectMeta/subjectGroup/questions shape as the JSON files, so a
// subject already listed in a semester's JSON (even with 0 questions,
// like the current Y2 placeholders) starts showing real questions the
// moment its entry appears, with no redeploy.
//
// Deliberately no offline/localStorage fallback for the JSON fetch
// above: the site is meant to require a live connection, so a failed
// JSON fetch surfaces as a real error (see App.jsx's offline screen)
// instead of silently continuing to work from a stale cached copy.
// The Firestore uploaded-questions read is treated differently
// (soft-fail, see below) since it's a supplementary layer, not core
// content.
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

        // One doc read for THIS semester's admin-uploaded questions
        // (see file header for why it's one doc, not a collection
        // scan). A semester with nothing uploaded yet just won't have
        // a doc - exists() is false, nothing to merge, no error.
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
          // Deliberately non-fatal, unlike the JSON fetch above: this
          // read can legitimately fail before auth is established
          // (e.g. AdminPortal's own pre-login screen also calls this
          // hook, and firestore.rules requires request.auth != null
          // for uploadedQuestions) - a permission or network hiccup
          // here should just mean "no admin-uploaded extras this
          // load", not take down the whole semester JSON the rest of
          // the app needs regardless.
          console.warn('Could not load uploaded questions for', entry.id, '- continuing without them:', err);
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
