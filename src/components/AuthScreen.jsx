import { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import './AuthScreen.css';

// Matches the semesterManifest pattern — extend this list as new
// year/semester data files get added.
const YEAR_SEMESTER_OPTIONS = [
  { value: 'y1s1', label: 'Year 1 · Semester 1' },
  { value: 'y1s2', label: 'Year 1 · Semester 2' },
  { value: 'y2s1', label: 'Year 2 · Semester 1' },
  { value: 'y2s2', label: 'Year 2 · Semester 2' },
];

export default function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [yearSemester, setYearSemester] = useState(YEAR_SEMESTER_OPTIONS[0].value);
  const [showPw, setShowPw] = useState(false);
  const [msg, setMsg] = useState(null); // { text, type }
  const [busy, setBusy] = useState(false);

  const ERROR_MESSAGES = {
    'auth/user-not-found': 'No account found with this email.',
    'auth/wrong-password': 'Incorrect password. Please try again.',
    'auth/email-already-in-use': 'An account with this email already exists.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/too-many-requests': 'Too many failed attempts. Please try again later.',
    'auth/network-request-failed': 'Network error. Check your connection.',
    'auth/invalid-credential': 'Invalid email or password.',
    'auth/weak-password': 'Password must be at least 6 characters.',
  };

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg(null);

    if (!email.trim() || !password) {
      setMsg({ text: 'Please fill in all fields.', type: 'error' });
      return;
    }
    if (mode === 'signup') {
      if (!name.trim()) {
        setMsg({ text: 'Please enter your name.', type: 'error' });
        return;
      }
      if (password !== confirm) {
        setMsg({ text: 'Passwords do not match.', type: 'error' });
        return;
      }
      if (password.length < 6) {
        setMsg({ text: 'Password must be at least 6 characters.', type: 'error' });
        return;
      }
    }

    setBusy(true);
    try {
      if (mode === 'signin') {
        await signIn(email.trim(), password);
      } else {
        await signUp(name.trim(), email.trim(), password, yearSemester);
        setMsg({ text: 'Account created! Welcome!', type: 'success' });
      }
    } catch (err) {
      setMsg({ text: ERROR_MESSAGES[err.code] || err.message, type: 'error' });
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card glass-hi">
        <div className="auth-tabs">
          <button
            className={mode === 'signin' ? 'auth-tab active' : 'auth-tab'}
            onClick={() => { setMode('signin'); setMsg(null); }}
            type="button"
          >
            Sign In
          </button>
          <button
            className={mode === 'signup' ? 'auth-tab active' : 'auth-tab'}
            onClick={() => { setMode('signup'); setMsg(null); }}
            type="button"
          >
            Sign Up
          </button>
        </div>

        <h1 className="auth-title">{mode === 'signin' ? 'Welcome Back' : 'Create Account'}</h1>
        <p className="auth-sub">
          {mode === 'signin'
            ? 'Enter your email and password to continue'
            : 'Sign up to start your medical MCQ journey'}
        </p>

        <form onSubmit={handleSubmit} className="auth-form">
          {mode === 'signup' && (
            <div className="auth-field">
              <label>Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" />
            </div>
          )}

          <div className="auth-field">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>

          {mode === 'signup' && (
            <div className="auth-field">
              <label>Year &amp; Semester</label>
              <select value={yearSemester} onChange={(e) => setYearSemester(e.target.value)}>
                {YEAR_SEMESTER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          )}

          <div className="auth-field">
            <label>{mode === 'signin' ? 'Password' : 'Create Password'}</label>
            <div className="auth-pw-row">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'signin' ? '········' : 'Create a strong password'}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              />
              <button type="button" className="auth-eye-btn" onClick={() => setShowPw((s) => !s)}>
                {showPw ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          {mode === 'signup' && (
            <div className="auth-field">
              <label>Confirm Password</label>
              <input
                type={showPw ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Re-enter your password"
              />
            </div>
          )}

          {msg && <div className={`auth-msg auth-msg-${msg.type}`}>{msg.text}</div>}

          <button type="submit" className="auth-submit-btn" disabled={busy}>
            {busy
              ? (mode === 'signin' ? 'Signing in…' : 'Creating account…')
              : (mode === 'signin' ? 'Sign In' : 'Create Account')}
          </button>
        </form>
      </div>
    </div>
  );
}
