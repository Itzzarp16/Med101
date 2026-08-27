import { useEffect, useState } from 'react';
import Dashboard from './components/Dashboard';
import TopicPicker from './components/TopicPicker';
import QuizScreen from './components/QuizScreen';
import LeaderboardScreen from './components/LeaderboardScreen';
import AdminCalendarScreen from './components/AdminCalendarScreen';
import AdminNoticeScreen from './components/AdminNoticeScreen';
import AdminQuestionsScreen from './components/AdminQuestionsScreen';
import SettingsScreen from './components/SettingsScreen';
import HomeNoticeBanner from './components/HomeNoticeBanner';
import AuthScreen from './components/AuthScreen';
import { useAuth } from './lib/AuthContext';
import { useSemesterData } from './lib/useSemesterData';
import { fetchAcademicCalendar, resolveCurrentSemester } from './lib/academicCalendar';

// Simple in-app navigation: 'dashboard' -> 'topics' -> 'quiz', plus
// standalone 'leaderboard', 'settings', and admin-only screens reachable
// from the topbar. No router yet — this is enough for a single linear flow.
export default function App() {
  const { user, profile, loading, isAdmin, kickedMessage, setKickedMessage, logOut } = useAuth();
  const semesterData = useSemesterData();
  const [screen, setScreen] = useState('dashboard');
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [selectedTopic, setSelectedTopic] = useState(null); // null = "All Topics" within subject
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

  const adminNavButtons = isAdmin && (
    <>
      <button onClick={() => setScreen('admin-questions')} className="admin-nav-btn">📝 Questions</button>
      <button onClick={() => setScreen('admin-notice')} className="admin-nav-btn">📢 Notice</button>
      <button onClick={() => setScreen('admin-calendar')} className="admin-nav-btn">⚙️ Calendar</button>
    </>
  );

  const settingsNavButton = (
    <button onClick={() => setScreen('settings')} className="lb-nav-btn">⚙️ Settings</button>
  );

  // Settings and admin calendar/notice screens are reachable regardless
  // of semester-data state — a student stuck on "content coming soon"
  // still needs to be able to change their semester back, for instance.
  if (screen === 'settings') {
    return (
      <div>
        <div className="topbar">
          <span>{user.displayName || user.email}</span>
          <button onClick={logOut} className="signout-btn">Sign out</button>
        </div>
        <SettingsScreen onBack={() => setScreen('dashboard')} />
      </div>
    );
  }

  if (screen === 'admin-calendar' && isAdmin) {
    return (
      <div>
        <div className="topbar">
          <span>{user.displayName || user.email}</span>
          <button onClick={logOut} className="signout-btn">Sign out</button>
        </div>
        <AdminCalendarScreen onBack={() => setScreen('dashboard')} />
      </div>
    );
  }

  if (screen === 'admin-notice' && isAdmin) {
    return (
      <div>
        <div className="topbar">
          <span>{user.displayName || user.email}</span>
          <button onClick={logOut} className="signout-btn">Sign out</button>
        </div>
        <AdminNoticeScreen onBack={() => setScreen('dashboard')} />
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
        <div className="topbar">
          <span>{user.displayName || user.email}</span>
          <div className="topbar-actions">
            {settingsNavButton}
            {adminNavButtons}
            <button onClick={logOut} className="signout-btn">Sign out</button>
          </div>
        </div>
        <HomeNoticeBanner />
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

  // Questions scoped to whatever the quiz screen should show right now
  const quizQuestions = scopedQuestions.filter((q) => {
    if (subjectGroup[q.s] !== selectedSubject) return false;
    if (selectedTopic && q.s !== selectedTopic) return false;
    return true;
  });

  return (
    <div>
      <div className="topbar">
        <span>{user.displayName || user.email}</span>
        <div className="topbar-actions">
          {screen !== 'leaderboard' && (
            <button onClick={() => setScreen('leaderboard')} className="lb-nav-btn">🏆 Leaderboard</button>
          )}
          {settingsNavButton}
          {adminNavButtons}
          <button onClick={logOut} className="signout-btn">Sign out</button>
        </div>
      </div>

      {screen === 'dashboard' && <HomeNoticeBanner />}

      {screen === 'admin-questions' && isAdmin && (
        <AdminQuestionsScreen
          semesterId={activeSemesterId}
          mainSubjectMeta={scopedMainSubjectMeta}
          subjectGroup={subjectGroup}
          jsonQuestions={scopedQuestions}
          onBack={() => setScreen('dashboard')}
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
            setScreen('quiz');
          }}
          onBack={() => setScreen('dashboard')}
        />
      )}

      {screen === 'quiz' && (
        <QuizScreen
          mainSubject={selectedSubject}
          topic={selectedTopic}
          semesterId={activeSemesterId}
          questions={quizQuestions}
          onExit={() => setScreen('topics')}
        />
      )}

      {screen === 'leaderboard' && (
        <LeaderboardScreen
          semesterId={activeSemesterId}
          onBack={() => setScreen('dashboard')}
        />
      )}
    </div>
  );
}
