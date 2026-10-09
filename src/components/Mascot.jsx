import './Mascot.css';

// "Pulse", Med101's little heart-with-a-stethoscope mascot. Pure SVG + CSS,
// no image assets, so it follows light/dark mode and costs a couple of KB.
//
//   mood: idle  - gentle bob + blinking (default)
//         wave  - waves a few times, then settles (greeting)
//         cheer - jumps with arms up and sparkles (correct answer)
//         nap   - eyes shut, breathing slowly, floating z's (empty screens)
//         shy   - covers its eyes with both hands (sign-in password field)
//
// Decorative only (aria-hidden): whatever it accompanies carries the meaning.
export default function Mascot({ mood = 'idle', size = 72, className = '' }) {
  const cheer = mood === 'cheer';
  const nap = mood === 'nap';
  const wave = mood === 'wave';
  const shy = mood === 'shy';

  return (
    <svg
      className={`mascot mascot--${mood} ${className}`.trim()}
      width={size}
      height={size}
      viewBox="-8 -4 116 112"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <g className="mc-all">
        {/* feet */}
        <ellipse className="mc-dark" cx="39" cy="92" rx="8" ry="4.5" />
        <ellipse className="mc-dark" cx="61" cy="92" rx="8" ry="4.5" />

        {/* arms (behind the body) */}
        {shy ? null : cheer ? (
          <>
            <path className="mc-arm mc-arm-l" d="M13 52 Q1 48 0 33" />
            <path className="mc-arm mc-arm-r" d="M87 52 Q99 48 100 33" />
          </>
        ) : (
          <>
            <path className="mc-arm" d="M13 54 Q4 60 5 70" />
            <path className={`mc-arm mc-arm-r${wave ? ' mc-wave' : ''}`} d={wave ? 'M87 52 Q98 49 98 36' : 'M87 54 Q96 60 95 70'} />
          </>
        )}

        {/* body */}
        <path
          className="mc-body"
          d="M50 90 C18 68 7 48 7 33 C7 18 18 8 31 8 C40 8 47 13 50 21 C53 13 60 8 69 8 C82 8 93 18 93 33 C93 48 82 68 50 90 Z"
        />
        <ellipse className="mc-shine" cx="27" cy="26" rx="8" ry="5" transform="rotate(-28 27 26)" />

        {/* shy: arms come up in FRONT of the body to the hands covering the eyes */}
        {shy && (
          <>
            <path className="mc-arm" d="M9 60 Q-4 40 30 44" />
            <path className="mc-arm" d="M91 60 Q104 40 70 44" />
          </>
        )}

        {/* stethoscope draped over the front */}
        <path className="mc-steth" d="M29 62 Q50 92 71 62" />
        <circle className="mc-steth-head" cx="50" cy="79" r="4.6" />
        <circle className="mc-steth-dot" cx="50" cy="79" r="1.7" />

        {/* face */}
        <g className="mc-face">
          {shy ? (
            <>
              <ellipse className="mc-hand" cx="36" cy="43" rx="9.5" ry="7.5" />
              <ellipse className="mc-hand" cx="64" cy="43" rx="9.5" ry="7.5" />
              <path className="mc-mouth" d="M43 56 Q50 61 57 56" />
            </>
          ) : nap ? (
            <>
              <path className="mc-eye-line" d="M31 44 Q37 50 43 44" />
              <path className="mc-eye-line" d="M57 44 Q63 50 69 44" />
              <path className="mc-mouth" d="M46 57 Q50 60 54 57" />
            </>
          ) : cheer ? (
            <>
              <path className="mc-eye-line" d="M31 46 Q37 38 43 46" />
              <path className="mc-eye-line" d="M57 46 Q63 38 69 46" />
              <path className="mc-mouth-open" d="M40 54 Q50 70 60 54 Z" />
              <path className="mc-tongue" d="M45 62 Q50 67 55 62 Q50 59 45 62 Z" />
            </>
          ) : (
            <>
              <g className="mc-eyes">
                <ellipse className="mc-eye" cx="37" cy="43" rx="4.3" ry="5.4" />
                <ellipse className="mc-eye" cx="63" cy="43" rx="4.3" ry="5.4" />
                <circle className="mc-glint" cx="38.6" cy="40.8" r="1.5" />
                <circle className="mc-glint" cx="64.6" cy="40.8" r="1.5" />
              </g>
              <path className="mc-mouth" d="M42 55 Q50 63 58 55" />
            </>
          )}
          <circle className="mc-cheek" cx="28" cy="54" r="5" />
          <circle className="mc-cheek" cx="72" cy="54" r="5" />
        </g>

        {nap && (
          <g className="mc-zs">
            <text className="mc-z mc-z1" x="80" y="14">z</text>
            <text className="mc-z mc-z2" x="90" y="2">Z</text>
          </g>
        )}
      </g>

      {cheer && (
        <g className="mc-sparkles">
          <path className="mc-spark mc-s1" d="M10 10 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" />
          <path className="mc-spark mc-s2" d="M92 6 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6z" />
          <path className="mc-spark mc-s3" d="M100 60 l1.4 3.4 3.4 1.4 -3.4 1.4 -1.4 3.4 -1.4 -3.4 -3.4 -1.4 3.4 -1.4z" />
        </g>
      )}
    </svg>
  );
}
