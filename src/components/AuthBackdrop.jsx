// Decorative backdrop for the sign-in screens: slowly drifting colour blobs
// (in CSS, on #auth-screen) plus a few medical doodles floating up behind the
// card. Purely visual and aria-hidden; all motion stops for reduced-motion.
const DOODLES = ['🧬', '💊', '🩺', '🫀', '🧠', '🦴', '🔬', '💉'];

export default function AuthBackdrop() {
  return (
    <div className="auth-doodles" aria-hidden="true">
      {DOODLES.map((d, i) => (
        <span key={d} className="auth-doodle" style={{ '--i': i }}>{d}</span>
      ))}
    </div>
  );
}
