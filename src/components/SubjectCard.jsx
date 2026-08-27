import './SubjectCard.css';

// Matches the old site's .subj-card exactly: flat glass card, emoji on
// the left, name + description stacked, chevron arrow on the right.
export default function SubjectCard({ emoji, name, desc, questionCount, topicCount, onClick }) {
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
      </span>
      <span className="subj-arrow">›</span>
    </button>
  );
}
