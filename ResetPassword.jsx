import { useEffect, useState } from 'react';
import { verifyPasswordResetCode, confirmPasswordReset } from 'firebase/auth';
import { auth } from '../lib/firebase';
import LegalFooter from './LegalFooter';
import './AuthScreen.css';

// Public, no-auth route (see main.jsx) - this is what Firebase's
// password-reset email should link to once its Action URL is set to
// https://med101.space/reset-password in the Firebase Console
// (Authentication -> Templates -> Password reset -> customize action
// URL). Reads Firebase's own ?mode=resetPassword&oobCode=... query
// params - verifyPasswordResetCode/confirmPasswordReset work with any
// authorized domain, they don't require the firebaseapp.com URL.
export default function ResetPassword() {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode');
  const oobCode = params.get('oobCode');

  const [status, setStatus] = useState('checking'); // checking | ready | invalid | done
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const ERROR_MESSAGES = {
    'auth/expired-action-code': 'This reset link has expired - request a new one from the sign-in screen.',
    'auth/invalid-action-code': 'This reset link is invalid or has already been used - request a new one.',
    'auth/user-disabled': 'This account has been disabled.',
    'auth/user-not-found': 'No account matches this reset link.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/network-request-failed': 'Network error. Check your connection.',
  };

  useEffect(() => {
    if (mode !== 'resetPassword' || !oobCode) {
      setStatus('invalid');
      return;
    }
    verifyPasswordResetCode(auth, oobCode)
      .then((verifiedEmail) => {
        setEmail(verifiedEmail);
        setStatus('ready');
      })
      .catch((e) => {
        setMsg({ text: ERROR_MESSAGES[e.code] || e.message || String(e), type: 'error' });
        setStatus('invalid');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, oobCode]);

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg(null);
    if (password.length < 6) {
      setMsg({ text: 'Password must be at least 6 characters.', type: 'error' });
      return;
    }
    if (password !== confirm) {
      setMsg({ text: 'Passwords do not match.', type: 'error' });
      return;
    }
    setBusy(true);
    try {
      await confirmPasswordReset(auth, oobCode, password);
      setStatus('done');
    } catch (e) {
      setMsg({ text: ERROR_MESSAGES[e.code] || e.message || String(e), type: 'error' });
      setBusy(false);
    }
  }

  return (
    <div id="auth-screen">
      <div className="auth-center">
        <div className="auth-card">
          <div className="auth-icon">🔑</div>
          <div className="auth-title">Reset Password</div>

          {status === 'checking' && (
            <div className="auth-sub">Checking your reset link…</div>
          )}

          {status === 'invalid' && (
            <>
              <div className="auth-sub">This reset link isn't valid.</div>
              {msg && <div className={`auth-msg ${msg.type}`} style={{ display: 'block' }}>{msg.text}</div>}
              <a href="/" className="auth-btn" style={{ display: 'block', textAlign: 'center', textDecoration: 'none', marginTop: 14 }}>
                Back to Sign In
              </a>
            </>
          )}

          {status === 'ready' && (
            <form onSubmit={handleSubmit}>
              <div className="auth-sub">Setting a new password for {email}</div>

              <div style={{ marginTop: 14 }}>
                <label className="auth-label">New Password</label>
                <div className="auth-input-wrap">
                  <input
                    className="auth-input"
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    style={{ paddingRight: 44 }}
                    autoComplete="new-password"
                    autoFocus
                  />
                  <button type="button" className="auth-eye" onClick={() => setShowPw((s) => !s)} title="Show/hide password">
                    {showPw ? '🙈' : '👁'}
                  </button>
                </div>
              </div>

              <div style={{ marginTop: 14 }}>
                <label className="auth-label">Confirm New Password</label>
                <input
                  className="auth-input"
                  type={showPw ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
              </div>

              <button type="submit" className="auth-btn" disabled={busy}>
                {busy ? 'Saving…' : 'Save New Password'}
              </button>

              {msg && <div className={`auth-msg ${msg.type}`} style={{ display: 'block' }}>{msg.text}</div>}
            </form>
          )}

          {status === 'done' && (
            <>
              <div className="auth-msg success" style={{ display: 'block' }}>
                Password updated! You can now sign in with your new password.
              </div>
              <a href="/" className="auth-btn" style={{ display: 'block', textAlign: 'center', textDecoration: 'none', marginTop: 14 }}>
                Go to Sign In
              </a>
            </>
          )}
        </div>
      </div>
      <LegalFooter />
    </div>
  );
}
