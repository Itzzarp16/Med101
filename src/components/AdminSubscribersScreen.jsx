import { useEffect, useState } from 'react';
import { getAllActivationCodes, fmtDate, expiryLabel } from '../lib/subscription';

// Split out of AdminPaymentsScreen's "Issued Codes" list into its own
// tab, showing only students whose subscription is currently active
// (redeemed and not yet expired) - a quick roster of who's actually
// subscribed right now, separate from the payment-review workflow.
export default function AdminSubscribersScreen() {
  const [codes, setCodes] = useState(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      setCodes(await getAllActivationCodes());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const active = codes ? codes.filter((c) => c.used && c.expiresAt && c.expiresAt.getTime() > Date.now()) : [];

  return (
    <div className="std-screen">
      <div className="std-header">
        <h1 className="std-title">✅ Subscribers</h1>
      </div>
      <p style={{ color: 'var(--text3)', fontSize: 13.5, marginTop: -8, marginBottom: 18 }}>
        Students with an active Premium subscription right now.
      </p>

      {loading ? (
        <div className="std-loading">Loading…</div>
      ) : active.length === 0 ? (
        <div className="glass std-card" style={{ textAlign: 'center', color: 'var(--text3)' }}>No active subscriptions right now.</div>
      ) : (
        active.map((c) => {
          const expiry = expiryLabel(c);
          return (
            <div key={c.code} className="glass std-card" style={{ marginTop: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{c.studentName}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text3)' }}>{c.studentEmail}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span>Code: <strong style={{ fontFamily: 'var(--font-mono)' }}>{c.code}</strong></span>
                <span>Duration: <strong>{c.durationDays} days</strong></span>
                <span>Issued: <strong>{fmtDate(c.createdAt)}</strong></span>
                <span>Activated: <strong>{fmtDate(c.usedAt)}</strong></span>
              </div>
              <div style={{ marginTop: 8, fontSize: 13, fontWeight: 700, color: expiry.color }}>{expiry.text}</div>
            </div>
          );
        })
      )}
    </div>
  );
}
