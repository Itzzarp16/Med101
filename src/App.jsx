import { useState } from 'react';
import Dashboard from './components/Dashboard';
import TopicPicker from './components/TopicPicker';
import QuizScreen from './components/QuizScreen';
import AuthScreen from './components/AuthScreen';
import { useAuth } from './lib/AuthContext';
import { useSemesterData } from './lib/useSemesterData';

// Simple in-app navigation: 'dashboard' -> 'topics' -> 'quiz'.
// No router yet — this is enough for a single linear flow, and keeps
// state (selected subject/topic) colocated instead of threading it
// through URL params for now.
export default function App() {
  const { user, loading, kickedMessage, setKickedMessage, logOut } = useAuth();
  const semesterData = useSemesterData();
  const [screen, setScreen] = useState('dashboard');
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [selectedTopic, setSelectedTopic] = useState(null); // null = "All Topics" within subject

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

  if (semesterData.loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)' }}>
        Loading questions…
      </div>
    );
  }

  const { mainSubjectMeta, subjectMeta, subjectGroup, questions } = semesterData;

  // Questions scoped to whatever the quiz screen should show right now
  const quizQuestions = questions.filter((q) => {
    if (subjectGroup[q.s] !== selectedSubject) return false;
    if (selectedTopic && q.s !== selectedTopic) return false;
    return true;
  });

  return (
    <div>
      <div className="topbar">
        <span>{user.displayName || user.email}</span>
        <button onClick={logOut} className="signout-btn">Sign out</button>
      </div>

      {screen === 'dashboard' && (
        <Dashboard
          mainSubjectMeta={mainSubjectMeta}
          subjectGroup={subjectGroup}
          questions={questions}
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
          questions={questions}
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
          semesterId="y1s2" // TODO: derive from active semester once multiple semester files exist
          questions={quizQuestions}
          onExit={() => setScreen('topics')}
        />
      )}
    </div>
  );
}
