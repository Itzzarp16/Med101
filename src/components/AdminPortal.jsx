import { useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { isLightMode, setTheme } from '../lib/theme';
import { useSemesterData } from '../lib/useSemesterData';
import useLockBodyScroll from '../lib/useLockBodyScroll';
import AdminHome from './AdminHome';
import { tiltHandlers } from '../lib/tilt';
import AdminNoticeScreen from './AdminNoticeScreen';
import AdminBroadcastScreen from './AdminBroadcastScreen';
import AdminCalendarScreen from './AdminCalendarScreen';
import AdminExamScheduleScreen from './AdminExamScheduleScreen';
import AdminQuestionReportsScreen from './AdminQuestionReportsScreen';
import AdminUserDetailScreen from './AdminUserDetailScreen';
import AdminAnalyticsScreen from './AdminAnalyticsScreen';
import AdminPaymentsScreen from './AdminPaymentsScreen';
import AdminSubscribersScreen from './AdminSubscribersScreen';
import AdminInvoicesScreen from './AdminInvoicesScreen';
import AdminUploadQuestionsScreen from './AdminUploadQuestionsScreen';
import AdminAnswerKeysScreen from './AdminAnswerKeysScreen';
import AdminPdfLibraryScreen from './AdminPdfLibraryScreen';
import AdminSecurityScreen from './AdminSecurityScreen';
import AdminBackupScreen from './AdminBackupScreen';
import { enrolledTotpFactors } from '../lib/mfa';
import './AdminPortal.css';
import './AdminTheme.css';
import './AdminRevamp.css';

// Standalone admin-only surface, served at /admin. Separate from the
// main app's screen-state navigation (App.jsx) on purpose - this is a
// dedicated portal, not another "screen" inside the student SPA. It
// reuses the same Admin*Screen components the TopBar dropdown already
// links to on the main site, so there's exactly one implementation of
// each admin feature; this file just gives them their own home.
const NAV_GROUPS = [
  { title: 'Overview', hue: 215, tabs: [
    { id: 'home', icon: '🏠', label: 'Overview', desc: 'All tools in one place' },
  ] },
  { title: 'Money', hue: 45, tabs: [
    { id: 'payments', icon: '💳', label: 'Payments', desc: 'Payments and the free-access switch' },
    { id: 'subscribers', icon: '✅', label: 'Subscribers', desc: 'Who has premium access' },
    { id: 'invoices', icon: '🧾', label: 'Invoices', desc: 'Find any invoice by its number' },
    { id: 'backup', icon: '💾', label: 'Backups', desc: 'Keep a safe copy of your data' },
  ] },
  { title: 'Content', hue: 215, tabs: [
    { id: 'notice', icon: '📢', label: 'Home Notice', desc: 'The banner on the student home screen' },
    { id: 'broadcast', icon: '🔔', label: 'Send Notification', desc: 'Push a message to students' },
    { id: 'calendar', icon: '⚙️', label: 'Academic Calendar', desc: 'Semester rollover dates' },
    { id: 'exams', icon: '📅', label: 'Exam Schedule', desc: 'Exam dates and when to reveal them' },
    { id: 'upload', icon: '📤', label: 'Upload Questions', desc: 'Add questions from PDF or Word' },
    { id: 'answer-keys', icon: '📄', label: 'Answer Keys', desc: 'Answer key PDFs for students' },
    { id: 'pdf-library', icon: '📚', label: 'PDF Library', desc: 'Subject PDFs shown in MedPDF' },
    { id: 'reports', icon: '🚩', label: 'Question Reports', desc: 'Questions students flagged' },
  ] },
  { title: 'Students', hue: 160, tabs: [
    { id: 'users', icon: '🔍', label: 'User Detail', desc: 'Look up and manage a student' },
    { id: 'analytics', icon: '📊', label: 'Usage Analytics', desc: 'See how the site is being used' },
  ] },
  { title: 'Account', hue: 280, tabs: [
    { id: 'security', icon: '🔐', label: 'Two-step login', desc: 'Protect your admin account' },
  ] },
];
const ALL_TABS = NAV_GROUPS.flatMap((g) => g.tabs);
const tabFromHash = () => {
  const id = window.location.hash.replace('#', '');
  return ALL_TABS.some((t) => t.id === id) ? id : 'home';
};

function AdminScreenFor({ tab, semesters, semesterMainSubjects, home }) {
  // Each screen still takes an onBack, since they're written as
  // full-screen views; here "back" just returns to the portal's own
  // tab bar instead of going anywhere.
  const noop = () => {};
  switch (tab) {
    case 'home': return home;
    case 'notice': return <AdminNoticeScreen onBack={noop} hideBack semesters={semesters} />;
    case 'broadcast': return <AdminBroadcastScreen onBack={noop} hideBack />;
    case 'calendar': return <AdminCalendarScreen onBack={noop} hideBack />;
    case 'exams': return <AdminExamScheduleScreen onBack={noop} hideBack />;
    case 'reports': return <AdminQuestionReportsScreen onBack={noop} hideBack />;
    case 'upload': return <AdminUploadQuestionsScreen onBack={noop} hideBack semesters={semesters} semesterMainSubjects={semesterMainSubjects} />;
    case 'answer-keys': return <AdminAnswerKeysScreen semesters={semesters} semesterMainSubjects={semesterMainSubjects} />;
    case 'pdf-library': return <AdminPdfLibraryScreen />;
    case 'users': return <AdminUserDetailScreen onBack={noop} initialUid={null} hideBack />;
    case 'analytics': return <AdminAnalyticsScreen onBack={noop} hideBack semesterMainSubjects={semesterMainSubjects} />;
    case 'payments': return <AdminPaymentsScreen onBack={noop} hideBack />;
    case 'subscribers': return <AdminSubscribersScreen onBack={noop} hideBack />;
    case 'invoices': return <AdminInvoicesScreen />;
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
  // Phones (<= 860px, see AdminPortal.css) get a hamburger + slide-in drawer
  // instead of the always-visible sidebar. On wider screens none of this shows.
  const [menuOpen, setMenuOpen] = useState(false);
  useLockBodyScroll(menuOpen);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    const mq = window.matchMedia('(min-width: 861px)');
    const onWide = () => { if (mq.matches) setMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    mq.addEventListener('change', onWide);
    return () => {
      window.removeEventListener('keydown', onKey);
      mq.removeEventListener('change', onWide);
    };
  }, [menuOpen]);
  // Each tab is a real history entry (like the main site and MedPDF), so the phone's
  // back gesture / browser back button steps back through the tabs you visited.
  const setTab = (id) => {
    if (id !== tabFromHash()) window.history.pushState(null, '', `#${id}`);
    setTabState(id);
    setMenuOpen(false);
    window.scrollTo(0, 0);
  };
  useEffect(() => {
    const sync = () => { setTabState(tabFromHash()); setMenuOpen(false); };
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    return () => { window.removeEventListener('popstate', sync); window.removeEventListener('hashchange', sync); };
  }, []);
  const { semesters, semesterMainSubjects } = useSemesterData();
  // Ambient 3D background: the shapes drift with the pointer and with scrolling.
  useEffect(() => {
    const root = document.documentElement;
    const move = (e) => {
      root.style.setProperty('--apx', ((e.clientX / window.innerWidth - 0.5) * 2).toFixed(3));
      root.style.setProperty('--apy', ((e.clientY / window.innerHeight - 0.5) * 2).toFixed(3));
    };
    const scroll = () => root.style.setProperty('--asy', String(window.scrollY));
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('scroll', scroll, { passive: true });
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('scroll', scroll);
    };
  }, []);

  if (loading) {
    return <div className="admin-portal-loading">Loading…</div>;
  }

  if (!user) {
    // Let an admin sign in directly from /admin rather than bouncing
    // them to the main site first - deliberately bare: just email,
    // password, submit. No sign-up tab, no site branding.
    return (
      <div className="admin-portal-authwrap">
        <div className="admin-bg3d" aria-hidden="true"><i className="a1" /><i className="a2" /><i className="a3" /></div>
        <div className="admin-login-card" {...tiltHandlers(8)}>
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

  const bg = <div className="admin-bg3d" aria-hidden="true"><i className="a1" /><i className="a2" /><i className="a3" /></div>;
  let navIdx = 0;
  const displayName = (profile?.name || user.email || 'Admin').split(' ')[0].split('@')[0];

  return (
    <div className="admin-portal">
      {bg}
      <div className="admin-mobilebar">
        <button
          className="admin-burger"
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
          aria-expanded={menuOpen}
          aria-controls="admin-drawer"
        >
          <span /><span /><span />
        </button>
        <a className="admin-mobilebar-name topbar-logo admin-logo-link" href="#home" onClick={(e) => { e.preventDefault(); setTab('home'); }} aria-label="Admin overview">Med101</a>
        <span className="admin-portal-badge">ADMIN</span>
      </div>
      {menuOpen && <div className="admin-drawer-overlay" onClick={() => setMenuOpen(false)} aria-hidden="true" />}

      <aside id="admin-drawer" className={menuOpen ? 'admin-side open' : 'admin-side'}>
        <button className="admin-drawer-close" onClick={() => setMenuOpen(false)} aria-label="Close menu">✕</button>
        <div className="admin-side-brand">
          <span className="admin-portal-badge">ADMIN</span>
          <a className="admin-side-name topbar-logo admin-logo-link" href="#home" onClick={(e) => { e.preventDefault(); setTab('home'); }} aria-label="Admin overview">Med101</a>
        </div>

        <nav className="admin-side-nav" aria-label="Admin sections">
          {NAV_GROUPS.map((g) => (
            <div key={g.title} className="admin-nav-group" style={{ '--h': g.hue }}>
              {g.title !== 'Overview' && <div className="admin-nav-grouptitle">{g.title}</div>}
              <div className="admin-nav-items">
                {g.tabs.map((t) => (
                  <button
                    key={t.id}
                    className={t.id === tab ? 'admin-nav-item active' : 'admin-nav-item'}
                    style={{ '--i': navIdx++ }}
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
            <span className="admin-title-icon" aria-hidden="true">{current?.icon}</span>
            <span>{current?.label}</span>
          </h1>
        </header>
        <main className="admin-portal-content" key={tab}>
          <AdminScreenFor
            tab={tab}
            semesters={semesters}
            semesterMainSubjects={semesterMainSubjects}
            home={<AdminHome groups={NAV_GROUPS} name={displayName} onOpen={setTab} />}
          />
        </main>
      </div>
    </div>
  );
}
