// Scans public/medpdf/pdfs and writes src/medpdf/manifest.json (served at /medpdf).
// Layout: public/medpdf/pdfs/<Year>/<Subject>/<Topic (optional, any depth)>/<file>.pdf
// Big PDFs (over GitHub's 100 MB limit) can live elsewhere: list them in
// public/medpdf/pdfs/links.json and they show up in the library next to the uploaded ones.
import fs from 'node:fs'
import path from 'node:path'

const ROOT = 'public/medpdf/pdfs'
const LINKS_FILE = 'public/medpdf/pdfs/links.json'
const YEARS = ['1st Year', '2nd Year', '3rd Year', '4th Year']
const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })

function scan(dir, rel) {
  if (!fs.existsSync(dir)) return []
  const entries = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => !e.name.startsWith('.'))
  const folders = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort(natural)
  const files = entries.filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.pdf')).map((e) => e.name).sort(natural)
  return [
    ...folders.map((name) => ({ type: 'folder', id: `${rel}/${name}`, name, children: scan(path.join(dir, name), `${rel}/${name}`) })),
    ...files.map((name) => ({
      type: 'file',
      id: `${rel}/${name}`,
      name: name.replace(/\.pdf$/i, ''),
      url: '/medpdf/pdfs/' + `${rel}/${name}`.split('/').map(encodeURIComponent).join('/'),
    })),
  ]
}

const tree = YEARS.map((y) => ({ type: 'folder', id: y, name: y, children: scan(path.join(ROOT, y), y) }))

// ── Externally hosted PDFs: { "links": [ { "path": "1st Year/Anatomy/<Topic>/<Display name>", "url": "https://..." } ] }
const sortNode = (n) => {
  if (!n.children) return
  n.children.sort((x, y) => (x.type === y.type ? natural(x.name, y.name) : x.type === 'folder' ? -1 : 1))
  n.children.forEach(sortNode)
}
function addExternalLinks() {
  if (!fs.existsSync(LINKS_FILE)) return 0
  let data
  try {
    data = JSON.parse(fs.readFileSync(LINKS_FILE, 'utf8'))
  } catch (e) {
    console.warn(`links.json is not valid JSON (${e.message}) - external links skipped`)
    return 0
  }
  let added = 0
  for (const item of data.links || []) {
    const parts = String(item.path || '').split('/').map((p) => p.trim()).filter(Boolean)
    const url = String(item.url || '').trim()
    if (parts.length < 3 || !/^https?:\/\//i.test(url)) {
      console.warn(`links.json: skipped ${JSON.stringify(item.path)} - needs "Year/Subject/Name" and an http(s) url`)
      continue
    }
    let node = tree.find((y) => y.name.toLowerCase() === parts[0].toLowerCase())
    if (!node) {
      console.warn(`links.json: skipped ${JSON.stringify(item.path)} - year must be one of ${YEARS.join(', ')}`)
      continue
    }
    for (const folder of parts.slice(1, -1)) {
      let next = node.children.find((c) => c.type === 'folder' && c.name.toLowerCase() === folder.toLowerCase())
      if (!next) {
        next = { type: 'folder', id: `${node.id}/${folder}`, name: folder, children: [] }
        node.children.push(next)
      }
      node = next
    }
    const name = parts[parts.length - 1]
    const id = `${node.id}/${name}`
    if (node.children.some((c) => c.id === id)) continue
    node.children.push({ type: 'file', id, name, url, external: true })
    added++
  }
  if (added) tree.forEach(sortNode)
  return added
}
const external = addExternalLinks()
fs.writeFileSync('src/medpdf/manifest.json', JSON.stringify(tree, null, 2))
console.log('manifest: ' + (JSON.stringify(tree).split('"type":"file"').length - 1) + ' PDFs' + (external ? ` (${external} external)` : ''))
