// Top bar for visitors who aren't signed in: logo + Sign in, no menu.
// (The full TopBar is the signed-in menu: profile, leaderboard, etc.)
export default function GuestBar({ onSignIn }) {
  return (
    <div className="topbar">
      <div className="topbar-left">
        <div className="topbar-logo-stack">
          <span className="topbar-logo">Med101</span>
          <span className="topbar-tagline">Learn. Practice. Improve.</span>
        </div>
      </div>
      <div className="topbar-right">
        <button type="button" className="btn-glow guest-signin-btn" onClick={onSignIn}>
          Sign in
        </button>
      </div>
    </div>
  );
}
