import './SubjectCard.css';

// Old site's .subj-card layout exactly (flat glass row, emoji left,
// text stacked, chevron right).
export default function SubjectCard({ emoji, name, desc, questionCount, topicCount, onClick }) {
  return (
    <button className="subj-card" onClick={onClick}>
      <span className="subj-emoji">{emoji}</span>
      <span className="subj-card-text">
        <span className="subj-name">{name}</span>
        <span className="subj-count">{desc}</span>

        <span className="subj-meta">
          {topicCount != null && <span>{topicCount} topics</span>}
          {questionCount != null && <span>{questionCount} questions</span>}
        </span>
      </span>
      <span className="subj-arrow">›</span>
    </button>
  );
}
