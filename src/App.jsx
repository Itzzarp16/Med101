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

// Simple in-app navigation: 'dashboard' -> 'topics' -> 'mode' -> 'quiz',
// plus standalone 'leaderboard', 'settings', and admin-only screens
// reachable from the shared TopBar. No router yet — this is enough for
// a single linear flow.
export default function App() {
  const { user, profile, loading, isAdmin, kickedMessage, setKickedMessage } = useAuth();
  const semesterData = useSemesterData();
  const [screen, setScreen] = useState('dashboard');
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [selectedTopic, setSelectedTopic] = useState(null); // null = "All Topics" within subject
  const [finalQuiz, setFinalQuiz] = useState(null); // { questions, autoAdvance, timerSeconds } once mode is chosen
  const [activeSemesterId, setActiveSemesterId] = useState(null);
  const [calendarLoading, setCalendarLoading] = useState(true);

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

  function goHome() {
    setScreen('dashboard');
  }

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

  // Settings and admin calendar/notice screens are reachable regardless
  // of semester-data state — a student stuck on "content coming soon"
  // still needs to be able to change their semester back, for instance.
  if (screen === 'settings') {
    return (
      <div>
        <TopBar
          onHome={goHome}
          onLeaderboard={() => setScreen('leaderboard')}
          onSettings={() => setScreen('settings')}
          onAdminQuestions={() => setScreen('admin-questions')}
          onAdminNotice={() => setScreen('admin-notice')}
          onAdminCalendar={() => setScreen('admin-calendar')}
        />
        <SettingsScreen onBack={goHome} />
      </div>
    );
  }

  if (screen === 'admin-calendar' && isAdmin) {
    return (
      <div>
        <TopBar
          onHome={goHome}
          onLeaderboard={() => setScreen('leaderboard')}
          onSettings={() => setScreen('settings')}
          onAdminQuestions={() => setScreen('admin-questions')}
          onAdminNotice={() => setScreen('admin-notice')}
          onAdminCalendar={() => setScreen('admin-calendar')}
        />
        <AdminCalendarScreen onBack={goHome} />
      </div>
    );
  }

  if (screen === 'admin-notice' && isAdmin) {
    return (
      <div>
        <TopBar
          onHome={goHome}
          onLeaderboard={() => setScreen('leaderboard')}
          onSettings={() => setScreen('settings')}
          onAdminQuestions={() => setScreen('admin-questions')}
          onAdminNotice={() => setScreen('admin-notice')}
          onAdminCalendar={() => setScreen('admin-calendar')}
        />
        <AdminNoticeScreen onBack={goHome} />
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
        <TopBar
          onHome={goHome}
          onLeaderboard={() => setScreen('leaderboard')}
          onSettings={() => setScreen('settings')}
          onAdminQuestions={() => setScreen('admin-questions')}
          onAdminNotice={() => setScreen('admin-notice')}
          onAdminCalendar={() => setScreen('admin-calendar')}
        />
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
      <TopBar
          onHome={goHome}
          onLeaderboard={() => setScreen('leaderboard')}
          onSettings={() => setScreen('settings')}
          onAdminQuestions={() => setScreen('admin-questions')}
          onAdminNotice={() => setScreen('admin-notice')}
          onAdminCalendar={() => setScreen('admin-calendar')}
        />

      {screen === 'admin-questions' && isAdmin && (
        <AdminQuestionsScreen
          semesterId={activeSemesterId}
          mainSubjectMeta={scopedMainSubjectMeta}
          subjectGroup={subjectGroup}
          jsonQuestions={scopedQuestions}
          onBack={goHome}
        />
      )}

      {screen === 'dashboard' && (
        <Dashboard
          mainSubjectMeta={scopedMainSubjectMeta}
          subjectGroup={subjectGroup}
          questions={scopedQuestions}
          onSelectSubject={(name) => {
            setSelectedSubject(name);
            setScreen('topics');
          }}
          onPracticeTopic={(subject, subtopic) => {
            // Quick-practice shortcut skips mode selection: jumps
            // straight into a Random 25 of that specific weak topic.
            setSelectedSubject(subject);
            setSelectedTopic(subtopic);
            const pool = scopedQuestions.filter((q) => q.s === subtopic);
            const shuffledPool = [...pool].sort(() => Math.random() - 0.5).slice(0, Math.min(25, pool.length));
            setFinalQuiz({ questions: shuffledPool, autoAdvance: true, timerSeconds: null });
            setScreen('quiz');
          }}
        />
      )}

      {screen === 'topics' && (
        <TopicPicker
          mainSubject={selectedSubject}
          subjectMeta={subjectMeta}
          subjectGroup={subjectGroup}
          questions={scopedQuestions}
          onSelectTopic={(topicName) => {
            setSelectedTopic(topicName);
            setScreen('mode');
          }}
          onBack={goHome}
        />
      )}

      {screen === 'mode' && (
        <QuizModeScreen
          pool={modePool}
          label={selectedTopic || selectedSubject}
          onStart={(quizQuestions, settings) => {
            setFinalQuiz({ questions: quizQuestions, ...settings });
            setScreen('quiz');
          }}
          onBack={() => setScreen('topics')}
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
          onExit={() => setScreen('topics')}
        />
      )}

      {screen === 'leaderboard' && (
        <LeaderboardScreen
          semesterId={activeSemesterId}
          onBack={goHome}
        />
      )}
    </div>
  );
}
