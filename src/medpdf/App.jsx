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

const Icon = ({ d }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
)
const FOLDER = 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'
const FILE = 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5'
const CHEV = 'M9 6l6 6-6 6'

function Row({ icon, title, sub, badge, onClick }) {
  return (
    <button className="row" onClick={onClick}>
      <Icon d={icon} />
      <span className="rt"><b>{title}</b>{sub && <small>{sub}</small>}</span>
      {badge != null && <em>{badge}</em>}
      <Icon d={CHEV} />
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
        <span className="sep">/</span>
        <button className="brand-sub" onClick={() => { home(); setQuery('') }}>PDFs</button>
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search PDFs" aria-label="Search PDFs" />
      </header>

      <main>
        {q ? (
          <section className="fade" key="search">
            <h1>{results.length} result{results.length === 1 ? '' : 's'}</h1>
            {results.length === 0 && <p className="empty">Nothing matches “{query}”.</p>}
            {results.map((f) => <Row key={f.id} icon={FILE} title={f.name} sub={f.trail.join(' / ')} onClick={() => setFile(f)} />)}
          </section>
        ) : subject ? (
          <section className="fade" key={cur.id}>
            <nav className="crumbs" aria-label="Breadcrumb">
              <button onClick={home}>{year.name}</button>
              {trail.map((t, i) => (
                <span key={t.id}>
                  <i>/</i>
                  {i === trail.length - 1 ? <b>{t.name}</b> : <button onClick={() => setTrail(trail.slice(0, i + 1))}>{t.name}</button>}
                </span>
              ))}
            </nav>
            <h1>{cur.name}</h1>
            {cur.children.length === 0 && (
              <p className="empty">No PDFs yet. Add files to <code>public/medpdf/pdfs/{year.name}/{trail.map((t) => t.name).join('/')}/</code></p>
            )}
            {cur.children.map((c) =>
              c.type === 'folder' ? (
                <Row key={c.id} icon={FOLDER} title={c.name} badge={count(c)} onClick={() => setTrail([...trail, c])} />
              ) : (
                <Row key={c.id} icon={FILE} title={c.name} onClick={() => setFile(c)} />
              ),
            )}
          </section>
        ) : (
          <>
            <h1>PDF library</h1>
            <div className="tabs" style={{ '--i': yearIdx }} role="tablist">
              {manifest.map((y, i) => (
                <button key={y.id} role="tab" aria-selected={i === yearIdx} onClick={() => setYearIdx(i)}>{y.name}</button>
              ))}
              <span className="bar" aria-hidden="true" />
            </div>
            <section className="grid fade" key={year.id}>
              {subjects.length === 0 && <p className="empty">Subjects for {year.name} are coming soon.</p>}
              {subjects.map((s) => {
                const n = count(s.folder)
                return (
                  <button key={s.name} className="card" onClick={() => open(s)}>
                    <span className="dot" style={{ '--h': s.hue }} />
                    <b>{s.name}</b>
                    <small>{n ? plural(n) : 'No PDFs yet'}</small>
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
              <button onClick={() => setFile(null)} aria-label="Close">Close</button>
            </div>
            <iframe src={file.url} title={file.name} />
          </div>
        </div>
      )}
    </>
  )
}
