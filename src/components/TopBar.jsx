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
export default function TopBar({ onHome, onLeaderboard, onSettings, onYourData, onChallenge, onFriends, onProfile, onWeakTopics, onWrongFlagged, onHistory, onSearch, onPremium, onAdminNotice, onAdminCalendar, onAdminUploadQuestions, onAdminUserDetail, onAdminAnalytics, onAdminPayments, onViewUser, screen }) {
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
            <button className="menu-item" onClick={() => go(onYourData)}>📄 Your Data</button>
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
                  transform="translate(2.5, 2.5) scale(0.79)"
                  d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.148-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"
                />
              </svg>
              WhatsApp Group
            </a>
            <button className="menu-item" onClick={() => go(onWeakTopics)}>🎯 Your Weak Topics</button>
            <button className="menu-item" onClick={() => go(onWrongFlagged)}>📌 Wrong &amp; Flagged Questions</button>
            <button className="menu-item" onClick={() => go(onSearch)}>🔍 Search Questions</button>
            <button className="menu-item" onClick={() => go(onHistory)}>🕘 History</button>
            <button className="menu-item" onClick={() => go(onPremium)}>⭐ Get Med101 Maxx</button>

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
