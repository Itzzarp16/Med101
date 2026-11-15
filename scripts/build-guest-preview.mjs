// Builds the free preview that visitors without an account get: the first 25 questions of every
// subject (and of every topic), written to public/data/preview/<semester>.json. Same shape as the
// full files; only `questions` is cut down. Visitors load these instead of the full question bank,
// so their first visit is fast and the preview works without an account.
//
// Sources, in the same order the app uses for signed-in students:
//   1. public/data/<semester>.json            (the built-in question files)
//   2. Firestore uploadedQuestions/<semester> (questions uploaded in the admin portal) - read here
//      with the server credentials already set on Vercel (FIREBASE_PROJECT_ID / _CLIENT_EMAIL /
//      _PRIVATE_KEY). If those aren't available, or Firestore can't be reached, the preview is
//      built from the JSON files alone and the build still succeeds.
// Runs on every build (prebuild), so the preview refreshes with each deployment. Not committed.
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

const SEMESTERS = ['y1s1', 'y1s2', 'y2s1', 'y2s2']
const LIMIT = 25
const OUT_DIR = 'public/data/preview'
const FIRESTORE_TIMEOUT_MS = 25000

// Merges uploaded subjects into a semester's data the same way useSemesterData.js does.
export function mergeUploads(data, id, subjects) {
  const questions = [...data.questions]
  const subjectGroup = { ...(data.subjectGroup || {}) }
  const subjectMeta = { ...(data.subjectMeta || {}) }
  Object.values(subjects || {}).forEach((u) => {
    if (!u || !u.subtopic) return
    ;(u.questions || []).forEach((q) => questions.push({ ...q, s: q.s || u.subtopic, term: id }))
    subjectGroup[u.subtopic] = u.mainSubject
    if (u.subtopicEmoji || u.subtopicDesc) {
      subjectMeta[u.subtopic] = {
        ...(subjectMeta[u.subtopic] || {}),
        emoji: u.subtopicEmoji || subjectMeta[u.subtopic]?.emoji,
        desc: u.subtopicDesc || subjectMeta[u.subtopic]?.desc,
      }
    }
  })
  return { ...data, questions, subjectGroup, subjectMeta }
}

// First LIMIT questions of each main subject and of each topic, in file order.
export function pickPreview(data) {
  const group = data.subjectGroup || {}
  const perMain = new Map()
  const perTopic = new Map()
  const keep = new Set()
  data.questions.forEach((q, i) => {
    const main = group[q.s]
    if (main !== undefined) {
      const n = perMain.get(main) || 0
      if (n < LIMIT) { perMain.set(main, n + 1); keep.add(i) }
    }
    const t = perTopic.get(q.s) || 0
    if (t < LIMIT) { perTopic.set(q.s, t + 1); keep.add(i) }
  })
  return { ...data, questions: data.questions.filter((_, i) => keep.has(i)) }
}

async function loadUploads() {
  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n')
  if (!projectId || !clientEmail || !privateKey) {
    console.log('guest preview: no Firebase credentials here, using the JSON files only')
    return {}
  }
  try {
    const { initializeApp, cert, getApps } = await import('firebase-admin/app')
    const { getFirestore } = await import('firebase-admin/firestore')
    if (!getApps().length) initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) })
    const db = getFirestore()
    const out = {}
    const read = (async () => {
      for (const id of SEMESTERS) {
        const snap = await db.collection('uploadedQuestions').doc(id).get()
        if (snap.exists) out[id] = snap.data().subjects || {}
      }
    })()
    let timer
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timed out')), FIRESTORE_TIMEOUT_MS) })
    await Promise.race([read, timeout])
    clearTimeout(timer)
    return out
  } catch (e) {
    console.warn('guest preview: could not read uploaded questions, using the JSON files only -', e.message)
    return {}
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const uploads = await loadUploads()
  let kept = 0
  let total = 0
  let uploaded = 0
  for (const id of SEMESTERS) {
    const file = `public/data/${id}.json`
    if (!fs.existsSync(file)) continue
    const base = JSON.parse(fs.readFileSync(file, 'utf8'))
    const merged = mergeUploads(base, id, uploads[id])
    uploaded += merged.questions.length - base.questions.length
    const out = pickPreview(merged)
    fs.writeFileSync(`${OUT_DIR}/${id}.json`, JSON.stringify(out))
    kept += out.questions.length
    total += merged.questions.length
  }
  console.log(`guest preview: kept ${kept} of ${total} questions (${uploaded} uploaded ones included in the pool)`)
  // The Firebase connection can keep the process alive; the build must not wait for it.
  process.exit(0)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
