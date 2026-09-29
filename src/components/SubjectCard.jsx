import './SubjectCard.css';

// Old site's .subj-card layout exactly (flat glass row, emoji left,
// text stacked, chevron right). The animated pulse-trace line is only
// shown on the Dashboard's "Choose a Subject" grid (trace=true there),
// not on the Subtopic screen, which reuses this same component.
const TRACE_COLORS = ['#4a6f94', '#30f28a', '#ffcc2a', '#ff3a5c', '#6b6f8a', '#8a6f7a'];
function traceColorFor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return TRACE_COLORS[hash % TRACE_COLORS.length];
}

export default function SubjectCard({ emoji, name, desc, questionCount, topicCount, trace, progress, onClick }) {
  const accent = trace ? traceColorFor(name) : null;

  return (
    <button className={trace ? 'subj-card subj-card--dash' : 'subj-card'} onClick={onClick}>
      <span className="subj-emoji">{emoji}</span>
      <span className="subj-card-text">
        <span className="subj-name">{name}</span>
        {desc && <span className="subj-count">{desc}</span>}

        <span className="subj-foot">
          <span className="subj-meta">
            {topicCount != null && <span>{topicCount} {topicCount === 1 ? 'topic' : 'topics'}</span>}
            {questionCount != null && <span>{questionCount} {questionCount === 1 ? 'question' : 'questions'}</span>}
          </span>
          {trace && (
            <span className={progress ? 'subj-trace active' : 'subj-trace'} aria-hidden="true" style={{ '--trace-color': accent }}>
              <svg viewBox="0 0 200 30" preserveAspectRatio="none">
                <path
                  className="subj-trace-line"
                  d="M0,15 L28,15 L36,4 L44,26 L52,15 L68,15 L76,7 L84,23 L92,15 L200,15"
                />
              </svg>
            </span>
          )}
        </span>

        {progress && (
          <span className="subj-progress">
            <span className="subj-progress-bar" aria-hidden="true">
              <span style={{ width: `${questionCount ? Math.min(100, (progress.answered / questionCount) * 100) : 0}%` }} />
            </span>
            <span className="subj-progress-text">{progress.answered} answered · {progress.pct}% accuracy</span>
          </span>
        )}
      </span>
      <span className="subj-arrow">›</span>
    </button>
  );
}
