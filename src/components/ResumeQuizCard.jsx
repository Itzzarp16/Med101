import './ResumeQuizCard.css';

function timeAgo(ts) {
  const mins = Math.max(1, Math.round((Date.now() - ts) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

// Shown on the dashboard when an unfinished solo quiz is saved.
export default function ResumeQuizCard({ snapshot, onResume, onDiscard }) {
  const total = snapshot.questions.length;
  const answered = snapshot.answers.filter((a) => a !== -1).length;
  const label = snapshot.topic || 'All Topics';
  return (
    <div className="resume-card">
      <div className="resume-card-text">
        <div className="resume-card-kicker">Unfinished quiz</div>
        <div className="resume-card-title">{snapshot.mainSubject} · {label}</div>
        <div className="resume-card-meta">{answered} of {total} answered · {timeAgo(snapshot.savedAt)}</div>
        <div className="resume-card-bar"><div style={{ width: `${(answered / total) * 100}%` }} /></div>
      </div>
      <div className="resume-card-actions">
        <button type="button" className="btn-glow resume-card-go" onClick={onResume}>Resume →</button>
        <button type="button" className="resume-card-discard" onClick={onDiscard}>Discard</button>
      </div>
    </div>
  );
}
