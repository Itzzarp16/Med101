import { useEffect, useMemo, useState } from 'react'
import manifest from './manifest.json'
import { SUBJECTS } from './subjects.js'

const find = (nodes, name) => nodes.find((n) => n.type === 'folder' && n.name.toLowerCase() === name.toLowerCase())
const count = (n) => (n.type === 'file' ? 1 : n.children.reduce((s, c) => s + count(c), 0))
const flat = (nodes, trail = []) =>
  nodes.flatMap((n) => (n.type === 'file' ? [{ ...n, trail }] : flat(n.children, [...trail, n.name])))
const plural = (n) => `${n} PDF${n === 1 ? '' : 's'}`

function subjectsFor(year) {
  const used = new Set()
  const list = (SUBJECTS[year.name] || []).map((c) => {
    const f = find(year.children, c.name)
    if (f) used.add(f.id)
    return { ...c, folder: f || { type: 'folder', id: `${year.id}/${c.name}`, name: c.name, children: [] } }
  })
  year.children
    .filter((n) => n.type === 'folder' && !used.has(n.id))
    .forEach((f) => list.push({ name: f.name, hue: 220, folder: f }))
  return list
}

const Icon = ({ d, size = 20 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
)
const FOLDER = 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'
const FILE = 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5'
const ARROW = 'M5 12h14M13 6l6 6-6 6'

// One heartbeat, repeated `beats` times across a 100-unit-wide strip per beat.
const beat = (x) => `L${x + 30} 20 L${x + 36} 20 L${x + 42} 6 L${x + 50} 34 L${x + 57} 12 L${x + 62} 20 L${x + 100} 20`
const ecg = (beats) => `M0 20 ${Array.from({ length: beats }, (_, i) => beat(i * 100)).join(' ')}`

// A faint ECG trace with a bright segment travelling along it.
function Pulse({ beats = 2, className = '' }) {
  const d = ecg(beats)
  return (
    <svg className={'pulse ' + className} viewBox={`0 0 ${beats * 100} 40`} preserveAspectRatio="none" aria-hidden="true">
      <path pathLength="100" className="base" d={d} />
      <path pathLength="100" className="run" d={d} />
    </svg>
  )
}

function Row({ n, icon, title, sub, badge, onClick }) {
  return (
    <button className="row" style={{ '--n': Math.min(n, 10) }} onClick={onClick}>
      <span className="ri"><Icon d={icon} /></span>
      <span className="rt"><b>{title}</b>{sub && <small>{sub}</small>}</span>
      {badge != null && <em>{badge}</em>}
      <Icon d={ARROW} size={18} />
    </button>
  )
}

export default function App() {
  const [yearIdx, setYearIdx] = useState(0)
  const [trail, setTrail] = useState([])
  const [subject, setSubject] = useState(null)
  const [file, setFile] = useState(null)
  const [query, setQuery] = useState('')

  const year = manifest[yearIdx]
  const subjects = useMemo(() => subjectsFor(year), [year])
  const all = useMemo(() => flat(manifest), [])
  const q = query.trim().toLowerCase()
  const results = q ? all.filter((f) => (f.trail.join(' ') + ' ' + f.name).toLowerCase().includes(q)) : []
  const cur = trail[trail.length - 1]

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && setFile(null)
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = file ? 'hidden' : ''
    return () => window.removeEventListener('keydown', onKey)
  }, [file])

  const home = () => { setSubject(null); setTrail([]) }
  const open = (s) => { setSubject(s); setTrail([s.folder]) }

  return (
    <>
      <header className="top">
        <a className="brand" href="/">Med101</a>
        <button className="tag" onClick={() => { home(); setQuery('') }}>PDFs</button>
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search PDFs" aria-label="Search PDFs" />
      </header>

      <main>
        {q ? (
          <section key="search" className="view">
            <h2 className="title">{results.length} result{results.length === 1 ? '' : 's'}</h2>
            {results.length === 0 && <p className="empty">Nothing matches “{query}”.</p>}
            {results.map((f, i) => <Row key={f.id} n={i} icon={FILE} title={f.name} sub={f.trail.join(' / ')} onClick={() => setFile(f)} />)}
          </section>
        ) : subject ? (
          <section key={cur.id} className="view" style={{ '--h': subject.hue }}>
            <nav className="crumbs" aria-label="Breadcrumb">
              <button onClick={home}>{year.name}</button>
              {trail.map((t, i) => (
                <span key={t.id}>
                  <i>/</i>
                  {i === trail.length - 1 ? <b>{t.name}</b> : <button onClick={() => setTrail(trail.slice(0, i + 1))}>{t.name}</button>}
                </span>
              ))}
            </nav>
            <h2 className="title big">{cur.name}</h2>
            <p className="meta">{count(cur) ? plural(count(cur)) : 'No PDFs yet'}</p>
            <Pulse beats={6} className="wide" />
            {cur.children.length === 0 && (
              <p className="empty">Add files to <code>public/medpdf/pdfs/{year.name}/{trail.map((t) => t.name).join('/')}/</code></p>
            )}
            <div className="rows">
              {cur.children.map((c, i) =>
                c.type === 'folder' ? (
                  <Row key={c.id} n={i} icon={FOLDER} title={c.name} badge={count(c)} onClick={() => setTrail([...trail, c])} />
                ) : (
                  <Row key={c.id} n={i} icon={FILE} title={c.name} onClick={() => setFile(c)} />
                ),
              )}
            </div>
          </section>
        ) : (
          <>
            <section className="hero">
              <h1><span className="ln"><span>Study PDFs,</span></span><span className="ln"><span>sorted by subject.</span></span></h1>
              <Pulse beats={10} className="wide hero-ecg" />
              <div className="years" style={{ '--i': yearIdx }} role="tablist">
                <b className="pill" aria-hidden="true" />
                {manifest.map((y, i) => (
                  <button key={y.id} role="tab" aria-selected={i === yearIdx} onClick={() => setYearIdx(i)}>{y.name}</button>
                ))}
              </div>
            </section>
            <section className="grid" key={year.id}>
              {subjects.length === 0 && <p className="empty">Subjects for {year.name} are coming soon.</p>}
              {subjects.map((s, i) => {
                const n = count(s.folder)
                return (
                  <button key={s.name} className="card" style={{ '--h': s.hue, '--n': i }} onClick={() => open(s)}>
                    <span className="cn">{s.name}</span>
                    <Pulse />
                    <span className="cf">
                      <span className="cc">{n ? plural(n) : 'No PDFs yet'}</span>
                      <span className="go"><Icon d={ARROW} size={18} /></span>
                    </span>
                  </button>
                )
              })}
            </section>
          </>
        )}
      </main>

      {file && (
        <div className="viewer" onClick={() => setFile(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="vbar">
              <span>{file.name}</span>
              <a href={file.url} target="_blank" rel="noreferrer">Open in new tab</a>
              <button onClick={() => setFile(null)}>Close</button>
            </div>
            <iframe src={file.url} title={file.name} />
          </div>
        </div>
      )}
    </>
  )
}
