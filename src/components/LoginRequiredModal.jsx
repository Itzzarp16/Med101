import { useEffect } from 'react';

// Shown to visitors who aren't signed in the moment they try to use something:
// explains an account is needed first, instead of jumping straight to the login form.
export default function LoginRequiredModal({ label, onContinue, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="login-gate-overlay" onClick={onClose} role="presentation">
      <div
        className="login-gate-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-gate-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="login-gate-emoji" aria-hidden="true">🔒</div>
        <h2 id="login-gate-title" className="login-gate-title">Account needed</h2>
        <p className="login-gate-text">
          {label ? <>To open <strong>{label}</strong> you need a Med101 account.</> : <>To use this you need a Med101 account.</>}
          {' '}It's quick to create, and you can sign in if you already have one.
        </p>
        <button type="button" className="btn-glow login-gate-primary" onClick={onContinue}>
          Sign in / Create account
        </button>
        <button type="button" className="btn-ghost login-gate-secondary" onClick={onClose}>
          Not now
        </button>
      </div>
    </div>
  );
}
