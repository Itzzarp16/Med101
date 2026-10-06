import { useEffect, useRef, useState, lazy, Suspense } from 'react';
import { Analytics } from '@vercel/analytics/react';
import TopBar from './components/TopBar';
import Dashboard from './components/Dashboard';
import SubtopicScreen from './components/SubtopicScreen';
import SlideStack from './components/SlideStack';
import StuckLoaderHelp from './components/StuckLoaderHelp';
import { viewTransition } from './lib/viewTransition';
import QuizModeScreen from './components/QuizModeScreen';
import QuizScreen from './components/QuizScreen';
import { subscribeToMyPremiumStatus, subscribeToSubscriptionConfig, premiumCoversSemester, isFreeLabel, activateFreeSemester } from './lib/subscription';
import AuthScreen from './components/AuthScreen';
import WhatsAppPromptModal from './components/WhatsAppPromptModal';
import OnboardingTour from './components/OnboardingTour';
import NotificationGateModal from './components/NotificationGateModal';
import { joinRoom } from './lib/rooms';
import { useAuth } from './lib/AuthContext';
import { useSemesterData } from './lib/useSemesterData';
import { subscribeToAcademicCalendar, resolveCurrentSemester } from './lib/academicCalendar';
import { startPresenceHeartbeat } from './lib/presence';
import { saveNavState, loadNavState, clearNavState } from './lib/navPersistence';
import { loadResumeSnapshot, clearQuizProgress, saveQuizProgress } from './lib/quizProgress';
import { loadCloudSnapshot, deleteCloudSnapshot } from './lib/quizResumeCloud';
import ResumeQuizCard from './components/ResumeQuizCard';
import IntroOverlay from './components/IntroOverlay';
import { shouldPlayIntro } from './lib/intro';

// Dashboard/SubtopicScreen/QuizModeScreen/QuizScreen above stay
// normal static imports - together they're the one back-to-back path
// every student takes on every single visit (land on Dashboard, pick
// a subtopic, pick a mode, take the quiz), so there's no good spot to
// add a chunk-fetch pause without it being felt on the app's single
// most common interaction.
//
// Everything below is reached via an explicit, occasional navigation
// (a hamburger-menu item, a topbar button, a challenge link) rather
// than being part of that default flow, so each is its own lazy
// chunk instead of dead weight on every visitor's first load - same
// reasoning as the Admin*/legal-page split in main.jsx.
const LeaderboardScreen = lazy(() => import('./components/LeaderboardScreen'));
const ChallengeScreen = lazy(() => import('./components/ChallengeScreen'));
const FriendsScreen = lazy(() => import('./components/FriendsScreen'));
const RoomLobbyScreen = lazy(() => import('./components/RoomLobbyScreen'));
const RoomResultsScreen = lazy(() => import('./components/RoomResultsScreen'));
const SettingsScreen = lazy(() => import('./components/SettingsScreen'));
const YourDataScreen = lazy(() => import('./components/YourDataScreen'));
const ProfileScreen = lazy(() => import('./components/ProfileScreen'));
const WeakTopicsScreen = lazy(() => import('./components/WeakTopicsScreen'));
// One list screen serves both menu items (kind="wrong" / kind="flagged").
const ReviewListScreen = lazy(() => import('./components/ReviewListScreen'));
const SearchScreen = lazy(() => import('./components/SearchScreen'));
const HistoryScreen = lazy(() => import('./components/HistoryScreen'));
const PremiumScreen = lazy(() => import('./components/PremiumScreen'));

// Only ever rendered for isAdmin accounts - a handful of people, not
// the student body this app is actually sized for - so these are
// lazy-loaded instead of shipped in the main bundle every visitor
// downloads and parses on first load. React.lazy + the Suspense
// fallback below means the first time an admin opens one of these,
// there's a brief loading state while its chunk fetches; every other
// visitor never pays for that code at all.
const AdminCalendarScreen = lazy(() => import('./components/AdminCalendarScreen'));
const AdminUploadQuestionsScreen = lazy(() => import('./components/AdminUploadQuestionsScreen'));
const AdminNoticeScreen = lazy(() => import('./components/AdminNoticeScreen'));
const AdminExamScheduleScreen = lazy(() => import('./components/AdminExamScheduleScreen'));
const AdminQuestionReportsScreen = lazy(() => import('./components/AdminQuestionReportsScreen'));
const AdminBroadcastScreen = lazy(() => import('./components/AdminBroadcastScreen'));
const AdminBackupScreen = lazy(() => import('./components/AdminBackupScreen'));
const AdminSecurityScreen = lazy(() => import('./components/AdminSecurityScreen'));
const AdminUserDetailScreen = lazy(() => import('./components/AdminUserDetailScreen'));
const AdminAnalyticsScreen = lazy(() => import('./components/AdminAnalyticsScreen'));
const AdminPaymentsScreen = lazy(() => import('./components/AdminPaymentsScreen'));
const AdminSubscribersScreen = lazy(() => import('./components/AdminSubscribersScreen'));

function AdminScreenFallback() {
  return <div className="std-loading">Loading…</div>;
}

// Same fallback, generic name for the non-admin lazy screens below.
const ScreenFallback = AdminScreenFallback;


