import { useEffect, useMemo, useState } from 'react'
import ScreenHeader from '../components/ScreenHeader'
import manifest from './manifest.json'
import { SUBJECTS } from './subjects.js'

// Same muted accent set the Answer Key screen uses.
const ACCENTS = ['var(--cyan-rgb)', 'var(--violet-rgb)', 'var(--pink-rgb)', '70, 140, 130']

const find = (nodes, name) => nodes.find((n) => n.type === 'folder' && n.name.toLowerCase() === name.toLowerCase())
const count = (n) => (n.type === 'file' ? 1 : n.children.reduce((s, c) => s + count(c), 0))
const flat = (nodes, trail = []) =>
  nodes.flatMap((n) => (n.type === 'file' ? [{ ...n, trail }] : flat(n.children, [...trail, n.name])))
const pdfs = (n) => `${n} PDF${n === 1 ? '' : 's'}`
const goHome = () => window.location.assign('/')

function subjectsFor(year) {
  const used = new Set()
  const list = (SUBJECTS[year.name] || []).map((c) => {
    const f = find(year.children, c.name)
    if (f) used.add(f.id)
    return { name: c.name, folder: f || { type: 'folder', id: `${year.id}/${c.name}`, name: c.name, children: [] } }
  })
  year.children
    .filter((n) => n.type === 'folder' && !used.has(n.id))
    .forEach((f) => list.push({ name: f.name, folder: f }))
  return list
}

const Mark = ({ folder }) => (
  <svg viewBox="0 0 28 32" aria-hidden="true" className="ak-doc-svg">
    {folder ? (
      <path d="M3 9a2.5 2.5 0 0 1 2.5-2.5h5l3 3h9A2.5 2.5 0 0 1 25 12v11a2.5 2.5 0 0 1-2.5 2.5h-17A2.5 2.5 0 0 1 3 23Z" />
    ) : (
      <>
        <path d="M5 1.5h11l7 7V28a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 5 28V4a2.5 2.5 0 0 1 2.5-2.5Z" />
        <path d="M16 2v7h7M9 16h10M9 20h10M9 24h7" />
      </>
    )}
  </svg>
)

function Card({ i, folder, title, chip, meta, onOpen, openLabel, href, download }) {
  return (
    <article className="ak-card" style={{ '--ak-index': Math.min(i, 8), '--ak-rgb': ACCENTS[i % ACCENTS.length] }}>
      <span className="ak-card-glow" aria-hidden="true" />
      <button className="ak-card-head" type="button" onClick={onOpen} aria-label={`${openLabel} ${title}`}>
        <span className="ak-tile"><Mark folder={folder} /></span>
        <span className="ak-card-info">
          <span className="ak-card-title">{title}</span>
          <span className="ak-card-meta"><span className="ak-chip">{chip}</span> {meta}</span>
        </span>
        <span className="ak-card-num" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
      </button>
      <div className="ak-card-actions">
        <button className="ak-btn ak-btn-primary" type="button" onClick={onOpen}>
          {openLabel} <span aria-hidden="true">↗</span>
        </button>
        {href && (
          <a className="ak-btn ak-btn-ghost" href={href} download={download} aria-label={`Download ${title}`}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19.5h14" /></svg>
          </a>
        )}
      </div>
    </article>
  )
}

