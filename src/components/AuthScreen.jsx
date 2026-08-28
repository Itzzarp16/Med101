import { useState } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import './AuthScreen.css';

// Matches the old site's #auth-screen exactly (same order): icon,
// gradient title, tabs, name (signup only), year/semester (signup
// only — new addition, styled to match), email, password with eye
// toggle, confirm password (signup only), forgot password (signin
// only), submit, message, powered-by badge.
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

  async function handleForgotPassword() {
    setMsg(null);
    if (!email.trim()) {
      setMsg({ text: 'Enter your email above first, then tap "Forgot password?".', type: 'error' });
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setMsg({ text: 'Password reset email sent — check your inbox.', type: 'success' });
    } catch (err) {
      setMsg({ text: ERROR_MESSAGES[err.code] || err.message, type: 'error' });
    }
  }

  return (
    <div id="auth-screen">
      <div className="auth-card">
        <div className="auth-icon">👨‍⚕️</div>
        <div className="auth-title">{mode === 'signin' ? 'Welcome Back' : 'Create Account'}</div>
        <div className="auth-sub">
          {mode === 'signin'
            ? 'Enter your email and password to continue'
            : 'Sign up to start your medical MCQ journey'}
        </div>

        <div className="auth-tabs">
          <button
            type="button"
            className={mode === 'signin' ? 'auth-tab active' : 'auth-tab'}
            onClick={() => { setMode('signin'); setMsg(null); }}
          >
            Sign In
          </button>
          <button
            type="button"
            className={mode === 'signup' ? 'auth-tab active' : 'auth-tab'}
            onClick={() => { setMode('signup'); setMsg(null); }}
          >
            Sign Up
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <div style={{ marginBottom: 14 }}>
              <label className="auth-label">Your Name</label>
              <input className="auth-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" />
            </div>
          )}

          {mode === 'signup' && (
            <div style={{ marginBottom: 14 }}>
              <label className="auth-label">Year &amp; Semester</label>
              <select className="auth-input" value={yearSemester} onChange={(e) => setYearSemester(e.target.value)}>
                {YEAR_SEMESTER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <label className="auth-label">Email</label>
            <input
              className="auth-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="yourname@email.com"
              autoComplete="email"
            />
          </div>

          <div>
            <label className="auth-label">{mode === 'signin' ? 'Password' : 'Create Password'}</label>
            <div className="auth-input-wrap">
              <input
                className="auth-input"
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{ paddingRight: 44 }}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              />
              <button type="button" className="auth-eye" onClick={() => setShowPw((s) => !s)} title="Show/hide password">
                {showPw ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          {mode === 'signup' && (
            <div style={{ marginTop: 14 }}>
              <label className="auth-label">Confirm Password</label>
              <div className="auth-input-wrap">
                <input
                  className="auth-input"
                  type={showPw ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  style={{ paddingRight: 44 }}
                />
              </div>
            </div>
          )}

          {mode === 'signin' && (
            <div style={{ marginTop: 6, textAlign: 'right' }}>
              <button type="button" className="auth-forgot" onClick={handleForgotPassword}>Forgot password?</button>
            </div>
          )}

          <button type="submit" className="auth-btn" disabled={busy}>
            {busy
              ? (mode === 'signin' ? 'Signing in…' : 'Creating account…')
              : (mode === 'signin' ? 'Sign In →' : 'Create Account →')}
          </button>

          {msg && <div className={`auth-msg ${msg.type}`} style={{ display: 'block' }}>{msg.text}</div>}
        </form>

        <div className="auth-powered">
          Made by <span>Abhishek Verma</span>
        </div>
      </div>
    </div>
  );
}
