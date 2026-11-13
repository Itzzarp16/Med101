import { useEffect, useMemo, useState } from 'react'
import manifest from './manifest.json'
import { SUBJECTS } from './subjects.js'
import PdfPages from '../components/PdfPages'
import { getTheme, setTheme } from '../lib/theme.js'

const find = (nodes, name) => nodes.find((n) => n.type === 'folder' && n.name.toLowerCase() === name.toLowerCase())
const count = (n) => (n.type === 'file' ? 1 : n.children.reduce((s, c) => s + count(c), 0))
const flat = (nodes, trail = []) =>
  nodes.flatMap((n) => (n.type === 'file' ? [{ ...n, trail }] : flat(n.children, [...trail, n.name])))
const kindOf = (f) => (f.external ? (driveFileId(f.url) ? 'DRIVE' : 'LINK') : 'PDF')
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
const SEARCH = 'M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16zM21 21l-4.3-4.3'
const CLOSE = 'M6 6l12 12M18 6L6 18'
const SUN = 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4'
const MOON = 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z'
const BOOK = 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19a2 2 0 0 1 2-2h13'

function Row({ n, icon, title, sub, badge, kind, dir, onClick }) {
  return (
    <button className={'row' + (dir ? ' dir' : '')} style={{ '--n': Math.min(n, 10) }} onClick={onClick}>
      <span className="ri"><Icon d={icon} /></span>
      <span className="rt"><b>{title}</b>{sub && <small>{sub}</small>}</span>
      {kind && <span className="chip">{kind}</span>}
      {badge != null && <em>{badge}</em>}
      <Icon d={ARROW} size={18} />
    </button>
  )
}

// Hosts that don't allow their files to be read by the in-page PDF reader (no CORS):
// those files get an "Open PDF" panel instead.
const NO_EMBED = /(^|\.)(drive\.google\.com|docs\.google\.com|dropbox\.com|onedrive\.live\.com|1drv\.ms|mega\.nz|mediafire\.com)$/i
function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}
// Google Drive share links -> the file id, so Drive's own viewer can be shown inside the panel.
function driveFileId(url) {
  try {
    const u = new URL(url)
    if (!/(^|\.)drive\.google\.com$/i.test(u.hostname)) return ''
    const m = u.pathname.match(/\/file\/d\/([\w-]{10,})/)
    if (m) return m[1]
    const id = u.searchParams.get('id') || ''
    return /^[\w-]{10,}$/.test(id) ? id : ''
  } catch { return '' }
}

// Navigation lives in real browser history (pushState / popstate), like the main site, so the
// phone's back gesture steps back one screen (close the reader -> up a folder -> year list)
// instead of leaving the page. The state holds ids only: y = year tab, t = folder ids from the
// subject down, f = open PDF id, s = a search is active.
const HOME = { y: 0, t: [], f: null, s: false }
const navFrom = (st) => (st && st.medpdf
  ? { y: st.y || 0, t: Array.isArray(st.t) ? st.t : [], f: st.f || null, s: !!st.s }
  : HOME)
const folderIndex = new Map()
;(function walk(nodes) {
  nodes.forEach((n) => { if (n.type === 'folder') { folderIndex.set(n.id, n); walk(n.children) } })
})(manifest)

