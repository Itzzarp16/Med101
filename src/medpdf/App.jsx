import { useEffect, useMemo, useState } from 'react'
import manifest from './manifest.json'
import { SUBJECTS } from './subjects.js'

const find = (nodes, name) => nodes.find((n) => n.type === 'folder' && n.name.toLowerCase() === name.toLowerCase())
const count = (n) => (n.type === 'file' ? 1 : n.children.reduce((s, c) => s + count(c), 0))
const flat = (nodes, trail = []) =>
  nodes.flatMap((n) => (n.type === 'file' ? [{ ...n, trail }] : flat(n.children, [...trail, n.name])))

function subjectsFor(year) {
  const used = new Set()
  const list = (SUBJECTS[year.name] || []).map((c) => {
    const f = find(year.children, c.name)
    if (f) used.add(f.id)
    return { ...c, folder: f || { type: 'folder', id: `${year.id}/${c.name}`, name: c.name, children: [] } }
  })
  year.children
    .filter((n) => n.type === 'folder' && !used.has(n.id))
    .forEach((f) => list.push({ name: f.name, icon: '📁', hue: 215, blurb: '', folder: f }))
  return list
}

const tilt = (e) => {
  if (e.pointerType !== 'mouse') return
  const el = e.currentTarget, r = el.getBoundingClientRect()
  const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height
  el.style.setProperty('--rx', (0.5 - y) * 10 + 'deg')
  el.style.setProperty('--ry', (x - 0.5) * 12 + 'deg')
  el.style.setProperty('--mx', x * 100 + '%')
  el.style.setProperty('--my', y * 100 + '%')
}
const untilt = (e) => {
  e.currentTarget.style.setProperty('--rx', '0deg')
  e.currentTarget.style.setProperty('--ry', '0deg')
}

function Card({ s, n, onOpen }) {
  const total = count(s.folder)
  return (
    <button className="card" style={{ '--h': s.hue, '--n': n }} onClick={onOpen} onPointerMove={tilt} onPointerLeave={untilt}>
      <span className="ico">{s.icon}</span>
      <span className="nm">{s.name}</span>
      <span className="bl">{s.blurb}</span>
      <span className={'ct' + (total ? '' : ' soon')}>{total ? `${total} PDF${total > 1 ? 's' : ''}` : 'Coming soon'}</span>
    </button>
  )
}

function Row({ n, hue, icon, title, sub, badge, onClick }) {
  return (
    <button className="row" style={{ '--n': Math.min(n, 12), '--h': hue }} onClick={onClick}>
      <span className="ri">{icon}</span>
      <span className="rt"><b>{title}</b>{sub && <small>{sub}</small>}</span>
      {badge != null && <em>{badge}</em>}
      <span className="go" aria-hidden="true">›</span>
    </button>
  )
}

export default function App() {
  const [yearIdx, setYearIdx] = useState(0)
  const [sel, setSel] = useState(null)
  const [trail, setTrail] = useState([])
  const [file, setFile] = useState(null)
  const [query, setQuery] = useState('')

  const year = manifest[yearIdx]
  const subjects = useMemo(() => subjectsFor(year), [year])
  const all = useMemo(() => flat(manifest), [])
  const q = query.trim().toLowerCase()
  const results = q ? all.filter((f) => (f.trail.join(' ') + ' ' + f.name).toLowerCase().includes(q)) : []
  const cur = trail[trail.length - 1]
  const hue = sel?.hue ?? 215

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && setFile(null)
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = file ? 'hidden' : ''
    return () => window.removeEventListener('keydown', onKey)
  }, [file])

  const open = (s) => { setSel(s); setTrail([s.folder]) }
  const back = () => (trail.length > 1 ? setTrail(trail.slice(0, -1)) : setSel(null))
  const pickYear = (i) => { setYearIdx(i); setSel(null); setQuery('') }

  return (
    <>
      <div className="bg" aria-hidden="true"><i /><i /><i /></div>
      <header className="top">
        <a className="brand" href="/">Med101<span>PDFs</span></a>
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search every PDF" aria-label="Search every PDF" />
      </header>

      <main>
        {q ? (
          <section className="list" key="search">
            <h2>{results.length} result{results.length === 1 ? '' : 's'}</h2>
            {results.length === 0 && <p className="empty">Nothing matches “{query}”. Try a shorter word.</p>}
            {results.map((f, i) => (
              <Row key={f.id} n={i} hue={215} icon="📄" title={f.name} sub={f.trail.join(' › ')} onClick={() => setFile(f)} />
            ))}
          </section>
        ) : sel ? (
          <section className="list" key={cur.id} style={{ '--h': hue }}>
            <button className="back" onClick={back}>‹ Back</button>
            <h2><span className="ico sm" style={{ '--h': hue }}>{sel.icon}</span>{trail.map((t) => t.name).join(' › ')}</h2>
            {cur.children.length === 0 && (
              <p className="empty">No PDFs here yet. Add files to <code>public/medpdf/pdfs/{year.name}/{trail.map((t) => t.name).join('/')}/</code> and redeploy.</p>
            )}
            {cur.children.map((c, i) =>
              c.type === 'folder' ? (
                <Row key={c.id} n={i} hue={hue} icon="📁" title={c.name} badge={`${count(c)}`} onClick={() => setTrail([...trail, c])} />
              ) : (
                <Row key={c.id} n={i} hue={hue} icon="📄" title={c.name} onClick={() => setFile(c)} />
              ),
            )}
          </section>
        ) : (
          <>
            <section className="hero">
              <h1><span>Every subject PDF,</span> <span>one tap away.</span></h1>
              <p>Choose your year, then a subject.</p>
              <div className="years" style={{ '--i': yearIdx }} role="tablist">
                <b className="pill" aria-hidden="true" />
                {manifest.map((y, i) => (
                  <button key={y.id} role="tab" aria-selected={i === yearIdx} className={i === yearIdx ? 'on' : ''} onClick={() => pickYear(i)}>
                    {y.name}
                  </button>
                ))}
              </div>
            </section>
            <section className="grid" key={year.id}>
              {subjects.length === 0 && <p className="empty">Subjects for {year.name} are coming soon.</p>}
              {subjects.map((s, i) => <Card key={s.name} s={s} n={i} onOpen={() => open(s)} />)}
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
              <button onClick={() => setFile(null)} aria-label="Close">✕</button>
            </div>
            <iframe src={file.url} title={file.name} />
          </div>
        </div>
      )}
    </>
  )
}
