import { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { playTapSound } from '../lib/sounds';

// Everything except the Med101 logo/signature and the user's own name
// now lives behind a hamburger menu — matches the drawer content the
// user sketched out: existing features first, admin-only ones in their
// own section. Items not yet built (change user ID/password/name, a
// dedicated profile screen, wrong/flagged questions) are left out until
// they actually exist.
export default function TopBar({ onHome, onLeaderboard, onSettings, onChallenge, onProfile, onWeakTopics, onWrongFlagged, onAdminQuestions, onAdminNotice, onAdminCalendar, onAdminUserDetail }) {
  const { user, isAdmin, logOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  function go(fn) {
    playTapSound();
    setMenuOpen(false);
    fn?.();
  }

  return (
    <div className="topbar">
      <div className="topbar-left">
        <button className="topbar-icon-btn home" title="Menu" onClick={() => { playTapSound(); setMenuOpen(true); }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" y1="7" x2="20" y2="7" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="17" x2="20" y2="17" />
          </svg>
        </button>

        <div className="topbar-logo-stack">
          <span className="topbar-logo">Med<span className="topbar-logo-2">101</span></span>
          <div className="topbar-signature">by Abhishek Verma</div>
        </div>
      </div>

      <div className="topbar-right">
        <span className="topbar-user">{user?.displayName || user?.email}</span>
      </div>

      {menuOpen && (
        <div className="menu-overlay" onClick={() => setMenuOpen(false)}>
          <div className="menu-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="menu-drawer-header">
              <span className="topbar-logo">Med<span className="topbar-logo-2">101</span></span>
              <button className="menu-close" onClick={() => setMenuOpen(false)}>✕</button>
            </div>

            <div className="menu-user">{user?.displayName || user?.email}</div>

            <button className="menu-item" onClick={() => go(onHome)}>🏠 Home</button>
            <button className="menu-item" onClick={() => go(onLeaderboard)}>🏆 Leaderboard</button>
            <button className="menu-item" onClick={() => go(onProfile)}>🙍 Your Profile</button>
            <button className="menu-item" onClick={() => go(onSettings)}>🎓 Change Year &amp; Semester</button>
            <button className="menu-item" onClick={() => go(onChallenge)}>👥 Challenge a Friend</button>
            <button className="menu-item" onClick={() => go(onWeakTopics)}>🎯 Your Weak Topics</button>
            <button className="menu-item" onClick={() => go(onWrongFlagged)}>📌 Wrong &amp; Flagged Questions</button>

            {isAdmin && (
              <>
                <div className="menu-section-label">For Admin Only</div>
                <button className="menu-item admin" onClick={() => go(onAdminQuestions)}>📝 Manage Questions</button>
                <button className="menu-item admin" onClick={() => go(onAdminNotice)}>📢 Home Notice</button>
                <button className="menu-item admin" onClick={() => go(onAdminCalendar)}>⚙️ Academic Calendar</button>
                <button className="menu-item admin" onClick={() => go(onAdminUserDetail)}>🔍 View User Detail</button>
              </>
            )}

            <button className="menu-item signout" onClick={() => go(logOut)}>⏏ Sign Out</button>
          </div>
        </div>
      )}
    </div>
  );
}
