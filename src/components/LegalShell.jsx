import { useAuth } from '../lib/AuthContext';
import { playTapSound } from '../lib/sounds';
import TopBar from './TopBar';
import './LegalShell.css';

// Wraps the public pages (About Us, Privacy Policy, Terms, Contact) with the
// same top bar the student app has: menu, Med101 logo, online count and the
// student's name/avatar. The pages themselves stay readable by anyone - when
// nobody is signed in the bar shrinks to the logo plus a "Sign in" button,
// and none of the signed-in-only parts (menu, online count) are mounted.
//
// These pages are separate routes from the student app (which lives at "/"),
// so every menu choice is a full page load into the app. The app opens the
// requested screen via /?open=<screen> (see OPEN_SCREENS in App.jsx).
const open = (screen) => () => {
  window.location.assign(screen ? `/?open=${screen}` : '/');
};

const TOP_BAR_PROPS = {
  onHome: open(),
  onSearch: open('search'),
  onWeakTopics: open('weak-topics'),
  onWrongFlagged: open('wrong-flagged'),
  onImportantMarked: open('important-marked'),
  onHistory: open('history'),
  onLeaderboard: open('leaderboard'),
  onFriends: open('friends'),
  onPremium: open('premium'),
  onSettings: open('settings'),
  onProfile: open('profile'),
  onAdminPayments: open('admin-payments'),
  onAdminSubscribers: open('admin-subscribers'),
  onAdminBackup: open('admin-backup'),
  onAdminNotice: open('admin-notice'),
  onAdminBroadcast: open('admin-broadcast'),
  onAdminCalendar: open('admin-calendar'),
  onAdminExams: open('admin-exams'),
  onAdminUploadQuestions: open('admin-upload-questions'),
  onAdminReports: open('admin-reports'),
  onAdminUserDetail: open('admin-user-detail'),
  onViewUser: open('admin-user-detail'),
  onAdminAnalytics: open('admin-analytics'),
  onAdminSecurity: open('admin-security'),
  screen: 'legal',
};

export default function LegalShell({ children }) {
  const { user, loading } = useAuth();

  return (
    <div className="legal-shell">
      {user ? (
        <TopBar {...TOP_BAR_PROPS} />
      ) : (
        <div className="topbar">
          <div className="topbar-left">
            <button
              className="topbar-logo-stack topbar-logo-stack-btn"
              title="Go to Home"
              aria-label="Go to Home"
              onClick={() => { playTapSound(); open()(); }}
            >
              <span className="topbar-logo">Med101</span>
              <span className="topbar-tagline">Learn. Practice. Improve.</span>
            </button>
          </div>
          <div className="topbar-right">
            {!loading && (
              <button className="topbar-user" onClick={() => { playTapSound(); open()(); }}>
                Sign in
              </button>
            )}
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
