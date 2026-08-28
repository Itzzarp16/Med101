import { useEffect, useState } from 'react';
import TopBar from './components/TopBar';
import Dashboard from './components/Dashboard';
import TopicPicker from './components/TopicPicker';
import QuizModeScreen from './components/QuizModeScreen';
import QuizScreen from './components/QuizScreen';
import LeaderboardScreen from './components/LeaderboardScreen';
import AdminCalendarScreen from './components/AdminCalendarScreen';
import AdminNoticeScreen from './components/AdminNoticeScreen';
import AdminQuestionsScreen from './components/AdminQuestionsScreen';
import SettingsScreen from './components/SettingsScreen';
import AuthScreen from './components/AuthScreen';
import { useAuth } from './lib/AuthContext';
import { useSemesterData } from './lib/useSemesterData';
import { fetchAcademicCalendar, resolveCurrentSemester } from './lib/academicCalendar';

// Navigation is backed by real browser history (pushState/popstate) so
// the phone's back gesture moves one screen back instead of closing the
// whole site — every forward navigation goes through goTo(), every
// "back" action goes through goBack() (== history.back()), and a
// popstate listener keeps `screen` in sync with whichever entry the
// user lands on.
export default function App() {
  const { user, profile, loading, isAdmin, kickedMessage, setKickedMessage } = useAuth();
  const semesterData = useSemesterData();
  const [screen, setScreen] = useState('dashboard');
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [selectedTopic, setSelectedTopic] = useState(null); // null = "All Topics" within subject
  const [finalQuiz, setFinalQuiz] = useState(null); // { questions, autoAdvance, timerSeconds } once mode is chosen
  const [activeSemesterId, setActiveSemesterId] = useState(null);
  const [calendarLoading, setCalendarLoading] = useState(true);

  // Seed a base history entry on mount, then listen for the back/forward
  // gesture and sync our screen state to whatever entry it lands on.
  useEffect(() => {
    window.history.replaceState({ screen: 'dashboard', selectedSubject: null, selectedTopic: null }, '');
    function onPopState(e) {
      const state = e.state || { screen: 'dashboard' };
      setScreen(state.screen);
      setSelectedSubject(state.selectedSubject ?? null);
      setSelectedTopic(state.selectedTopic ?? null);
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

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
    onSettings: () => goTo('settings'),
    onAdminQuestions: () => goTo('admin-questions'),
    onAdminNotice: () => goTo('admin-notice'),
    onAdminCalendar: () => goTo('admin-calendar'),
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

  if (semesterData.loading || calendarLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)' }}>
        Loading questions…
      </div>
    );
  }

  const { mainSubjectMeta, subjectMeta, subjectGroup, semesterMainSubjects, questions } = semesterData;

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
  const modePool = scopedQuestions.filter((q) => {
    if (subjectGroup[q.s] !== selectedSubject) return false;
    if (selectedTopic && q.s !== selectedTopic) return false;
    return true;
  });

  return (
    <div>
      <TopBar {...topBarProps} />

      {screen === 'admin-questions' && isAdmin && (
        <AdminQuestionsScreen
          semesterId={activeSemesterId}
          mainSubjectMeta={scopedMainSubjectMeta}
          subjectGroup={subjectGroup}
          jsonQuestions={scopedQuestions}
          onBack={goBack}
        />
      )}

      {screen === 'dashboard' && (
        <Dashboard
          mainSubjectMeta={scopedMainSubjectMeta}
          subjectGroup={subjectGroup}
          questions={scopedQuestions}
          onSelectSubject={(name) => goTo('topics', { selectedSubject: name, selectedTopic: null })}
          onPracticeTopic={(subject, subtopic) => {
            // Quick-practice shortcut skips mode selection: jumps
            // straight into a Random 25 of that specific weak topic.
            const pool = scopedQuestions.filter((q) => q.s === subtopic);
            const shuffledPool = [...pool].sort(() => Math.random() - 0.5).slice(0, Math.min(25, pool.length));
            setFinalQuiz({ questions: shuffledPool, autoAdvance: true, timerSeconds: null });
            goTo('quiz', { selectedSubject: subject, selectedTopic: subtopic });
          }}
        />
      )}

      {screen === 'topics' && (
        <TopicPicker
          mainSubject={selectedSubject}
          subjectMeta={subjectMeta}
          subjectGroup={subjectGroup}
          questions={scopedQuestions}
          onSelectTopic={(topicName) => goTo('mode', { selectedTopic: topicName })}
          onBack={goBack}
        />
      )}

      {screen === 'mode' && (
        <QuizModeScreen
          pool={modePool}
          label={selectedTopic || selectedSubject}
          onStart={(quizQuestions, settings) => {
            setFinalQuiz({ questions: quizQuestions, ...settings });
            goTo('quiz');
          }}
          onBack={goBack}
        />
      )}

      {screen === 'quiz' && finalQuiz && (
        <QuizScreen
          mainSubject={selectedSubject}
          topic={selectedTopic}
          semesterId={activeSemesterId}
          questions={finalQuiz.questions}
          autoAdvance={finalQuiz.autoAdvance}
          timerSeconds={finalQuiz.timerSeconds}
          onExit={goBack}
        />
      )}

      {screen === 'leaderboard' && (
        <LeaderboardScreen
          semesterId={activeSemesterId}
          onBack={goBack}
        />
      )}
    </div>
  );
}
