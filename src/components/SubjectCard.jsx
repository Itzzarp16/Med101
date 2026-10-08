import { useLayoutEffect, useRef } from 'react';
import './SubjectCard.css';
import { hapticSync } from '../lib/haptics';
import CountUp from './CountUp';
import '../styles/subjectTheme.css';

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
// ripple ring: the card is a dot at its centre, grows into a circle, glides
// to the emoji and opens out into the full card; title, stats, progress and chevron follow). Because --p is a pure function of scroll position there is no
// state machine: scrolling down builds, scrolling back up un-builds in
// reverse, and nothing can flicker. Done in JS (not CSS view() timelines)
// so it behaves the same in every browser. One shared rAF-throttled scroll
// listener; reads are batched before writes.
const REVEAL_RANGE = 250; // px of travel from the bottom edge to fully built
const SETTLE_DELAY = 160; // ms after the last scroll event before the loop is re-checked
// Haptic beats, synced to the same --p the CSS animation reads: a light tick
// as the card sparks into a dot, a medium one as it opens into the full card,
// a firm one when it lands. Crossing them going up (scroll down, building) and
// going down (scroll up, un-building) both fire, so feel follows the visuals.
const HAPTIC_BEATS = [[0.15, 0.4], [0.6, 0.75], [1, 1]];
const scrubCards = new Set();
const scrubShown = new WeakMap(); // the p value currently displayed per card
const scrubWidth = new WeakMap();
let scrubRaf = 0;
let scrubBound = false;
let scrubLastScroll = 0;
let scrubSettleTimer = 0;
let scrubLastFrame = 0;
let scrubUserScrolled = false; // before the first scroll, on-screen cards build in on their own
let scrubDir = 0; // +1 content moving up (scrolling down), -1 content moving down
const scrubScrollY = new WeakMap(); // last scrollTop per scroller

// The mobile browser's address bar sliding in/out changes innerHeight in the
// middle of a scroll, which used to shift every card's progress at once (a
// visible jump). Use the tallest height seen for this width instead; it only
// resets when the width changes (rotation / resize).
let stableW = 0;
let stableH = 0;
function stableViewH() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (w !== stableW) { stableW = w; stableH = h; }
  else if (h > stableH) stableH = h;
  return stableH;
}

function scrubTick() {
  scrubRaf = 0;
  const now = performance.now();
  // Frame-rate independent smoothing: 60Hz and 120Hz phones now animate at
  // the same speed (the per-frame factors below are tuned for 60fps).
  const dt = scrubLastFrame ? Math.min(64, now - scrubLastFrame) : 16.7;
  scrubLastFrame = now;
  const frames = dt / 16.7;
  const viewH = stableViewH();
  const reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const reads = [];
  scrubCards.forEach((el) => {
    if (el.isConnected) reads.push([el, el.getBoundingClientRect().top, el.offsetWidth]);
  });
  let moving = false;
  reads.forEach(([el, top, w]) => {
    // Card width feeds the circle's travel to the card centre (see CSS).
    if (scrubWidth.get(el) !== w) {
      scrubWidth.set(el, w);
      el.style.setProperty('--cw', `${w}px`);
    }
    const pos = Math.min(1, Math.max(0, (viewH - top) / REVEAL_RANGE));
    // While scrolling the card follows its position on screen; once the page
    // has been still for a moment, any card that is on screen finishes
    // building by itself, so nothing is left half-open at rest.
    let target = reduce ? 1 : pos;
    // Only the very first paint (before any scroll) builds cards in by itself.
    // After that the card is a pure function of scroll position, so lifting
    // your finger mid-way leaves it paused exactly where it is.
    if (!reduce && !scrubUserScrolled && top < viewH - 6) target = 1;
    let p = scrubShown.get(el);
    if (p === undefined) p = pos;
    else {
      // Never un-build a card while the page is being scrolled DOWN: a card
      // that finished building during a pause used to collapse back to a
      // half-open pill the instant the finger moved again. Cards still
      // un-build when you scroll back UP, which is the intended reverse.
      if (scrubDir > 0 && target < p) target = p;
      // Light smoothing (quick while scrolling, slower when settling) keeps
      // the motion fluid and continuous when the target jumps.
      const k = 0.45;
      p += (target - p) * (1 - Math.pow(1 - k, frames));
    }
    if (Math.abs(target - p) < 0.004) p = target;
    else moving = true;
    const prev = scrubShown.get(el);
    if (p === prev) return;
    if (prev !== undefined && !reduce) {
      for (const [beat, strength] of HAPTIC_BEATS) {
        if ((prev < beat && p >= beat) || (prev >= beat && p < beat)) {
          // only for cards actually on screen
          if (top < viewH && top > -el.offsetHeight) hapticSync(strength);
        }
      }
    }
    scrubShown.set(el, p);
    el.style.setProperty('--p', p.toFixed(3));
    el.dataset.forge = p >= 1 ? '1' : '0';
  });
  if (moving) scrubSchedule();
}

function scrubSchedule() {
  if (!scrubRaf) scrubRaf = requestAnimationFrame(scrubTick);
}

function scrubOnScroll(e) {
  const t = e && e.target && e.target.scrollTop !== undefined && e.target !== document
    ? e.target
    : document.scrollingElement;
  if (t) {
    const y = t.scrollTop;
    const last = scrubScrollY.get(t);
    if (last !== undefined && y !== last) scrubDir = y > last ? 1 : -1;
    scrubScrollY.set(t, y);
  }
  scrubUserScrolled = true;
  scrubLastScroll = performance.now();
  scrubSchedule();
  clearTimeout(scrubSettleTimer);
  scrubSettleTimer = setTimeout(scrubSchedule, SETTLE_DELAY + 20);
}

function scrubRegister(el) {
  scrubCards.add(el);
  if (!scrubBound) {
    scrubBound = true;
    document.addEventListener('scroll', scrubOnScroll, { capture: true, passive: true });
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
      clearTimeout(scrubSettleTimer);
      document.removeEventListener('scroll', scrubOnScroll, { capture: true });
      window.removeEventListener('resize', scrubSchedule);
    }
  };
}

// Visually hidden but read by screen readers (the animated numbers are aria-hidden).
const SR_ONLY = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' };

export default function SubjectCard({ index, emoji, name, desc, questionCount, topicCount, trace, progress, exam, build, hideArrow, hue, onClick }) {
  // `hue` (0-11) = this subject's own colour from styles/subjectTheme.css; falls back to the old hashed colour.
  const accent = trace ? (hue != null ? 'var(--hue)' : traceColorFor(name)) : null;

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
      className={`${trace ? 'subj-card subj-card--dash' : 'subj-card'}${build ? ' subj-card--build' : (index != null ? ' stagger-in' : '')}${hue != null ? ` subj-hue-${hue}` : ''}`}
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
            📅 Exam {exam.dateText} · {exam.daysText}{exam.note ? ` (${exam.note})` : ''}
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
            <span className="subj-progress-text">
              <span style={SR_ONLY}>{progress.answered} answered, {progress.pct}% accuracy</span>
              <span aria-hidden="true">
                <CountUp to={progress.answered} whenVisible /> answered · <CountUp to={progress.pct} suffix="%" whenVisible /> accuracy
              </span>
            </span>
          </span>
        )}
      </span>
      {!hideArrow && <span className="subj-arrow">›</span>}
    </button>
  );
}
