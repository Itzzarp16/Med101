import { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { isLightMode, setTheme } from '../lib/theme';
import { useSemesterData } from '../lib/useSemesterData';
import AdminNoticeScreen from './AdminNoticeScreen';
import AdminBroadcastScreen from './AdminBroadcastScreen';
import AdminCalendarScreen from './AdminCalendarScreen';
import AdminExamScheduleScreen from './AdminExamScheduleScreen';
import AdminQuestionReportsScreen from './AdminQuestionReportsScreen';
import AdminUserDetailScreen from './AdminUserDetailScreen';
import AdminAnalyticsScreen from './AdminAnalyticsScreen';
import AdminPaymentsScreen from './AdminPaymentsScreen';
import AdminSubscribersScreen from './AdminSubscribersScreen';
import AdminUploadQuestionsScreen from './AdminUploadQuestionsScreen';
import AdminSecurityScreen from './AdminSecurityScreen';
import AdminBackupScreen from './AdminBackupScreen';
import { enrolledTotpFactors } from '../lib/mfa';
import './AdminPortal.css';
import './AdminTheme.css';

// Standalone admin-only surface, served at /admin. Separate from the
// main app's screen-state navigation (App.jsx) on purpose - this is a
// dedicated portal, not another "screen" inside the student SPA. It
// reuses the same Admin*Screen components the TopBar dropdown already
// links to on the main site, so there's exactly one implementation of
// each admin feature; this file just gives them their own home.
const NAV_GROUPS = [
  { title: 'Money', tabs: [
    { id: 'payments', icon: '💳', label: 'Payments' },
    { id: 'subscribers', icon: '✅', label: 'Subscribers' },
    { id: 'backup', icon: '💾', label: 'Backups' },
  ] },
  { title: 'Content', tabs: [
    { id: 'notice', icon: '📢', label: 'Home Notice' },
    { id: 'broadcast', icon: '🔔', label: 'Send Notification' },
    { id: 'calendar', icon: '⚙️', label: 'Academic Calendar' },
    { id: 'exams', icon: '📅', label: 'Exam Schedule' },
    { id: 'upload', icon: '📤', label: 'Upload Questions' },
    { id: 'reports', icon: '🚩', label: 'Question Reports' },
  ] },
  { title: 'Students', tabs: [
    { id: 'users', icon: '🔍', label: 'User Detail' },
    { id: 'analytics', icon: '📊', label: 'Usage Analytics' },
  ] },
  { title: 'Account', tabs: [
    { id: 'security', icon: '🔐', label: 'Two-step login' },
  ] },
];
const ALL_TABS = NAV_GROUPS.flatMap((g) => g.tabs);
const tabFromHash = () => {
  const id = window.location.hash.replace('#', '');
  return ALL_TABS.some((t) => t.id === id) ? id : 'payments';
};

function AdminScreenFor({ tab, semesters, semesterMainSubjects }) {
  // Each screen still takes an onBack, since they're written as
  // full-screen views; here "back" just returns to the portal's own
  // tab bar instead of going anywhere.
  const noop = () => {};
  switch (tab) {
    case 'notice': return <AdminNoticeScreen onBack={noop} hideBack semesters={semesters} />;
    case 'broadcast': return <AdminBroadcastScreen onBack={noop} hideBack />;
    case 'calendar': return <AdminCalendarScreen onBack={noop} hideBack />;
    case 'exams': return <AdminExamScheduleScreen onBack={noop} hideBack />;
    case 'reports': return <AdminQuestionReportsScreen onBack={noop} hideBack />;
    case 'upload': return <AdminUploadQuestionsScreen onBack={noop} hideBack semesters={semesters} semesterMainSubjects={semesterMainSubjects} />;
    case 'users': return <AdminUserDetailScreen onBack={noop} initialUid={null} hideBack />;
    case 'analytics': return <AdminAnalyticsScreen onBack={noop} hideBack semesterMainSubjects={semesterMainSubjects} />;
    case 'payments': return <AdminPaymentsScreen onBack={noop} hideBack />;
    case 'subscribers': return <AdminSubscribersScreen onBack={noop} hideBack />;
    case 'backup': return <AdminBackupScreen />;
    case 'security': return <AdminSecurityScreen />;
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
      const signedIn = await signIn(email.trim(), password);
      if (!signedIn) setBusy(false); // waiting for the two-step code
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

// Admin accounts must sign in with the authenticator second step. A session
// without it only gets this page: enroll (first time) or sign in again with
// the code (already enrolled). Nothing else in the portal is reachable.
function TwoStepGate({ user, logOut }) {
  const enrolled = enrolledTotpFactors(user).length > 0;
  return (
    <div className="admin-portal-authwrap">
      <div className="admin-login-card" style={{ maxWidth: 560 }}>
        <span className="admin-portal-badge">ADMIN</span>
        <div className="admin-portal-authnote">Two-step login required</div>
        {enrolled ? (
          <>
            <p className="admin-login-sub">
              Two-step login is on for {user.email}, but this session did not use it. Sign out,
              then sign in again and enter the 6-digit code from your authenticator app.
            </p>
            <button className="admin-login-btn" onClick={logOut}>Sign out</button>
          </>
        ) : (
          <>
            <p className="admin-login-sub">
              Admin tools stay locked until you turn on two-step login for {user.email}. Set it up
              below, then sign out and sign back in with your code.
            </p>
            <div className="admin-portal" style={{ minHeight: 0, background: 'transparent', width: '100%', textAlign: 'left', display: 'block' }}>
              <AdminSecurityScreen />
            </div>
            <button className="admin-portal-logout" style={{ marginTop: 12 }} onClick={logOut}>Sign out</button>
          </>
        )}
      </div>
    </div>
  );
}

export default function AdminPortal() {
  const { user, profile, loading, isAdmin, isAdminAccount, adminChecked, logOut } = useAuth();
  const [tab, setTabState] = useState(tabFromHash);
  const [light, setLight] = useState(isLightMode());
  const toggleTheme = () => {
    const next = !light;
    setTheme(next ? 'light' : 'dark');
    setLight(next);
  };
  const setTab = (id) => {
    setTabState(id);
    window.history.replaceState(null, '', `#${id}`);
  };
  const { semesters, semesterMainSubjects } = useSemesterData();

  if (loading) {
    return <div className="admin-portal-loading">Loading…</div>;
  }

  if (!user) {
    // Let an admin sign in directly from /admin rather than bouncing
    // them to the main site first - deliberately bare: just email,
    // password, submit. No sign-up tab, no site branding.
    return (
      <div className="admin-portal-authwrap">
        <div className="admin-login-card">
          <span className="admin-portal-badge">ADMIN</span>
          <div className="admin-portal-authnote">Med101 Portal</div>
          <p className="admin-login-sub">Sign in with your admin account.</p>
          <AdminLogin />
        </div>
      </div>
    );
  }

  if (isAdminAccount && !adminChecked) {
    return <div className="admin-portal-loading">Loading…</div>;
  }

  if (isAdminAccount && !isAdmin) {
    return <TwoStepGate user={user} logOut={logOut} />;
  }

  if (!isAdmin) {
    return (
      <div className="admin-portal-denied">
        <div className="admin-login-card">
        <h1>🚫 Admins only</h1>
        <p>{profile?.name || user.email} isn't on the admin list for Med101.</p>
        <a href="/" className="admin-portal-link">← Back to Med101</a>
        </div>
      </div>
    );
  }

  const current = ALL_TABS.find((t) => t.id === tab);

  return (
    <div className="admin-portal">
      <aside className="admin-side">
        <div className="admin-side-brand">
          <span className="admin-portal-badge">ADMIN</span>
          <span className="admin-side-name">Med101</span>
        </div>

        <nav className="admin-side-nav" aria-label="Admin sections">
          {NAV_GROUPS.map((g) => (
            <div key={g.title} className="admin-nav-group">
              <div className="admin-nav-grouptitle">{g.title}</div>
              <div className="admin-nav-items">
                {g.tabs.map((t) => (
                  <button
                    key={t.id}
                    className={t.id === tab ? 'admin-nav-item active' : 'admin-nav-item'}
                    onClick={() => setTab(t.id)}
                    aria-current={t.id === tab ? 'page' : undefined}
                  >
                    <span className="admin-nav-icon" aria-hidden="true">{t.icon}</span>
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="admin-side-foot">
          <div className="admin-side-user" title={user.email}>{profile?.name || user.email}</div>
          <div className="admin-side-footlinks">
            <button
              className="admin-theme-btn"
              onClick={toggleTheme}
              aria-label={light ? 'Switch to dark mode' : 'Switch to light mode'}
              title={light ? 'Switch to dark mode' : 'Switch to light mode'}
            >
              {light ? '🌙' : '☀️'}
            </button>
            <a href="/" className="admin-portal-link">Main site</a>
            <button className="admin-portal-logout" onClick={logOut}>Log out</button>
          </div>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-portal-header">
          <h1 className="admin-page-title">
            <span aria-hidden="true">{current?.icon}</span> {current?.label}
          </h1>
        </header>
        <main className="admin-portal-content">
          <AdminScreenFor tab={tab} semesters={semesters} semesterMainSubjects={semesterMainSubjects} />
        </main>
      </div>
    </div>
  );
}
