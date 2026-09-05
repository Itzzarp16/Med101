import { useEffect, useRef, useState } from 'react';
import { Analytics } from '@vercel/analytics/react';
import TopBar from './components/TopBar';
import Dashboard from './components/Dashboard';
import SubtopicScreen from './components/SubtopicScreen';
import QuizModeScreen from './components/QuizModeScreen';
import QuizScreen from './components/QuizScreen';
import LeaderboardScreen from './components/LeaderboardScreen';
import ChallengeScreen from './components/ChallengeScreen';
import FriendsScreen from './components/FriendsScreen';
import RoomLobbyScreen from './components/RoomLobbyScreen';
import RoomResultsScreen from './components/RoomResultsScreen';
import AdminCalendarScreen from './components/AdminCalendarScreen';
import AdminNoticeScreen from './components/AdminNoticeScreen';
import AdminQuestionsScreen from './components/AdminQuestionsScreen';
import SettingsScreen from './components/SettingsScreen';
import ProfileScreen from './components/ProfileScreen';
import WeakTopicsScreen from './components/WeakTopicsScreen';
import WrongFlaggedScreen from './components/WrongFlaggedScreen';
import SearchScreen from './components/SearchScreen';
import HistoryScreen from './components/HistoryScreen';
import AdminUserDetailScreen from './components/AdminUserDetailScreen';
import AdminAnalyticsScreen from './components/AdminAnalyticsScreen';
import AuthScreen from './components/AuthScreen';
import { joinRoom } from './lib/rooms';
import { useAuth } from './lib/AuthContext';
import { useSemesterData } from './lib/useSemesterData';
import { fetchAcademicCalendar, resolveCurrentSemester } from './lib/academicCalendar';
import { startPresenceHeartbeat } from './lib/presence';
import { saveNavState, loadNavState, clearNavState } from './lib/navPersistence';