export default function App() {
  const [nav, setNav] = useState(() => navFrom(window.history.state))
  const [query, setQuery] = useState('')
  const [light, setLight] = useState(() => getTheme() === 'light')

  // Move to a new screen. 'push' adds a history entry (back returns here); 'replace' swaps the current one.
  const go = (patch, mode = 'push') => {
    const next = { ...nav, ...patch }
    window.history[mode === 'replace' ? 'replaceState' : 'pushState']({ medpdf: true, ...next }, '')
    setNav(next)
  }
  const goBack = () => window.history.back()

  useEffect(() => {
    window.history.replaceState({ medpdf: true, ...navFrom(window.history.state) }, '') // base entry
    const onPop = (e) => {
      const n = navFrom(e.state)
      setNav(n)
      if (!n.s) setQuery('')
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const yearIdx = Math.min(nav.y, manifest.length - 1)
  const trail = nav.t.map((id) => folderIndex.get(id)).filter(Boolean)
  const year = manifest[yearIdx]
  const subjects = useMemo(() => subjectsFor(year), [year])
  const all = useMemo(() => flat(manifest), [])
  const fileById = useMemo(() => new Map(all.map((f) => [f.id, f])), [all])
  const file = nav.f ? fileById.get(nav.f) || null : null
  const subject = trail.length ? (subjects.find((s) => s.folder.id === trail[0].id) || { hue: 215 }) : null
  const q = query.trim().toLowerCase()
  const results = q ? all.filter((f) => (f.trail.join(' ') + ' ' + f.name).toLowerCase().includes(q)) : []
  const driveId = file?.external ? driveFileId(file.url) : ''
  const blocked = !!file?.external && NO_EMBED.test(hostOf(file.url))
  const cur = trail[trail.length - 1]

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && nav.f) window.history.back() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = file ? 'hidden' : ''
    return () => window.removeEventListener('keydown', onKey)
  }, [file, nav.f])

  const home = () => { go({ t: [], f: null, s: false }); setQuery('') }
  const open = (s) => go({ t: [s.folder.id] })
  const openFile = (f) => go({ f: f.id })
  const onSearch = (e) => {
    const v = e.target.value
    setQuery(v)
    if (v.trim() && !nav.s) go({ s: true })                                   // search starts: one history entry
    else if (!v.trim() && nav.s && !nav.f) window.history.back()              // emptied: leave the search entry
  }

  const totalPdfs = useMemo(() => all.length, [all])
  const yearCount = count(year)
  const toggleTheme = () => { const t = light ? 'dark' : 'light'; setTheme(t); setLight(t === 'light'); document.documentElement.classList.toggle('light', t === 'light') }
  const clearSearch = () => { setQuery(''); if (nav.s && !nav.f) window.history.back() }

  return (
    <>
      <header className="top">
        <div className="mp-logo-stack">
          <button className="mp-logo" onClick={home} title="MedPDF home" aria-label="MedPDF home">MedPDF</button>
          <a className="mp-by" href="/" title="Go to Med101">by <b>Med101</b></a>
        </div>
        <label className="search">
          <Icon d={SEARCH} size={18} />
          <input type="search" value={query} onChange={onSearch} placeholder="Search all PDFs" aria-label="Search PDFs" />
          {query && <button type="button" className="x" onClick={clearSearch} aria-label="Clear search"><Icon d={CLOSE} size={14} /></button>}
        </label>
        <button className="theme" onClick={toggleTheme} aria-label={light ? 'Switch to dark mode' : 'Switch to light mode'} title="Theme">
          <Icon d={light ? MOON : SUN} size={18} />
        </button>
      </header>

      <main>
        {q ? (
          <section key="search" className="view">
            <h2 className="title sm">{results.length} result{results.length === 1 ? '' : 's'} for “{query.trim()}”</h2>
            {results.length === 0 && (
              <div className="empty"><Icon d={SEARCH} size={30} /><b>Nothing matches</b><span>Try a subject, book or topic name.</span></div>
            )}
            <div className="rows">
              {results.map((f, i) => <Row key={f.id} n={i} icon={FILE} kind={kindOf(f)} title={f.name} sub={f.trail.join(' / ')} onClick={() => openFile(f)} />)}
            </div>
          </section>
        ) : subject ? (
          <section key={cur.id} className="view" style={{ '--h': subject.hue }}>
            <nav className="crumbs" aria-label="Breadcrumb">
              <button onClick={home}>{year.name}</button>
              {trail.map((t, i) => (
                <span key={t.id}>
                  <i>/ </i>
                  {i === trail.length - 1 ? <b>{t.name}</b> : <button onClick={() => go({ t: nav.t.slice(0, i + 1) })}>{t.name}</button>}
                </span>
              ))}
            </nav>
            <div className="vhead">
              <h2 className="title">{cur.name}</h2>
              <p className="meta">{count(cur) ? plural(count(cur)) : 'No PDFs yet'}</p>
            </div>
            {cur.children.length === 0 && (
              <div className="empty">
                <Icon d={FOLDER} size={30} />
                <b>Nothing here yet</b>
                <span>Add files to <code>public/medpdf/pdfs/{year.name}/{trail.map((t) => t.name).join('/')}/</code></span>
              </div>
            )}
            <div className="rows">
              {cur.children.map((c, i) =>
                c.type === 'folder' ? (
                  <Row key={c.id} n={i} dir icon={FOLDER} title={c.name} badge={count(c)} onClick={() => go({ t: [...nav.t, c.id] })} />
                ) : (
                  <Row key={c.id} n={i} icon={FILE} kind={kindOf(c)} title={c.name} onClick={() => openFile(c)} />
                ),
              )}
            </div>
          </section>
        ) : (
          <>
            <section className="hero">
              <span className="eyebrow"><i /> Free study library for MBBS students</span>
              <h1><span className="ln"><span>Every PDF you need,</span></span><span className="ln"><span>one tap away.</span></span></h1>
              <div className="stats">
                <span className="stat"><b>{totalPdfs}</b>PDFs</span>
                <span className="stat"><b>{manifest.reduce((n, y) => n + subjectsFor(y).length, 0)}</b>subjects</span>
                <span className="stat"><b>{yearCount}</b>in {year.name}</span>
              </div>
              <div className="years" style={{ '--i': yearIdx }} role="tablist">
                <b className="pill" aria-hidden="true" />
                {manifest.map((y, i) => (
                  <button key={y.id} role="tab" aria-selected={i === yearIdx} onClick={() => { go({ y: i, t: [], f: null, s: false }, 'replace'); setQuery('') }}>{y.name}</button>
                ))}
              </div>
            </section>
            <section className="grid" key={year.id}>
              {subjects.length === 0 && <div className="empty" style={{ gridColumn: '1 / -1' }}><Icon d={BOOK} size={30} /><b>Coming soon</b><span>Subjects for {year.name} are on the way.</span></div>}
              {subjects.map((s, i) => {
                const n = count(s.folder)
                return (
                  <button key={s.name} className="card" style={{ '--h': s.hue, '--n': i }} onClick={() => open(s)}>
                    <span className="cdot"><Icon d={BOOK} size={20} /></span>
                    <span className="cn">{s.name}</span>
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
      <footer>MedPDF is part of <a href="/">Med101</a> · Learn. Practice. Improve.</footer>

      {file && (
        <div className="viewer" onClick={goBack}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="vbar">
              <span>{file.name}</span>
              {driveId ? (
                <a href={file.url} target="_blank" rel="noreferrer">Open in Google Drive ↗</a>
              ) : !blocked && (
                <>
                  <a href={file.url} target="_blank" rel="noreferrer">Open in new tab</a>
                  <a href={file.url} download>Download</a>
                </>
              )}
              <button onClick={goBack}>Close</button>
            </div>
            {driveId && <div className="vhint">Preview from Google Drive. If it doesn&rsquo;t load, tap &ldquo;Open in Google Drive&rdquo;.</div>}
            <div className="pdfwrap">
              {driveId ? (
                <iframe className="drive-frame" src={`https://drive.google.com/file/d/${driveId}/preview`} title={file.name} allow="autoplay" />
              ) : blocked ? (
                <div className="ak-pdf-status">
                  <div>
                    This PDF is hosted on {hostOf(file.url)}.<br />Open it there to read or download.
                    <br />
                    <a className="ext-open" href={file.url} target="_blank" rel="noreferrer">Open PDF ↗</a>
                  </div>
                </div>
              ) : (
                <PdfPages key={file.url} url={file.url} />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
