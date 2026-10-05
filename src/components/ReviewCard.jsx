import { useState } from 'react';
import { Highlight } from './QuestionListCard';

// One row in the Wrong Questions / Important Marked lists. Collapsed it shows just the question,
// the correct answer and a quiet meta line; tap the row to see every option
// and the remove action. Rows sit in a shared list (dividers, no boxes).
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

export default function ReviewCard({ item, kind, term, onRemove, removeLabel }) {
  const [open, setOpen] = useState(false);
  const options = Array.isArray(item.o) ? item.o : [];
  const answer = options[item.c];
  // What the student chose (wrong list only; older entries never saved it).
  const picked = kind === 'wrong' && Number.isInteger(item.picked) ? item.picked : null;
  const pickedText = picked !== null && picked >= 0 && picked !== item.c ? options[picked] : undefined;
  const timedOut = picked === -2;
  const when = kind === 'wrong' ? ago(item.lastWrongAt) : ago(item.flaggedAt);
  const meta = [item.s, when && `${kind === 'wrong' ? 'Missed' : 'Marked'} ${when}`].filter(Boolean).join(' · ');
  // Only open a row by itself when the search hit is hidden: inside an option
  // that is not the correct answer, and not in the question/answer already shown.
  const has = (x) => typeof x === 'string' && x.toLowerCase().includes(term.toLowerCase());
  const shownHit = !!term && (has(item.q) || has(answer) || has(pickedText));
  const hiddenHit = !!term && options.some((o, i) => i !== item.c && i !== picked && has(o));
  const expanded = open || (!shownHit && hiddenHit);

  return (
    <article className="wf-row">
      <button type="button" className="wf-row-head" aria-expanded={expanded} onClick={() => setOpen((v) => !v)}>
        <span className="wf-row-main">
          <span className="wf-q"><Highlight text={item.q} term={term} /></span>
          {pickedText !== undefined && (
            <span className="wf-ans bad">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              <span><Highlight text={String(pickedText)} term={term} /></span>
            </span>
          )}
          {timedOut && (
            <span className="wf-ans bad">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2M9.5 2.5h5" /></svg>
              <span>Ran out of time</span>
            </span>
          )}
          {answer !== undefined && (
            <span className="wf-ans">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
              <span><Highlight text={String(answer)} term={term} /></span>
            </span>
          )}
          {meta && <span className="wf-meta">{meta}</span>}
        </span>
        <svg className="wf-chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>

      <div className="wf-detail" data-open={expanded ? '1' : '0'}>
        <div className="wf-detail-in">
          <div className="wf-opts">
            {options.map((opt, i) => (
              <div key={i} className={i === item.c ? 'wf-opt ok' : i === picked ? 'wf-opt bad' : 'wf-opt'}>
                <span className="wf-opt-l">{LABELS[i]}</span>
                <span className="wf-opt-t"><Highlight text={String(opt)} term={term} /></span>
                {i === picked && i !== item.c && <span className="wf-opt-tag">Your answer</span>}
              </div>
            ))}
          </div>
          {onRemove && (
            <button type="button" className="wf-remove" onClick={onRemove} aria-label={removeLabel}>
              {kind === 'wrong' ? 'Remove from list' : 'Unmark'}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
