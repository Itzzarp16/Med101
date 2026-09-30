import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../lib/AuthContext';
import { playTapSound } from '../lib/sounds';
import { subscribeToOnlineCount, subscribeToOnlineNames } from '../lib/presence';

// Everything except the Med101 logo/signature and the user's own name
// now lives behind a hamburger menu - matches the drawer content the
// user sketched out: existing features first, admin-only ones in their
// own section. Items not yet built (change user ID/password/name, a
// dedicated profile screen, wrong/flagged questions) are left out until
// they actually exist.
export default function TopBar({ onHome, onLeaderboard, onSettings, onFriends, onProfile, onWeakTopics, onWrongFlagged, onHistory, onSearch, onPremium, onAdminNotice, onAdminCalendar, onAdminUploadQuestions, onAdminUserDetail, onAdminAnalytics, onAdminPayments, onAdminSubscribers, onViewUser, screen }) {
  const { user, profile, isAdmin, logOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [onlineCount, setOnlineCount] = useState(null);
  const [onlineNames, setOnlineNames] = useState(null);
  const [showOnlineList, setShowOnlineList] = useState(false);

  // Everyone signed in gets the count.
  useEffect(() => {
    const unsub = subscribeToOnlineCount(setOnlineCount);
    return unsub;
  }, []);

  // Only admin subscribes to the actual names - regular students would
  // just get a permission error from the database rules if this ran.
  useEffect(() => {
    if (!isAdmin) return;
    const unsub = subscribeToOnlineNames(setOnlineNames);
    return unsub;
  }, [isAdmin]);

  function go(fn) {
    playTapSound();
    setMenuOpen(false);
    fn?.();
  }

  return (
    <>
    <div className="topbar">
      <div className="topbar-left">
        <button className="topbar-icon-btn home" title="Menu" aria-label="Open menu" onClick={() => { playTapSound(); setMenuOpen(true); }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" y1="7" x2="20" y2="7" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="17" x2="20" y2="17" />
          </svg>
        </button>

        <button
          className="topbar-logo-stack topbar-logo-stack-btn"
          title="Go to Home"
          aria-label="Go to Home"
          onClick={() => { playTapSound(); onHome?.(); }}
        >
          <span className="topbar-logo">Med101</span>
          <span className="topbar-tagline">Learn. Practice. Improve.</span>
        </button>
      </div>

      <div className="topbar-right">
        {onlineCount != null && (
          isAdmin ? (
            <button
              className="topbar-online topbar-online-btn"
              title="Tap to see who's online"
              aria-label={`${onlineCount} students online - tap to see who`}
              onClick={() => { playTapSound(); setShowOnlineList((v) => !v); }}
            >
              <span className="topbar-online-dot" /> {onlineCount} online
            </button>
          ) : (
            <span className="topbar-online" title="Students currently connected right now">
              <span className="topbar-online-dot" /> {onlineCount} online
            </span>
          )
        )}
        <button className="topbar-user" title="View your profile" onClick={() => { playTapSound(); onProfile?.(); }}>
          {profile?.photoURL && (
            <span
              style={{
                display: 'inline-block', width: 22, height: 22, borderRadius: '50%',
                background: `center/cover url(${profile.photoURL})`, marginRight: 6, verticalAlign: 'middle',
              }}
            />
          )}
          {user?.displayName || user?.email}
        </button>
      </div>

      {showOnlineList && isAdmin && createPortal(
        <div className="menu-overlay" onClick={() => setShowOnlineList(false)}>
          <div className="online-list-popover" onClick={(e) => e.stopPropagation()}>
            <div className="online-list-header">
              <span>🟢 Online Now ({onlineNames?.length ?? 0})</span>
              <button className="menu-close" onClick={() => setShowOnlineList(false)} aria-label="Close online users list">✕</button>
            </div>
            {(onlineNames || []).length === 0 ? (
              <div className="online-list-empty">No one online right now.</div>
            ) : (
              <div className="online-list-items">
                {(onlineNames || []).map((p) => (
                  <button
                    key={p.uid}
                    className="online-list-item online-list-item-btn"
                    onClick={() => { playTapSound(); setShowOnlineList(false); onViewUser?.(p.uid); }}
                  >
                    {p.name}{p.uid === user?.uid ? ' (You)' : ''}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}

      {menuOpen && createPortal(
        <div className="menu-overlay" onClick={() => setMenuOpen(false)}>
          <div className="menu-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="menu-drawer-header">
              <span className="topbar-logo">Med101</span>
              <button className="menu-close" onClick={() => setMenuOpen(false)} aria-label="Close menu">✕</button>
            </div>

            <button className="menu-user menu-user-btn" onClick={() => go(onProfile)} title="Your profile">
              🙍 {user?.displayName || user?.email}
            </button>

            <button className="menu-item" onClick={() => go(onHome)}>🏠 Home</button>

            <div className="menu-section-label">Study</div>
            <button className="menu-item" onClick={() => go(onSearch)}>🔍 Search Questions</button>
            <button className="menu-item" onClick={() => go(onWeakTopics)}>🎯 Your Weak Topics</button>
            <button className="menu-item" onClick={() => go(onWrongFlagged)}>📌 Wrong &amp; Flagged Questions</button>
            <button className="menu-item" onClick={() => go(onHistory)}>🕘 History</button>

            <div className="menu-section-label">Compete</div>
            <button className="menu-item" onClick={() => go(onLeaderboard)}>🏆 Leaderboard</button>
            <button className="menu-item" onClick={() => go(onFriends)}>👥 Friends &amp; Challenges</button>

            <div className="menu-section-label">Account</div>
            <button className="menu-item" onClick={() => go(onPremium)}>⭐ Get Med101 Maxx</button>
            <button className="menu-item" onClick={() => go(onSettings)}>⚙️ Settings</button>

            {isAdmin && (
              <>
                <div className="menu-section-label">For Admin Only</div>
                <button className="menu-item admin" onClick={() => go(onAdminNotice)}>📢 Home Notice</button>
                <button className="menu-item admin" onClick={() => go(onAdminCalendar)}>⚙️ Academic Calendar</button>
                <button className="menu-item admin" onClick={() => go(onAdminUploadQuestions)}>📤 Upload Questions</button>
                <button className="menu-item admin" onClick={() => go(onAdminUserDetail)}>🔍 View User Detail</button>
                <button className="menu-item admin" onClick={() => go(onAdminAnalytics)}>📊 Usage Analytics</button>
                <button className="menu-item admin" onClick={() => go(onAdminPayments)}>💳 Payments</button>
                <button className="menu-item admin" onClick={() => go(onAdminSubscribers)}>✅ Subscribers</button>
              </>
            )}

            <button className="menu-item signout" onClick={() => go(logOut)}>⏏ Sign Out</button>
          </div>
        </div>,
        document.body,
      )}
    </div>

    </>
  );
}
