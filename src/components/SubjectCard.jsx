import './SubjectCard.css';

// The signature UI element from the design plan: each subject reads like
// a vitals-monitor tile rather than a flat progress bar. `masteryPct` is
// optional for now (no per-user progress tracking wired up yet) — when
// absent, the trace just idles instead of showing a ring reading.
export default function SubjectCard({ emoji, name, desc, questionCount, topicCount, accent, masteryPct, onClick }) {
  const accentColor = accent && accent.startsWith('var(') ? accent : accent || 'var(--cyan)';

  return (
    <button className="subject-card glass" style={{ '--card-accent': accentColor }} onClick={onClick}>
      <div className="subject-card-top">
        <span className="subject-card-emoji">{emoji}</span>
        {typeof masteryPct === 'number' && (
          <div className="mastery-ring" aria-label={`${masteryPct}% mastery`}>
            <svg viewBox="0 0 36 36">
              <path className="mastery-ring-bg" d="M18 2 a16 16 0 0 1 0 32 a16 16 0 0 1 0 -32" />
              <path
                className="mastery-ring-fg"
                d="M18 2 a16 16 0 0 1 0 32 a16 16 0 0 1 0 -32"
                style={{ strokeDasharray: `${masteryPct}, 100` }}
              />
            </svg>
            <span className="mastery-ring-label">{masteryPct}%</span>
          </div>
        )}
      </div>

      <div className="subject-card-body">
        <div className="subject-card-name">{name}</div>
        <div className="subject-card-desc">{desc}</div>
      </div>

      <div className="subject-card-trace" aria-hidden="true">
        <svg viewBox="0 0 200 40" preserveAspectRatio="none">
          <path
            className="trace-line"
            d="M0,20 L30,20 L38,6 L46,34 L54,20 L70,20 L78,10 L86,30 L94,20 L200,20"
          />
        </svg>
      </div>

      <div className="subject-card-meta">
        {topicCount != null && <span>{topicCount} topics</span>}
        {questionCount != null && <span>{questionCount} questions</span>}
      </div>
    </button>
  );
}
