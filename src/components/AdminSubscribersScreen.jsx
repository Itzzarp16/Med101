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
  const [revokingCode, setRevokingCode] = useState(null); // code with the reason box open
  const [revokeReason, setRevokeReason] = useState('');
  const [busyCode, setBusyCode] = useState(null);
  const [revokeError, setRevokeError] = useState(null);

  useEffect(() => {
    const unsub = subscribeToAllActivationCodes((list) => {
      setCodes(list);
      setLoading(false);
    });
    return unsub;
  }, []);

  async function handleConfirmRevoke(code) {
    playTapSound();
    setRevokeError(null);
    setBusyCode(code);
    try {
      await revokeActivationCode(code, revokeReason);
      setRevokingCode(null);
      setRevokeReason('');
      // no manual reload needed - the live subscription above picks up
      // the deletion automatically
    } catch (e) {
      setRevokeError(e.message || String(e));
    } finally {
      setBusyCode(null);
    }
  }

  const active = codes ? codes.filter((c) => c.used && c.expiresAt && c.expiresAt.getTime() > Date.now()) : [];

  return (
    <div className="std-screen">
      <div className="std-header">
        <h1 className="std-title">✅ Subscribers</h1>
      </div>
      <p style={{ color: 'var(--text3)', fontSize: 13.5, marginTop: -8, marginBottom: 18 }}>
        Students with an active Med101 Maxx subscription right now.
      </p>

      {revokeError && <div className="auth-msg error" style={{ display: 'block', marginBottom: 10 }}>{revokeError}</div>}

      {loading ? (
        <div className="std-loading">Loading…</div>
      ) : active.length === 0 ? (
        <div className="glass std-card" style={{ textAlign: 'center', color: 'var(--text3)' }}>No active subscriptions right now.</div>
      ) : (
        active.map((c) => {
          const expiry = expiryLabel(c);
          const revoking = revokingCode === c.code;
          return (
            <div key={c.code} className="glass std-card sub-card">
              <div className="sub-top">
                <div className="sub-avatar" aria-hidden="true">{(c.studentName || '?').trim().charAt(0).toUpperCase()}</div>
                <div className="sub-id">
                  <div className="sub-name">{c.studentName}</div>
                  <div className="sub-email">{c.studentEmail}</div>
                </div>
                <div
                  className="sub-pill"
                  style={{ color: expiry.color, background: `color-mix(in srgb, ${expiry.color} 14%, transparent)` }}
                >
                  {expiry.text}
                </div>
              </div>
              <dl className="sub-grid">
                {c.bankingName && <div><dt>Paid as</dt><dd>{c.bankingName}</dd></div>}
                {c.phone && <div><dt>Phone</dt><dd>{c.phone}</dd></div>}
                {c.utr && <div><dt>UTR</dt><dd className="mono">{c.utr}</dd></div>}
                <div><dt>Code</dt><dd className="mono">{c.code}</dd></div>
                <div><dt>Duration</dt><dd>{c.durationDays} days</dd></div>
                <div><dt>Issued</dt><dd>{fmtDate(c.createdAt)}</dd></div>
                <div><dt>Activated</dt><dd>{fmtDate(c.usedAt)}</dd></div>
              </dl>

              {revoking ? (
                <div style={{ marginTop: 10 }}>
                  <input
                    className="auth-input"
                    value={revokeReason}
                    onChange={(e) => setRevokeReason(e.target.value)}
                    placeholder="Reason (optional, shown to student)"
                  />
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button
                      className="btn-ghost"
                      style={{ flex: 1, color: 'var(--red)' }}
                      onClick={() => handleConfirmRevoke(c.code)}
                      disabled={busyCode === c.code}
                    >
                      {busyCode === c.code ? '…' : '⚠️ Confirm - end their access now'}
                    </button>
                    <button
                      className="btn-ghost"
                      style={{ flex: 1 }}
                      onClick={() => { playTapSound(); setRevokingCode(null); setRevokeReason(''); }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="btn-ghost sub-revoke"
                  style={{ color: 'var(--red)', fontSize: 13 }}
                  onClick={() => { playTapSound(); setRevokeError(null); setRevokingCode(c.code); }}
                >
                  🗑️ Revoke Subscription
                </button>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
