import { useState } from 'react';
import { auth } from '../lib/firebase';
import { playTapSound } from '../lib/sounds';

async function callBroadcast(body) {
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

export default function AdminBroadcastScreen({ onBack, hideBack = false }) {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { type: 'success' | 'error', text }

  async function handleSend() {
    playTapSound();
    setBusy(true);
    setResult(null);
    try {
      const { devices } = await callBroadcast({ dryRun: true });
      if (!devices) {
        setResult({ type: 'error', text: 'No students have notifications turned on yet.' });
        return;
      }
      if (!window.confirm(`Send this to ${devices} device${devices === 1 ? '' : 's'}? This cannot be undone.`)) return;
      const r = await callBroadcast({ title, body: message, url: '/' });
      setResult({ type: 'success', text: `Sent to ${r.sent} of ${r.devices} devices.` });
      setTitle('');
      setMessage('');
    } catch (e) {
      setResult({ type: 'error', text: e.message || String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="std-screen">
      {!hideBack && (
        <button className="btn-ghost std-back" onClick={() => { playTapSound(); onBack(); }}>← Back</button>
      )}
      <div className="std-header">
        <h1 className="std-title">🔔 Send Notification</h1>
        <p className="std-sub">
          Pushes a notification to every student who has turned notifications on.
          Students who haven't enabled them won't receive it.
        </p>
      </div>
      <div className="glass std-card">
        <label className="auth-label">Title</label>
        <input className="auth-input" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. New Histology questions added" />
        <label className="auth-label">Message</label>
        <textarea className="auth-input" rows={4} maxLength={200} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Keep it short - it appears on the lock screen" style={{ resize: 'vertical', fontFamily: 'inherit' }} />
        <button className="btn-glow std-save-btn" onClick={handleSend} disabled={busy || !title.trim() || !message.trim()}>
          {busy ? 'Working…' : 'Send to all students'}
        </button>
        {result && <div className={`auth-msg ${result.type}`} style={{ display: 'block' }}>{result.text}</div>}
      </div>
    </div>
  );
}
