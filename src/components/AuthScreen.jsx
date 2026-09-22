import { useEffect, useRef, useState } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { usernameFormatError, checkUsernameAvailable, normalize, uploadProfilePhoto } from '../lib/profile';
import LegalFooter from './LegalFooter';
import './AuthScreen.css';

const YEAR_SEMESTER_OPTIONS = [
  { value: 'y1s1', label: 'Semester 1' },
  { value: 'y1s2', label: 'Semester 2' },
  { value: 'y2s1', label: 'Semester 3' },
  { value: 'y2s2', label: 'Semester 4' },
  { value: 'y3s1', label: 'Semester 5' },
  { value: 'y3s2', label: 'Semester 6' },
];

export default function AuthScreen() {
  const {
    signIn,
    signInWithGoogle,
    completeGoogleSignUp,
    signUp,

    setGoogleSignupPending,
  } = useAuth();

  const [mode, setMode] = useState('signin');
  const [signupStep, setSignupStep] = useState(1);
  const [googleSignupMode, setGoogleSignupMode] = useState(false);

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
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const photoInputRef = useRef(null);

  // Just stages the file + a local preview - actually uploaded after
  // the account exists (uploadProfilePhoto needs a real uid to write
  // to), inside handleSubmit's signup branch below. Picking a photo is
  // optional; skipping it just means no photo yet, same as any
  // existing student who hasn't set one from Profile.
  function handlePhotoPicked(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setMsg({ text: 'Please choose an image file.', type: 'error' });
      return;
    }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

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
    setGoogleSignupMode(false);
    setGoogleSignupPending(null);
  }

  async function handleGoogleSignIn() {
    setMsg(null);
    setBusy(true);

    try {
      const result = await signInWithGoogle();

      if (result?.newUser && result.pending) {
        setGoogleSignupMode(true);
        setMode('signup');
        setSignupStep(1);
        setName(result.pending.name || '');
        setEmail(result.pending.email || '');
        setUsername('');
        setYearSemester(YEAR_SEMESTER_OPTIONS[0].value);
        setTermsAccepted(false);
        setMsg({
          text: 'Welcome! Complete your MED101 profile to continue.',
          type: 'success',
        });
      }
    } catch (err) {
      const googleErrors = {
        'auth/popup-closed-by-user': 'Google sign-in was cancelled.',
        'auth/popup-blocked': 'Your browser blocked the Google sign-in window. Please allow popups and try again.',
        'auth/cancelled-popup-request': 'Google sign-in was cancelled.',
        'auth/network-request-failed': 'Network error. Check your connection.',
        'auth/account-exists-with-different-credential':
          'An account already exists with this email using another sign-in method.',
      };

      setMsg({
        text: googleErrors[err.code] || err.message || 'Google sign-in failed. Please try again.',
        type: 'error',
      });
    } finally {
      setBusy(false);
    }
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

    if (!email.trim() || (!googleSignupMode && !password)) {
      setMsg({
        text: 'Please fill in all fields.',
        type: 'error',
      });
      return;
    }

    if (mode === 'signup' && !googleSignupMode && password !== confirm) {
      setMsg({
        text: 'Passwords do not match.',
        type: 'error',
      });
      return;
    }

    if (mode === 'signup' && !googleSignupMode && password.length < 6) {
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
      } else if (googleSignupMode) {
        const { usernameClaimError } = await completeGoogleSignUp(
          name.trim(),
          yearSemester,
          username.trim()
        );

        if (usernameClaimError) {
          setMsg({
            text: `Account created, but the username couldn't be set: ${usernameClaimError}. You can set one from Settings.`,
            type: 'error',
          });
        } else {
          setMsg({
            text: 'Account created! Welcome to MED101!',
            type: 'success',
          });
        }

        setGoogleSignupMode(false);
      } else {
        const { usernameClaimError } = await signUp(
          name.trim(),
          email.trim(),
          password,
          yearSemester,
          username.trim()
        );

        // Best-effort, same spirit as the username claim above: a
        // failed photo upload shouldn't block account creation or
        // even change the success message - they can just add one
        // later from Profile, same as anyone who skipped this.
        if (!googleSignupMode && photoFile && auth.currentUser) {
          try {
            await uploadProfilePhoto(auth.currentUser, photoFile);
          } catch (photoErr) {
            console.warn('Profile photo upload failed post-signup:', photoErr);
          }
        }

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
                ? googleSignupMode
                  ? 'Almost done - complete your MED101 profile'
                  : 'Almost done - set your email and password'
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

          {mode === 'signin' && (
            <>
              <button
                type="button"
                className="auth-btn"
                onClick={handleGoogleSignIn}
                disabled={busy}
                style={{
                  background: '#fff',
                  color: '#202124',
                  border: '1px solid var(--border2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  marginBottom: 16,
                }}
              >
                <span style={{ fontSize: 18, fontWeight: 700 }}>G</span>
                {busy ? 'Signing in…' : 'Continue with Google'}
              </button>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  margin: '4px 0 16px',
                  color: 'var(--text3)',
                  fontSize: 12,
                }}
              >
                <div style={{ flex: 1, height: 1, background: 'var(--border2)' }} />
                <span>OR</span>
                <div style={{ flex: 1, height: 1, background: 'var(--border2)' }} />
              </div>
            </>
          )}

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
                  readOnly={googleSignupMode}
                  style={googleSignupMode ? { opacity: 0.75 } : undefined}
                />
              </div>

              {!googleSignupMode && (
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
              )}

              {showingSignupStep2 && (
                <>
                  {!googleSignupMode && (
                    <div style={{ marginTop: 14 }}>
                      <label className="auth-label">
                        Confirm Password
                      </label>

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

                  <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button
                      type="button"
                      onClick={() => photoInputRef.current?.click()}
                      title="Add profile photo"
                      style={{
                        width: 56, height: 56, borderRadius: '50%', flexShrink: 0,
                        border: '1px solid var(--border2)', cursor: 'pointer',
                        background: photoPreview ? `center/cover url(${photoPreview})` : 'var(--bg2)',
                        color: 'var(--text2)', fontSize: 22, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      {!photoPreview && (name.trim()[0] || '+').toUpperCase()}
                    </button>
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoPicked}
                      style={{ display: 'none' }}
                    />
                    <div>
                      <button
                        type="button"
                        className="btn-ghost"
                        style={{ fontSize: 13 }}
                        onClick={() => photoInputRef.current?.click()}
                      >
                        {photoPreview ? 'Change Photo' : 'Add Profile Photo'}
                      </button>
                      <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 4 }}>Optional - you can add this later too</div>
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
                    : googleSignupMode
                      ? 'Complete Account →'
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
        </div>
      </div>

      <LegalFooter />
    </div>
  );
}
