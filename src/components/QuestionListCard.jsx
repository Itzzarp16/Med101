import QImage from './QImage';
// Shared card for a question in a list (Search results, Wrong & Flagged):
// badges + optional remove button, the question, and its options with the
// correct one marked. `term` highlights search matches.
const LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];

export function Highlight({ text, term }) {
  if (!term) return text;
  const idx = text.toLowerCase().indexOf(term.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="lu-mark">{text.slice(idx, idx + term.length)}</mark>
      {text.slice(idx + term.length)}
    </>
  );
}

export default function QuestionListCard({ item, badges, term, onRemove, removeLabel }) {
  return (
    <div className="lu-card glass">
      <div className="lu-card-top">
        <div className="lu-badges">{badges}</div>
        {onRemove && (
          <button type="button" className="lu-x" onClick={onRemove} aria-label={removeLabel}>✕</button>
        )}
      </div>
      <p className="lu-q"><Highlight text={item.q} term={term} /></p>
      <QImage srcs={item.img} />
      <div className="lu-opts">
        {item.o.map((opt, i) => (
          <div key={i} className={i === item.c ? 'lu-opt ok' : 'lu-opt'}>
            <span className="lu-opt-l">{LABELS[i]}</span>
            <span className="lu-opt-t"><Highlight text={opt} term={term} /></span>
            {i === item.c && <span className="lu-opt-tick" aria-label="Correct answer">✓</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
