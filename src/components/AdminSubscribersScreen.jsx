import { useEffect, useState } from 'react';
import { subscribeToAllActivationCodes, revokeActivationCode, fmtDate, expiryLabel } from '../lib/subscription';
import { playTapSound } from '../lib/sounds';

// Split out of AdminPaymentsScreen's "Issued Codes" list into its own
// tab, showing only students whose subscription is currently active
// (redeemed and not yet expired) - a quick roster of who's actually
// subscribed right now, separate from the payment-review workflow.
export default function AdminSubscribersScreen() {
  const [codes, setCodes] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirmingCode, setConfirmingCode] = useState(null); // code armed for revoke, two-tap confirm
  const [revokingCode, setRevokingCode] = useState(null);
  const [revokeError, setRevokeError] = useState(null);

  useEffect(() => {
    const unsub = subscribeToAllActivationCodes((list) => {
      setCodes(list);
      setLoading(false);
    });
    return unsub;
  }, []);

  async function handleRevoke(code) {
    playTapSound();
    setRevokeError(null);
    if (confirmingCode !== code) {
      setConfirmingCode(code);
      return;
    }
    setRevokingCode(code);
    try {
      await revokeActivationCode(code);
      setConfirmingCode(null);
      // no manual reload needed - the live subscription above picks up
      // the deletion automatically
    } catch (e) {
      setRevokeError(e.message || String(e));
    } finally {
      setRevokingCode(null);
    }
  }

  const active = codes ? codes.filter((c) => c.used && c.expiresAt && c.expiresAt.getTime() > Date.now()) : [];

  return (
    <div className="std-screen">
      <div className="std-header">
        <h1 className="std-title">✅ Subscribers</h1>
      </div>
      <p style={{ color: 'var(--text3)', fontSize: 13.5, marginTop: -8, marginBottom: 18 }}>
        Students with an active Premium subscription right now.
      </p>

      {revokeError && <div className="auth-msg error" style={{ display: 'block', marginBottom: 10 }}>{revokeError}</div>}

      {loading ? (
        <div className="std-loading">Loading…</div>
      ) : active.length === 0 ? (
        <div className="glass std-card" style={{ textAlign: 'center', color: 'var(--text3)' }}>No active subscriptions right now.</div>
      ) : (
        active.map((c) => {
          const expiry = expiryLabel(c);
          const confirming = confirmingCode === c.code;
          return (
            <div key={c.code} className="glass std-card" style={{ marginTop: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{c.studentName}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text3)' }}>{c.studentEmail}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {c.bankingName && <span>Paid as: <strong>{c.bankingName}</strong></span>}
                {c.phone && <span>Phone: <strong>{c.phone}</strong></span>}
                {c.utr && <span>UTR: <strong style={{ fontFamily: 'var(--font-mono)' }}>{c.utr}</strong></span>}
                <span>Code: <strong style={{ fontFamily: 'var(--font-mono)' }}>{c.code}</strong></span>
                <span>Duration: <strong>{c.durationDays} days</strong></span>
                <span>Issued: <strong>{fmtDate(c.createdAt)}</strong></span>
                <span>Activated: <strong>{fmtDate(c.usedAt)}</strong></span>
              </div>
              <div style={{ marginTop: 8, fontSize: 13, fontWeight: 700, color: expiry.color }}>{expiry.text}</div>

              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button
                  className="btn-ghost"
                  style={{ flex: 1, color: 'var(--red)', borderColor: confirming ? 'var(--red)' : undefined, fontSize: 13 }}
                  onClick={() => handleRevoke(c.code)}
                  disabled={revokingCode === c.code}
                >
                  {revokingCode === c.code ? '…' : confirming ? '⚠️ Tap again to end their access now' : '🗑️ Revoke Subscription'}
                </button>
                {confirming && (
                  <button className="btn-ghost" style={{ fontSize: 13 }} onClick={() => { playTapSound(); setConfirmingCode(null); }}>
                    Cancel
                  </button>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
