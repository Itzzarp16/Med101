import { useMemo, useState } from 'react'
import manifest from './manifest.json'

const flatten = (nodes, trail = []) =>
  nodes.flatMap((n) => (n.type === 'file' ? [{ ...n, trail }] : flatten(n.children, [...trail, n.name])))
const countFiles = (n) => (n.type === 'file' ? 1 : n.children.reduce((s, c) => s + countFiles(c), 0))

function Branch({ node, open, toggle, pick, activeId }) {
  if (node.type === 'file') {
    return (
      <li>
        <button className={'leaf' + (activeId === node.id ? ' on' : '')} onClick={() => pick(node)}>
          {node.name}
        </button>
      </li>
    )
  }
  const isOpen = open.has(node.id)
  return (
    <li>
      <button className="folder" aria-expanded={isOpen} onClick={() => toggle(node.id)}>
        <span className={'caret' + (isOpen ? ' down' : '')} aria-hidden="true" />
        {node.name}
        <small>{countFiles(node)}</small>
      </button>
      {isOpen && (
        <ul>
          {node.children.length === 0 && <li className="empty">Empty folder</li>}
          {node.children.map((c) => (
            <Branch key={c.id} node={c} open={open} toggle={toggle} pick={pick} activeId={activeId} />
          ))}
        </ul>
      )}
    </li>
  )
}

export default function App() {
  const [yearId, setYearId] = useState(manifest[0].id)
  const [open, setOpen] = useState(() => new Set())
  const [query, setQuery] = useState('')
  const [file, setFile] = useState(null)

  const year = manifest.find((y) => y.id === yearId)
  const all = useMemo(() => flatten(manifest), [])
  const q = query.trim().toLowerCase()
  const results = q ? all.filter((f) => (f.trail.join(' ') + ' ' + f.name).toLowerCase().includes(q)) : []

  const toggle = (id) =>
    setOpen((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })

  return (
    <div className="app">
      <header>
        <h1>Resource Root</h1>
        <input
          type="search"
          placeholder="Search subjects, topics and PDFs"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search"
        />
        <nav aria-label="Year">
          {manifest.map((y) => (
            <button key={y.id} className={y.id === yearId ? 'on' : ''} onClick={() => { setYearId(y.id); setQuery('') }}>
              {y.name}
            </button>
          ))}
        </nav>
      </header>

      <main>
        <section className="tree">
          {q ? (
            <ul>
              {results.length === 0 && <li className="empty">No PDF matches “{query}”.</li>}
              {results.map((f) => (
                <li key={f.id}>
                  <button className={'leaf result' + (file?.id === f.id ? ' on' : '')} onClick={() => setFile(f)}>
                    {f.name}
                    <small>{f.trail.join(' / ')}</small>
                  </button>
                </li>
              ))}
            </ul>
          ) : countFiles(year) === 0 && year.children.length === 0 ? (
            <p className="empty">
              No folders yet. Add PDFs under <code>public/medpdf/pdfs/{year.name}/Subject/</code> and restart the dev server.
            </p>
          ) : (
            <ul>
              {year.children.map((c) => (
                <Branch key={c.id} node={c} open={open} toggle={toggle} pick={setFile} activeId={file?.id} />
              ))}
            </ul>
          )}
        </section>

        <section className="viewer">
          {file ? (
            <>
              <div className="bar">
                <span>{file.name}</span>
                <a href={file.url} target="_blank" rel="noreferrer">Open in new tab</a>
              </div>
              <iframe key={file.id} src={file.url} title={file.name} />
            </>
          ) : (
            <p className="empty">Pick a PDF from the tree to read it here.</p>
          )}
        </section>
      </main>
    </div>
  )
}
