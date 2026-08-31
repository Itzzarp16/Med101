import { useEffect, useState } from 'react';
import TopBar from './components/TopBar';
import Dashboard from './components/Dashboard';
import QuizModeScreen from './components/QuizModeScreen';
import QuizScreen from './components/QuizScreen';
import LeaderboardScreen from './components/LeaderboardScreen';
import ChallengeScreen from './components/ChallengeScreen';
import RoomLobbyScreen from './components/RoomLobbyScreen';
import RoomResultsScreen from './components/RoomResultsScreen';
import AdminCalendarScreen from './components/AdminCalendarScreen';
import AdminNoticeScreen from './components/AdminNoticeScreen';
import AdminQuestionsScreen from './components/AdminQuestionsScreen';
import SettingsScreen from './components/SettingsScreen';
import ProfileScreen from './components/ProfileScreen';
import WeakTopicsScreen from './components/WeakTopicsScreen';
import WrongFlaggedScreen from './components/WrongFlaggedScreen';
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
// whole site — every forward navigation goes through goTo(), every
// "back" action goes through goBack() (== history.back()), and a
// popstate listener keeps `screen` in sync with whichever entry the
// user lands on.
export default function App() {
  const { user, profile, loading, isAdmin, kickedMessage, setKickedMessage } = useAuth();
  const semesterData = useSemesterData();
  // A hard page refresh loses all in-memory React state, but the
  // student should land back on whatever screen they were on (e.g. a
  // quiz in progress) rather than being dumped to the dashboard. This
  // restores the last-saved navigation snapshot once on mount — the
  // saving side is the useEffect further down.
  const savedNavRef = useState(() => loadNavState())[0];

  const [screen, setScreen] = useState(savedNavRef?.screen || 'dashboard');
  const [selectedSubject, setSelectedSubject] = useState(savedNavRef?.selectedSubject ?? null);
  const [selectedTopic, setSelectedTopic] = useState(savedNavRef?.selectedTopic ?? null); // null = "All Topics" within subject
  const [finalQuiz, setFinalQuiz] = useState(savedNavRef?.finalQuiz ?? null); // { questions, autoAdvance, timerSeconds } once mode is chosen
  const [quizKey, setQuizKey] = useState(0); // bumped to force QuizScreen to remount fresh on Restart Same / Retry Wrong
  const [activeSemesterId, setActiveSemesterId] = useState(null);
  const [calendarLoading, setCalendarLoading] = useState(true);
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
    if (!profile) return;

    async function resolve() {
      const calendar = await fetchAcademicCalendar();
      if (cancelled) return;
      const semId = resolveCurrentSemester(profile.enrolledYearSemester || 'y1s1', calendar);
      setActiveSemesterId(semId);
      setCalendarLoading(false);
    }

    resolve();
    return () => { cancelled = true; };
  }, [profile]);

  // Presence heartbeat — pings this session as "online" every 30s so
  // the topbar can show a live headcount of currently active students.
  useEffect(() => {
    if (!user) return;
    return startPresenceHeartbeat(user.uid, user.displayName || user.email);
  }, [user]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)' }}>
        Loading…
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
    onSettings: () => goTo('settings'),
    onProfile: () => goTo('profile'),
    onWeakTopics: () => goTo('weak-topics'),
    onWrongFlagged: () => goTo('wrong-flagged'),
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
  // of semester-data state — a student stuck on "content coming soon"
  // still needs to be able to change their semester back, for instance.
  if (screen === 'settings') {
    return (
      <div>
        <TopBar {...topBarProps} />
        <SettingsScreen onBack={goBack} />
      </div>
    );
  }

  if (screen === 'profile') {
    return (
      <div>
        <TopBar {...topBarProps} />
        <ProfileScreen onBack={goBack} />
      </div>
    );
  }

  if (screen === 'admin-calendar' && isAdmin) {
    return (
      <div>
        <TopBar {...topBarProps} />
        <AdminCalendarScreen onBack={goBack} />
      </div>
    );
  }

  if (screen === 'admin-notice' && isAdmin) {
    return (
      <div>
        <TopBar {...topBarProps} />
        <AdminNoticeScreen onBack={goBack} />
      </div>
    );
  }

  if (screen === 'admin-user-detail' && isAdmin) {
    return (
      <div>
        <TopBar {...topBarProps} />
        <AdminUserDetailScreen onBack={goBack} initialUid={viewUserUid} />
      </div>
    );
  }

  if (screen === 'admin-analytics' && isAdmin) {
    return (
      <div>
        <TopBar {...topBarProps} />
        <AdminAnalyticsScreen onBack={goBack} />
      </div>
    );
  }

  if (semesterData.loading || calendarLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)' }}>
        Loading questions…
      </div>
    );
  }

  const { mainSubjectMeta, subjectMeta, subjectGroup, semesterMainSubjects, questions, usingCachedData } = semesterData;

  // No data file exists yet for this student's resolved semester (e.g.
  // they've progressed to Y2S1 but only Y1S2 content has been added so
  // far). Show a friendly placeholder instead of an empty dashboard.
  const semesterSubjectNames = semesterMainSubjects[activeSemesterId];
  if (!semesterSubjectNames) {
    return (
      <div>
        <TopBar {...topBarProps} />
        <div className="coming-soon">
          <div className="coming-soon-emoji">📚</div>
          <h1>Content coming soon</h1>
          <p>Questions for your current semester aren't uploaded yet — check back soon, or update your semester in Settings if you picked the wrong one.</p>
        </div>
      </div>
    );
  }

  // Scope everything down to only this student's active semester.
  const scopedMainSubjectMeta = Object.fromEntries(
    Object.entries(mainSubjectMeta).filter(([name]) => semesterSubjectNames.includes(name))
  );
  const scopedQuestions = questions.filter((q) => q.term === activeSemesterId);

  // The pool for whatever subject/topic was picked in TopicPicker — this
  // feeds QuizModeScreen, which decides exact quantity/order from it.
  const modePool = scopedQuestions.filter((q) => subjectGroup[q.s] === selectedSubject);

  return (
    <div>
      <TopBar {...topBarProps} />

      {usingCachedData && (
        <div className="offline-banner">📴 Offline — showing your last saved question set</div>
      )}

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

      {screen === 'dashboard' && (
        <Dashboard
          mainSubjectMeta={scopedMainSubjectMeta}
          subjectGroup={subjectGroup}
          questions={scopedQuestions}
          onSelectSubject={(name) => goTo('mode', { selectedSubject: name, selectedTopic: null })}
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
  );
}
