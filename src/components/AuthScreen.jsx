import { useEffect, useRef, useState } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { usernameFormatError, checkUsernameAvailable, normalize } from '../lib/profile';
import LegalFooter from './LegalFooter';
import './AuthScreen.css';

// Matches the old site's #auth-screen exactly (same order): icon,
// gradient title, tabs, name (signup only), year/semester (signup
// only - new addition, styled to match), email, password with eye
// toggle, confirm password (signup only), forgot password (signin
// only), submit, message, powered-by badge.
//
// Signup is now two steps: step 1 collects name, username and
// year/semester. Username availability is checked live here (debounced,
// against the now-public-read usernames/{name} collection - see
// firestore.rules) so a taken name gets caught and can be fixed right
// on this screen; step 2 collects email/password and actually creates
// the account.
// The username is claimed inside AuthContext.signUp itself (not here)
// - onAuthStateChanged fires independently of this component and can
// swap the whole screen away as soon as the account exists, so the
// claim needs to be guaranteed to run as part of account creation,
// not raced against whatever happens to this component afterward. The
// live check above catches the common case (name already taken) before
// signup even starts, but a last-second collision between the check
// and the actual claim is still possible - if the claim itself still
// fails, the account still goes through and a persistent notice (see
// AuthContext's signupNotice) tells the person to set one from
// Settings instead of blocking signup on it.
const YEAR_SEMESTER_OPTIONS = [
  { value: 'y1s1', label: 'Year 1 · Semester 1' },
  { value: 'y1s2', label: 'Year 1 · Semester 2' },
  { value: 'y2s1', label: 'Year 2 · Semester 1' },
  { value: 'y2s2', label: 'Year 2 · Semester 2' },
];

