import './SubjectCard.css';

// Old site's .subj-card layout exactly (flat glass row, emoji left,
// text stacked, chevron right) — plus one flourish kept from the
// earlier design: an animated pulse-trace line, accented per-subject.
const TRACE_COLORS = ['#18e8ff', '#30f28a', '#ffcc2a', '#ff3a5c', '#b48eff', '#ff6eb4'];
function traceColorFor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return TRACE_COLORS[hash % TRACE_COLORS.length];
}

export default function SubjectCard({ emoji, name, desc, questionCount, topicCount, onClick }) {
  const accent = traceColorFor(name);

  return (
    <button className="subj-card" onClick={onClick}>
      <span className="subj-emoji">{emoji}</span>
      <span className="subj-card-text">
        <span className="subj-name">{name}</span>
        <span className="subj-count">
          {desc}
          {(topicCount != null || questionCount != null) && (
            <> — {topicCount != null && `${topicCount} topics`}{topicCount != null && questionCount != null && ', '}{questionCount != null && `${questionCount} questions`}</>
          )}
        </span>

        <span className="subj-trace" aria-hidden="true" style={{ '--trace-color': accent }}>
          <svg viewBox="0 0 200 30" preserveAspectRatio="none">
            <path
              className="subj-trace-line"
              d="M0,15 L28,15 L36,4 L44,26 L52,15 L68,15 L76,7 L84,23 L92,15 L200,15"
            />
          </svg>
        </span>

        <span className="subj-meta">
          {topicCount != null && <span>{topicCount} topics</span>}
          {questionCount != null && <span>{questionCount} questions</span>}
        </span>
      </span>
      <span className="subj-arrow">›</span>
    </button>
  );
}
