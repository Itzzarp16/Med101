import { useEffect, useState } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { usernameFormatError, checkUsernameAvailable, normalize } from '../lib/profile';
import LegalFooter from './LegalFooter';
import './AuthScreen.css';

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
  const [usernameStatus, setUsernameStatus] = useState('idle');
  const [usernameCheckError, setUsernameCheckError] = useState(null);
  const [yearSemester, setYearSemester] = useState(YEAR_SEMESTER_OPTIONS[0].value);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [msg, setMsg] = useState(null);
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
    setTermsAccepted(false);
    setMsg(null);
  }

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
        const timeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timed-out')), 8000)
        );

        const available = await Promise.race([
          checkUsernameAvailable(username),
          timeout,
        ]);

        if (active) {
          setUsernameStatus(available ? 'available' : 'taken');
        }
      } catch (e) {
        console.warn('Username availability check failed:', e);

        if (active) {
          setUsernameStatus('error');
          setUsernameCheckError(e.code || e.message || String(e));
        }
      }
    }, 450);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [username, mode, signupStep]);

  function handleNext(e) {
    e.preventDefault();
    setMsg(null);

    if (!name.trim()) {
      setMsg({
        text: 'Please enter your name.',
        type: 'error',
      });
      return;
    }

    if (!username.trim()) {
      setMsg({
        text: 'Please choose a username.',
        type: 'error',
      });
      return;
    }

    const formatError = usernameFormatError(username);

    if (formatError) {
      setMsg({
        text: formatError,
        type: 'error',
      });
      return;
    }

    if (usernameStatus === 'taken') {
      setMsg({
        text: `"${normalize(username)}" is already taken - please choose another.`,
        type: 'error',
      });
      return;
    }

    if (usernameStatus === 'checking') {
      setMsg({
        text: 'Still checking that username - one moment and try again.',
        type: 'error',
      });
      return;
    }

    setSignupStep(2);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg(null);

    if (!email.trim() || !password) {
      setMsg({
        text: 'Please fill in all fields.',
        type: 'error',
      });
      return;
    }

    if (mode === 'signup' && password !== confirm) {
      setMsg({
        text: 'Passwords do not match.',
        type: 'error',
      });
      return;
    }

    if (mode === 'signup' && password.length < 6) {
      setMsg({
        text: 'Password must be at least 6 characters.',
        type: 'error',
      });
      return;
    }

    // Terms & Privacy Policy are required ONLY on signup Step 2.
    if (mode === 'signup' && signupStep === 2 && !termsAccepted) {
      setMsg({
        text: 'Please agree to the Terms & Conditions and Privacy Policy before creating your account.',
        type: 'error',
      });
      return;
    }

    setBusy(true);

    try {
      if (mode === 'signin') {
        await signIn(email.trim(), password);
      } else {
        const { usernameClaimError } = await signUp(
          name.trim(),
          email.trim(),
          password,
          yearSemester,
          username.trim()
        );

        if (usernameClaimError) {
          console.warn(
            'Username claim failed post-signup:',
            usernameClaimError
          );

          setMsg({
            text: `Account created, but the username couldn't be set: ${usernameClaimError}. You can set one from Settings.`,
            type: 'error',
          });
        } else {
          setMsg({
            text: 'Account created! Welcome!',
            type: 'success',
          });
        }
      }
    } catch (err) {
      setMsg({
        text: ERROR_MESSAGES[err.code] || err.message,
        type: 'error',
      });

      setBusy(false);
    }
  }

  async function handleForgotPassword() {
    setMsg(null);

    if (!email.trim()) {
      setMsg({
        text: 'Enter your email above first, then tap "Forgot password?".',
        type: 'error',
      });
      return;
    }

    try {
      // Points the reset link straight at our own /reset-password page
      // instead of med101-1.firebaseapp.com/__/auth/action. This is set
      // here in code rather than via Firebase Console's "Customize
      // action URL" (Authentication -> Templates), which throws "An
      // error occurred when updating action URL" for this project -
      // actionCodeSettings achieves the same thing per-call and isn't
      // affected by whatever's wrong with that console toggle.
      await sendPasswordResetEmail(auth, email.trim(), {
        url: 'https://med101.space/reset-password',
        handleCodeInApp: true,
      });

      setMsg({
        text: 'Password reset email sent. Check your inbox.',
        type: 'success',
      });
    } catch (err) {
      setMsg({
        text: ERROR_MESSAGES[err.code] || err.message,
        type: 'error',
      });
    }
  }

  const showingSignupStep2 = mode === 'signup' && signupStep === 2;

  return (
    <div id="auth-screen">
      <div className="auth-center">
        <div className="auth-card">
          <div className="auth-icon">👨‍⚕️</div>

          <div className="auth-title">
            {mode === 'signin' ? 'Welcome Back' : 'Create Account'}
          </div>

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
              className={
                mode === 'signin'
                  ? 'auth-tab active'
                  : 'auth-tab'
              }
              onClick={() => switchMode('signin')}
            >
              Login
            </button>

            <button
              type="button"
              className={
                mode === 'signup'
                  ? 'auth-tab active'
                  : 'auth-tab'
              }
              onClick={() => switchMode('signup')}
            >
              Create Account
            </button>
          </div>

          {mode === 'signup' && signupStep === 1 && (
            <form onSubmit={handleNext}>
              <div style={{ marginBottom: 14 }}>
                <label className="auth-label">Your Name</label>

                <input
                  className="auth-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  autoComplete="name"
                  autoFocus
                />
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
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--text3)',
                      marginTop: 4,
                    }}
                  >
                    Checking availability…
                  </div>
                )}

                {usernameStatus === 'available' && (
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--green)',
                      marginTop: 4,
                    }}
                  >
                    ✓ Available
                  </div>
                )}

                {usernameStatus === 'taken' && (
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--red)',
                      marginTop: 4,
                    }}
                  >
                    ✗ Already taken - try another
                  </div>
                )}

                {usernameStatus === 'error' && (
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--amber)',
                      marginTop: 4,
                    }}
                  >
                    Couldn't verify right now
                    {usernameCheckError
                      ? ` (${usernameCheckError})`
                      : ''}{' '}
                    - we'll confirm it right after you sign up.
                  </div>
                )}
              </div>

              <div>
                <label className="auth-label">
                  Choose Your Year and Semester
                </label>

                <select
                  className="auth-input"
                  value={yearSemester}
                  onChange={(e) =>
                    setYearSemester(e.target.value)
                  }
                >
                  {YEAR_SEMESTER_OPTIONS.map((opt) => (
                    <option
                      key={opt.value}
                      value={opt.value}
                    >
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                className="auth-btn"
              >
                Next →
              </button>

              {msg && (
                <div
                  className={`auth-msg ${msg.type}`}
                  style={{ display: 'block' }}
                >
                  {msg.text}
                </div>
              )}
            </form>
          )}

          {(mode === 'signin' || showingSignupStep2) && (
            <form onSubmit={handleSubmit}>
              {showingSignupStep2 && (
                <button
                  type="button"
                  className="auth-forgot"
                  style={{
                    textAlign: 'left',
                    marginBottom: 14,
                  }}
                  onClick={() => {
                    setSignupStep(1);
                    setMsg(null);
                  }}
                >
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
                <label className="auth-label">
                  {mode === 'signin'
                    ? 'Password'
                    : 'Create Password'}
                </label>

                <div className="auth-input-wrap">
                  <input
                    className="auth-input"
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={(e) =>
                      setPassword(e.target.value)
                    }
                    placeholder="••••••••"
                    style={{ paddingRight: 44 }}
                    autoComplete={
                      mode === 'signin'
                        ? 'current-password'
                        : 'new-password'
                    }
                  />

                  <button
                    type="button"
                    className="auth-eye"
                    onClick={() =>
                      setShowPw((s) => !s)
                    }
                    title="Show/hide password"
                  >
                    {showPw ? '🙈' : '👁'}
                  </button>
                </div>
              </div>

              {showingSignupStep2 && (
                <>
                  <div style={{ marginTop: 14 }}>
                    <label className="auth-label">
                      Confirm Password
                    </label>

                    <div className="auth-input-wrap">
                      <input
                        className="auth-input"
                        type={
                          showPw ? 'text' : 'password'
                        }
                        value={confirm}
                        onChange={(e) =>
                          setConfirm(e.target.value)
                        }
                        placeholder="••••••••"
                        style={{ paddingRight: 44 }}
                      />
                    </div>
                  </div>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 8,
                      marginTop: 16,
                      fontSize: 13,
                      lineHeight: 1.5,
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={termsAccepted}
                      onChange={(e) =>
                        setTermsAccepted(e.target.checked)
                      }
                      style={{ marginTop: 3 }}
                    />

                    <span>
                      I agree to the{' '}
                      <a
                        href="/terms"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Terms & Conditions
                      </a>{' '}
                      and{' '}
                      <a
                        href="/privacy-policy"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Privacy Policy
                      </a>
                      .
                    </span>
                  </label>
                </>
              )}

              {mode === 'signin' && (
                <div
                  style={{
                    marginTop: 6,
                    textAlign: 'right',
                  }}
                >
                  <button
                    type="button"
                    className="auth-forgot"
                    onClick={handleForgotPassword}
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              <button
                type="submit"
                className="auth-btn"
                disabled={busy}
              >
                {busy
                  ? mode === 'signin'
                    ? 'Signing in…'
                    : 'Creating account…'
                  : mode === 'signin'
                    ? 'Sign In →'
                    : 'Create Account →'}
              </button>

              {msg && (
                <div
                  className={`auth-msg ${msg.type}`}
                  style={{ display: 'block' }}
                >
                  {msg.text}
                </div>
              )}
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
