import { useMemo } from 'react';
import ScreenHeader from './ScreenHeader';
import EmptyIllustration from './EmptyIllustration';
import './AnswerKey.css';

// Each PDF is explicitly assigned to a semester, so students only see
// answer keys for the semester they are currently viewing.
const ANSWER_KEY_PDFS = [
  {
    semesterId: 'y2s1',
    subject: 'Physiology 2',
    filename: 'physiology-2.pdf',
    path: '/answer-keys/semester-3/physiology-2.pdf',
  },
];

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
  const pdfs = useMemo(
    () => ANSWER_KEY_PDFS.filter((pdf) => pdf.semesterId === activeSemesterId),
    [activeSemesterId],
  );

  return (
    <div className="std-screen wf-screen ak-pdf-screen">
      <ScreenHeader onBack={onBack} title="Answer Key">
        {semesterLabel} PDFs
      </ScreenHeader>

      {pdfs.length === 0 ? (
        <div className="wf-empty">
          <EmptyIllustration kind="search" />
          <div className="wf-empty-t">No answer-key PDFs yet</div>
          <div className="wf-empty-s">
            Answer-key PDFs for {semesterLabel} will appear here when they are uploaded.
          </div>
        </div>
      ) : (
        <section className="ak-pdf-list" aria-label={semesterLabel + ' answer-key PDFs'}>
          {pdfs.map((pdf) => (
            <article className="ak-pdf-card" key={pdf.filename}>
              <div className="ak-pdf-icon" aria-hidden="true">PDF</div>
              <div className="ak-pdf-info">
                <div className="ak-pdf-title">{pdf.subject}</div>
                <div className="ak-pdf-subtitle">{semesterLabel} · PDF document</div>
              </div>
              <div className="ak-pdf-actions">
                <a className="ak-pdf-btn" href={pdf.path} target="_blank" rel="noreferrer">View PDF</a>
                <a className="ak-pdf-btn ak-pdf-btn-secondary" href={pdf.path} download={pdf.filename}>Download</a>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
