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

// ── Scroll-linked forge controller ─────────────────────────────────────
// One shared, rAF-throttled scroll listener for every build-enabled card.
// A previous IntersectionObserver version flickered because state only
// changed at threshold crossings (cards sat half-hidden/half-built) and
// flipped back and forth when the scroll jittered. This version decides
// from scroll DIRECTION plus fixed lines, so nothing can toggle twice:
//   scrolling down: any card whose top is above the BUILD line is built
//   scrolling up:   any card whose top is below the ERASE line is erased
// and nothing else ever changes. Direction only flips after ~10px of
// movement the other way, so momentum/bounce jitter is ignored.
const BUILD_LINE = 0.94; // fraction of viewport height
const ERASE_LINE = 0.66;
const forgeCards = new Set();
let forgeDir = 'down';
let forgeLastTop = null;
let forgeAcc = 0;
let forgeRaf = 0;
let forgeBound = false;

function forgeTick() {
  forgeRaf = 0;
  const viewH = window.innerHeight;
  let ref = null;
  for (const c of forgeCards) {
    if (c.el.isConnected) { ref = c; break; }
  }
  if (!ref) { forgeLastTop = null; return; }
  const top = ref.el.getBoundingClientRect().top;
  if (forgeLastTop !== null) {
    const d = top - forgeLastTop; // negative = page moved up = scrolling down
    if (d < 0) forgeAcc = Math.min(forgeAcc, 0) + d;
    else if (d > 0) forgeAcc = Math.max(forgeAcc, 0) + d;
    if (forgeAcc <= -10) forgeDir = 'down';
    else if (forgeAcc >= 10) forgeDir = 'up';
  }
  forgeLastTop = top;
  let built = 0;
  for (const c of forgeCards) {
    if (!c.el.isConnected) continue;
    const rect = c.el.getBoundingClientRect();
    if (forgeDir === 'down') {
      if (rect.top < viewH * BUILD_LINE && rect.bottom > 0 && c.build(built)) built += 1;
    } else if (rect.top > viewH * ERASE_LINE) {
      c.erase();
    }
  }
}

function forgeSchedule() {
  if (!forgeRaf) forgeRaf = requestAnimationFrame(forgeTick);
}

function forgeRegister(card) {
  forgeCards.add(card);
  if (!forgeBound) {
    forgeBound = true;
    document.addEventListener('scroll', forgeSchedule, { capture: true, passive: true });
    window.addEventListener('resize', forgeSchedule, { passive: true });
  }
  forgeSchedule();
  return () => {
    forgeCards.delete(card);
    if (forgeCards.size === 0 && forgeBound) {
      forgeBound = false;
      forgeLastTop = null;
      forgeDir = 'down';
      forgeAcc = 0;
      document.removeEventListener('scroll', forgeSchedule, { capture: true });
      window.removeEventListener('resize', forgeSchedule);
    }
  };
}

export default function SubjectCard({ index, emoji, name, desc, questionCount, topicCount, trace, progress, exam, build, onClick }) {
  const accent = trace ? traceColorFor(name) : null;

  // Scroll-linked build (see SubjectCard.css + controller above). Phases:
  //   pending    hidden, waiting below the build line
  //   building   forge-in plays, then the card simply stays visible
  //   unbuilding reverse animation, played when scrolling back up past
  //              the erase line; then back to pending
  // Cards above the viewport are left alone. Repeats on every pass.
  const cardRef = useRef(null);
  const phaseRef = useRef(build ? 'pending' : undefined);
  const [buildPhase, setBuildPhaseState] = useState(phaseRef.current);
  const setBuildPhase = (next) => {
    const value = typeof next === 'function' ? next(phaseRef.current) : next;
    phaseRef.current = value;
    setBuildPhaseState(value);
  };
  useEffect(() => {
    if (!build) return undefined;
    const el = cardRef.current;
    if (!el) return undefined;
    return forgeRegister({
      el,
      // Returns true when it actually started a build (for staggering).
      build: (order) => {
        if (phaseRef.current !== 'pending' && phaseRef.current !== 'unbuilding') return false;
        // Cards on screen during the app-boot reveal wait for the circle
        // to reach them; later builds start at once, staggered a little
        // when several cards appear in the same frame.
        const booting = !!el.closest('.boot-reveal');
        const delay = booting ? 1.2 + Math.min(index ?? 0, 8) * 0.14 : order * 0.07;
        el.style.setProperty('--build-delay', `${delay}s`);
        setBuildPhase('building');
        return true;
      },
      erase: () => {
        if (phaseRef.current === 'building') setBuildPhase('unbuilding');
      },
    });
  }, [build, index]);

  // unbuilding -> pending once the reverse animation has played (timer is
  // a safety net in case animationend never fires).
  useEffect(() => {
    if (buildPhase !== 'unbuilding') return undefined;
    const t = setTimeout(() => setBuildPhase((p) => (p === 'unbuilding' ? 'pending' : p)), 600);
    return () => clearTimeout(t);
  }, [buildPhase]);

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
