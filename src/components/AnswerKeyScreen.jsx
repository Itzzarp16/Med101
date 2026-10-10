import { useEffect, useMemo, useState } from 'react';
import ScreenHeader from './ScreenHeader';
import EmptyIllustration from './EmptyIllustration';
import './AnswerKey.css';

const SEMESTER_LABELS = {
  y1s1: 'Semester 1',
  y1s2: 'Semester 2',
  y2s1: 'Semester 3',
  y2s2: 'Semester 4',
  y3s1: 'Semester 5',
  y3s2: 'Semester 6',
};

export default function AnswerKeyScreen({ activeSemesterId, onBack }) {
  const semesterLabel = SEMESTER_LABELS[activeSemesterId] || 'Your Semester';
  const [pdfs, setPdfs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [viewingPdf, setViewingPdf] = useState(null);

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

  if (viewingPdf) {
    const viewerUrl = `${viewingPdf.path}#toolbar=0&navpanes=0&scrollbar=1&view=FitH`;
    return (
      <div className="std-screen wf-screen ak-pdf-screen ak-pdf-viewer-screen">
        <ScreenHeader onBack={() => setViewingPdf(null)} title={viewingPdf.subject}>
          {semesterLabel} · Answer Key PDF
        </ScreenHeader>
        <div className="ak-viewer-toolbar">
          <span className="ak-viewer-label"><span className="ak-viewer-dot" /> PDF DOCUMENT</span>
          <a className="ak-pdf-btn ak-viewer-download" href={viewingPdf.path} download={viewingPdf.filename}>Download PDF</a>
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
        {semesterLabel} PDFs
      </ScreenHeader>

      {loading ? (
        <div className="wf-empty"><div className="wf-empty-s">Loading answer-key PDFs…</div></div>
      ) : loadError ? (
        <div className="wf-empty">
          <EmptyIllustration kind="search" />
          <div className="wf-empty-t">Could not load answer keys</div>
          <div className="wf-empty-s">Check your connection and try opening this page again.</div>
        </div>
      ) : semesterPdfs.length === 0 ? (
        <div className="wf-empty">
          <EmptyIllustration kind="search" />
          <div className="wf-empty-t">No answer-key PDFs yet</div>
          <div className="wf-empty-s">
            Answer-key PDFs for {semesterLabel} will appear here when they are uploaded.
          </div>
        </div>
      ) : (
        <section className="ak-pdf-list" aria-label={semesterLabel + ' answer-key PDFs'}>
          {semesterPdfs.map((pdf) => (
            <article className="ak-pdf-card" key={pdf.semesterId + '-' + pdf.filename}>
              <div className="ak-pdf-icon" aria-hidden="true">PDF</div>
              <div className="ak-pdf-info">
                <div className="ak-pdf-title">{pdf.subject}</div>
                <div className="ak-pdf-subtitle">{semesterLabel} · PDF document</div>
              </div>
              <div className="ak-pdf-actions">
                <button className="ak-pdf-btn" type="button" onClick={() => setViewingPdf(pdf)}>View PDF</button>
                <a className="ak-pdf-btn ak-pdf-btn-secondary" href={pdf.path} download={pdf.filename}>Download</a>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
