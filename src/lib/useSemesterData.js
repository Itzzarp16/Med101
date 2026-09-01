import { useEffect, useState } from 'react';
import { fetchFirestoreQuestions, fetchMigratedSubjects } from './questionsService';

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

// Which subjects are migrated to Firestore only changes when the admin
// migrates one - checking it fresh on *every single page load, for
// every student* (one Firestore query per candidate subject) is pure
// overhead. localStorage (not sessionStorage) so this is shared across
// every open tab, not re-paid per tab - important during testing with
// many tabs open at once, and still picks up admin changes quickly
// (worst case: a few minutes stale, then self-corrects).
const MIGRATED_CACHE_PREFIX = 'med101_migrated_cache_';
const MIGRATED_CACHE_TTL_MS = 3 * 60 * 1000;

function loadMigratedCache(semesterId) {
  try {
    const raw = localStorage.getItem(MIGRATED_CACHE_PREFIX + semesterId);
    if (!raw) return null;
    const { ts, subjects } = JSON.parse(raw);
    if (Date.now() - ts > MIGRATED_CACHE_TTL_MS) return null;
    return new Set(subjects);
  } catch {
    return null;
  }
}

function saveMigratedCache(semesterId, migratedSet) {
  try {
    localStorage.setItem(
      MIGRATED_CACHE_PREFIX + semesterId,
      JSON.stringify({ ts: Date.now(), subjects: [...migratedSet] })
    );
  } catch {
    // localStorage unavailable/full - just means this load skips the
    // cache benefit, nothing breaks.
  }
}

// The actual migrated question CONTENT (not just which subjects are
// migrated) is the expensive part - one read per question, every cold
// load, every tab. Same localStorage + short-TTL treatment: a repeat
// load within the window reuses it instead of re-downloading every
// question again.
const QUESTIONS_CACHE_PREFIX = 'med101_migrated_questions_cache_';
const QUESTIONS_CACHE_TTL_MS = 3 * 60 * 1000;

function loadQuestionsCache(semesterId, subject) {
  try {
    const raw = localStorage.getItem(QUESTIONS_CACHE_PREFIX + semesterId + '_' + subject);
    if (!raw) return null;
    const { ts, docs } = JSON.parse(raw);
    if (Date.now() - ts > QUESTIONS_CACHE_TTL_MS) return null;
    return docs;
  } catch {
    return null;
  }
}

function saveQuestionsCache(semesterId, subject, docs) {
  try {
    localStorage.setItem(
      QUESTIONS_CACHE_PREFIX + semesterId + '_' + subject,
      JSON.stringify({ ts: Date.now(), docs })
    );
  } catch {
    // Storage full/unavailable - just skips the cache benefit.
  }
}

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

        // For any subject that's been migrated to Firestore, that
        // becomes the source of truth - replace the JSON questions
        // for that subject with the live Firestore ones, so admin
        // edits/adds/deletes show up without a redeploy. Firestore's
        // own offline persistence (see firebase.js) keeps this working
        // without a network too, once it's been read at least once.
        try {
          const candidates = Object.keys(data.mainSubjectMeta || {});
          if (candidates.length > 0) {
            let migrated = loadMigratedCache(data.id);
            if (!migrated) {
              migrated = await fetchMigratedSubjects(data.id, candidates);
              saveMigratedCache(data.id, migrated);
            }

            const migratedList = [...migrated];
            // Fire all migrated subjects' question fetches at once
            // instead of one-at-a-time - was previously a sequential
            // await-in-a-loop, so N subjects meant N full round trips
            // stacked back to back. Cache-check each one first so a
            // repeat load within the TTL window costs zero reads.
            const liveResultsBySubject = await Promise.all(
              migratedList.map(async (subj) => {
                const cached = loadQuestionsCache(data.id, subj);
                if (cached) return cached;
                const fresh = await fetchFirestoreQuestions(data.id, subj);
                saveQuestionsCache(data.id, subj, fresh);
                return fresh;
              })
            );

            migratedList.forEach((subj, i) => {
              questions = questions.filter(
                (q) => !(q.term === data.id && subjectGroup[q.s] === subj)
              );
              const asQuizShape = liveResultsBySubject[i].map((doc) => ({
                s: doc.subtopic,
                q: doc.q,
                o: doc.o,
                c: doc.c,
                term: data.id,
                firestoreId: doc.id,
              }));
              questions = questions.concat(asQuizShape);
            });
          }
        } catch (err) {
          console.warn('Could not check/merge migrated subjects for', data.id, err);
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
