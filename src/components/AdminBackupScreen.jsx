import { useEffect, useState } from 'react';
import { auth } from '../lib/firebase';

async function callApi(body) {
  const idToken = await auth.currentUser.getIdToken();
  const res = await fetch('/api/admin/send-broadcast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const fmt = (iso) => (iso ? new Date(iso).toLocaleString('en-GB') : 'never');

// Admin portal tab: shows whether the daily payment + subscriber backup is
// working and lets an admin send one right now.
export default function AdminBackupScreen() {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function load() {
    try {
      setStatus(await callApi({ action: 'backup-status' }));
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
  }

  useEffect(() => { load(); }, []);

  async function handleNow() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await callApi({ action: 'backup-now' });
      setMsg({
        type: 'success',
        text: `Backup emailed to ${r.to.join(', ')}: ${r.counts.paymentRequests} payments, ${r.counts.activationCodes} premium codes.`,
      });
      await load();
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
      await load();
    } finally { setBusy(false); }
  }

  const c = status?.counts;

  return (
    <div className="std-screen">
      <div className="std-header">
        <h1 className="std-title">💾 Backups</h1>
        <p className="std-sub">
          Every day at 09:30 (Kyrgyzstan time) a copy of all payments and premium codes is emailed to
          {' '}{(status?.to || []).join(', ') || 'the admin inbox'}. Keep those emails: they are your restore point.
        </p>
      </div>

      <div className="glass std-card">
        <div style={{ fontWeight: 700 }}>
          {!status ? 'Loading…'
            : status.lastRunAt == null ? '⚠️ No backup has run yet'
            : status.lastOk ? '✅ Last backup succeeded' : '❌ Last backup failed'}
        </div>
        {status?.lastRunAt && (
          <div style={{ fontSize: 13, opacity: 0.8 }}>
            {fmt(status.lastRunAt)} · {status.trigger === 'manual' ? 'run by an admin' : 'daily job'}
            {c && <> · {c.paymentRequests} payments, {c.activationCodes} premium codes</>}
          </div>
        )}
        {status?.error && <div className="auth-msg error" style={{ display: 'block' }}>{status.error}</div>}
        <button className="btn-glow std-save-btn" disabled={busy} onClick={handleNow}>
          {busy ? 'Sending…' : 'Back up now'}
        </button>
      </div>

      {msg && <div className={`auth-msg ${msg.type}`} style={{ display: 'block', marginTop: 12 }}>{msg.text}</div>}
    </div>
  );
}
