import { useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { playTapSound, isMuted, setMuted } from '../lib/sounds';
import { isLightMode, setTheme } from '../lib/theme';
import { subscribeToOnlineCount, subscribeToOnlineNames } from '../lib/presence';

// Everything except the Med101 logo/signature and the user's own name
// now lives behind a hamburger menu - matches the drawer content the
// user sketched out: existing features first, admin-only ones in their
// own section. Items not yet built (change user ID/password/name, a
// dedicated profile screen, wrong/flagged questions) are left out until
// they actually exist.
export default function TopBar({ onHome, onLeaderboard, onSettings, onChallenge, onFriends, onProfile, onWeakTopics, onWrongFlagged, onHistory, onSearch, onPremium, onAdminNotice, onAdminCalendar, onAdminUploadQuestions, onAdminUserDetail, onAdminAnalytics, onAdminPayments, onViewUser, screen }) {
  const { user, profile, isAdmin, logOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [onlineCount, setOnlineCount] = useState(null);
  const [onlineNames, setOnlineNames] = useState(null);
  const [showOnlineList, setShowOnlineList] = useState(false);
  const [lightMode, setLightMode] = useState(isLightMode());
  const [soundMuted, setSoundMuted] = useState(isMuted());

  function toggleLightMode() {
    const next = !lightMode;
    playTapSound();
    setLightMode(next);
    setTheme(next ? 'light' : 'dark');
  }

  function toggleSound() {
    const next = !soundMuted;
    setMuted(next);
    setSoundMuted(next);
    if (!next) playTapSound(); // only chime when turning sound back ON
  }

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
        <button className="topbar-icon-btn home" title="Menu" onClick={() => { playTapSound(); setMenuOpen(true); }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" y1="7" x2="20" y2="7" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="17" x2="20" y2="17" />
          </svg>
        </button>

        <button
          className="topbar-logo-stack topbar-logo-stack-btn"
          title="Go to Home"
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

      {showOnlineList && isAdmin && (
        <div className="menu-overlay" onClick={() => setShowOnlineList(false)}>
          <div className="online-list-popover" onClick={(e) => e.stopPropagation()}>
            <div className="online-list-header">
              <span>🟢 Online Now ({onlineNames?.length ?? 0})</span>
              <button className="menu-close" onClick={() => setShowOnlineList(false)}>✕</button>
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
        </div>
      )}

      {menuOpen && (
        <div className="menu-overlay" onClick={() => setMenuOpen(false)}>
          <div className="menu-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="menu-drawer-header">
              <span className="topbar-logo">Med101</span>
              <button className="menu-close" onClick={() => setMenuOpen(false)}>✕</button>
            </div>

            <div className="menu-user">{user?.displayName || user?.email}</div>

            <button className="menu-item" onClick={() => go(onHome)}>🏠 Home</button>
            <button className="menu-item" onClick={() => go(onLeaderboard)}>🏆 Leaderboard</button>
            <button className="menu-item" onClick={() => go(onProfile)}>🙍 Your Profile</button>
            <button className="menu-item" onClick={() => go(onSettings)}>🎓 Change Year &amp; Semester</button>
            <button className="menu-item" onClick={() => go(onChallenge)}>👥 Challenge a Friend</button>
            <button className="menu-item" onClick={() => go(onFriends)}>🧑‍🤝‍🧑 Friends</button>
            <a
              className="menu-item"
              href="https://chat.whatsapp.com/Kn2NDwg7Wij5VQbs35hYMx?s=cl&p=a&mlu=4&ilr=4"
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: 'none' }}
              onClick={() => { playTapSound(); setMenuOpen(false); }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" style={{ verticalAlign: '-3px', marginRight: 6 }}>
                <circle cx="12" cy="12" r="12" fill="#25D366" />
                <path
                  fill="#fff"
                  d="M12 5.5a6.5 6.5 0 0 0-5.6 9.8L5.5 18.5l3.3-.87A6.5 6.5 0 1 0 12 5.5Zm0 1.3a5.2 5.2 0 0 1 4.42 7.95l-.16.26.63 2.3-2.36-.62-.25.15A5.2 5.2 0 1 1 12 6.8Zm-2.62 2.62c-.14 0-.36.05-.55.27-.19.21-.72.7-.72 1.72s.74 2 .84 2.13c.1.14 1.44 2.2 3.5 3.08 1.72.74 2.07.59 2.44.55.37-.04 1.2-.49 1.37-.96.17-.47.17-.87.12-.96-.05-.08-.19-.13-.4-.23-.2-.1-1.2-.6-1.39-.66-.19-.07-.32-.1-.46.1-.14.21-.53.66-.65.79-.12.14-.24.15-.44.05-.2-.1-.87-.32-1.65-1.02-.61-.54-1.02-1.21-1.14-1.42-.12-.2-.01-.31.09-.41.09-.09.2-.24.3-.36.1-.12.13-.2.2-.34.07-.14.03-.26-.02-.36-.05-.1-.46-1.11-.63-1.51-.16-.4-.33-.34-.46-.35Z"
                />
              </svg>
              WhatsApp Group
            </a>
            <button className="menu-item" onClick={() => go(onWeakTopics)}>🎯 Your Weak Topics</button>
            <button className="menu-item" onClick={() => go(onWrongFlagged)}>📌 Wrong &amp; Flagged Questions</button>
            <button className="menu-item" onClick={() => go(onSearch)}>🔍 Search Questions</button>
            <button className="menu-item" onClick={() => go(onHistory)}>🕘 History</button>
            <button className="menu-item" onClick={() => go(onPremium)}>⭐ Get Premium</button>

            {isAdmin && (
              <>
                <div className="menu-section-label">For Admin Only</div>
                <button className="menu-item admin" onClick={() => go(onAdminNotice)}>📢 Home Notice</button>
                <button className="menu-item admin" onClick={() => go(onAdminCalendar)}>⚙️ Academic Calendar</button>
                <button className="menu-item admin" onClick={() => go(onAdminUploadQuestions)}>📤 Upload Questions</button>
                <button className="menu-item admin" onClick={() => go(onAdminUserDetail)}>🔍 View User Detail</button>
                <button className="menu-item admin" onClick={() => go(onAdminAnalytics)}>📊 Usage Analytics</button>
                <button className="menu-item admin" onClick={() => go(onAdminPayments)}>💳 Payments</button>
              </>
            )}

            <button className="menu-item signout" onClick={() => go(logOut)}>⏏ Sign Out</button>
          </div>
        </div>
      )}
    </div>

    {screen === 'dashboard' && (
      <div className="topbar-subrow">
        <button
          className="topbar-icon-btn theme"
          title={lightMode ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
          onClick={toggleLightMode}
        >
          {lightMode ? '☀️' : '🌙'}
        </button>
        <button
          className={soundMuted ? 'topbar-icon-btn sound muted' : 'topbar-icon-btn sound'}
          title={soundMuted ? 'Unmute sound' : 'Mute sound'}
          onClick={toggleSound}
        >
          {soundMuted ? '🔇' : '🔊'}
        </button>
      </div>
    )}
    </>
  );
}
