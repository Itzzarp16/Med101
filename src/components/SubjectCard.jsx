import { useEffect, useRef, useState } from 'react';
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

// Each card's pulse starts at a different point in its loop so a grid of
// them ripples instead of all beating in sync.
function traceDelayFor(name) {
  let hash = 7;
  for (let i = 0; i < name.length; i++) hash = (hash * 17 + name.charCodeAt(i)) >>> 0;
  return (hash % 26) / 10; // 0 - 2.5s
}

// Cards that have already played their "forge-in" this session; they
// don't replay every time the dashboard is revisited.
const builtThisSession = new Set();

export default function SubjectCard({ index, emoji, name, desc, questionCount, topicCount, trace, progress, exam, build, onClick }) {
  const accent = trace ? traceColorFor(name) : null;

  // Scroll-triggered build: the card stays hidden until it scrolls into
  // view, then it is "forged" (scan line + staged content, see
  // SubjectCard.css). IntersectionObserver missing -> just show it.
  const cardRef = useRef(null);
  const [buildPhase, setBuildPhase] = useState(
    build ? (builtThisSession.has(name) ? 'done' : 'pending') : undefined
  );
  useEffect(() => {
    if (buildPhase !== 'pending') return undefined;
    const el = cardRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setBuildPhase('done');
      return undefined;
    }
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      // Cards already on screen during the app-boot reveal wait for the
      // circle to reach them; cards scrolled to later build right away.
      const booting = !!el.closest('.boot-reveal');
      el.style.setProperty('--build-delay', booting ? `${1.2 + Math.min(index ?? 0, 8) * 0.14}s` : '0s');
      builtThisSession.add(name);
      setBuildPhase('building');
      io.disconnect();
    }, { threshold: 0.2, rootMargin: '0px 0px -6% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [buildPhase, index, name]);

  return (
    <button
      ref={cardRef}
      className={`${trace ? 'subj-card subj-card--dash' : 'subj-card'}${build ? ' subj-card--build' : (index != null ? ' stagger-in' : '')}`}
      style={index != null ? { '--stagger-i': Math.min(index, 8) } : undefined}
      data-build={buildPhase}
      onClick={onClick}
    >
      {build && <span className="subj-scan" aria-hidden="true" />}
      <span className="subj-emoji">{emoji}</span>
      <span className="subj-card-text">
        <span className="subj-name">{name}</span>
        {desc && <span className="subj-count">{desc}</span>}
        {exam && (
          <span className={exam.days <= 7 ? 'subj-exam soon' : 'subj-exam'}>
            📅 Exam {exam.dateText} · {exam.daysText}
          </span>
        )}

        <span className="subj-foot">
          <span className="subj-meta">
            {topicCount != null && <span>{topicCount} {topicCount === 1 ? 'topic' : 'topics'}</span>}
            {questionCount != null && <span>{questionCount} {questionCount === 1 ? 'question' : 'questions'}</span>}
          </span>
          {trace && (
            <span className="subj-trace active" aria-hidden="true" style={{ '--trace-color': accent, '--trace-delay': `${-(traceDelayFor(name))}s` }}>
              <svg viewBox="0 0 72 16">
                <path
                  className="subj-trace-line"
                  pathLength="100"
                  d="M0,8 L12,8 L15,2 L19,14 L22,8 L32,8 L35,4 L38,12 L41,8 L72,8"
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
