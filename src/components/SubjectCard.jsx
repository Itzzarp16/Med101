import { useLayoutEffect, useRef } from 'react';
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
// Every card gets a progress value --p (0..1) from where it sits on screen:
// 0 while its top is at/below the bottom edge, 1 once it has risen ~170px.
// SubjectCard.css turns --p into the build (card drawn top to bottom under a
// ripple ring: the card is a dot on its emoji, grows into a circle, then
// opens out into the full card; title, stats, progress and chevron follow). Because --p is a pure function of scroll position there is no
// state machine: scrolling down builds, scrolling back up un-builds in
// reverse, and nothing can flicker. Done in JS (not CSS view() timelines)
// so it behaves the same in every browser. One shared rAF-throttled scroll
// listener; reads are batched before writes.
const REVEAL_RANGE = 250; // px of travel from the bottom edge to fully built
const scrubCards = new Set();
const scrubLast = new WeakMap();
let scrubRaf = 0;
let scrubBound = false;

function scrubTick() {
  scrubRaf = 0;
  const viewH = window.innerHeight;
  const reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const reads = [];
  scrubCards.forEach((el) => {
    if (!el.isConnected) return;
    reads.push([el, el.getBoundingClientRect().top]);
  });
  reads.forEach(([el, top]) => {
    let p = reduce ? 1 : (viewH - top) / REVEAL_RANGE;
    p = p < 0 ? 0 : p > 1 ? 1 : Math.round(p * 200) / 200;
    if (scrubLast.get(el) === p) return;
    scrubLast.set(el, p);
    el.style.setProperty('--p', String(p));
    el.dataset.forge = p >= 1 ? '1' : '0';
  });
}

function scrubSchedule() {
  if (!scrubRaf) scrubRaf = requestAnimationFrame(scrubTick);
}

function scrubRegister(el) {
  scrubCards.add(el);
  if (!scrubBound) {
    scrubBound = true;
    document.addEventListener('scroll', scrubSchedule, { capture: true, passive: true });
    window.addEventListener('resize', scrubSchedule, { passive: true });
  }
  // Layout can shift after mount without any scroll (banners, fonts, data
  // arriving), so re-measure a few times while things settle.
  const timers = [150, 500, 1200, 2500].map((ms) => setTimeout(scrubSchedule, ms));
  return () => {
    timers.forEach(clearTimeout);
    scrubCards.delete(el);
    if (scrubCards.size === 0 && scrubBound) {
      scrubBound = false;
      document.removeEventListener('scroll', scrubSchedule, { capture: true });
      window.removeEventListener('resize', scrubSchedule);
    }
  };
}

export default function SubjectCard({ index, emoji, name, desc, questionCount, topicCount, trace, progress, exam, build, onClick }) {
  const accent = trace ? traceColorFor(name) : null;

  const cardRef = useRef(null);
  // Layout effect so the first measurement happens before paint (no flash of
  // fully-built cards sitting below the fold).
  useLayoutEffect(() => {
    if (!build || !cardRef.current) return undefined;
    const el = cardRef.current;
    const cleanup = scrubRegister(el);
    scrubTick();
    return cleanup;
  }, [build]);

  return (
    <button
      ref={cardRef}
      className={`${trace ? 'subj-card subj-card--dash' : 'subj-card'}${build ? ' subj-card--build' : (index != null ? ' stagger-in' : '')}`}
      style={index != null ? { '--stagger-i': Math.min(index, 8) } : undefined}
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
