import { useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import {
  getSubscriptionConfig, submitPaymentRequest, getMyPaymentRequests,
  redeemActivationCode, getMyPremiumStatus,
} from '../lib/subscription';
import { playTapSound } from '../lib/sounds';
import { buildUpiUri } from '../lib/upi';
import LiveQrCode from './LiveQrCode';
import './PremiumScreen.css';

const STATUS_LABEL = {
  pending: { text: 'Pending review', color: 'var(--amber)' },
  approved: { text: 'Approved', color: 'var(--green)' },
  rejected: { text: 'Rejected', color: 'var(--red)' },
};

// Admin's Price Label field is free text (e.g. "₹299 / 3 months"),
// but if they just typed a bare number like "11", show it as ₹11
// rather than a naked "11" - only kicks in when the whole label is
// just digits/decimal, so a fuller label they've already formatted
// themselves is left untouched.
function formatPrice(label) {
  if (!label) return label;
  const trimmed = label.trim();
  return /^\d+(\.\d+)?$/.test(trimmed) ? `₹${trimmed}` : label;
}

// Only prefills the UPI app's amount field when the label is a clean
// number (or ₹-prefixed number) like "11" or "₹11" - a fuller label
// like "₹299 / 3 months" doesn't reliably map to one amount, so it's
// left for the student to enter themselves in that case.
function extractAmount(label) {
  if (!label) return null;
  const m = label.trim().match(/^₹?(\d+(\.\d+)?)$/);
  return m ? m[1] : null;
}

export default function PremiumScreen({ onBack, onRedeemed }) {
  const { user } = useAuth();
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [premium, setPremium] = useState({ isPremium: false, premiumUntil: null });
  const [myRequests, setMyRequests] = useState([]);

  const [bankingName, setBankingName] = useState('');
  const [amount, setAmount] = useState('');
  const [phone, setPhone] = useState('');
  const [utr, setUtr] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState(null);

  const [code, setCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemMsg, setRedeemMsg] = useState(null);
  const [copied, setCopied] = useState(false);

  function handleCopyUpi() {
    if (!config?.upiId) return;
    playTapSound();
    navigator.clipboard?.writeText(config.upiId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  async function loadAll() {
    const [cfg, status, reqs] = await Promise.all([
      getSubscriptionConfig(),
      getMyPremiumStatus(user.uid),
      getMyPaymentRequests(user.uid),
    ]);
    setConfig(cfg);
    setPremium(status);
    reqs.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    setMyRequests(reqs);
    setLoading(false);
  }

  useEffect(() => { loadAll(); }, [user.uid]);

  async function handleSubmit(e) {
    e.preventDefault();
    playTapSound();
    setSubmitMsg(null);
    if (!utr.trim()) {
      setSubmitMsg({ text: 'Enter the transaction ID (UTR) from your payment.', type: 'error' });
      return;
    }
    setSubmitting(true);
    try {
      await submitPaymentRequest({
        uid: user.uid, email: user.email, displayName: user.displayName,
        bankingName, amount, phone, utr,
      });
      setSubmitMsg({ text: 'Submitted! We\'ll review it and send you an activation code shortly.', type: 'success' });
      setBankingName(''); setAmount(''); setPhone(''); setUtr('');
      loadAll();
    } catch (e) {
      setSubmitMsg({ text: e.message || String(e), type: 'error' });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRedeem(e) {
    e.preventDefault();
    playTapSound();
    setRedeemMsg(null);
    if (!code.trim()) return;
    setRedeeming(true);
    try {
      await redeemActivationCode(user.uid, code);
      setRedeemMsg({ text: 'Premium activated! Enjoy full access.', type: 'success' });
      setCode('');
      loadAll();
      onRedeemed?.();
    } catch (e) {
      setRedeemMsg({ text: e.message || String(e), type: 'error' });
    } finally {
      setRedeeming(false);
    }
  }

  return (
    <div className="std-screen">
      <button className="btn-ghost std-back" onClick={() => { playTapSound(); onBack(); }}>← Back</button>

      <div className="std-header">
        <h1 className="std-title">⭐ Premium</h1>
        <p className="std-sub">Unlock every question, in every subject.</p>
      </div>

      {loading ? (
        <div className="std-loading">Loading…</div>
      ) : (
        <>
          <div className="glass std-card" style={{ borderColor: premium.isPremium ? 'var(--green)' : undefined }}>
            {premium.isPremium ? (
              <>
                <div className="auth-label" style={{ margin: 0, color: 'var(--green)' }}>✅ Premium Active</div>
                <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>
                  Valid until <strong>{premium.premiumUntil.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</strong>
                </div>
              </>
            ) : (
              <>
                <div className="auth-label" style={{ margin: 0 }}>Free Preview</div>
                <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>
                  You can try the first 25 questions of any subject. Get Premium for full access to everything.
                </div>
              </>
            )}
          </div>

          {config && (
            <div className="pay-card">
              <div className="pay-card-inner">
                <div className="pay-card-eyebrow">Scan to Pay</div>
                {config.priceLabel && <div className="pay-card-price">{formatPrice(config.priceLabel)}</div>}

                {config.upiId && (
                  <div className="pay-qr-frame">
                    <LiveQrCode upiId={config.upiId} amount={extractAmount(config.priceLabel)} />
                  </div>
                )}

                {config.upiId && (
                  <div className="pay-upi-row">
                    <span className="pay-upi-id">{config.upiId}</span>
                    <button type="button" className="pay-upi-copy" onClick={handleCopyUpi}>
                      {copied ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>
                )}

                {config.upiId && (
                  <a
                    className="pay-tap-btn"
                    href={buildUpiUri({ upiId: config.upiId, amount: extractAmount(config.priceLabel) })}
                    onClick={() => playTapSound()}
                  >
                    📲 Tap to Pay in UPI App
                  </a>
                )}

                <ol className="pay-steps">
                  <li>Scan the QR, or tap "Pay in UPI App" on mobile</li>
                  <li>Submit the transaction ID (UTR) below</li>
                  <li>We'll verify and send you an activation code</li>
                  <li>Enter the code to unlock full access</li>
                </ol>

                {config.instructions && (
                  <div className="pay-instructions">{config.instructions}</div>
                )}
              </div>
            </div>
          )}

          <form className="glass std-card" onSubmit={handleSubmit}>
            <div className="auth-label" style={{ margin: 0 }}>Submit Your Payment</div>
            <label className="auth-label" style={{ marginTop: 10 }}>Your Banking Name</label>
            <input className="auth-input" value={bankingName} onChange={(e) => setBankingName(e.target.value)} placeholder="Name on the account you paid from" />
            <label className="auth-label" style={{ marginTop: 10 }}>Amount Paid</label>
            <input className="auth-input" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 299" inputMode="decimal" />
            <label className="auth-label" style={{ marginTop: 10 }}>Your Contact Number</label>
            <input className="auth-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 9876543210" inputMode="tel" />
            <label className="auth-label" style={{ marginTop: 10 }}>Transaction ID (UTR)</label>
            <input className="auth-input" value={utr} onChange={(e) => setUtr(e.target.value)} placeholder="From your UPI app's payment history" style={{ fontFamily: 'var(--font-mono)' }} />
            <button className="btn-glow std-save-btn" type="submit" disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit for Review'}
            </button>
            {submitMsg && <div className={`auth-msg ${submitMsg.type}`} style={{ display: 'block' }}>{submitMsg.text}</div>}
          </form>

          <form className="glass std-card" onSubmit={handleRedeem}>
            <div className="auth-label" style={{ margin: 0 }}>Have an Activation Code?</div>
            <input
              className="auth-input"
              style={{ marginTop: 10, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="MED-XXXXXXXX"
            />
            <button className="btn-glow std-save-btn" type="submit" disabled={redeeming}>
              {redeeming ? 'Activating…' : 'Activate'}
            </button>
            {redeemMsg && <div className={`auth-msg ${redeemMsg.type}`} style={{ display: 'block' }}>{redeemMsg.text}</div>}
          </form>

          {myRequests.length > 0 && (
            <div className="glass std-card">
              <div className="auth-label" style={{ margin: 0 }}>Your Submissions</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                {myRequests.map((r) => (
                  <div key={r.utr} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                    <span style={{ color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>{r.utr}</span>
                    <span style={{ color: STATUS_LABEL[r.status]?.color, fontWeight: 700 }}>{STATUS_LABEL[r.status]?.text || r.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
