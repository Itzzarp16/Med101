import { useEffect, useState } from 'react';
import { getPendingPaymentRequests, approvePaymentRequest, rejectPaymentRequest, getSubscriptionConfig, saveSubscriptionConfig, getAllActivationCodes } from '../lib/subscription';
import { playTapSound } from '../lib/sounds';

const DURATION_PRESETS = [
  { label: '1 Month', days: 30 },
  { label: '3 Months', days: 90 },
  { label: '6 Months', days: 180 },
  { label: '1 Year', days: 365 },
];

function fmtDate(ts) {
  if (!ts) return '-';
  const ms = ts.toMillis ? ts.toMillis() : ts.seconds * 1000;
  return new Date(ms).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function expiryLabel(codeRow) {
  if (!codeRow.used) return { text: 'Not activated yet', color: 'var(--text3)' };
  if (!codeRow.expiresAt) return { text: '-', color: 'var(--text3)' };
  const daysLeft = Math.ceil((codeRow.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (daysLeft < 0) return { text: `Expired ${fmtDate({ seconds: codeRow.expiresAt.getTime() / 1000 })}`, color: 'var(--red)' };
  if (daysLeft === 0) return { text: 'Expires today', color: 'var(--amber)' };
  return { text: `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`, color: daysLeft <= 7 ? 'var(--amber)' : 'var(--green)' };
}

export default function AdminPaymentsScreen({ onBack, hideBack = false }) {
  const [requests, setRequests] = useState(null);
  const [loading, setLoading] = useState(true);
  const [codes, setCodes] = useState(null);
  const [codesLoading, setCodesLoading] = useState(true);
  const [busyUtr, setBusyUtr] = useState(null);
  const [durationByUtr, setDurationByUtr] = useState({});
  const [customDaysByUtr, setCustomDaysByUtr] = useState({});
  const [issuedCode, setIssuedCode] = useState(null); // { utr, code, days } - shown once, right after approving
  const [rejectingUtr, setRejectingUtr] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  // Subscription config (UPI ID / price / instructions) - editable
  // right here since it's the same admin who deals with both.
  const [config, setConfig] = useState({ upiId: '', priceLabel: '', qrImageUrl: '', instructions: '' });
  const [configLoading, setConfigLoading] = useState(true);
  const [configSaving, setConfigSaving] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);

  async function loadRequests() {
    setLoading(true);
    try {
      const list = await getPendingPaymentRequests();
      list.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setRequests(list);
    } finally {
      setLoading(false);
    }
  }

  async function loadCodes() {
    setCodesLoading(true);
    try {
      setCodes(await getAllActivationCodes());
    } finally {
      setCodesLoading(false);
    }
  }

  useEffect(() => {
    loadRequests();
    loadCodes();
    getSubscriptionConfig().then((c) => {
      if (c) setConfig({ upiId: c.upiId || '', priceLabel: c.priceLabel || '', qrImageUrl: c.qrImageUrl || '', instructions: c.instructions || '' });
      setConfigLoading(false);
    });
  }, []);

  async function handleSaveConfig() {
    playTapSound();
    setConfigSaving(true);
    setConfigSaved(false);
    try {
      await saveSubscriptionConfig(config);
      setConfigSaved(true);
    } catch (e) {
      alert('Failed to save: ' + (e.message || e));
    } finally {
      setConfigSaving(false);
    }
  }

  async function handleApprove(req) {
    playTapSound();
    const preset = durationByUtr[req.utr];
    const days = preset === 'custom' ? parseInt(customDaysByUtr[req.utr], 10) : preset;
    if (!days || days <= 0) {
      alert('Choose a duration first.');
      return;
    }
    setBusyUtr(req.utr);
    try {
      const code = await approvePaymentRequest(req.utr, req.uid, days);
      setIssuedCode({ utr: req.utr, code, days, email: req.email });
      await loadRequests();
      await loadCodes();
    } catch (e) {
      alert('Failed to approve: ' + (e.message || e));
    } finally {
      setBusyUtr(null);
    }
  }

  async function handleReject(utr) {
    playTapSound();
    setBusyUtr(utr);
    try {
      await rejectPaymentRequest(utr, rejectReason);
      setRejectingUtr(null);
      setRejectReason('');
      await loadRequests();
    } catch (e) {
      alert('Failed to reject: ' + (e.message || e));
    } finally {
      setBusyUtr(null);
    }
  }

  return (
    <div className="std-screen">
      {!hideBack && (
        <button className="btn-ghost std-back" onClick={() => { playTapSound(); onBack(); }}>← Back</button>
      )}

      <div className="std-header">
        <h1 className="std-title">💳 Payments</h1>
        <p className="std-sub">Review manual UPI payment submissions and issue activation codes.</p>
      </div>

      {issuedCode && (
        <div className="glass std-card" style={{ borderColor: 'var(--green)' }}>
          <div className="auth-label" style={{ margin: 0 }}>✅ Approved — send this code to {issuedCode.email}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 800, color: 'var(--green)', margin: '10px 0', letterSpacing: 1 }}>
            {issuedCode.code}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text3)' }}>Valid for {issuedCode.days} days once redeemed.</div>
          <button className="btn-ghost" style={{ width: '100%', marginTop: 10 }} onClick={() => setIssuedCode(null)}>Dismiss</button>
        </div>
      )}

      <div className="glass std-card">
        <div className="auth-label" style={{ margin: 0 }}>Subscription Settings</div>
        {configLoading ? (
          <div className="std-loading">Loading…</div>
        ) : (
          <>
            <label className="auth-label" style={{ marginTop: 10 }}>Price Label</label>
            <input className="auth-input" value={config.priceLabel} onChange={(e) => setConfig((c) => ({ ...c, priceLabel: e.target.value }))} placeholder="e.g. ₹299 / 3 months" />
            <label className="auth-label" style={{ marginTop: 10 }}>UPI ID</label>
            <input className="auth-input" value={config.upiId} onChange={(e) => setConfig((c) => ({ ...c, upiId: e.target.value }))} placeholder="yourname@upi" style={{ fontFamily: 'var(--font-mono)' }} />
            <label className="auth-label" style={{ marginTop: 10 }}>QR Image URL (optional)</label>
            <input className="auth-input" value={config.qrImageUrl} onChange={(e) => setConfig((c) => ({ ...c, qrImageUrl: e.target.value }))} placeholder="https://..." />
            <label className="auth-label" style={{ marginTop: 10 }}>Instructions (optional)</label>
            <textarea className="auth-input" rows={3} style={{ resize: 'vertical', fontFamily: 'inherit' }} value={config.instructions} onChange={(e) => setConfig((c) => ({ ...c, instructions: e.target.value }))} placeholder="Any extra notes shown to students on the payment page" />
            <button className="btn-glow std-save-btn" onClick={handleSaveConfig} disabled={configSaving}>
              {configSaving ? 'Saving…' : 'Save Settings'}
            </button>
            {configSaved && <div className="auth-msg success" style={{ display: 'block' }}>Saved.</div>}
          </>
        )}
      </div>

      <div className="auth-label" style={{ marginTop: 18 }}>
        Pending Requests {requests ? `(${requests.length})` : ''}
      </div>

      {loading ? (
        <div className="std-loading">Loading…</div>
      ) : requests.length === 0 ? (
        <div className="glass std-card" style={{ textAlign: 'center', color: 'var(--text3)' }}>No pending payments.</div>
      ) : (
        requests.map((req) => (
          <div key={req.utr} className="glass std-card" style={{ marginTop: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{req.displayName || '(no name)'}</div>
            <div style={{ fontSize: 12.5, color: 'var(--text3)' }}>{req.email}</div>
            <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span>Banking name: <strong>{req.bankingName || '-'}</strong></span>
              <span>Amount: <strong>{req.amount || '-'}</strong></span>
              <span>UTR: <strong style={{ fontFamily: 'var(--font-mono)' }}>{req.utr}</strong></span>
              <span>Phone: <strong>{req.phone || '-'}</strong></span>
            </div>

            {rejectingUtr === req.utr ? (
              <div style={{ marginTop: 10 }}>
                <input
                  className="auth-input"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Reason (optional, shown to student)"
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button className="btn-ghost" style={{ flex: 1, color: 'var(--red)' }} onClick={() => handleReject(req.utr)} disabled={busyUtr === req.utr}>
                    {busyUtr === req.utr ? '…' : 'Confirm Reject'}
                  </button>
                  <button className="btn-ghost" style={{ flex: 1 }} onClick={() => { setRejectingUtr(null); setRejectReason(''); }}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                  {DURATION_PRESETS.map((p) => (
                    <button
                      key={p.days}
                      className={durationByUtr[req.utr] === p.days ? 'tpreset sel' : 'tpreset'}
                      onClick={() => setDurationByUtr((d) => ({ ...d, [req.utr]: p.days }))}
                    >
                      {p.label}
                    </button>
                  ))}
                  <button
                    className={durationByUtr[req.utr] === 'custom' ? 'tpreset sel' : 'tpreset'}
                    onClick={() => setDurationByUtr((d) => ({ ...d, [req.utr]: 'custom' }))}
                  >
                    Custom
                  </button>
                </div>
                {durationByUtr[req.utr] === 'custom' && (
                  <input
                    className="auth-input"
                    style={{ marginTop: 8 }}
                    type="number"
                    min="1"
                    value={customDaysByUtr[req.utr] || ''}
                    onChange={(e) => setCustomDaysByUtr((d) => ({ ...d, [req.utr]: e.target.value }))}
                    placeholder="Number of days"
                  />
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button className="btn-glow" style={{ flex: 1 }} onClick={() => handleApprove(req)} disabled={busyUtr === req.utr}>
                    {busyUtr === req.utr ? '…' : '✅ Approve'}
                  </button>
                  <button className="btn-ghost" style={{ flex: 1, color: 'var(--red)' }} onClick={() => setRejectingUtr(req.utr)} disabled={busyUtr === req.utr}>
                    ✗ Reject
                  </button>
                </div>
              </>
            )}
          </div>
        ))
      )}

      <div className="auth-label" style={{ marginTop: 22 }}>
        Issued Codes {codes ? `(${codes.length})` : ''}
      </div>

      {codesLoading ? (
        <div className="std-loading">Loading…</div>
      ) : codes.length === 0 ? (
        <div className="glass std-card" style={{ textAlign: 'center', color: 'var(--text3)' }}>No codes issued yet.</div>
      ) : (
        codes.map((c) => {
          const expiry = expiryLabel(c);
          return (
            <div key={c.code} className="glass std-card" style={{ marginTop: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{c.studentName}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text3)' }}>{c.studentEmail}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span>Code: <strong style={{ fontFamily: 'var(--font-mono)' }}>{c.code}</strong></span>
                <span>Duration: <strong>{c.durationDays} days</strong></span>
                <span>Issued: <strong>{fmtDate(c.createdAt)}</strong></span>
                <span>Activated: <strong>{c.used ? fmtDate(c.usedAt) : 'Not yet'}</strong></span>
              </div>
              <div style={{ marginTop: 8, fontSize: 13, fontWeight: 700, color: expiry.color }}>{expiry.text}</div>
            </div>
          );
        })
      )}
    </div>
  );
}