// Navigation is backed by real browser history (pushState/popstate) so
// the phone's back gesture moves one screen back instead of closing the
// whole site - every forward navigation goes through goTo(), every
// "back" action goes through goBack() (== history.back()), and a
// popstate listener keeps `screen` in sync with whichever entry the
// user lands on.
export default function App() {
  const { user, profile, loading, isAdmin, kickedMessage, setKickedMessage } = useAuth();
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
  const [finalQuiz, setFinalQuiz] = useState(savedNavRef?.finalQuiz ?? null); // { questions, autoAdvance, timerSeconds } once mode is chosen
  const [quizKey, setQuizKey] = useState(0); // bumped to force QuizScreen to remount fresh on Restart Same / Retry Wrong
  const [activeSemesterId, setActiveSemesterId] = useState(null);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [loaderPhase, setLoaderPhase] = useState('loading'); // 'loading' | 'completing' | 'done' - drives the loading-bar finish animation
  const logoStackRef = useRef(null);
  const [logoFlyStyle, setLogoFlyStyle] = useState(null);
  const [activeRoomCode, setActiveRoomCode] = useState(savedNavRef?.activeRoomCode ?? null);
  const [activeRoomIsHost, setActiveRoomIsHost] = useState(savedNavRef?.activeRoomIsHost ?? false);
  const [viewUserUid, setViewUserUid] = useState(savedNavRef?.viewUserUid ?? null);

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
      const state = e.state || { screen: 'dashboard' };
      setScreen(state.screen);
      setSelectedSubject(state.selectedSubject ?? null);
      setSelectedTopic(state.selectedTopic ?? null);
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
  function goTo(screenName, extra = {}) {
    const nextSubject = 'selectedSubject' in extra ? extra.selectedSubject : selectedSubject;
    const nextTopic = 'selectedTopic' in extra ? extra.selectedTopic : selectedTopic;
    window.history.pushState({ screen: screenName, selectedSubject: nextSubject, selectedTopic: nextTopic }, '');
    if ('selectedSubject' in extra) setSelectedSubject(extra.selectedSubject);
    if ('selectedTopic' in extra) setSelectedTopic(extra.selectedTopic);
    setScreen(screenName);
  }

  // Back navigation: goes through the browser's own history stack so it
  // stays perfectly in sync with the device back gesture.
  function goBack() {
    window.history.back();
  }

  function goHome() {
    goTo('dashboard');
  }

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

    async function resolve() {
      const calendar = await fetchAcademicCalendar();
      if (cancelled) return;
      const availableSemesterIds = Object.keys(semesterData.semesterMainSubjects || {});
      const semId = resolveCurrentSemester(profile.enrolledYearSemester || 'y1s1', calendar, new Date(), availableSemesterIds);
      setActiveSemesterId(semId);
      setCalendarLoading(false);
    }

    resolve();
    return () => { cancelled = true; };
  }, [profile, semesterData.semesterMainSubjects]);

  // Loading-bar finish sequence: the moment both real loading steps
  // are actually done, snap the indeterminate sweep to a solid 100%
  // fill for a beat, then fly the logo up toward the top bar's
  // position before finally swapping to the real app - so the logo
  // reads as *becoming* the top bar logo rather than the loader just
  // vanishing and a separate small logo appearing in its place.
  useEffect(() => {
    if (semesterData.loading || calendarLoading) {
      if (loaderPhase !== 'loading') setLoaderPhase('loading');
      return;
    }
    if (loaderPhase !== 'loading') return; // already completing/flying/done
    setLoaderPhase('completing');
    const t1 = setTimeout(() => setLoaderPhase('flying'), 380);
    const t2 = setTimeout(() => setLoaderPhase('done'), 380 + 650);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [semesterData.loading, calendarLoading]);

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
    if (loaderPhase !== 'flying') {
      setLogoFlyStyle(null);
      return;
    }
    const el = logoStackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const startCenterX = rect.left + rect.width / 2;
    const startCenterY = rect.top + rect.height / 2;
    // Roughly where the real top-bar logo sits: topbar padding (14px)
    // + hamburger button (30px) + gap (8px) before the logo starts,
    // plus half the small logo's own width; vertically the topbar's
    // center (~26px from the top).
    const targetX = 14 + 30 + 8 + 40;
    const targetY = 26;
    const dx = targetX - startCenterX;
    const dy = targetY - startCenterY;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (reducedMotion) {
      setLogoFlyStyle({ transform: `translate(${dx}px, ${dy}px) scale(0.5)`, transition: 'none' });
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
          transform: `translate(${dx}px, ${dy}px) scale(0.5)`,
          transition: 'transform 0.65s cubic-bezier(0.65, 0, 0.35, 1)',
        });
      });
    });
  }, [loaderPhase]);

  if (loading) {
    return (
      <div className="app-loading-screen">
        <div className="app-loading-logo-stack">
          <div className="app-loading-logo">Med101</div>
          <div className="app-loading-signature">by Abhishek Verma</div>
        </div>
        <div className="app-loading-bar-row">
          <span className="app-loading-play">▶</span>
          <div className="app-loading-track">
            <div className="app-loading-fill app-loading-fill-indeterminate" />
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
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
    onChallenge: () => goTo('challenge'),
    onFriends: () => goTo('friends'),
    onSettings: () => goTo('settings'),
    onProfile: () => goTo('profile'),
    onWeakTopics: () => goTo('weak-topics'),
    onWrongFlagged: () => goTo('wrong-flagged'),
    onSearch: () => goTo('search'),
    onHistory: () => goTo('history'),
    onAdminUserDetail: () => { setViewUserUid(null); goTo('admin-user-detail'); },
    onViewUser: (uid) => { setViewUserUid(uid); goTo('admin-user-detail'); },
    onAdminAnalytics: () => goTo('admin-analytics'),
    onAdminQuestions: () => goTo('admin-questions'),
    onAdminNotice: () => goTo('admin-notice'),
    onAdminCalendar: () => goTo('admin-calendar'),
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
          <SettingsScreen onBack={goBack} />
        </div>
      </div>
    );
  }

  if (screen === 'profile') {
    return (
      <div>
        <TopBar {...topBarProps} />
        <div className="screen-fade" key={screen}>
          <ProfileScreen onBack={goBack} />
        </div>
      </div>
    );
  }

  if (screen === 'admin-calendar' && isAdmin) {
    return (
      <div>
        <TopBar {...topBarProps} />
        <div className="screen-fade" key={screen}>
          <AdminCalendarScreen onBack={goBack} />
        </div>
      </div>
    );
  }

  if (screen === 'admin-notice' && isAdmin) {
    return (
      <div>
        <TopBar {...topBarProps} />
        <div className="screen-fade" key={screen}>
          <AdminNoticeScreen onBack={goBack} />
        </div>
      </div>
    );
  }

  if (screen === 'admin-user-detail' && isAdmin) {
    return (
      <div>
        <TopBar {...topBarProps} />
        <div className="screen-fade" key={screen}>
          <AdminUserDetailScreen onBack={goBack} initialUid={viewUserUid} />
        </div>
      </div>
    );
  }

  if (screen === 'admin-analytics' && isAdmin) {
    return (
      <div>
        <TopBar {...topBarProps} />
        <div className="screen-fade" key={screen}>
          <AdminAnalyticsScreen onBack={goBack} />
        </div>
      </div>
    );
  }

  // No artificial time cap here - the loader stays up for exactly as
  // long as auth/semester data/calendar actually take to resolve, then
  // plays its finish sequence (completing -> flying -> done).
  if (loaderPhase !== 'done') {
    const flying = loaderPhase === 'flying';
    return (
      <div className={flying ? 'app-loading-screen app-loading-screen-flying' : 'app-loading-screen'}>
        <div ref={logoStackRef} className="app-loading-logo-stack" style={logoFlyStyle || undefined}>
          <div className="app-loading-logo">Med101</div>
          <div className="app-loading-signature">by Abhishek Verma</div>
        </div>
        <div className="app-loading-bar-row">
          <span className="app-loading-play">▶</span>
          <div className="app-loading-track">
            <div
              className={loaderPhase === 'completing' ? 'app-loading-fill' : 'app-loading-fill app-loading-fill-indeterminate'}
              style={loaderPhase === 'completing' ? { width: '100%' } : undefined}
            />
          </div>
        </div>
      </div>
    );
  }

  const { mainSubjectMeta, subjectMeta, subjectGroup, semesterMainSubjects, questions, usingCachedData } = semesterData;

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
    <div>
      <TopBar {...topBarProps} />

      {usingCachedData && (
        <div className="offline-banner">📴 Offline: showing your last saved question set</div>
      )}

      <div className="screen-fade" key={screen}>
      {screen === 'admin-questions' && isAdmin && (
        <AdminQuestionsScreen
          semesterId={activeSemesterId}
          mainSubjectMeta={scopedMainSubjectMeta}
          subjectGroup={subjectGroup}
          jsonQuestions={scopedQuestions}
          onBack={goBack}
        />
      )}

      {screen === 'weak-topics' && (
        <WeakTopicsScreen
          onPracticeTopic={(subject, subtopic) => {
            const pool = scopedQuestions.filter((q) => q.s === subtopic);
            const shuffledPool = [...pool].sort(() => Math.random() - 0.5).slice(0, Math.min(25, pool.length));
            setFinalQuiz({ questions: shuffledPool, autoAdvance: true, timerSeconds: null });
            goTo('quiz', { selectedSubject: subject, selectedTopic: subtopic });
          }}
          onBack={goBack}
        />
      )}

      {screen === 'wrong-flagged' && (
        <WrongFlaggedScreen
          onPracticeSet={(items) => {
            const asQuizShape = items.map((it) => ({ s: it.s, q: it.q, o: it.o, c: it.c }));
            setFinalQuiz({ questions: asQuizShape, autoAdvance: true, timerSeconds: null });
            setSelectedSubject(items[0]?.mainSubject || null);
            setSelectedTopic(null);
            goTo('quiz');
          }}
          onBack={goBack}
        />
      )}

      {screen === 'search' && (
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
      )}

      {screen === 'history' && (
        <HistoryScreen
          onRetry={(quizQuestions, mainSubject, topic) => {
            setFinalQuiz({ questions: quizQuestions, autoAdvance: true, timerSeconds: null });
            setSelectedSubject(mainSubject || null);
            setSelectedTopic(topic || null);
            goTo('quiz');
          }}
          onBack={goBack}
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
        />
      )}

      {screen === 'dashboard' && (
        <Dashboard
          mainSubjectMeta={scopedMainSubjectMeta}
          subjectGroup={subjectGroup}
          questions={scopedQuestions}
          onSelectSubject={(name) => goTo('subtopic', { selectedSubject: name, selectedTopic: null })}
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

      {screen === 'mode' && (
        <QuizModeScreen
          pool={modePool}
          subjectMeta={subjectMeta}
          subjectName={selectedSubject}
          emoji={scopedMainSubjectMeta[selectedSubject]?.emoji}
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
          autoAdvance={finalQuiz.autoAdvance}
          timerSeconds={finalQuiz.timerSeconds}
          roomCode={finalQuiz.roomCode}
          totalTimeLimitMs={finalQuiz.totalTimeLimitMs}
          onExit={goBack}
          onViewRoomResults={() => goTo('room-results')}
          onRestartSame={() => setQuizKey((k) => k + 1)}
          onRetryWrong={(wrongQuestions) => {
            setFinalQuiz((prev) => ({ ...prev, questions: wrongQuestions }));
            setQuizKey((k) => k + 1);
          }}
        />
      )}

      {screen === 'challenge' && (
        <ChallengeScreen
          mainSubjectMeta={scopedMainSubjectMeta}
          scopedQuestions={scopedQuestions}
          subjectGroup={subjectGroup}
          onEnterRoom={(code, isHost) => {
            setActiveRoomCode(code);
            setActiveRoomIsHost(isHost);
            goTo('room-lobby');
          }}
          onBack={goBack}
        />
      )}

      {screen === 'friends' && (
        <FriendsScreen onBack={goBack} />
      )}

      {screen === 'room-lobby' && activeRoomCode && (
        <RoomLobbyScreen
          code={activeRoomCode}
          isHost={activeRoomIsHost}
          onStart={(room) => {
            setFinalQuiz({
              questions: room.questions,
              autoAdvance: true,
              timerSeconds: null,
              roomCode: activeRoomCode,
              roomMainSubject: room.mainSubject,
              totalTimeLimitMs: room.timeLimitMinutes * 60000,
            });
            goTo('quiz');
          }}
          onViewResults={() => goTo('room-results')}
          onBack={goBack}
        />
      )}

      {screen === 'room-results' && activeRoomCode && (
        <RoomResultsScreen code={activeRoomCode} onBack={goBack} />
      )}

      {screen === 'leaderboard' && (
        <LeaderboardScreen
          semesterId={activeSemesterId}
          mainSubjectMeta={scopedMainSubjectMeta}
          onBack={goBack}
        />
      )}
      </div>
      <Analytics />
    </div>
  );
}