// Navigation is backed by real browser history (pushState/popstate) so
// the phone's back gesture moves one screen back instead of closing the
// whole site - every forward navigation goes through goTo(), every
// "back" action goes through goBack() (== history.back()), and a
// popstate listener keeps `screen` in sync with whichever entry the
// user lands on.
export default function App() {
  const { user, profile, loading, isAdmin, kickedMessage, setKickedMessage, signupNotice, setSignupNotice, showWhatsAppPrompt, setShowWhatsAppPrompt, showOnboardingTour, finishOnboardingTour, needsGoogleProfileSetup } = useAuth();
  const semesterData = useSemesterData();
  // A hard page refresh loses all in-memory React state, but the
  // student should land back on whatever screen they were on (e.g. a
  // quiz in progress) rather than being dumped to the dashboard. This
  // restores the last-saved navigation snapshot once on mount - the
  // saving side is the useEffect further down.
  const savedNavRef = useState(() => loadNavState())[0];

  const [screen, setScreen] = useState(savedNavRef?.screen || 'dashboard');
  const [selectedSubject, setSelectedSubject] = useState(savedNavRef?.selectedSubject ?? null);
  const [selectedTopic, setSelectedTopic] = useState(savedNavRef?.selectedTopic ?? null); // null = "All Topics" within subject
  const [resumeSnap, setResumeSnap] = useState(null); // unfinished solo quiz saved on this device
  const [finalQuiz, setFinalQuiz] = useState(savedNavRef?.finalQuiz ?? null); // { questions, autoAdvance, timerSeconds } once mode is chosen
  const [quizKey, setQuizKey] = useState(0); // bumped to force QuizScreen to remount fresh on Restart Same / Retry Wrong

  // Premium status - a live subscription (not a one-time check), so
  // approving a payment unlocks access immediately without the student
  // needing to hard-refresh or sign out and back in. Defaults to false
  // (not premium) until the first snapshot arrives, so the paywall
  // fails closed rather than briefly over-granting access.
  // The student's full premium status, including every activated
  // subscription and the semester each one is scoped to (null =
  // unrestricted, e.g. admin-granted or a pre-per-semester-pricing
  // code). A student who paid for Semester 1 only gets full access
  // while actually viewing Semester 1 - switching their enrolled
  // semester in Settings drops them back to the free preview for
  // whatever semester they switch to, unless they've paid for that
  // one too.
  const [premiumStatus, setPremiumStatus] = useState(null);
  // Already allowed notifications? Quietly refresh this device's token.
  const pushUid = user?.uid;
  useEffect(() => {
    if (!pushUid) return;
    import('./lib/push').then((m) => m.syncPushToken());
  }, [pushUid]);

  useEffect(() => {
    if (!user?.uid) { setPremiumStatus(null); return; }
    return subscribeToMyPremiumStatus(user.uid, setPremiumStatus);
  }, [user?.uid]);

  // The actual gate used everywhere content is unlocked: true if ANY
  // active subscription is unrestricted or covers the semester
  // currently being viewed.
  const isPremiumForCurrentSemester = premiumCoversSemester(premiumStatus, profile?.enrolledYearSemester);

  // Admin can temporarily make Premium free for everyone (e.g. a
  // promo, or just pausing monetization for a while) without touching
  // anyone's actual subscription records - this is a display-time
  // override only, combined into the isPremium prop passed down below.
  // Live subscription so flipping it takes effect for every open tab
  // immediately, same as everything else in this app.
  const [premiumPaused, setPremiumPaused] = useState(false);
  // Full subscription config (not just the premiumPaused flag) so the
  // auto-free-activation effect below can read pricing without waiting
  // for the student to open the Premium screen - previously a free
  // semester only got auto-granted there, so a student who never
  // opened Premium stayed locked out even though their semester is $0.
  const [subscriptionConfig, setSubscriptionConfig] = useState(null);
  useEffect(() => {
    return subscribeToSubscriptionConfig((config) => {
      setSubscriptionConfig(config || null);
      setPremiumPaused(!!config?.premiumPaused);
    });
  }, []);

  // Auto-activate free access app-wide the moment we know the
  // student's current semester is priced 0, without requiring a visit
  // to the Premium screen (mirrors the same auto-activation effect
  // there, which still covers a student paying for/viewing a
  // different semester via the picker). Guarded by a ref so a slow
  // network doesn't fire it twice while the first call is in flight.
  const autoActivatingFreeRef = useRef(false);
  useEffect(() => {
    if (!user?.uid || !profile?.enrolledYearSemester) return;
    if (premiumStatus === null || subscriptionConfig === null) return; // not loaded yet
    if (premiumPaused || isPremiumForCurrentSemester) return;
    const label = subscriptionConfig.priceLabelsBySemester?.[profile.enrolledYearSemester] || subscriptionConfig.priceLabel;
    if (!isFreeLabel(label)) return;
    if (autoActivatingFreeRef.current) return;
    autoActivatingFreeRef.current = true;
    activateFreeSemester()
      .catch((e) => console.warn('Auto free-semester activation failed:', e))
      .finally(() => { autoActivatingFreeRef.current = false; });
    // isPremiumForCurrentSemester flips true on its own once the new
    // activationCode doc lands (subscribeToMyPremiumStatus is live) -
    // no need to set any local state here.
  }, [user?.uid, profile?.enrolledYearSemester, premiumStatus, subscriptionConfig, premiumPaused, isPremiumForCurrentSemester]);
  const [activeSemesterId, setActiveSemesterId] = useState(null);
  const [calendarLoading, setCalendarLoading] = useState(true);
  // Cinematic intro after the first loading screen (see lib/intro.js for when it plays).
  const [introDone, setIntroDone] = useState(() => !shouldPlayIntro());
  const [loaderPhase, setLoaderPhase] = useState('loading'); // 'loading' | 'completing' | 'done' - drives the loading-bar finish animation
  // Splash bar runs ONCE: eases from 0 toward ~90% (decelerating, so it
  // never looks frozen however long loading takes), then snaps to 100%
  // when loading really finishes. Armed after first paint so the
  // transition has a 0% starting point to animate from.
  const [loaderBarArmed, setLoaderBarArmed] = useState(false);
  // The reveal ring is removed from the DOM the moment its animation is
  // over (it must never be able to show again afterwards).
  const [bootRingDone, setBootRingDone] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setLoaderBarArmed(true)));
    return () => cancelAnimationFrame(id);
  }, []);
  const logoStackRef = useRef(null);
  const topbarGhostLogoRef = useRef(null); // invisible copy of the real topbar logo, measured as the fly target
  const [logoFlyStyle, setLogoFlyStyle] = useState(null);
  const [activeRoomCode, setActiveRoomCode] = useState(savedNavRef?.activeRoomCode ?? null);
  const [activeRoomIsHost, setActiveRoomIsHost] = useState(savedNavRef?.activeRoomIsHost ?? false);
  const [viewUserUid, setViewUserUid] = useState(savedNavRef?.viewUserUid ?? null);
  // Set when a friend is tapped in FriendsScreen - carries {uid, username}
  // through the Challenge -> Room Lobby flow so the lobby can auto-invite
  // them once the room exists. Cleared once the invite is sent (or on back).
  const [challengeFriend, setChallengeFriend] = useState(null);
  // Set when the leaderboard is opened from the Friends screen so it starts on
  // "Friends only"; cleared whenever we're on any other screen so opening it
  // from the menu later still starts on "Everyone".
  const [lbFriendsOnly, setLbFriendsOnly] = useState(false);
  useEffect(() => { if (screen !== 'leaderboard') setLbFriendsOnly(false); }, [screen]);

  // Screens that already animate between each other with SlideStack's own
  // swipe. Moving between two of these skips the page-level transition so
  // the two animations never stack.
  const SLIDE_STACK_SCREENS = ['dashboard', 'subtopic', 'mode', 'quiz', 'subject-soon'];
  const screenRef = useRef(screen);
  useEffect(() => { screenRef.current = screen; }, [screen]);

  function changeScreen(next, apply) {
    const prev = screenRef.current;
    if (SLIDE_STACK_SCREENS.includes(prev) && SLIDE_STACK_SCREENS.includes(next)) {
      apply();
      return;
    }
    viewTransition(apply);
  }

  // Seed a base history entry on mount (matching whatever screen was
  // restored above, so the back gesture stays consistent), then listen
  // for the back/forward gesture and sync our screen state to whatever
  // entry it lands on.
  useEffect(() => {
    window.history.replaceState(
      { screen: savedNavRef?.screen || 'dashboard', selectedSubject: savedNavRef?.selectedSubject ?? null, selectedTopic: savedNavRef?.selectedTopic ?? null },
      ''
    );
    function onPopState(e) {
      document.documentElement.dataset.nav = 'back'; // drives the slide direction (tokens.css)
      const state = e.state || { screen: 'dashboard' };
      changeScreen(state.screen, () => {
        setScreen(state.screen);
        setSelectedSubject(state.selectedSubject ?? null);
        setSelectedTopic(state.selectedTopic ?? null);
      });
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist a restore-on-refresh snapshot every time navigation-relevant
  // state changes. Cleared entirely on sign-out so a different account
  // signing in later never inherits a stale in-progress quiz.
  useEffect(() => {
    if (!user) {
      clearNavState();
      return;
    }
    saveNavState({ screen, selectedSubject, selectedTopic, finalQuiz, activeRoomCode, activeRoomIsHost, viewUserUid });
  }, [user, screen, selectedSubject, selectedTopic, finalQuiz, activeRoomCode, activeRoomIsHost, viewUserUid]);

  // Forward navigation: pushes a new history entry so the back gesture
  // can return to wherever the student was.
  // Look for an unfinished quiz whenever the dashboard is showing: the local
  // copy instantly, then the Firestore copy (so a quiz started on another
  // device shows up too). The newest usable one wins. The cloud read is
  // skipped if it was done in the last minute and no quiz has run since.
  const cloudCheckRef = useRef({ at: 0, snap: null });
  useEffect(() => {
    if (screen === 'quiz') cloudCheckRef.current = { at: 0, snap: null };
    if (screen !== 'dashboard' || !user) { setResumeSnap(null); return undefined; }
    const usableOf = (snap) => {
      if (!snap || snap.roomCode || (snap.uid && snap.uid !== user.uid)) return null;
      const answered = snap.answers.filter((a) => a !== -1).length;
      return (answered > 0 || snap.cur > 0) && answered < snap.questions.length ? snap : null;
    };
    const newest = (x, y) => (x && y ? (x.savedAt >= y.savedAt ? x : y) : (x || y));
    const local = usableOf(loadResumeSnapshot());
    setResumeSnap(newest(local, usableOf(cloudCheckRef.current.snap)));

    let cancelled = false;
    if (Date.now() - cloudCheckRef.current.at > 60000) {
      loadCloudSnapshot(user.uid).then((cloud) => {
        cloudCheckRef.current = { at: Date.now(), snap: cloud };
        if (!cancelled) setResumeSnap(newest(usableOf(loadResumeSnapshot()), usableOf(cloud)));
      });
    }
    return () => { cancelled = true; };
  }, [screen, user]);

  function goTo(screenName, extra = {}) {
    const nextSubject = 'selectedSubject' in extra ? extra.selectedSubject : selectedSubject;
    const nextTopic = 'selectedTopic' in extra ? extra.selectedTopic : selectedTopic;
    // Slide direction: returning to the dashboard reads as "back", everything else as deeper.
    document.documentElement.dataset.nav = screenName === 'dashboard' ? 'back' : 'forward';
    window.history.pushState({ screen: screenName, selectedSubject: nextSubject, selectedTopic: nextTopic }, '');
    changeScreen(screenName, () => {
      if ('selectedSubject' in extra) setSelectedSubject(extra.selectedSubject);
      if ('selectedTopic' in extra) setSelectedTopic(extra.selectedTopic);
      setScreen(screenName);
    });
  }

  // Back navigation: goes through the browser's own history stack so it
  // stays perfectly in sync with the device back gesture.
  function goBack() {
    window.history.back();
  }

  function goHome() {
    goTo('dashboard');
  }

  // Deep links from push notifications: a cold start opens /?open=<screen>,
  // and when the app is already open the service worker posts a message.
  // Only these screens can be opened this way.
  useEffect(() => {
    if (!user?.uid) return undefined;
    // Notification taps and the top bar on the public pages (About, Privacy,
    // Terms, Contact) open the app on one of these. Admin screens guard
    // themselves, so listing them here doesn't let anyone in.
    const OPEN_SCREENS = [
      'leaderboard', 'challenge', 'friends', 'weak-topics', 'history',
      'search', 'wrong-flagged', 'important-marked', 'premium', 'settings', 'profile',
      'admin-payments', 'admin-subscribers', 'admin-backup', 'admin-notice', 'admin-broadcast',
      'admin-calendar', 'admin-exams', 'admin-upload-questions', 'admin-reports',
      'admin-user-detail', 'admin-analytics', 'admin-security',
    ];
    const params = new URLSearchParams(window.location.search);
    const target = params.get('open');
    if (target) {
      params.delete('open');
      const qs = params.toString();
      window.history.replaceState(window.history.state, '', window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash);
      if (OPEN_SCREENS.includes(target)) goTo(target);
    }
    function onSwMessage(e) {
      const t = e.data && e.data.type === 'open-screen' ? e.data.screen : null;
      if (t && OPEN_SCREENS.includes(t)) goTo(t);
    }
    navigator.serviceWorker?.addEventListener('message', onSwMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', onSwMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  // Resolve which semester this student should actually see, the moment
  // their profile (which holds enrolledYearSemester) is available. Also
  // re-runs automatically whenever the student changes it themselves in
  // Settings, since `profile` updates live via the AuthContext listener.
  useEffect(() => {
    let cancelled = false;
    if (!profile) {
      // profile can legitimately stay null for a beat while its
      // Firestore listener is still resolving, but if it never arrives
      // (a permissions hiccup, a missing profile doc, etc.) this screen
      // must not just hang forever with no way forward - fall back to
      // the default calendar/semester after a few seconds so the
      // student always reaches the app.
      const fallbackTimer = setTimeout(() => {
        if (!cancelled && calendarLoading) {
          console.warn('Profile never loaded, proceeding with default semester.');
          setActiveSemesterId('y1s1');
          setCalendarLoading(false);
        }
      }, 6000);
      return () => { cancelled = true; clearTimeout(fallbackTimer); };
    }

    const unsubCalendar = subscribeToAcademicCalendar((calendar) => {
      if (cancelled) return;
      const availableSemesterIds = Object.keys(semesterData.semesterMainSubjects || {});
      const semId = resolveCurrentSemester(profile.enrolledYearSemester || 'y1s1', calendar, new Date(), availableSemesterIds);
      setActiveSemesterId(semId);
      setCalendarLoading(false);
    });

    return () => { cancelled = true; unsubCalendar(); };
  }, [profile, semesterData.semesterMainSubjects]);

  // Loading-bar finish sequence: the moment both real loading steps
  // are actually done, snap the indeterminate sweep to a solid 100%
  // fill for a beat, then fly the logo up toward the top bar's
  // position before finally swapping to the real app - so the logo
  // reads as *becoming* the top bar logo rather than the loader just
  // vanishing and a separate small logo appearing in its place.
  useEffect(() => {
    // Hold the finish sequence until the intro is over, so the logo reveal
    // plays after it instead of unseen behind it.
    if (semesterData.loading || calendarLoading || !introDone) {
      if (loaderPhase !== 'loading') setLoaderPhase('loading');
      return;
    }
    if (loaderPhase !== 'loading') return; // already completing/flying/done
    setLoaderPhase('completing');
    const t1 = setTimeout(() => setLoaderPhase('flying'), 380);
    const t2 = setTimeout(() => setLoaderPhase('done'), 380 + 2400);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [semesterData.loading, calendarLoading, introDone]);

  // Presence heartbeat - pings this session as "online" every 30s so
  // the topbar can show a live headcount of currently active students.
  useEffect(() => {
    if (!user) return;
    return startPresenceHeartbeat(user.uid, user.displayName || user.email);
  }, [user]);

  // Compute the logo's fly-to-topbar animation using real measured
  // pixels (captured once via getBoundingClientRect + window
  // dimensions) instead of vh/vw CSS units. vh/vw recalculate live as
  // mobile Chrome's address bar shows/hides during page load, which
  // was causing the animation to visibly jump/glitch mid-flight.
  //
  // IMPORTANT: this hook must stay above every early return in this
  // component (Settings/Profile/Admin screens etc. below all return
  // early) - React requires the same hooks to run in the same order on
  // every render of a given component instance. Having this effect
  // declared after those returns meant it was skipped on some renders
  // (Settings, Profile, any admin screen) but called on others
  // (Dashboard, still-loading), which is exactly what triggered
  // "Minified React error #310 - rendered fewer hooks than expected".
  useEffect(() => {
    if (loaderPhase === 'completing' || loaderPhase === 'flying') {
      // Centre of where the logo lands: the circular boot reveal (see
      // motion.css) expands outward from exactly this point.
      const g = topbarGhostLogoRef.current?.getBoundingClientRect();
      if (g) {
        const root = document.documentElement.style;
        root.setProperty('--boot-x', `${Math.round(g.left + g.width / 2)}px`);
        root.setProperty('--boot-y', `${Math.round(g.top + g.height / 2)}px`);
      }
    }
    if (loaderPhase !== 'flying') {
      setLogoFlyStyle(null);
      return;
    }
    const el = logoStackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // Target = the exact box the real top-bar logo will occupy, measured
    // from an invisible ghost topbar rendered with the real topbar CSS
    // (so it can't drift from the actual layout). The splash logo stack
    // uses the same proportions as the top-bar stack (see tokens.css),
    // so a single uniform scale + translate lands it pixel-on-pixel and
    // the swap to the real TopBar is invisible - one logo, not two.
    const ghost = topbarGhostLogoRef.current?.getBoundingClientRect();
    const scale = ghost && rect.width ? ghost.width / rect.width : 0.5;
    const dx = ghost ? ghost.left - rect.left : 52 - rect.left;
    const dy = ghost ? ghost.top - rect.top : 12 - rect.top;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (reducedMotion) {
      setLogoFlyStyle({ transform: `translate(${dx}px, ${dy}px) scale(${scale})`, transition: 'none' });
      return;
    }
    // Set the starting state with no transition first, then apply the
    // real transform on the next frame so the browser actually
    // animates between two fixed points rather than jumping straight
    // to the end (or re-deriving the end point mid-animation).
    setLogoFlyStyle({ transform: 'translate(0px, 0px) scale(1)', transition: 'none' });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setLogoFlyStyle({
          transform: `translate(${dx}px, ${dy}px) scale(${scale})`,
          transition: 'transform 0.65s cubic-bezier(0.65, 0, 0.35, 1)',
        });
      });
    });
  }, [loaderPhase]);

  // One-shot boot reveal: flag <html> while the circular reveal plays so
  // motion.css can spring the top bar buttons in, glow the logo and
  // delay the subject-card cascade until the circle reaches them.
  // (No cleanup on purpose: the phase moves flying -> done mid-reveal.)
  useEffect(() => {
    if (loaderPhase !== 'flying') return;
    const root = document.documentElement;
    root.dataset.boot = '1';
    setTimeout(() => setBootRingDone(true), 2150);
    setTimeout(() => { delete root.dataset.boot; }, 4200);
  }, [loaderPhase]);

  if (loading) {
    return (
      <div className="app-loading-screen">
        <div className="app-loading-logo-stack">
          <div className="app-loading-logo">Med101</div>
          <div className="app-loading-tagline">Learn. Practice. Improve.</div>
        </div>
        <div className="app-loading-bar-row">
          <span className="app-loading-play">▶</span>
          <div className="app-loading-track">
            <div className="app-loading-fill app-loading-fill-indeterminate" />
          </div>
        </div>
        <StuckLoaderHelp hint="signing in" />
      </div>
    );
  }

  // Intro plays here: data keeps loading behind it (hooks above), and the
  // normal splash finish / login screen follow when it is done.
  if (!introDone) return <IntroOverlay onDone={() => setIntroDone(true)} />;

  if (!user || needsGoogleProfileSetup) {
    return (
      <>
        {kickedMessage && (
          <div className="kicked-banner" onClick={() => setKickedMessage(null)}>
            {kickedMessage}
          </div>
        )}
        <AuthScreen />
      </>
    );
  }

  const topBarProps = {
    onHome: goHome,
    onLeaderboard: () => goTo('leaderboard'),
    onFriends: () => goTo('friends'),
    onSettings: () => goTo('settings'),
    onProfile: () => goTo('profile'),
    onWeakTopics: () => goTo('weak-topics'),
    onWrongFlagged: () => goTo('wrong-flagged'), // route id kept so old notification links still open it
    onImportantMarked: () => goTo('important-marked'),
    onSearch: () => goTo('search'),
    onHistory: () => goTo('history'),
    onPremium: () => goTo('premium'),
    onAdminUserDetail: () => { setViewUserUid(null); goTo('admin-user-detail'); },
    onViewUser: (uid) => { setViewUserUid(uid); goTo('admin-user-detail'); },
    onAdminAnalytics: () => goTo('admin-analytics'),
    onAdminNotice: () => goTo('admin-notice'),
    onAdminExams: () => goTo('admin-exams'),
    onAdminReports: () => goTo('admin-reports'),
    onAdminBroadcast: () => goTo('admin-broadcast'),
    onAdminBackup: () => goTo('admin-backup'),
    onAdminSecurity: () => goTo('admin-security'),
    onAdminCalendar: () => goTo('admin-calendar'),
    onAdminUploadQuestions: () => goTo('admin-upload-questions'),
    onAdminPayments: () => goTo('admin-payments'),
    onAdminSubscribers: () => goTo('admin-subscribers'),
    screen,
  };

  // Settings and admin calendar/notice screens are reachable regardless
  // of semester-data state - a student stuck on "content coming soon"
  // still needs to be able to change their semester back, for instance.
  if (screen === 'settings') {
    return (
      <div>
        <TopBar {...topBarProps} />
        <div className="screen-fade" key={screen}>
          <Suspense fallback={<ScreenFallback />}>
            <SettingsScreen onBack={goBack} onProfile={() => goTo('profile')} />
          </Suspense>
        </div>
      </div>
    );
  }

  if (screen === 'your-data') {
    return (
      <div>
        <TopBar {...topBarProps} />
        <div className="screen-fade" key={screen}>
          <Suspense fallback={<ScreenFallback />}>
            <YourDataScreen onBack={goBack} />
          </Suspense>
        </div>
      </div>
    );
  }

  if (screen === 'profile') {
    return (
      <div>
        <TopBar {...topBarProps} />
        <div className="screen-fade" key={screen}>
          <Suspense fallback={<ScreenFallback />}>
            <ProfileScreen onBack={goBack} />
          </Suspense>
        </div>
      </div>
    );
  }

  if (screen === 'admin-calendar' && isAdmin) {
    return (
      <div>
        <TopBar {...topBarProps} />
        <div className="screen-fade admin-wide" key={screen}>
          <Suspense fallback={<AdminScreenFallback />}>
            <AdminCalendarScreen onBack={goBack} />
          </Suspense>
        </div>
      </div>
    );
  }

  if (screen === 'admin-broadcast' && isAdmin) {
    return (
      <div>
        <TopBar {...topBarProps} />
        <div className="screen-fade admin-wide" key={screen}>
          <Suspense fallback={<AdminScreenFallback />}>
            <AdminBroadcastScreen onBack={goBack} />
          </Suspense>
        </div>
      </div>
    );
  }

  if (screen === 'admin-backup' && isAdmin) {
    return (
      <div>
        <TopBar {...topBarProps} />
        <div className="screen-fade admin-wide" key={screen}>
          <Suspense fallback={<AdminScreenFallback />}>
            <AdminBackupScreen />
          </Suspense>
        </div>
      </div>
    );
  }

  if (screen === 'admin-security' && isAdmin) {
    return (
      <div>
        <TopBar {...topBarProps} />
        <div className="screen-fade admin-wide" key={screen}>
          <Suspense fallback={<AdminScreenFallback />}>
            <AdminSecurityScreen />
          </Suspense>
        </div>
      </div>
    );
  }

  if (screen === 'admin-reports' && isAdmin) {
    return (
      <div>
        <TopBar {...topBarProps} />
        <div className="screen-fade admin-wide" key={screen}>
          <Suspense fallback={<AdminScreenFallback />}>
            <AdminQuestionReportsScreen onBack={goBack} />
          </Suspense>
        </div>
      </div>
    );
  }

  if (screen === 'admin-exams' && isAdmin) {
    return (
      <div>
        <TopBar {...topBarProps} />
        <div className="screen-fade admin-wide" key={screen}>
          <Suspense fallback={<AdminScreenFallback />}>
            <AdminExamScheduleScreen onBack={goBack} />
          </Suspense>
        </div>
      </div>
    );
  }

  if (screen === 'admin-notice' && isAdmin) {
    return (
      <div>
        <TopBar {...topBarProps} />
        <div className="screen-fade admin-wide" key={screen}>
          <Suspense fallback={<AdminScreenFallback />}>
            <AdminNoticeScreen onBack={goBack} semesters={semesterData.semesters} />
          </Suspense>
        </div>
      </div>
    );
  }

  if (screen === 'admin-user-detail' && isAdmin) {
    return (
      <div>
        <TopBar {...topBarProps} />
        <div className="screen-fade admin-wide" key={screen}>
          <Suspense fallback={<AdminScreenFallback />}>
            <AdminUserDetailScreen onBack={goBack} initialUid={viewUserUid} />
          </Suspense>
        </div>
      </div>
    );
  }

  if (screen === 'admin-analytics' && isAdmin) {
    return (
      <div>
        <TopBar {...topBarProps} />
        <div className="screen-fade admin-wide admin-portal" style={{ minHeight: 0, background: 'transparent', textAlign: 'left' }} key={screen}>
          <Suspense fallback={<AdminScreenFallback />}>
            <AdminAnalyticsScreen onBack={goBack} />
          </Suspense>
        </div>
      </div>
    );
  }

  if (screen === 'admin-payments' && isAdmin) {
    return (
      <div>
        <TopBar {...topBarProps} />
        <div className="screen-fade admin-wide" key={screen}>
          <Suspense fallback={<AdminScreenFallback />}>
            <AdminPaymentsScreen onBack={goBack} />
          </Suspense>
        </div>
      </div>
    );
  }

  if (screen === 'admin-subscribers' && isAdmin) {
    return (
      <div>
        <TopBar {...topBarProps} />
        <div className="screen-fade admin-wide" key={screen}>
          <Suspense fallback={<AdminScreenFallback />}>
            <AdminSubscribersScreen onBack={goBack} />
          </Suspense>
        </div>
      </div>
    );
  }

  if (screen === 'premium') {
    return (
      <div>
        <TopBar {...topBarProps} />
        <div className="screen-fade" key={screen}>
          <Suspense fallback={<ScreenFallback />}>
            <PremiumScreen onBack={goBack} />
          </Suspense>
        </div>
      </div>
    );
  }

  // No artificial time cap here - the loader stays up for exactly as
  // long as auth/semester data/calendar actually take to resolve, then
  // plays its finish sequence (completing -> flying -> done).
  const flying = loaderPhase === 'flying';
  const splashScreen = (
    <div className={flying ? 'app-loading-screen app-loading-screen-flying' : 'app-loading-screen'}>
        {/* Invisible stand-in for the real top bar's logo, used only to measure where the splash logo should land. */}
        <div className="topbar topbar-ghost" aria-hidden="true">
          <div className="topbar-left">
            <span className="topbar-icon-btn home" />
            <div ref={topbarGhostLogoRef} className="topbar-logo-stack">
              <span className="topbar-logo">Med101</span>
              <span className="topbar-tagline">Learn. Practice. Improve.</span>
            </div>
          </div>
        </div>
        <div ref={logoStackRef} className="app-loading-logo-stack" style={logoFlyStyle || undefined}>
          <div className="app-loading-logo">Med101</div>
          <div className="app-loading-tagline">Learn. Practice. Improve.</div>
        </div>
        <div className="app-loading-bar-row">
          <span className="app-loading-play">▶</span>
          <div className="app-loading-track">
            <div
              className="app-loading-fill"
              style={loaderPhase === 'loading'
                ? { width: loaderBarArmed ? '94%' : '0%', transition: 'width 24s cubic-bezier(0.08, 0.6, 0.3, 1)' }
                : { width: '100%', transition: 'width 0.35s ease' }}
            />
          </div>
        </div>
        {loaderPhase === 'loading' && (
          <StuckLoaderHelp hint={semesterData.loading ? 'loading questions' : 'loading your semester'} />
        )}
      </div>
  );
  if (loaderPhase === 'loading' || loaderPhase === 'completing') {
    return (
      <>
        {showOnboardingTour && (
          <OnboardingTour onFinish={finishOnboardingTour} />
        )}
        {showWhatsAppPrompt && (
          <WhatsAppPromptModal onClose={() => setShowWhatsAppPrompt(false)} />
        )}
        {splashScreen}
      </>
    );
  }

  const { mainSubjectMeta, subjectMeta, subjectGroup, semesterMainSubjects, questions, semesters, error: dataError } = semesterData;

  if (screen === 'admin-upload-questions' && isAdmin) {
    return (
      <div>
        <TopBar {...topBarProps} />
        <div className="screen-fade admin-wide" key={screen}>
          <Suspense fallback={<AdminScreenFallback />}>
            <AdminUploadQuestionsScreen onBack={goBack} semesters={semesters} semesterMainSubjects={semesterMainSubjects} />
          </Suspense>
        </div>
      </div>
    );
  }

  // The 4s hard cap above can let the app past the branded loader
  // before semester/calendar data has actually finished resolving
  // (activeSemesterId still null, or semesterMainSubjects still
  // empty). That's a genuinely different situation from "this
  // semester really has no content" - show a neutral still-working
  // state for it instead of the "Content coming soon" dead-end, so
  // it doesn't flash misleadingly right before the real subjects
  // show up moments later.
  const stillResolving = semesterData.loading || calendarLoading || !activeSemesterId;
  const semesterSubjectNames = activeSemesterId ? semesterMainSubjects[activeSemesterId] : undefined;

  if (!semesterSubjectNames && stillResolving) {
    return (
      <div>
        <TopBar {...topBarProps} />
        <div className="screen-fade" key="still-resolving">
          <div className="app-loading-bar-row" style={{ margin: '80px auto' }}>
            <span className="app-loading-play">▶</span>
            <div className="app-loading-track">
              <div className="app-loading-fill app-loading-fill-indeterminate" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // No data file exists yet for this student's resolved semester (e.g.
  // they've progressed to Y2S1 but only Y1S2 content has been added so
  // far). Show a friendly placeholder instead of an empty dashboard.
  if (!semesterSubjectNames) {
    return (
      <div>
        <TopBar {...topBarProps} />
        <div className="screen-fade coming-soon" key={screen}>
          <div className="coming-soon-emoji">📚</div>
          <h1>Content coming soon</h1>
          <p>Questions for your current semester aren't uploaded yet. Check back soon, or update your semester in Settings if you picked the wrong one.</p>
        </div>
      </div>
    );
  }

  // Scope everything down to only this student's active semester.
  const scopedMainSubjectMeta = Object.fromEntries(
    Object.entries(mainSubjectMeta).filter(([name]) => semesterSubjectNames.includes(name))
  );
  const scopedQuestions = questions.filter((q) => q.term === activeSemesterId);

  // The pool for whatever subject/topic was picked in the Subtopic
  // screen - this feeds QuizModeScreen, which decides exact
  // quantity/order from it.
  const modePool = scopedQuestions.filter(
    (q) => subjectGroup[q.s] === selectedSubject && (!selectedTopic || q.s === selectedTopic)
  );

  return (
    <>
    {flying && splashScreen}
    {flying && !bootRingDone && <span className="boot-ring" aria-hidden="true" />}
    <div className={flying ? 'boot-reveal' : undefined}>
      {signupNotice && (
        <div className="kicked-banner" onClick={() => setSignupNotice(null)}>
          {signupNotice}
        </div>
      )}
      {showOnboardingTour && (
        <OnboardingTour onFinish={finishOnboardingTour} />
      )}
      {showWhatsAppPrompt && (
        <WhatsAppPromptModal onClose={() => setShowWhatsAppPrompt(false)} />
      )}
      {user?.uid && !showOnboardingTour && !showWhatsAppPrompt && !needsGoogleProfileSetup && (
        <NotificationGateModal uid={user.uid} />
      )}
      <TopBar {...topBarProps} />

      {dataError && (
        <div className="offline-banner">
          📡 Couldn't load question data - check your connection.{' '}
          <button className="btn-ghost" style={{ padding: '2px 10px', marginLeft: 6 }} onClick={() => window.location.reload()}>Retry</button>
        </div>
      )}

      {['dashboard', 'subtopic', 'mode', 'quiz', 'subject-soon'].includes(screen) ? (
        <SlideStack activeKey={screen}>
          {screen === 'subject-soon' && (
            <div className="screen-fade coming-soon" key={screen}>
              <div className="coming-soon-emoji">{scopedMainSubjectMeta[selectedSubject]?.emoji || '📚'}</div>
              <h1>{selectedSubject}</h1>
              <p>Content coming soon. Questions for this subject haven't been uploaded yet. Check back soon.</p>
              <button className="btn-ghost" style={{ marginTop: 16 }} onClick={() => goTo('dashboard')}>
                ← Back to Subjects
              </button>
            </div>
          )}
          {screen === 'dashboard' && (
            <Dashboard
              resumeCard={resumeSnap ? (
              <ResumeQuizCard
                snapshot={resumeSnap}
                onDiscard={() => { clearQuizProgress(); if (user) deleteCloudSnapshot(user.uid); cloudCheckRef.current = { at: Date.now(), snap: null }; setResumeSnap(null); }}
                onResume={() => {
                  saveQuizProgress(resumeSnap); // make sure this device has the snapshot locally (it may have come from the cloud)
                  setFinalQuiz({
                    questions: resumeSnap.questions,
                    autoAdvance: resumeSnap.autoAdvance,
                    timerSeconds: resumeSnap.timerSeconds,
                    resumeAttemptId: resumeSnap.attemptId,
                    ...(resumeSnap.mock ? { mock: true, totalTimeLimitMs: resumeSnap.totalTimeLimitMs ?? undefined } : null),
                  });
                  goTo('quiz', { selectedSubject: resumeSnap.mainSubject, selectedTopic: resumeSnap.topic });
                }}
              />
              ) : null}
              mainSubjectMeta={scopedMainSubjectMeta}
              subjectGroup={subjectGroup}
              questions={scopedQuestions}
              semesterId={activeSemesterId}
              onSelectSubject={(name) => goTo('subtopic', { selectedSubject: name, selectedTopic: null })}
              onComingSoon={(name) => goTo('subject-soon', { selectedSubject: name, selectedTopic: null })}
              onPracticeTopic={(subject, subtopic) => {
                // Quick-practice shortcut skips mode selection: jumps
                // straight into a Random 25 of that specific weak topic.
                const pool = scopedQuestions.filter((q) => q.s === subtopic);
                const shuffledPool = [...pool].sort(() => Math.random() - 0.5).slice(0, Math.min(25, pool.length));
                setFinalQuiz({ questions: shuffledPool, autoAdvance: true, timerSeconds: null });
                goTo('quiz', { selectedSubject: subject, selectedTopic: subtopic });
              }}
              onAcceptInvite={async (roomCode) => {
                await joinRoom(roomCode, user.uid, user.displayName || user.email);
                setActiveRoomCode(roomCode);
                setActiveRoomIsHost(false);
                goTo('room-lobby');
              }}
            />
          )}
          {screen === 'subtopic' && (
            <SubtopicScreen
              mainSubject={selectedSubject}
              mainSubjectMeta={scopedMainSubjectMeta}
              subjectMeta={subjectMeta}
              subjectGroup={subjectGroup}
              questions={scopedQuestions}
              onSelectTopic={(topic) => goTo('mode', { selectedSubject, selectedTopic: topic })}
              onBack={() => goTo('dashboard')}
              semesterId={activeSemesterId}
            />
          )}
          {screen === 'mode' && (
            <QuizModeScreen
              pool={modePool}
              subjectMeta={subjectMeta}
              subjectName={selectedSubject}
              emoji={scopedMainSubjectMeta[selectedSubject]?.emoji}
              isPremium={isPremiumForCurrentSemester || isAdmin || premiumPaused}
              onGetPremium={() => goTo('premium')}
              onStart={(quizQuestions, settings) => {
                setFinalQuiz({ questions: quizQuestions, ...settings });
                goTo('quiz');
              }}
              onBack={goBack}
            />
          )}
          {screen === 'quiz' && finalQuiz && (
            <QuizScreen
              key={quizKey}
              mainSubject={finalQuiz.roomCode ? finalQuiz.roomMainSubject : selectedSubject}
              topic={selectedTopic}
              semesterId={activeSemesterId}
              questions={finalQuiz.questions}
              isPremium={isPremiumForCurrentSemester || isAdmin || premiumPaused}
              autoAdvance={finalQuiz.autoAdvance}
              timerSeconds={finalQuiz.timerSeconds}
              roomCode={finalQuiz.roomCode}
              totalTimeLimitMs={finalQuiz.totalTimeLimitMs}
              mock={finalQuiz.mock}
              resumeAttemptId={finalQuiz.resumeAttemptId}
              onExit={goBack}
              onViewRoomResults={() => goTo('room-results')}
              onRestartSame={() => setQuizKey((k) => k + 1)}
              onRetryWrong={(wrongQuestions) => {
                setFinalQuiz((prev) => ({ ...prev, questions: wrongQuestions }));
                setQuizKey((k) => k + 1);
              }}
            />
          )}
        </SlideStack>
      ) : (
      <div className="screen-fade" key={screen}>
      {screen === 'weak-topics' && (
        <Suspense fallback={<ScreenFallback />}>
          <WeakTopicsScreen
            onPracticeTopic={(subject, subtopic) => {
              const pool = scopedQuestions.filter((q) => q.s === subtopic);
              const shuffledPool = [...pool].sort(() => Math.random() - 0.5).slice(0, Math.min(25, pool.length));
              setFinalQuiz({ questions: shuffledPool, autoAdvance: true, timerSeconds: null });
              goTo('quiz', { selectedSubject: subject, selectedTopic: subtopic });
            }}
            onBack={goBack}
          />
        </Suspense>
      )}

      {screen === 'wrong-flagged' && (
        <Suspense fallback={<ScreenFallback />}>
          <ReviewListScreen
            kind="wrong"
            semesterSubjects={semesterSubjectNames}
            onPracticeSet={(items) => {
              const asQuizShape = items.map((it) => ({ s: it.s, q: it.q, o: it.o, c: it.c }));
              setFinalQuiz({ questions: asQuizShape, autoAdvance: true, timerSeconds: null });
              setSelectedSubject(items[0]?.mainSubject || null);
              setSelectedTopic(null);
              goTo('quiz');
            }}
            onBack={goBack}
          />
        </Suspense>
      )}

      {screen === 'important-marked' && (
        <Suspense fallback={<ScreenFallback />}>
          <ReviewListScreen
            kind="flagged"
            semesterSubjects={semesterSubjectNames}
            onPracticeSet={(items) => {
              const asQuizShape = items.map((it) => ({ s: it.s, q: it.q, o: it.o, c: it.c }));
              setFinalQuiz({ questions: asQuizShape, autoAdvance: true, timerSeconds: null });
              setSelectedSubject(items[0]?.mainSubject || null);
              setSelectedTopic(null);
              goTo('quiz');
            }}
            onBack={goBack}
          />
        </Suspense>
      )}

      {screen === 'search' && (
        <Suspense fallback={<ScreenFallback />}>
          <SearchScreen
            scopedQuestions={scopedQuestions}
            subjectGroup={subjectGroup}
            mainSubjectMeta={scopedMainSubjectMeta}
            onPracticeSet={(items) => {
              setFinalQuiz({ questions: items, autoAdvance: true, timerSeconds: null });
              setSelectedSubject(subjectGroup[items[0]?.s] || null);
              setSelectedTopic(null);
              goTo('quiz');
            }}
            onBack={goBack}
          />
        </Suspense>
      )}

      {screen === 'history' && (
        <Suspense fallback={<ScreenFallback />}>
          <HistoryScreen
            onRetry={(quizQuestions, mainSubject, topic) => {
              setFinalQuiz({ questions: quizQuestions, autoAdvance: true, timerSeconds: null });
              setSelectedSubject(mainSubject || null);
              setSelectedTopic(topic || null);
              goTo('quiz');
            }}
            onBack={goBack}
          />
        </Suspense>
      )}

      {screen === 'challenge' && (
        <Suspense fallback={<ScreenFallback />}>
          <ChallengeScreen
            mainSubjectMeta={scopedMainSubjectMeta}
            scopedQuestions={scopedQuestions}
            subjectGroup={subjectGroup}
            challengeTarget={challengeFriend}
            onEnterRoom={(code, isHost) => {
              setActiveRoomCode(code);
              setActiveRoomIsHost(isHost);
              goTo('room-lobby');
            }}
            onBack={() => { setChallengeFriend(null); goBack(); }}
          />
        </Suspense>
      )}

      {screen === 'friends' && (
        <Suspense fallback={<ScreenFallback />}>
          <FriendsScreen
            onBack={goBack}
            onChallenge={(friend) => { setChallengeFriend(friend); goTo('challenge'); }}
            onLeaderboard={() => { setLbFriendsOnly(true); goTo('leaderboard'); }}
            onProfile={() => goTo('profile')}
          />
        </Suspense>
      )}

      {screen === 'room-lobby' && activeRoomCode && (
        <Suspense fallback={<ScreenFallback />}>
          <RoomLobbyScreen
            code={activeRoomCode}
            isHost={activeRoomIsHost}
            autoInviteFriend={challengeFriend}
            onAutoInviteSent={() => setChallengeFriend(null)}
            onStart={(room) => {
              setFinalQuiz({
                questions: room.questions,
                autoAdvance: room.autoAdvance !== false, // default true for older rooms with no stored value
                timerSeconds: room.timerSeconds ?? null,
                roomCode: activeRoomCode,
                roomMainSubject: room.mainSubject,
                totalTimeLimitMs: room.timeLimitMinutes * 60000,
              });
              goTo('quiz');
            }}
            onViewResults={() => goTo('room-results')}
            onBack={goBack}
          />
        </Suspense>
      )}

      {screen === 'room-results' && activeRoomCode && (
        <Suspense fallback={<ScreenFallback />}>
          <RoomResultsScreen code={activeRoomCode} onBack={goBack} />
        </Suspense>
      )}

      {screen === 'leaderboard' && (
        <Suspense fallback={<ScreenFallback />}>
          <LeaderboardScreen
            semesterId={activeSemesterId}
            mainSubjectMeta={scopedMainSubjectMeta}
            startFriendsOnly={lbFriendsOnly}
            onBack={goBack}
          />
        </Suspense>
      )}
      </div>
      )}
      <Analytics />
    </div>
    </>
  );
}