export default function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState('signin');
  const [signupStep, setSignupStep] = useState(1);

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  // 'idle' | 'checking' | 'available' | 'taken' | 'error' - live
  // feedback on step 1, so a taken name gets caught and can be fixed
  // right there instead of only surfacing after the account exists.
  const [usernameStatus, setUsernameStatus] = useState('idle');
  const [usernameCheckError, setUsernameCheckError] = useState(null);
  const [yearSemester, setYearSemester] = useState(YEAR_SEMESTER_OPTIONS[0].value);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
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

  function switchMode(newMode) {
    setMode(newMode);
    setSignupStep(1);
    setMsg(null);
  }

  // Debounced live check: waits for typing to pause before hitting
  // Firestore, and ignores a result if the username changed again
  // while the request was in flight (the `active` flag below).
  useEffect(() => {
    if (mode !== 'signup' || signupStep !== 1) return;
    if (usernameFormatError(username)) {
      setUsernameStatus('idle');
      return;
    }
    let active = true;
    setUsernameStatus('checking');
    setUsernameCheckError(null);
    const timer = setTimeout(async () => {
      try {
        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timed-out')), 8000));
        const available = await Promise.race([checkUsernameAvailable(username), timeout]);
        if (active) setUsernameStatus(available ? 'available' : 'taken');
      } catch (e) {
        console.warn('Username availability check failed:', e);
        if (active) {
          setUsernameStatus('error');
          setUsernameCheckError(e.code || e.message || String(e));
        }
      }
    }, 450);
    return () => { active = false; clearTimeout(timer); };
  }, [username, mode, signupStep]);

  function handleNext(e) {
    e.preventDefault();
    setMsg(null);

    if (!name.trim()) {
      setMsg({ text: 'Please enter your name.', type: 'error' });
      return;
    }
    if (!username.trim()) {
      setMsg({ text: 'Please choose a username.', type: 'error' });
      return;
    }
    const formatError = usernameFormatError(username);
    if (formatError) {
      setMsg({ text: formatError, type: 'error' });
      return;
    }
    if (usernameStatus === 'taken') {
      setMsg({ text: `"${normalize(username)}" is already taken - please choose another.`, type: 'error' });
      return;
    }
    if (usernameStatus === 'checking') {
      setMsg({ text: 'Still checking that username - one moment and try again.', type: 'error' });
      return;
    }

    setSignupStep(2);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg(null);

    if (!email.trim() || !password) {
      setMsg({ text: 'Please fill in all fields.', type: 'error' });
      return;
    }
    if (mode === 'signup' && password !== confirm) {
      setMsg({ text: 'Passwords do not match.', type: 'error' });
      return;
    }
    if (mode === 'signup' && password.length < 6) {
      setMsg({ text: 'Password must be at least 6 characters.', type: 'error' });
      return;
    }

    setBusy(true);
    try {
      if (mode === 'signin') {
        await signIn(email.trim(), password);
      } else {
        const { usernameClaimError } = await signUp(name.trim(), email.trim(), password, yearSemester, username.trim());
        if (usernameClaimError) {
          // Account exists either way - don't strand them mid-signup,
          // but show the real reason instead of assuming it was a
          // naming collision, so this is diagnosable if it happens again.
          console.warn('Username claim failed post-signup:', usernameClaimError);
          setMsg({ text: `Account created, but the username couldn't be set: ${usernameClaimError}. You can set one from Settings.`, type: 'error' });
        } else {
          setMsg({ text: 'Account created! Welcome!', type: 'success' });
        }
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
      setMsg({ text: 'Password reset email sent. Check your inbox.', type: 'success' });
    } catch (err) {
      setMsg({ text: ERROR_MESSAGES[err.code] || err.message, type: 'error' });
    }
  }

  const showingSignupStep2 = mode === 'signup' && signupStep === 2;

  return (
    <div id="auth-screen">
      <div className="auth-center">
      <div className="auth-card">
        <div className="auth-icon">👨‍⚕️</div>
        <div className="auth-title">{mode === 'signin' ? 'Welcome Back' : 'Create Account'}</div>
        <div className="auth-sub">
          {mode === 'signin'
            ? 'Enter your email and password to continue'
            : showingSignupStep2
              ? 'Almost done - set your email and password'
              : 'Sign up to start your medical MCQ journey'}
        </div>

        <div className="auth-tabs">
          <button
            type="button"
            className={mode === 'signin' ? 'auth-tab active' : 'auth-tab'}
            onClick={() => switchMode('signin')}
          >
            Login
          </button>
          <button
            type="button"
            className={mode === 'signup' ? 'auth-tab active' : 'auth-tab'}
            onClick={() => switchMode('signup')}
          >
            Create Account
          </button>
        </div>

        {mode === 'signup' && signupStep === 1 && (
          <form onSubmit={handleNext}>
            <div style={{ marginBottom: 14 }}>
              <label className="auth-label">Your Name</label>
              <input className="auth-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" autoFocus />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label className="auth-label">Create Username</label>
              <input
                className="auth-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. dr_vijay"
                autoComplete="username"
              />
              {usernameStatus === 'checking' && (
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>Checking availability…</div>
              )}
              {usernameStatus === 'available' && (
                <div style={{ fontSize: 12, color: 'var(--green)', marginTop: 4 }}>✓ Available</div>
              )}
              {usernameStatus === 'taken' && (
                <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>✗ Already taken - try another</div>
              )}
              {usernameStatus === 'error' && (
                <div style={{ fontSize: 12, color: 'var(--amber)', marginTop: 4 }}>
                  Couldn't verify right now{usernameCheckError ? ` (${usernameCheckError})` : ''} - we'll confirm it right after you sign up.
                </div>
              )}
            </div>

            <div>
              <label className="auth-label">Choose Your Year and Semester</label>
              <select className="auth-input" value={yearSemester} onChange={(e) => setYearSemester(e.target.value)}>
                {YEAR_SEMESTER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <button type="submit" className="auth-btn">
              Next →
            </button>

            {msg && <div className={`auth-msg ${msg.type}`} style={{ display: 'block' }}>{msg.text}</div>}
          </form>
        )}

        {(mode === 'signin' || showingSignupStep2) && (
          <form onSubmit={handleSubmit}>
            {showingSignupStep2 && (
              <button type="button" className="auth-forgot" style={{ textAlign: 'left', marginBottom: 14 }} onClick={() => { setSignupStep(1); setMsg(null); }}>
                ← Back
              </button>
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
                autoFocus={showingSignupStep2}
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

            {showingSignupStep2 && (
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
        )}

        <div className="auth-powered">
          by <span>Vijay Yadav</span>
        </div>
      </div>
      </div>
      <LegalFooter />
    </div>
  );
}
