import { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import AdminNoticeScreen from './AdminNoticeScreen';
import AdminCalendarScreen from './AdminCalendarScreen';
import AdminUserDetailScreen from './AdminUserDetailScreen';
import AdminAnalyticsScreen from './AdminAnalyticsScreen';
import AdminPaymentsScreen from './AdminPaymentsScreen';
import AdminSubscribersScreen from './AdminSubscribersScreen';
import './AdminPortal.css';

// Standalone admin-only surface, served at /admin. Separate from the
// main app's screen-state navigation (App.jsx) on purpose - this is a
// dedicated portal, not another "screen" inside the student SPA. It
// reuses the same Admin*Screen components the TopBar dropdown already
// links to on the main site, so there's exactly one implementation of
// each admin feature; this file just gives them their own home.
const TABS = [
  { id: 'payments', label: '💳 Payments' },
  { id: 'subscribers', label: '✅ Subscribers' },
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
    case 'payments': return <AdminPaymentsScreen onBack={noop} hideBack />;
    case 'subscribers': return <AdminSubscribersScreen onBack={noop} hideBack />;
    default: return null;
  }
}

function AdminLogin() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const ERROR_MESSAGES = {
    'auth/user-not-found': 'No account found with this email.',
    'auth/wrong-password': 'Incorrect password.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/too-many-requests': 'Too many failed attempts. Try again later.',
    'auth/network-request-failed': 'Network error. Check your connection.',
    'auth/invalid-credential': 'Invalid email or password.',
  };

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError(ERROR_MESSAGES[err.code] || err.message);
      setBusy(false);
    }
  }

  return (
    <form className="admin-login-form" onSubmit={handleSubmit}>
      <label className="auth-label">Email</label>
      <input
        className="auth-input"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="admin@med101.space"
        autoComplete="email"
        autoFocus
      />
      <label className="auth-label" style={{ marginTop: 14 }}>Password</label>
      <input
        className="auth-input"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="••••••••"
        autoComplete="current-password"
      />
      <button type="submit" className="admin-login-btn" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign In'}
      </button>
      {error && <div className="admin-login-error">{error}</div>}
    </form>
  );
}

export default function AdminPortal() {
  const { user, profile, loading, isAdmin, logOut } = useAuth();
  const [tab, setTab] = useState('payments');

  if (loading) {
    return <div className="admin-portal-loading">Loading…</div>;
  }

  if (!user) {
    // Let an admin sign in directly from /admin rather than bouncing
    // them to the main site first - deliberately bare: just email,
    // password, submit. No sign-up tab, no site branding.
    return (
      <div className="admin-portal-authwrap">
        <div className="admin-portal-authnote">Med101 Admin</div>
        <AdminLogin />
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
