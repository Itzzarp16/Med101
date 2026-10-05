import { useState } from 'react';

// One question in the Wrong & Flagged review list. Shows the question and the
// correct answer up front (that's what you came to review); the other
// options fold away behind a tap so long lists stay easy to scan.
const LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];

function ago(ts) {
  const d = ts && typeof ts.toDate === 'function' ? ts.toDate() : null;
  if (!d) return '';
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return 'just now';
  const m = s / 60;
  if (m < 60) return `${Math.floor(m)}m ago`;
  const h = m / 60;
  if (h < 24) return `${Math.floor(h)}h ago`;
  const days = h / 24;
  if (days < 30) return `${Math.floor(days)}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function ReviewCard({ item, kind, onRemove, removeLabel }) {
  const [open, setOpen] = useState(false);
  const options = Array.isArray(item.o) ? item.o : [];
  const when = kind === 'wrong' ? ago(item.lastWrongAt) : ago(item.flaggedAt);
  const whenLabel = when ? `${kind === 'wrong' ? 'Missed' : 'Flagged'} ${when}` : '';

  return (
    <article className="wf-card" data-kind={kind}>
      <div className="wf-card-top">
        <span className="wf-topic" title={item.s}><i aria-hidden="true" />{item.s}</span>
        {whenLabel && <span className="wf-when">{whenLabel}</span>}
        {onRemove && (
          <button type="button" className="wf-x" onClick={onRemove} aria-label={removeLabel}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        )}
      </div>

      <p className="wf-q">{item.q}</p>

      {options[item.c] !== undefined && (
        <div className="wf-answer">
          <span className="wf-answer-l">{LABELS[item.c]}</span>
          <span className="wf-answer-t">{options[item.c]}</span>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-label="Correct answer"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        </div>
      )}

      {options.length > 1 && (
        <>
          <button type="button" className="wf-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {open ? 'Hide options' : 'Show all options'}
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
          </button>
          <div className="wf-opts-wrap" data-open={open ? '1' : '0'}>
            <div className="wf-opts">
              {options.map((opt, i) => (
                <div key={i} className={i === item.c ? 'wf-opt ok' : 'wf-opt'}>
                  <span className="wf-opt-l">{LABELS[i]}</span>
                  <span className="wf-opt-t">{opt}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </article>
  );
}
