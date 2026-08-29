import { useAuth } from '../lib/AuthContext';

export default function TopBar({ onHome, onLeaderboard, onSettings, onChallenge, onAdminQuestions, onAdminNotice, onAdminCalendar, showLeaderboard = true }) {
  const { user, isAdmin, logOut } = useAuth();

  return (
    <div className="topbar">
      <div className="topbar-left">
        <button className="topbar-icon-btn home" title="Home" onClick={onHome}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />
            <path d="M9 21V12h6v9" />
          </svg>
        </button>

        {showLeaderboard && (
          <button className="topbar-icon-btn leaderboard" title="Leaderboard" onClick={onLeaderboard}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4z" />
              <path d="M7 5H4a1 1 0 0 0-1 1v1a4 4 0 0 0 4 4M17 5h3a1 1 0 0 1 1 1v1a4 4 0 0 1-4 4" />
            </svg>
          </button>
        )}

        <button className="topbar-icon-btn settings" title="Settings" onClick={onSettings}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>

        <button className="topbar-icon-btn leaderboard" title="Challenge a Friend" onClick={onChallenge}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </button>

        <div className="topbar-logo-stack">
          <span className="topbar-logo">Med<span className="topbar-logo-2">101</span></span>
          <div className="topbar-signature">by Abhishek Verma</div>
        </div>

        {isAdmin && (
          <>
            <button className="topbar-icon-btn admin" title="Manage Questions" onClick={onAdminQuestions}>📝</button>
            <button className="topbar-icon-btn admin" title="Home Notice" onClick={onAdminNotice}>📢</button>
            <button className="topbar-icon-btn admin" title="Academic Calendar" onClick={onAdminCalendar}>⚙️</button>
          </>
        )}
      </div>

      <div className="topbar-right">
        <span className="topbar-user">{user?.displayName || user?.email}</span>
        <button className="signout-btn" onClick={logOut}>⏏ Sign Out</button>
      </div>
    </div>
  );
}
