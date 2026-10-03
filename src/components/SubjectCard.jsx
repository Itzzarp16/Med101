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

// ── Scroll-scrubbed entrance (dashboard cards, `build` prop) ───────────
// The card's entrance is tied directly to scroll position, not triggered by
// it: SubjectCard.css animates every card with a CSS view() timeline, so as a
// card rises from the bottom edge it builds in step with your finger, and
// scrolling back up plays the exact same motion in reverse, one card at a
// time as each one crosses the bottom edge. No JS runs per scroll frame, no
// timers, no direction guessing, so nothing can flicker or pop.
//
// Browsers without scroll-driven animations (older Safari/Firefox) get a
// simple fallback instead: each card fades and rises in once, the first time
// it enters the screen, and then stays put.
const SCROLL_TIMELINE =
  typeof CSS !== 'undefined' && typeof CSS.supports === 'function' &&
  CSS.supports('animation-timeline: view()');

export default function SubjectCard({ index, emoji, name, desc, questionCount, topicCount, trace, progress, exam, build, onClick }) {
  const accent = trace ? traceColorFor(name) : null;

  // Fallback only (no scroll-driven animation support): reveal once on first view.
  const cardRef = useRef(null);
  const fallback = !!build && !SCROLL_TIMELINE;
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (!fallback) return undefined;
    const el = cardRef.current;
    if (!el) return undefined;
    if (typeof IntersectionObserver === 'undefined') { setRevealed(true); return undefined; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setRevealed(true); io.disconnect(); }
    }, { threshold: 0.12, rootMargin: '0px 0px -4% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [fallback]);

  return (
    <button
      ref={cardRef}
      className={`${trace ? 'subj-card subj-card--dash' : 'subj-card'}${build ? ' subj-card--build' : (index != null ? ' stagger-in' : '')}`}
      style={index != null ? { '--stagger-i': Math.min(index, 8) } : undefined}
      data-reveal={fallback ? (revealed ? 'in' : 'pending') : undefined}
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
