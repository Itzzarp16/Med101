import { useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import {
  getSubscriptionConfig, submitPaymentRequest, subscribeToMyPaymentRequests,
  redeemActivationCode, subscribeToMyPremiumStatus,
} from '../lib/subscription';
import { playTapSound } from '../lib/sounds';
import LiveQrCode from './LiveQrCode';
import PremiumThankYou from './PremiumThankYou';
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

export default function PremiumScreen({ onBack }) {
  const { user, isAdmin } = useAuth();
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [premium, setPremium] = useState({ isPremium: false, premiumUntil: null });
  const [myRequests, setMyRequests] = useState([]);

  const [bankingName, setBankingName] = useState('');
  const [phone, setPhone] = useState('');
  const [utr, setUtr] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState(null);

  const [copied, setCopied] = useState(false);

  const [code, setCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemMsg, setRedeemMsg] = useState(null);
  const [showThankYou, setShowThankYou] = useState(false);

  function handleCopyUpi() {
    if (!config?.upiId) return;
    playTapSound();
    navigator.clipboard?.writeText(config.upiId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  useEffect(() => {
    getSubscriptionConfig().then(setConfig);
  }, []);

  useEffect(() => {
    // Live, not a one-time fetch - so an admin approving/rejecting this
    // student's payment (or activating premium) shows up immediately,
    // with no hard refresh needed.
    const unsubPremium = subscribeToMyPremiumStatus(user.uid, (status) => {
      setPremium(status);
      setLoading(false);
    });
    const unsubRequests = subscribeToMyPaymentRequests(user.uid, setMyRequests);
    return () => {
      unsubPremium();
      unsubRequests();
    };
  }, [user.uid]);

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
        bankingName, phone, utr,
      });
      setSubmitMsg({
        text: config?.activationMethod === 'code'
          ? 'Submitted! We\'ll review it and send you an activation code shortly.'
          : 'Submitted! We\'ll review it and activate your account shortly.',
        type: 'success',
      });
      setBankingName(''); setPhone(''); setUtr('');
    } catch (e) {
      setSubmitMsg({ text: e.message || String(e), type: 'error' });
    } finally {
      setSubmitting(false);
    }
  }

  async function redeemCode(rawCode) {
    setRedeemMsg(null);
    if (!rawCode.trim()) return;
    setRedeeming(true);
    try {
      await redeemActivationCode(user.uid, rawCode);
      setRedeemMsg({ text: 'Premium activated! Enjoy full access.', type: 'success' });
      setCode('');
      setShowThankYou(true);
    } catch (e) {
      setRedeemMsg({ text: e.message || String(e), type: 'error' });
    } finally {
      setRedeeming(false);
    }
  }

  function handleRedeem(e) {
    e.preventDefault();
    playTapSound();
    redeemCode(code);
  }

  return (
    <div className="std-screen">
      {showThankYou && <PremiumThankYou onClose={() => setShowThankYou(false)} />}

      <button className="btn-ghost std-back" onClick={() => { playTapSound(); onBack(); }}>← Back</button>

      <div className="std-header">
        <h1 className="std-title">⭐ Premium</h1>
        <p className="std-sub">Unlock every question, in every subject.</p>
      </div>

      {isAdmin ? (
        <div className="glass std-card" style={{ borderColor: 'var(--green)' }}>
          <div className="auth-label" style={{ margin: 0, color: 'var(--green)' }}>✅ Full Access (Admin)</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>
            Admin accounts always have complete access to every subject and question - no subscription needed.
          </div>
        </div>
      ) : loading ? (
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

          {!premium.isPremium && config && (
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

                <ol className="pay-steps">
                  <li>Scan the QR with any UPI app</li>
                  <li>Submit the transaction ID (UTR) below</li>
                  {config.activationMethod === 'code' ? (
                    <>
                      <li>We'll verify and send you an activation code</li>
                      <li>Enter the code to unlock full access</li>
                    </>
                  ) : (
                    <li>We'll verify and activate your account - nothing else to do</li>
                  )}
                </ol>

                {config.instructions && (
                  <div className="pay-instructions">{config.instructions}</div>
                )}
              </div>
            </div>
          )}

          {!premium.isPremium && (
            <form className="glass std-card" onSubmit={handleSubmit}>
              <div className="auth-label" style={{ margin: 0 }}>Submit Your Payment</div>
              <label className="auth-label" style={{ marginTop: 10 }}>Your Banking Name</label>
              <input className="auth-input" value={bankingName} onChange={(e) => setBankingName(e.target.value)} placeholder="Name on the account you paid from" />
              <label className="auth-label" style={{ marginTop: 10 }}>Your Contact Number</label>
              <input className="auth-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 9876543210" inputMode="tel" />
              <label className="auth-label" style={{ marginTop: 10 }}>Transaction ID (UTR)</label>
              <input className="auth-input" value={utr} onChange={(e) => setUtr(e.target.value)} placeholder="From your UPI app's payment history" style={{ fontFamily: 'var(--font-mono)' }} />
              <button className="btn-glow std-save-btn" type="submit" disabled={submitting}>
                {submitting ? 'Submitting…' : 'Submit for Review'}
              </button>
              {submitMsg && <div className={`auth-msg ${submitMsg.type}`} style={{ display: 'block' }}>{submitMsg.text}</div>}
            </form>
          )}

          {!premium.isPremium && config?.activationMethod === 'code' && (
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
          )}

          {!premium.isPremium && myRequests.length > 0 && (
            <div className="glass std-card">
              <div className="auth-label" style={{ margin: 0 }}>Your Submissions</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
                {myRequests.map((r) => (
                  <div key={r.utr} style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                      <span style={{ color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>{r.utr}</span>
                      <span style={{ color: STATUS_LABEL[r.status]?.color, fontWeight: 700 }}>{STATUS_LABEL[r.status]?.text || r.status}</span>
                    </div>

                    {r.status === 'rejected' && r.rejectionReason && (
                      <div style={{ marginTop: 6, fontSize: 12.5, color: 'var(--text2)' }}>
                        Reason: {r.rejectionReason}
                      </div>
                    )}

                    {r.status === 'approved' && r.code && (
                      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span className="pay-upi-id" style={{ fontSize: 13 }}>{r.code}</span>
                        <button
                          type="button"
                          className="pay-upi-copy"
                          onClick={() => { playTapSound(); navigator.clipboard?.writeText(r.code); }}
                        >
                          Copy
                        </button>
                        <button
                          type="button"
                          className="pay-upi-copy"
                          style={{ borderColor: 'var(--green)', color: 'var(--green)' }}
                          onClick={() => { playTapSound(); redeemCode(r.code); }}
                          disabled={redeeming}
                        >
                          {redeeming ? 'Activating…' : '✓ Activate Now'}
                        </button>
                      </div>
                    )}
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
