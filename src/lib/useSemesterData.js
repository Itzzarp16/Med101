import { useCallback, useEffect, useRef, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

// Mirrors the old site's loadSemesterData(): fetches semester JSON files,
// merges their subject metadata, and exposes everything the dashboard
// and quiz screens need. Add an entry here once a new semester's data
// file exists (same shape as data/y1s2.json). A student whose calendar-
// resolved semester isn't in this list yet just sees a "coming soon"
// screen - see App.jsx.
const SEMESTER_MANIFEST = [
  { id: 'y1s1', file: '/data/y1s1.json' },
  { id: 'y1s2', file: '/data/y1s2.json' },
  { id: 'y2s1', file: '/data/y2s1.json' },
  { id: 'y2s2', file: '/data/y2s2.json' },
];

// Semester 1's Foreign and Latin Language question bank is kept as a
// compressed static supplement so the existing 287 KB y1s1 JSON does not
// need to be rewritten every time this bank changes. It contains the
// Latin Language and Foreign Language questions from the supplied exam file.
async function loadY1S1ForeignLatinSupplement() {
  const res = await fetch('/data/y1s1-foreign-latin.gz.b64', { cache: 'no-store' });
  if (!res.ok) throw new Error(`Foreign/Latin supplement responded ${res.status}`);
  const b64 = (await res.text()).trim();
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This browser does not support gzip decompression for the Foreign/Latin question bank');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}

// Questions mainly come from the static JSON files above, PLUS one
// Firestore document read PER SEMESTER (uploadedQuestions/{semesterId})
// - the live target for api/upload-questions.py (the admin PDF-upload
// parser). This is deliberately ONE doc per semester rather than one
// doc per upload/subtopic: reading a whole collection here would mean
// the read cost per app load grows with how much content has ever been
// uploaded (exactly the Firestore-cost problem the old "migrated
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

  const mountedRef = useRef(true);
  const loadRef = useRef(null);

  useEffect(() => {
    mountedRef.current = true;

    // silent = a manual refresh (pull-to-refresh): no loading flag, and a
    // failed fetch leaves the data already on screen alone instead of
    // flipping the whole app to the offline/error screen. Resolves true
    // when fresh data was applied.
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
          console.error('Failed to load question data (no offline fallback):', entry.file, err);
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

        // Semester 1 also has the supplied Foreign and Latin Language exam
        // bank. Load it as a static supplement and merge it into the same
        // subject/subtopic model used by every other question set.
        if (entry.id === 'y1s1') {
          try {
            const supplement = await loadY1S1ForeignLatinSupplement();
            const taggedQuestions = (supplement.questions || []).map((q) => ({ ...q, term: entry.id }));
            questions = questions.concat(taggedQuestions);
            Object.assign(mainSubjectMeta, supplement.mainSubjectMeta || {});
            Object.assign(subjectMeta, supplement.subjectMeta || {});
            Object.assign(subjectGroup, supplement.subjectGroup || {});
            semesterMainSubjects[data.id] = Object.keys(mainSubjectMeta).filter((name) => name === 'Foreign and Latin language' || (data.mainSubjectMeta || {})[name]);
          } catch (err) {
            // The core semester JSON remains usable if the optional
            // Foreign/Latin supplement cannot be decoded or fetched.
            console.warn('Could not load Semester 1 Foreign/Latin questions:', err);
          }
        }

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

  // Stable handle for pull-to-refresh: re-reads the semester JSON files and
  // the admin-uploaded questions doc, so a freshly uploaded question set
  // shows up without closing the app. Costs the same few reads as a load.
  const refresh = useCallback(() => (loadRef.current ? loadRef.current(true) : Promise.resolve(false)), []);

  return { ...state, refresh };
}
