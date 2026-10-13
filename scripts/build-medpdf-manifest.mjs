// Scans public/medpdf/pdfs and writes src/medpdf/manifest.json (served at /medpdf).
// Layout: public/medpdf/pdfs/<Year>/<Subject>/<Topic (optional, any depth)>/<file>.pdf
import fs from 'node:fs'
import path from 'node:path'

const ROOT = 'public/medpdf/pdfs'
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
fs.writeFileSync('src/medpdf/manifest.json', JSON.stringify(tree, null, 2))
console.log('manifest: ' + (JSON.stringify(tree).split('"type":"file"').length - 1) + ' PDFs')
