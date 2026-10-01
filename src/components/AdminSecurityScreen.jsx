import { useState } from 'react';
import { sendEmailVerification } from 'firebase/auth';
import { useAuth } from '../lib/AuthContext';
import {
  beginTotpEnrollment,
  enrolledTotpFactors,
  finishTotpEnrollment,
  mfaErrorText,
  removeTotp,
} from '../lib/mfa';

// Admin portal tab: turn on / manage the authenticator-app second step for
// the signed-in admin. Each admin account enrolls separately.
export default function AdminSecurityScreen() {
  const { user, refreshUser } = useAuth();
  const [setup, setSetup] = useState(null); // { secret, uri, key, qr }
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  if (!user) return null;
  const factors = enrolledTotpFactors(user);
  const enabled = factors.length > 0;

  async function handleVerifyEmail() {
    setBusy(true);
    setMsg(null);
    try {
      await sendEmailVerification(user);
      setMsg({ type: 'success', text: `Verification email sent to ${user.email}. Open the link, then reload this page.` });
    } catch (e) {
      setMsg({ type: 'error', text: mfaErrorText(e) });
    } finally { setBusy(false); }
  }

  async function handleStart() {
    setBusy(true);
    setMsg(null);
    try {
      const { secret, uri, key } = await beginTotpEnrollment(user);
      const { default: QRCode } = await import('qrcode');
      const qr = await QRCode.toDataURL(uri, { width: 220, margin: 1 });
      setSetup({ secret, uri, key, qr });
      setCode('');
    } catch (e) {
      setMsg({ type: 'error', text: mfaErrorText(e) });
    } finally { setBusy(false); }
  }

  async function handleFinish() {
    if (code.replace(/\s+/g, '').length !== 6) {
      setMsg({ type: 'error', text: 'Enter the 6-digit code from your authenticator app.' });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await finishTotpEnrollment(user, setup.secret, code);
      setSetup(null);
      setCode('');
      await refreshUser();
      setMsg({ type: 'success', text: 'Two-step login is on for this account. Now sign out and sign back in: you will be asked for a code, and admin tools unlock after that.' });
    } catch (e) {
      setMsg({ type: 'error', text: mfaErrorText(e) });
    } finally { setBusy(false); }
  }

  async function handleRemove(factor) {
    if (!window.confirm('Turn off two-step login for this account?')) return;
    setBusy(true);
    setMsg(null);
    try {
      await removeTotp(user, factor.uid);
      await refreshUser();
      setMsg({ type: 'success', text: 'Two-step login turned off for this account.' });
    } catch (e) {
      setMsg({ type: 'error', text: mfaErrorText(e) });
    } finally { setBusy(false); }
  }

  return (
    <div className="std-screen">
      <div className="std-header">
        <h1 className="std-title">🔐 Two-step login</h1>
        <p className="std-sub">
          Adds a 6-digit code from an authenticator app (Google Authenticator, Authy, …) after your
          password. Each admin account turns it on separately.
        </p>
      </div>

      <div className="glass std-card">
        <div style={{ fontWeight: 700 }}>{user.email}</div>
        <div style={{ fontSize: 13, opacity: 0.75 }}>
          Status: {enabled ? '✅ Two-step login is ON' : '⚠️ Two-step login is OFF'}
          {' · '}Email {user.emailVerified ? 'verified' : 'not verified'}
        </div>

        {!user.emailVerified && (
          <button className="btn-ghost" disabled={busy} onClick={handleVerifyEmail}>
            Send verification email
          </button>
        )}

        {enabled && factors.map((f) => (
          <div key={f.uid} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13.5 }}>
              📱 {f.displayName || 'Authenticator app'} · added {new Date(f.enrollmentTime).toLocaleDateString('en-GB')}
            </span>
            <button className="btn-ghost" disabled={busy} onClick={() => handleRemove(f)}>Turn off</button>
          </div>
        ))}

        {!enabled && !setup && (
          <button className="btn-glow std-save-btn" disabled={busy || !user.emailVerified} onClick={handleStart}>
            {busy ? 'Please wait…' : 'Set up authenticator app'}
          </button>
        )}
      </div>

      {setup && (
        <div className="glass std-card" style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 700 }}>1. Add this account to your authenticator app</div>
          <img src={setup.qr} alt="QR code for your authenticator app" width={220} height={220}
               style={{ background: '#fff', borderRadius: 10, alignSelf: 'flex-start' }} />
          <div style={{ fontSize: 13, opacity: 0.8 }}>
            On a phone? <a href={setup.uri}>Open in your authenticator app</a>, or type this key in by hand:
          </div>
          <code style={{ wordBreak: 'break-all', fontSize: 13 }}>{setup.key}</code>
          <div style={{ fontSize: 12.5, opacity: 0.7 }}>
            Tip: scan it on two phones now so you have a backup. You can't see this key again after this step.
          </div>

          <div style={{ fontWeight: 700, marginTop: 6 }}>2. Enter the 6-digit code it shows</div>
          <input
            className="auth-input"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn-glow std-save-btn" disabled={busy} onClick={handleFinish}>
              {busy ? 'Checking…' : 'Verify & turn on'}
            </button>
            <button className="btn-ghost" disabled={busy} onClick={() => { setSetup(null); setCode(''); }}>Cancel</button>
          </div>
        </div>
      )}

      {msg && <div className={`auth-msg ${msg.type}`} style={{ display: 'block', marginTop: 12 }}>{msg.text}</div>}
    </div>
  );
}
