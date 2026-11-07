import { useState } from 'react';
import { auth } from '../lib/firebase';
import { SUBJECTS } from '../medpdf/subjects.js';

const YEARS = ['1st Year', '2nd Year', '3rd Year', '4th Year'];

// "Add PDF link" - for PDFs too big to upload (GitHub's limit is 100 MB). The link is saved
// to public/medpdf/pdfs/links.json through /api/upload-questions (uploadType 'pdfLink'),
// and the /medpdf library lists it after the site redeploys.
export default function AdminPdfLinkCard() {
  const [year, setYear] = useState(YEARS[0]);
  const [subject, setSubject] = useState('');
  const [customSubject, setCustomSubject] = useState('');
  const [folder, setFolder] = useState('');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);

  const known = (SUBJECTS[year] || []).map((s) => s.name);
  const subjectValue = (known.length === 0 || subject === '__custom__' ? customSubject : subject).trim();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess(null);
    if (!subjectValue || !name.trim() || !url.trim()) {
      setError('Pick a subject, then enter a name and the link.');
      return;
    }
    const user = auth.currentUser;
    if (!user) {
      setError('Please sign in again.');
      return;
    }
    setBusy(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch('/api/upload-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ uploadType: 'pdfLink', year, subject: subjectValue, folder: folder.trim(), name: name.trim(), url: url.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setSuccess(data);
      setName('');
      setUrl('');
    } catch (err) {
      setError(err.message || 'Could not save the link.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="std-header" style={{ marginTop: 28 }}>
        <h2 className="std-title">🔗 Add PDF Link</h2>
        <p className="std-sub">
          For PDFs too big to upload (over 100 MB). Host the file somewhere else (Google Drive works: set sharing to
          &quot;Anyone with the link&quot;) and paste its link here. It shows up in the PDF library at med101.space/medpdf
          after the site redeploys, about a minute.
        </p>
      </div>
      <form className="glass std-card" onSubmit={handleSubmit}>
        <label className="auth-label" htmlFor="pdf-link-year">Year</label>
        <select id="pdf-link-year" className="auth-input" value={year} onChange={(e) => { setYear(e.target.value); setSubject(''); setCustomSubject(''); }}>
          {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>

        <label className="auth-label" htmlFor="pdf-link-subject">Subject</label>
        {known.length > 0 ? (
          <>
            <select id="pdf-link-subject" className="auth-input" value={subject} onChange={(e) => setSubject(e.target.value)}>
              <option value="">Select a subject…</option>
              {known.map((n) => <option key={n} value={n}>{n}</option>)}
              <option value="__custom__">Other — enter subject name</option>
            </select>
            {subject === '__custom__' && (
              <input className="auth-input" type="text" maxLength={80} placeholder="Enter subject name" value={customSubject} onChange={(e) => setCustomSubject(e.target.value)} />
            )}
          </>
        ) : (
          <input id="pdf-link-subject" className="auth-input" type="text" maxLength={80} placeholder="Enter subject name" value={customSubject} onChange={(e) => setCustomSubject(e.target.value)} />
        )}

        <label className="auth-label" htmlFor="pdf-link-folder">Folder (optional)</label>
        <input id="pdf-link-folder" className="auth-input" type="text" maxLength={160} placeholder="e.g. Textbooks" value={folder} onChange={(e) => setFolder(e.target.value)} />

        <label className="auth-label" htmlFor="pdf-link-name">Name students will see</label>
        <input id="pdf-link-name" className="auth-input" type="text" maxLength={120} placeholder="e.g. BD Chaurasia Vol 2" value={name} onChange={(e) => setName(e.target.value)} />

        <label className="auth-label" htmlFor="pdf-link-url">Link</label>
        <input id="pdf-link-url" className="auth-input" type="url" inputMode="url" placeholder="https://drive.google.com/file/d/…/view" value={url} onChange={(e) => setUrl(e.target.value)} />

        <button className="btn-glow std-save-btn" type="submit" disabled={busy}>
          {busy ? 'Saving to GitHub…' : 'Add to library'}
        </button>
        {error && <div className="auth-msg error" role="alert" style={{ display: 'block' }}>{error}</div>}
        {success && (
          <div className="auth-msg success" role="status" style={{ display: 'block' }}>
            <strong>{success.replaced ? 'Link updated.' : 'Link added.'}</strong> {success.path}
            <div style={{ marginTop: 6 }}>{success.message}</div>
          </div>
        )}
      </form>
    </>
  );
}