export default function App() {
  const [yearIdx, setYearIdx] = useState(0)
  const [trail, setTrail] = useState([])
  const [file, setFile] = useState(null)
  const [query, setQuery] = useState('')

  const year = manifest[yearIdx]
  const subjects = useMemo(() => subjectsFor(year), [year])
  const all = useMemo(() => flat(manifest), [])
  const q = query.trim().toLowerCase()
  const results = q ? all.filter((f) => (f.trail.join(' ') + ' ' + f.name).toLowerCase().includes(q)) : []
  const cur = trail[trail.length - 1]
  const yearTotal = count(year)

  useEffect(() => { window.scrollTo(0, 0) }, [trail, file, yearIdx])

  const topbar = (
    <div className="topbar">
      <div className="topbar-left">
        <div className="topbar-logo-stack">
          <span className="topbar-logo">Med101</span>
          <span className="topbar-tagline">Learn. Practice. Improve.</span>
        </div>
      </div>
      <div className="topbar-right">
        <button className="topbar-user mp-topbar-link" onClick={goHome}>Open app</button>
      </div>
    </div>
  )

  // ── Reader ───────────────────────────────────────────
  if (file) {
    return (
      <>
        {topbar}
        <div className="std-screen ak-pdf-screen ak-pdf-viewer-screen">
          <ScreenHeader onBack={() => setFile(null)} title={file.name}>{file.trail.join(' · ')}</ScreenHeader>
          <div className="ak-viewer-toolbar">
            <span className="ak-viewer-label"><span className="ak-viewer-dot" /> PDF DOCUMENT</span>
            <a className="ak-btn ak-btn-primary" href={file.url} download>
              <span aria-hidden="true">↓</span> Download
            </a>
          </div>
          <div className="ak-viewer-frame-wrap">
            <iframe className="ak-viewer-frame" src={`${file.url}#toolbar=0&navpanes=0&scrollbar=1&view=FitH`} title={file.name} />
          </div>
        </div>
      </>
    )
  }

  const inSubject = trail.length > 0
  const header = inSubject ? (
    <ScreenHeader onBack={() => setTrail(trail.slice(0, -1))} title={cur.name}>
      {[year.name, ...trail.slice(0, -1).map((t) => t.name)].join(' · ')}
    </ScreenHeader>
  ) : (
    <ScreenHeader onBack={goHome} title="PDF Library">Your revision library</ScreenHeader>
  )

  const hero = inSubject ? (
    <section className="ak-hero" key={cur.id} aria-label={cur.name}>
      <span className="ak-hero-orbit ak-hero-orbit-one" aria-hidden="true" />
      <span className="ak-hero-orbit ak-hero-orbit-two" aria-hidden="true" />
      <div className="ak-hero-body">
        <span className="ak-eyebrow"><i /> {year.name.toUpperCase()}</span>
        <h2 className="ak-hero-title sm">{cur.name}</h2>
        <p className="ak-hero-copy">Open a PDF in the app or download it for offline revision.</p>
        <div className="ak-hero-stats">
          <span className="ak-stat"><b>{count(cur)}</b> {count(cur) === 1 ? 'PDF' : 'PDFs'}</span>
          <span className="ak-stat"><b>{cur.children.filter((c) => c.type === 'folder').length}</b> folders</span>
        </div>
      </div>
      <div className="ak-hero-mark" aria-hidden="true"><Mark folder={trail.length === 1} /></div>
    </section>
  ) : (
    <section className="ak-hero" aria-label={`${year.name} PDFs`}>
      <span className="ak-hero-orbit ak-hero-orbit-one" aria-hidden="true" />
      <span className="ak-hero-orbit ak-hero-orbit-two" aria-hidden="true" />
      <div className="ak-hero-body">
        <span className="ak-eyebrow"><i /> SUBJECT PDFS</span>
        <h2 className="ak-hero-title">{year.name}</h2>
        <p className="ak-hero-copy">Pick a subject. Open its PDFs in the app or download them for offline revision.</p>
        <div className="ak-hero-stats">
          <span className="ak-stat"><b>{subjects.length}</b> {subjects.length === 1 ? 'subject' : 'subjects'}</span>
          <span className="ak-stat"><b>{yearTotal}</b> {yearTotal === 1 ? 'PDF' : 'PDFs'}</span>
        </div>
      </div>
      <div className="ak-hero-mark" aria-hidden="true"><Mark /></div>
    </section>
  )

  let body
  if (q) {
    body = results.length === 0 ? (
      <div className="ak-state-card ak-state-compact">
        <div className="ak-state-icon">⌕</div>
        <h3>No matching PDFs</h3>
        <p>Try another search term.</p>
        <button className="ak-text-action" type="button" onClick={() => setQuery('')}>Clear search</button>
      </div>
    ) : (
      <section className="ak-grid" key={'q' + q}>
        {results.map((f, i) => (
          <Card key={f.id} i={i} title={f.name} chip="PDF" meta={f.trail.join(' · ')} openLabel="Open PDF" onOpen={() => setFile(f)} href={f.url} download />
        ))}
      </section>
    )
  } else if (inSubject) {
    body = cur.children.length === 0 ? (
      <div className="ak-state-card">
        <div className="ak-state-icon"><Mark /></div>
        <h3>Your library is getting ready</h3>
        <p>PDFs for {cur.name} will appear here as soon as they’re uploaded.</p>
      </div>
    ) : (
      <section className="ak-grid" key={cur.id}>
        {cur.children.map((c, i) =>
          c.type === 'folder' ? (
            <Card key={c.id} i={i} folder title={c.name} chip={pdfs(count(c)).toUpperCase()} meta={cur.name} openLabel="Open folder" onOpen={() => setTrail([...trail, c])} />
          ) : (
            <Card key={c.id} i={i} title={c.name} chip="PDF" meta={cur.name} openLabel="Open PDF" onOpen={() => setFile({ ...c, trail: [year.name, ...trail.map((t) => t.name)] })} href={c.url} download />
          ),
        )}
      </section>
    )
  } else {
    body = subjects.length === 0 ? (
      <div className="ak-state-card">
        <div className="ak-state-icon"><Mark /></div>
        <h3>Your library is getting ready</h3>
        <p>Subjects for {year.name} will appear here soon.</p>
      </div>
    ) : (
      <section className="ak-grid" key={year.id}>
        {subjects.map((s, i) => (
          <Card key={s.name} i={i} folder title={s.name} chip={pdfs(count(s.folder)).toUpperCase()} meta={year.name} openLabel="Open subject" onOpen={() => setTrail([s.folder])} />
        ))}
      </section>
    )
  }

  return (
    <>
      {topbar}
      <div className="std-screen ak-pdf-screen">
        {header}
        {hero}
        {!inSubject && (
          <div className="mp-years" role="tablist" aria-label="Year">
            {manifest.map((y, i) => (
              <button key={y.id} className="mp-year" role="tab" aria-selected={i === yearIdx} onClick={() => { setYearIdx(i); setQuery('') }}>{y.name}</button>
            ))}
          </div>
        )}
        <div className="ak-toolbar">
          <label className="ak-search">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" /></svg>
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search all PDFs…" aria-label="Search all PDFs" />
            {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search">×</button>}
          </label>
          <span className="ak-count" aria-live="polite">{q ? results.length : inSubject ? count(cur) : yearTotal}<em>/</em>{q ? all.length : inSubject ? count(year) : all.length}</span>
        </div>
        {body}
      </div>
    </>
  )
}
