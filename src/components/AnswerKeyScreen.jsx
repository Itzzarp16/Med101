import { useEffect, useMemo, useState } from 'react';
import ScreenHeader from './ScreenHeader';
import './AnswerKey.css';

const SEMESTER_LABELS = {
  y1s1: 'Semester 1',
  y1s2: 'Semester 2',
  y2s1: 'Semester 3',
  y2s2: 'Semester 4',
  y3s1: 'Semester 5',
  y3s2: 'Semester 6',
};

function DocumentMark() {
  return (
    <svg viewBox="0 0 28 32" aria-hidden="true" className="ak-doc-svg">
      <path d="M5 1.5h11l7 7V28a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 5 28V4a2.5 2.5 0 0 1 2.5-2.5Z" />
      <path d="M16 2v7h7M9 16h10M9 20h10M9 24h7" />
    </svg>
  );
}

export default function AnswerKeyScreen({ activeSemesterId, onBack }) {
  const semesterLabel = SEMESTER_LABELS[activeSemesterId] || 'Your Semester';
  const [pdfs, setPdfs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [viewingPdf, setViewingPdf] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    let alive = true;
    fetch('/answer-keys/manifest.json', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error('Could not load answer keys.');
        return response.json();
      })
      .then((data) => {
        if (!alive) return;
        setPdfs(Array.isArray(data.pdfs) ? data.pdfs : []);
        setLoadError(false);
      })
      .catch(() => { if (alive) setLoadError(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const semesterPdfs = useMemo(
    () => pdfs.filter((pdf) => pdf.semesterId === activeSemesterId),
    [pdfs, activeSemesterId],
  );
  const filteredPdfs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return semesterPdfs;
    return semesterPdfs.filter((pdf) => pdf.subject.toLowerCase().includes(query));
  }, [semesterPdfs, searchQuery]);

  if (viewingPdf) {
    const viewerUrl = `${viewingPdf.path}#toolbar=0&navpanes=0&scrollbar=1&view=FitH`;
    return (
      <div className="std-screen wf-screen ak-pdf-screen ak-pdf-viewer-screen">
        <ScreenHeader onBack={() => setViewingPdf(null)} title={viewingPdf.subject}>
          {semesterLabel} · Answer Key
        </ScreenHeader>
        <div className="ak-viewer-toolbar">
          <span className="ak-viewer-label"><span className="ak-viewer-dot" /> PDF DOCUMENT</span>
          <a className="ak-action ak-action-primary" href={viewingPdf.path} download={viewingPdf.filename}>
            <span aria-hidden="true">↓</span> Download
          </a>
        </div>
        <div className="ak-viewer-frame-wrap">
          <iframe className="ak-viewer-frame" src={viewerUrl} title={`${viewingPdf.subject} answer key PDF`} />
        </div>
      </div>
    );
  }

  return (
    <div className="std-screen wf-screen ak-pdf-screen">
      <ScreenHeader onBack={onBack} title="Answer Key">
        Your revision library
      </ScreenHeader>

      <div className="ak-simple-heading">
        <h2>{semesterLabel}</h2>
        <p>Answer keys</p>
      </div>

      <div className="ak-library-heading">
        <div>
          <h3>Available documents</h3>
          <p>Choose a subject to open its answer key.</p>
        </div>
        {!loading && !loadError && semesterPdfs.length > 0 && (
          <span className="ak-count">{filteredPdfs.length} / {semesterPdfs.length}</span>
        )}
      </div>

      {!loading && !loadError && semesterPdfs.length > 0 && (
        <label className="ak-search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" /></svg>
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search subjects…"
            aria-label="Search answer keys"
          />
          {searchQuery && <button type="button" onClick={() => setSearchQuery('')} aria-label="Clear search">×</button>}
        </label>
      )}

      {loading ? (
        <div className="ak-loading-list" aria-label="Loading answer keys">
          {[1, 2, 3].map((item) => <div className="ak-skeleton" key={item}><span /><div><i /><i /></div><b /></div>)}
        </div>
      ) : loadError ? (
        <div className="ak-state-card">
          <div className="ak-state-icon">!</div>
          <h3>Couldn’t load the library</h3>
          <p>Check your connection and try opening this page again.</p>
        </div>
      ) : semesterPdfs.length === 0 ? (
        <div className="ak-state-card">
          <div className="ak-state-icon"><DocumentMark /></div>
          <h3>Your library is getting ready</h3>
          <p>Answer keys for {semesterLabel} will appear here as soon as they’re uploaded.</p>
        </div>
      ) : filteredPdfs.length === 0 ? (
        <div className="ak-state-card ak-state-compact">
          <div className="ak-state-icon">⌕</div>
          <h3>No matching subjects</h3>
          <p>Try another search term.</p>
          <button className="ak-text-action" type="button" onClick={() => setSearchQuery('')}>Clear search</button>
        </div>
      ) : (
        <section className="ak-pdf-list" aria-label={semesterLabel + ' answer-key PDFs'}>
          {filteredPdfs.map((pdf, index) => (
            <article className="ak-pdf-card" key={pdf.semesterId + '-' + pdf.filename} style={{ '--ak-index': Math.min(index, 8) }}>
              <div className="ak-pdf-icon"><DocumentMark /><span>PDF</span></div>
              <div className="ak-pdf-info">
                <div className="ak-pdf-title">{pdf.subject}</div>
                <div className="ak-pdf-subtitle"><span className="ak-file-dot" /> {semesterLabel} <span className="ak-subtitle-sep">/</span> PDF document</div>
              </div>
              <div className="ak-pdf-actions">
                <button className="ak-action ak-action-primary" type="button" onClick={() => setViewingPdf(pdf)}>
                  Open answer key <span aria-hidden="true">↗</span>
                </button>
                <a className="ak-action ak-action-secondary" href={pdf.path} download={pdf.filename} aria-label={`Download ${pdf.subject} answer key`}>
                  <span aria-hidden="true">↓</span>
                </a>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
