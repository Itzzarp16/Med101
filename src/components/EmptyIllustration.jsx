import './EmptyIllustration.css';

// Small line drawings for empty lists, used in place of the old emoji.
// Everything is drawn with currentColor / CSS variables (see the .ei-*
// classes in EmptyIllustration.css), so it follows light/dark mode and the
// navy accent without any per-theme assets.
//
//   kind: history | friends | rooms | wrong | flagged | search | podium |
//         weak | error
//
// Shared parts per drawing: .ei-line (outline), .ei-fill (soft accent
// fill), .ei-acc (accent stroke), .ei-dot (twinkling sparkle).

const ART = {
  // Clipboard with a few blank lines: no quiz attempts yet.
  history: (
    <>
      <rect className="ei-fill ei-line" x="34" y="18" width="52" height="64" rx="8" />
      <rect className="ei-line" x="48" y="12" width="24" height="12" rx="5" fill="var(--bg, #050505)" />
      <path className="ei-line" d="M44 40h32M44 50h32M44 60h20" />
      <circle className="ei-acc ei-pulse" cx="82" cy="74" r="12" fill="var(--bg, #050505)" />
      <path className="ei-acc" d="M82 68v6l4 3" />
      <circle className="ei-dot" cx="22" cy="30" r="2.4" />
      <circle className="ei-dot ei-d2" cx="100" cy="28" r="1.8" />
    </>
  ),
  // Two people with a plus: no friends yet.
  friends: (
    <>
      <circle className="ei-fill ei-line" cx="46" cy="38" r="12" />
      <path className="ei-fill ei-line" d="M24 80c0-13 9-22 22-22s22 9 22 22" />
      <circle className="ei-line" cx="76" cy="42" r="9" strokeDasharray="3 4" />
      <path className="ei-line" d="M62 80c1-9 7-16 16-16 6 0 11 3 14 8" strokeDasharray="3 4" />
      <circle className="ei-acc" cx="94" cy="24" r="10" fill="var(--bg, #050505)" />
      <path className="ei-acc" d="M94 19v10M89 24h10" />
      <circle className="ei-dot" cx="20" cy="26" r="2" />
    </>
  ),
  // A door slightly ajar with a plus: no challenge rooms yet.
  rooms: (
    <>
      <rect className="ei-fill ei-line" x="32" y="14" width="46" height="68" rx="6" />
      <path className="ei-line ei-door" d="M78 20l16 6v54l-16 2z" />
      <circle className="ei-acc" cx="68" cy="50" r="2.6" fill="currentColor" />
      <path className="ei-line" d="M26 86h74" />
      <circle className="ei-acc ei-pulse" cx="98" cy="22" r="9" fill="var(--bg, #050505)" />
      <path className="ei-acc" d="M98 18v8M94 22h8" />
      <circle className="ei-dot ei-d2" cx="20" cy="40" r="2" />
    </>
  ),
  // Clipboard with a big tick: nothing wrong, all clear.
  wrong: (
    <>
      <rect className="ei-fill ei-line" x="34" y="18" width="52" height="64" rx="8" />
      <rect className="ei-line" x="48" y="12" width="24" height="12" rx="5" fill="var(--bg, #050505)" />
      <path className="ei-acc ei-draw" d="M46 52l10 10 18-20" strokeWidth="3.4" />
      <path className="ei-line" d="M46 72h28" />
      <circle className="ei-dot" cx="22" cy="34" r="2.4" />
      <circle className="ei-dot ei-d2" cx="100" cy="46" r="2" />
      <path className="ei-dot ei-d3" d="M98 20l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" />
    </>
  ),
  // Outlined star with a dotted halo: nothing starred yet.
  flagged: (
    <>
      <circle className="ei-line" cx="60" cy="48" r="38" strokeDasharray="2 6" />
      <path
        className="ei-fill ei-line ei-spin-in"
        d="M60.0 21.0L66.8 38.7L85.7 39.7L70.9 51.6L75.9 69.8L60.0 59.5L44.1 69.8L49.1 51.6L34.3 39.7L53.2 38.7z"
      />
      <circle className="ei-dot" cx="100" cy="24" r="2.4" />
      <circle className="ei-dot ei-d2" cx="18" cy="62" r="2" />
      <path className="ei-dot ei-d3" d="M22 21l1.6 4 4 1.6-4 1.6L22 32l-1.6-3.8-4-1.6 4-1.6z" />
    </>
  ),
  // Magnifier over empty page: no search results.
  search: (
    <>
      <rect className="ei-fill ei-line" x="26" y="16" width="52" height="64" rx="8" />
      <path className="ei-line" d="M36 32h32M36 42h20" />
      <circle className="ei-acc ei-sweep" cx="72" cy="58" r="16" fill="var(--bg, #050505)" fillOpacity=".55" />
      <path className="ei-acc ei-sweep" d="M84 70l14 14" strokeWidth="4" />
      <path className="ei-acc" d="M66 58h12" />
      <circle className="ei-dot" cx="102" cy="30" r="2" />
    </>
  ),
  // Empty podium: leaderboard with no scores.
  podium: (
    <>
      <rect className="ei-fill ei-line" x="42" y="46" width="36" height="38" rx="4" />
      <rect className="ei-line" x="12" y="62" width="30" height="22" rx="4" strokeDasharray="3 4" />
      <rect className="ei-line" x="78" y="68" width="30" height="16" rx="4" strokeDasharray="3 4" />
      <path className="ei-line" d="M8 86h104" />
      <path className="ei-acc" d="M52 66l8-8 8 8" />
      <path className="ei-acc ei-bob" d="M52 30l4 6 4-8 4 8 4-6-2 10H54z" fill="var(--bg, #050505)" />
      <circle className="ei-dot" cx="20" cy="36" r="2" />
      <circle className="ei-dot ei-d2" cx="98" cy="40" r="2.4" />
    </>
  ),
  // Target with nothing hit: weak topics need more answers first.
  weak: (
    <>
      <circle className="ei-fill ei-line" cx="60" cy="48" r="34" />
      <circle className="ei-line" cx="60" cy="48" r="22" />
      <circle className="ei-acc" cx="60" cy="48" r="10" />
      <circle cx="60" cy="48" r="3" fill="currentColor" className="ei-acc" />
      <path className="ei-acc ei-bob" d="M86 20L64 44" strokeWidth="2.6" />
      <path className="ei-acc ei-bob" d="M86 20l1-8M86 20l8-1" />
      <circle className="ei-dot" cx="18" cy="24" r="2" />
      <circle className="ei-dot ei-d2" cx="104" cy="70" r="2.2" />
    </>
  ),
  // Cloud with a slash: something failed to load.
  error: (
    <>
      <path
        className="ei-fill ei-line"
        d="M36 70a16 16 0 0 1 2-31 22 22 0 0 1 42-4 18 18 0 0 1 4 35z"
      />
      <path className="ei-acc" d="M60 44v14" strokeWidth="3.2" />
      <circle cx="60" cy="66" r="2.4" fill="currentColor" className="ei-acc" />
      <circle className="ei-dot" cx="100" cy="24" r="2" />
    </>
  ),
};

export default function EmptyIllustration({ kind = 'history', size = 112, className = '' }) {
  const art = ART[kind] || ART.history;
  return (
    <svg
      className={`ei ${className}`.trim()}
      width={size}
      height={size * 0.8}
      viewBox="0 0 120 96"
      fill="none"
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      {art}
    </svg>
  );
}
