import { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import AdminNoticeScreen from './AdminNoticeScreen';
import AdminCalendarScreen from './AdminCalendarScreen';
import AdminUserDetailScreen from './AdminUserDetailScreen';
import AdminAnalyticsScreen from './AdminAnalyticsScreen';
import AuthScreen from './AuthScreen';
import './AdminPortal.css';

// Standalone admin-only surface, served at /admin. Separate from the
// main app's screen-state navigation (App.jsx) on purpose - this is a
// dedicated portal, not another "screen" inside the student SPA. It
// reuses the same Admin*Screen components the TopBar dropdown already
// links to on the main site, so there's exactly one implementation of
// each admin feature; this file just gives them their own home.
const TABS = [
  { id: 'notice', label: '📢 Home Notice' },
  { id: 'calendar', label: '⚙️ Academic Calendar' },
  { id: 'users', label: '🔍 User Detail' },
  { id: 'analytics', label: '📊 Usage Analytics' },
];

function AdminScreenFor({ tab }) {
  // Each screen still takes an onBack, since they're written as
  // full-screen views; here "back" just returns to the portal's own
  // tab bar instead of going anywhere.
  const noop = () => {};
  switch (tab) {
    case 'notice': return <AdminNoticeScreen onBack={noop} hideBack />;
    case 'calendar': return <AdminCalendarScreen onBack={noop} hideBack />;
    case 'users': return <AdminUserDetailScreen onBack={noop} initialUid={null} hideBack />;
    case 'analytics': return <AdminAnalyticsScreen onBack={noop} hideBack />;
    default: return null;
  }
}

export default function AdminPortal() {
  const { user, profile, loading, isAdmin, logOut } = useAuth();
  const [tab, setTab] = useState('notice');

  if (loading) {
    return <div className="admin-portal-loading">Loading…</div>;
  }

  if (!user) {
    // Let an admin sign in directly from /admin rather than bouncing
    // them to the main site first.
    return (
      <div className="admin-portal-authwrap">
        <div className="admin-portal-authnote">Med101 Admin Portal</div>
        <AuthScreen />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="admin-portal-denied">
        <h1>🚫 Admins only</h1>
        <p>{profile?.name || user.email} isn't on the admin list for Med101.</p>
        <a href="/" className="admin-portal-link">← Back to Med101</a>
      </div>
    );
  }

  return (
    <div className="admin-portal">
      <header className="admin-portal-header">
        <div className="admin-portal-title">
          <span className="admin-portal-badge">ADMIN</span>
          Med101 Portal
        </div>
        <div className="admin-portal-headeractions">
          <a href="/" className="admin-portal-link">Main site</a>
          <button className="admin-portal-logout" onClick={logOut}>Log out</button>
        </div>
      </header>

      <nav className="admin-portal-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={t.id === tab ? 'admin-portal-tab active' : 'admin-portal-tab'}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="admin-portal-content">
        <AdminScreenFor tab={tab} />
      </main>
    </div>
  );
}
