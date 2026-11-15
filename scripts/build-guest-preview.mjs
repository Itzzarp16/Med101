// Copies the first 25 questions of every subject (and of every topic) out of
// public/data/<semester>.json into small preview files, public/data/preview/<semester>.json.
// Visitors who haven't signed up load these instead of the full question bank, so their first
// visit is fast and the free preview ("first 25 questions of any subject") works without an account.
// Same shape as the full files; only `questions` is cut down. Runs on every build (prebuild),
// so new questions saved to the JSON are picked up automatically. Output is not committed.
import fs from 'node:fs'

const SEMESTERS = ['y1s1', 'y1s2', 'y2s1', 'y2s2']
const LIMIT = 25
const OUT_DIR = 'public/data/preview'

fs.mkdirSync(OUT_DIR, { recursive: true })
let kept = 0
let total = 0

for (const id of SEMESTERS) {
  const file = `public/data/${id}.json`
  if (!fs.existsSync(file)) continue
  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  const group = data.subjectGroup || {}
  const perMain = new Map()
  const perTopic = new Map()
  const keep = new Set()

  // File order is the order students see, so "first 25" means the first 25 in the file.
  data.questions.forEach((q, i) => {
    const main = group[q.s]
    if (main !== undefined) {
      const n = perMain.get(main) || 0
      if (n < LIMIT) { perMain.set(main, n + 1); keep.add(i) }
    }
    const t = perTopic.get(q.s) || 0
    if (t < LIMIT) { perTopic.set(q.s, t + 1); keep.add(i) }
  })

  const out = { ...data, questions: data.questions.filter((_, i) => keep.has(i)) }
  fs.writeFileSync(`${OUT_DIR}/${id}.json`, JSON.stringify(out))
  kept += out.questions.length
  total += data.questions.length
}
console.log(`guest preview: kept ${kept} of ${total} questions`)
