import { useEffect, useState } from 'react';
import { subscribeToPendingPaymentRequests, subscribeToRejectedPaymentRequests, approvePaymentRequest, rejectPaymentRequest, getSubscriptionConfig, saveSubscriptionConfig, getAllActivationCodes, fmtDate, expiryLabel } from '../lib/subscription';
import { playTapSound } from '../lib/sounds';

const DURATION_PRESETS = [
  { label: '1 Month', days: 30 },
  { label: '3 Months', days: 90 },
  { label: '6 Months', days: 180 },
  { label: '1 Year', days: 365 },
];

export default function AdminPaymentsScreen({ onBack, hideBack = false }) {
  const [requests, setRequests] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rejected, setRejected] = useState(null);
  const [rejectedLoading, setRejectedLoading] = useState(true);
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
  const [config, setConfig] = useState({ upiId: '', priceLabel: '', instructions: '', activationMethod: 'auto' });
  const [configLoading, setConfigLoading] = useState(true);
  const [configSaving, setConfigSaving] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showRejected, setShowRejected] = useState(false);

  async function loadCodes() {
    setCodesLoading(true);
    try {
      setCodes(await getAllActivationCodes());
    } finally {
      setCodesLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    const unsubPending = subscribeToPendingPaymentRequests((list) => {
      setRequests(list);
      setLoading(false);
    });
    setRejectedLoading(true);
    const unsubRejected = subscribeToRejectedPaymentRequests((list) => {
      setRejected(list);
      setRejectedLoading(false);
    });
    loadCodes();
    getSubscriptionConfig().then((c) => {
      if (c) setConfig({ upiId: c.upiId || '', priceLabel: c.priceLabel || '', instructions: c.instructions || '', activationMethod: c.activationMethod === 'code' ? 'code' : 'auto' });
      setConfigLoading(false);
    });
    return () => {
      unsubPending();
      unsubRejected();
    };
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
      const { code, autoActivate } = await approvePaymentRequest(req.utr, req.uid, days, config.activationMethod);
      setIssuedCode({ utr: req.utr, code, days, email: req.email, autoActivate });
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
          {issuedCode.autoActivate ? (
            <>
              <div className="auth-label" style={{ margin: 0 }}>✅ Premium activated for {issuedCode.email}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text3)', marginTop: 6 }}>Valid for {issuedCode.days} days, effective now - nothing for them to enter.</div>
            </>
          ) : (
            <>
              <div className="auth-label" style={{ margin: 0 }}>✅ Approved — send this code to {issuedCode.email}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 800, color: 'var(--green)', margin: '10px 0', letterSpacing: 1 }}>
                {issuedCode.code}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text3)' }}>Valid for {issuedCode.days} days once redeemed.</div>
            </>
          )}
          <button className="btn-ghost" style={{ width: '100%', marginTop: 10 }} onClick={() => setIssuedCode(null)}>Dismiss</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          className="btn-ghost"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, width: 'auto',
            padding: '10px 16px', fontSize: 13.5, fontWeight: 700,
          }}
          onClick={() => { playTapSound(); setShowSettings(true); }}
        >
          ⚙️ Payment Settings
        </button>

        <button
          className="btn-ghost"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, width: 'auto',
            padding: '10px 16px', fontSize: 13.5, fontWeight: 700,
            borderColor: 'rgba(255, 58, 92, 0.35)', color: 'var(--red)',
          }}
          onClick={() => { playTapSound(); setShowRejected(true); }}
        >
          ✗ Rejected Requests {rejected ? `(${rejected.length})` : ''}
        </button>
      </div>

      {showSettings && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(6, 8, 24, 0.72)', backdropFilter: 'blur(3px)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            padding: '32px 16px', overflowY: 'auto',
          }}
          onClick={() => setShowSettings(false)}
        >
          <div
            className="glass std-card"
            style={{ maxWidth: 480, width: '100%', margin: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="auth-label" style={{ margin: 0 }}>⚙️ Payment Settings</div>
              <button
                className="btn-ghost"
                style={{ width: 32, height: 32, padding: 0, borderRadius: '50%', fontSize: 16, lineHeight: 1 }}
                onClick={() => { playTapSound(); setShowSettings(false); }}
              >
                ✕
              </button>
            </div>
            {configLoading ? (
              <div className="std-loading">Loading…</div>
            ) : (
              <>
                <label className="auth-label" style={{ marginTop: 10 }}>Price Label</label>
                <input className="auth-input" value={config.priceLabel} onChange={(e) => setConfig((c) => ({ ...c, priceLabel: e.target.value }))} placeholder="e.g. ₹299 / 3 months" />
                <label className="auth-label" style={{ marginTop: 10 }}>UPI ID</label>
                <input className="auth-input" value={config.upiId} onChange={(e) => setConfig((c) => ({ ...c, upiId: e.target.value }))} placeholder="yourname@upi" style={{ fontFamily: 'var(--font-mono)' }} />
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>The QR code and payment link are generated automatically from this UPI ID - no image to upload.</div>
                <label className="auth-label" style={{ marginTop: 10 }}>Instructions (optional)</label>
                <textarea className="auth-input" rows={3} style={{ resize: 'vertical', fontFamily: 'inherit' }} value={config.instructions} onChange={(e) => setConfig((c) => ({ ...c, instructions: e.target.value }))} placeholder="Any extra notes shown to students on the payment page" />

                <label className="auth-label" style={{ marginTop: 10 }}>When You Approve a Payment</label>
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <button
                    className={config.activationMethod === 'auto' ? 'tpreset sel' : 'tpreset'}
                    onClick={() => setConfig((c) => ({ ...c, activationMethod: 'auto' }))}
                    type="button"
                  >
                    ⚡ Activate Instantly
                  </button>
                  <button
                    className={config.activationMethod === 'code' ? 'tpreset sel' : 'tpreset'}
                    onClick={() => setConfig((c) => ({ ...c, activationMethod: 'code' }))}
                    type="button"
                  >
                    🔑 Issue a Code
                  </button>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>
                  {config.activationMethod === 'code'
                    ? 'Approving generates a code shown once to you - the student enters it themselves to activate.'
                    : 'Approving turns on premium for that student right away - nothing for them to enter.'}
                  {' '}You can switch this anytime; it only affects approvals from now on.
                </div>

                <button className="btn-glow std-save-btn" onClick={handleSaveConfig} disabled={configSaving}>
                  {configSaving ? 'Saving…' : 'Save Settings'}
                </button>
                {configSaved && <div className="auth-msg success" style={{ display: 'block' }}>Saved.</div>}
              </>
            )}
          </div>
        </div>
      )}

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

      {showRejected && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(6, 8, 24, 0.72)', backdropFilter: 'blur(3px)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            padding: '32px 16px', overflowY: 'auto',
          }}
          onClick={() => setShowRejected(false)}
        >
          <div
            style={{ maxWidth: 480, width: '100%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="glass std-card" style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="auth-label" style={{ margin: 0, color: 'var(--red)' }}>
                  ✗ Rejected Requests {rejected ? `(${rejected.length})` : ''}
                </div>
                <button
                  className="btn-ghost"
                  style={{ width: 32, height: 32, padding: 0, borderRadius: '50%', fontSize: 16, lineHeight: 1 }}
                  onClick={() => { playTapSound(); setShowRejected(false); }}
                >
                  ✕
                </button>
              </div>
            </div>

            {rejectedLoading ? (
              <div className="std-loading">Loading…</div>
            ) : rejected.length === 0 ? (
              <div className="glass std-card" style={{ textAlign: 'center', color: 'var(--text3)' }}>No rejected payments.</div>
            ) : (
              rejected.map((req) => (
                <div key={req.utr} className="glass std-card" style={{ marginTop: 10, borderColor: 'rgba(255, 58, 92, 0.35)' }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{req.displayName || '(no name)'}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text3)' }}>{req.email}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span>Banking name: <strong>{req.bankingName || '-'}</strong></span>
                    <span>UTR: <strong style={{ fontFamily: 'var(--font-mono)' }}>{req.utr}</strong></span>
                    <span>Phone: <strong>{req.phone || '-'}</strong></span>
                    <span>Rejected on: <strong>{fmtDate(req.reviewedAt)}</strong></span>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 13, color: 'var(--red)' }}>
                    Reason: {req.rejectionReason ? req.rejectionReason : <span style={{ color: 'var(--text3)' }}>(none given)</span>}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <div className="auth-label" style={{ marginTop: 22 }}>
        Issued Codes {codes ? `(${codes.length})` : ''}
      </div>

      {codesLoading ? (
        <div className="std-loading">Loading…</div>
      ) : codes.length === 0 ? (
        <div className="glass std-card" style={{ textAlign: 'center', color: 'var(--text3)' }}>No codes issued yet.</div>
      ) : (
        (() => {
          const notActivated = codes.filter((c) => !c.used);
          const expired = codes.filter((c) => c.used && c.expiresAt && c.expiresAt.getTime() <= Date.now());

          const renderCard = (c) => {
            const expiry = expiryLabel(c);
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
                  <span>Activated: <strong>{c.used ? fmtDate(c.usedAt) : 'Not yet'}</strong></span>
                </div>
                <div style={{ marginTop: 8, fontSize: 13, fontWeight: 700, color: expiry.color }}>{expiry.text}</div>
              </div>
            );
          };

          if (notActivated.length === 0 && expired.length === 0) {
            return <div className="glass std-card" style={{ textAlign: 'center', color: 'var(--text3)' }}>No pending or expired codes. See the Subscribers tab for active ones.</div>;
          }

          return (
            <>
              {notActivated.length > 0 && (
                <>
                  <div className="auth-label">⏳ Not Yet Activated ({notActivated.length})</div>
                  {notActivated.map(renderCard)}
                </>
              )}

              {expired.length > 0 && (
                <>
                  <div className="auth-label" style={{ marginTop: 20 }}>Expired ({expired.length})</div>
                  {expired.map(renderCard)}
                </>
              )}
            </>
          );
        })()
      )}
    </div>
  );
}
