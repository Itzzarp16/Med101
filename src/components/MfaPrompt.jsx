import { useState } from 'react';
import { mfaErrorText } from '../lib/mfa';
import './MfaPrompt.css';

// Shown on top of any screen when a sign-in (password or Google) stops at
// the second step. Rendered by AuthProvider; it only ever appears for
// accounts that enrolled an authenticator app.
export default function MfaPrompt({ onSubmit, onCancel }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (code.replace(/\s+/g, '').length !== 6) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(code);
    } catch (err) {
      setError(mfaErrorText(err));
      setBusy(false);
    }
  }

  return (
    <div className="mfa-overlay" role="dialog" aria-modal="true" aria-labelledby="mfa-title">
      <form className="mfa-card" onSubmit={handleSubmit}>
        <h2 id="mfa-title" className="mfa-title">Two-step login</h2>
        <p className="mfa-sub">Enter the 6-digit code from your authenticator app.</p>
        <input
          className="mfa-input"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          placeholder="123456"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoFocus
        />
        {error && <div className="mfa-error">{error}</div>}
        <button type="submit" className="mfa-btn" disabled={busy}>{busy ? 'Checking…' : 'Verify'}</button>
        <button type="button" className="mfa-cancel" onClick={onCancel} disabled={busy}>Cancel</button>
      </form>
    </div>
  );
}
