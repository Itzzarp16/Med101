import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import {
  subscribeToSubscriptionConfig, submitPaymentRequest, subscribeToMyPaymentRequests,
  redeemActivationCode, subscribeToMyPremiumStatus, activateFreeSemester,
  premiumCoversSemester, SEMESTER_LABELS,
} from '../lib/subscription';
import { playTapSound } from '../lib/sounds';
import LiveQrCode from './LiveQrCode';
import PremiumThankYou from './PremiumThankYou';
import PremiumRejected from './PremiumRejected';
import { buildInvoicePdf } from '../lib/dataExport';
import './PremiumScreen.css';
import LoadingLine from './LoadingLine';

// Which rejected payment UTRs this student has already been shown the
// rejection overlay for - persisted so a rejection they never saw
// (closed the app before checking Premium) still surfaces next time
// they open the Premium screen, but a rejection they've already
// acknowledged (dismissed or hit Retry on) never pops up again.
function getSeenRejections(uid) {
  try {
    return JSON.parse(localStorage.getItem(`med101_seen_rejections_${uid}`) || '[]');
  } catch {
    return [];
  }
}

function markRejectionSeen(uid, utr) {
  const seen = getSeenRejections(uid);
  if (!seen.includes(utr)) {
    try {
      localStorage.setItem(`med101_seen_rejections_${uid}`, JSON.stringify([...seen, utr]));
    } catch {
      // Storage unavailable/full - worst case the overlay shows again
      // next visit, which is harmless (just once more than ideal).
    }
  }
}

const STATUS_LABEL = {
  pending: { text: 'Pending review', color: 'var(--amber)' },
  approved: { text: 'Approved', color: 'var(--green)' },
  rejected: { text: 'Rejected', color: 'var(--red)' },
  revoked: { text: 'Access ended', color: 'var(--red)' },
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

const SOURCE_NOTE = {
  admin: 'Granted by an admin',
  free: 'Free access',
  paid: null,
};

function fmtDay(d) {
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function semesterName(semester) {
  return semester ? (SEMESTER_LABELS[semester] || semester) : 'All semesters';
}

// One row of the "Your Subscriptions" list - which semester it covers,
// whether it's still running, and the dates, with a bar showing how much
// of the period is left, so a student can see at a glance what they've
// paid for and when it ends.
function SubscriptionRow({ sub, isCurrent }) {
  const dayMs = 24 * 60 * 60 * 1000;
  const daysLeft = Math.ceil((sub.expiresAt.getTime() - Date.now()) / dayMs);
  const tone = !sub.active ? 'red' : daysLeft <= 7 ? 'amber' : 'green';
  const note = SOURCE_NOTE[sub.source];
  const span = sub.expiresAt.getTime() - sub.activatedAt.getTime();
  const leftFrac = sub.active && span > 0 ? Math.max(0, Math.min(1, (sub.expiresAt.getTime() - Date.now()) / span)) : 0;
  return (
    <div className="pm-sub-row">
      <div className="pm-sub-top">
        <span className="pm-sub-name">
          {semesterName(sub.semester)}
          {isCurrent && sub.active && <span className="badge badge-cyan pm-sub-badge">Current</span>}
        </span>
        <span className={`pm-pill ${tone}`}>
          {sub.active ? (daysLeft === 1 ? '1 day left' : `${daysLeft} days left`) : 'Expired'}
        </span>
      </div>
      <div className={`pm-sub-bar ${tone}`} aria-hidden="true"><span style={{ width: `${leftFrac * 100}%` }} /></div>
      <div className="pm-sub-dates">
        Started {fmtDay(sub.activatedAt)} · {sub.active ? 'Valid until' : 'Ended'} {fmtDay(sub.expiresAt)}
        {note && <> · {note}</>}
      </div>
    </div>
  );
}

// Status banner at the top: icon + title + one line of detail, coloured by tone.
function Banner({ tone, icon, title, children }) {
  return (
    <div className={`pm-banner ${tone || 'neutral'}`}>
      <div className="pm-banner-icon" aria-hidden="true">{icon}</div>
      <div className="pm-banner-text">
        <div className="pm-banner-title">{title}</div>
        {children && <div className="pm-banner-body">{children}</div>}
      </div>
    </div>
  );
}

export default function PremiumScreen({ onBack }) {
  const { user, profile, isAdmin } = useAuth();
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [premium, setPremium] = useState({ isPremium: false, premiumUntil: null, subscriptions: [] });
  const [myRequests, setMyRequests] = useState([]);
  // Which semester the payment form is for - declared early since
  // effectivePriceLabel below needs it. Defaults to the student's own
  // current semester once profile loads (see the sync effect further
  // down); they can pick a different one in the form.
  const [paySemester, setPaySemester] = useState(profile?.enrolledYearSemester || null);
  const paySemesterTouched = useRef(false);
  // The admin can set a different price per semester (Payment Settings
  // -> Per-Semester Pricing); this is what actually gets shown/charged,
  // falling back to the single default priceLabel when that semester
  // has no override set.
  const priceFor = (sem) => config?.priceLabelsBySemester?.[sem] || config?.priceLabel;
  const effectivePriceLabel = priceFor(paySemester);
  const isFreeFor = (sem) => {
    const a = extractAmount(priceFor(sem));
    return a !== null && parseFloat(a) === 0;
  };
  // The semester picked in the pay card can differ from the student's
  // own semester: payIsFree drives what that card shows, while the free
  // auto-activation below only ever follows the student's own semester
  // (the server activates that one).
  const payIsFree = isFreeFor(paySemester);
  // A bare "0"/"00"/"₹0" (not a fuller label that merely contains a
  // zero somewhere) means the admin has made this semester free -
  // see the auto-activation effect below.
  const isFreeSemester = isFreeFor(profile?.enrolledYearSemester);
  // Whether the student's ACTIVE subscription actually covers the
  // semester they're currently viewing (see App.jsx's identical
  // check) - premium.isPremium alone isn't enough once premium can be
  // scoped to one semester, or this screen would tell a Semester-1
  // subscriber they're "already Maxx" while they're actually viewing
  // (and locked out of) Semester 2.
  const premiumForThisSemester = premiumCoversSemester(premium, profile?.enrolledYearSemester);
  // The active subscription that actually covers the current
  // semester (latest-expiring if more than one does) - its expiry is
  // what the "Active" card should show, not premium.premiumUntil,
  // which is the latest expiry across every semester.
  const coveringSub = (premium.subscriptions || [])
    .filter((sub) => sub.active && (sub.semester === null || sub.semester === profile?.enrolledYearSemester))
    .sort((a, b) => b.expiresAt - a.expiresAt)[0] || null;
  const hasOtherActiveSub = !premiumForThisSemester && (premium.subscriptions || []).some((sub) => sub.active);
  // Once a payment's been submitted, the whole "pay now" flow should
  // step out of the way - either they're waiting on a decision, or
  // they already have a code to enter. Only a rejection reopens it
  // (they need a way to try again).
  const hasPendingRequest = myRequests.some((r) => r.status === 'pending');
  const hasApprovedUnredeemed = myRequests.some((r) => r.status === 'approved');
  const hidePaymentFlow = hasPendingRequest || hasApprovedUnredeemed;

  useEffect(() => {
    if (profile?.enrolledYearSemester && !paySemesterTouched.current) {
      setPaySemester(profile.enrolledYearSemester);
    }
  }, [profile?.enrolledYearSemester]);

  const [bankingName, setBankingName] = useState('');
  const [phone, setPhone] = useState('');
  const [utr, setUtr] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState(null);

  const [copied, setCopied] = useState(false);
  const [subsOpen, setSubsOpen] = useState(false);
  const [invoiceBusy, setInvoiceBusy] = useState(null);
  const [invoiceError, setInvoiceError] = useState(null);
  // Paid = the admin approved the payment (an approved request later
  // ended early by an admin was still paid for, so it keeps its invoice).
  const paidRequests = myRequests.filter((r) => r.status === 'approved' || r.status === 'revoked');
  // Admin-granted subscriptions have no payment request, so they're
  // turned into invoice rows from the subscription itself.
  const adminInvoices = (premium.subscriptions || [])
    .filter((sub) => sub.source === 'admin')
    .map((sub) => ({
      utr: `ADM${sub.activatedAt.getTime()}`, grantedByAdmin: true,
      yearSemester: sub.semester, durationDays: sub.durationDays,
      reviewedAt: sub.activatedAt, createdAt: sub.activatedAt, amount: '', invoiceNo: sub.invoiceNo || undefined,
    }));
  const invoiceRows = [...paidRequests, ...adminInvoices];

  async function handleInvoice(r) {
    playTapSound();
    setInvoiceBusy(r.utr);
    setInvoiceError(null);
    try {
      const doc = await buildInvoicePdf({ request: r, user, profile, fallbackAmount: formatPrice(priceFor(r.yearSemester)) });
      doc.save(`med101-invoice-${r.utr}.pdf`);
    } catch (e) {
      setInvoiceError(e.message || String(e));
    } finally {
      setInvoiceBusy(null);
    }
  }

  const [code, setCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemMsg, setRedeemMsg] = useState(null);
  const [showThankYou, setShowThankYou] = useState(false);

  const [activatingFree, setActivatingFree] = useState(false);
  const [freeActivateError, setFreeActivateError] = useState(null);

  async function handleActivateFree() {
    setActivatingFree(true);
    setFreeActivateError(null);
    try {
      await activateFreeSemester();
      // No need to touch `premium` here - subscribeToMyPremiumStatus
      // is a live listener and will flip premiumForThisSemester to
      // true as soon as the new activationCode doc lands.
    } catch (e) {
      setFreeActivateError(e.message || String(e));
    } finally {
      setActivatingFree(false);
    }
  }

  // Auto-activate as soon as we know this semester is free and the
  // student doesn't already have it - no button for the normal case,
  // per "if I enter amount 0 it should be automatically free". Only
  // runs once config/premium have actually loaded (loading === false)
  // so it doesn't fire on a stale/default premium value, and skips
  // entirely if a manual free-everyone pause is already covering
  // everyone anyway.
  useEffect(() => {
    if (loading || !isFreeSemester || premiumForThisSemester || config?.premiumPaused) return;
    if (activatingFree) return;
    handleActivateFree();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, isFreeSemester, premiumForThisSemester, config?.premiumPaused]);

  function handleCopyUpi() {
    if (!config?.upiId) return;
    playTapSound();
    navigator.clipboard?.writeText(config.upiId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  useEffect(() => {
    return subscribeToSubscriptionConfig(setConfig);
  }, []);

  const [rejectedOverlay, setRejectedOverlay] = useState(null); // { utr, reason } or null

  useEffect(() => {
    // Live, not a one-time fetch - so an admin approving/rejecting this
    // student's payment (or activating premium) shows up immediately,
    // with no hard refresh needed.
    const unsubPremium = subscribeToMyPremiumStatus(user.uid, (status) => {
      setPremium(status);
      setLoading(false);
    });
    const unsubRequests = subscribeToMyPaymentRequests(user.uid, (list) => {
      // Show the rejection overlay for the most recent rejected request
      // the student hasn't acknowledged yet (dismissed or hit Retry on)
      // - persisted per-account, so this fires the next time they open
      // the Premium screen even if they closed the app before seeing
      // it, but never repeats once they've actually seen it. Only
      // relevant here (PremiumScreen only mounts when they navigate to
      // Premium), so it never surfaces just from opening the app.
      const seen = getSeenRejections(user.uid);
      const unseenRejected = list
        .filter((r) => r.status === 'rejected' && !seen.includes(r.utr))
        .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      if (unseenRejected.length > 0) {
        setRejectedOverlay({ utr: unseenRejected[0].utr, reason: unseenRejected[0].rejectionReason });
      }
      setMyRequests(list);
    });
    return () => {
      unsubPremium();
      unsubRequests();
    };
  }, [user.uid]);

  function dismissRejectedOverlay() {
    if (rejectedOverlay) markRejectionSeen(user.uid, rejectedOverlay.utr);
    setRejectedOverlay(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    playTapSound();
    setSubmitMsg(null);
    if (!utr.trim()) {
      setSubmitMsg({ text: 'Enter the transaction ID (UTR) from your payment.', type: 'error' });
      return;
    }
    if (phone.replace(/\D/g, '').length !== 10) {
      setSubmitMsg({ text: 'Enter a 10-digit contact number.', type: 'error' });
      return;
    }
    setSubmitting(true);
    try {
      await submitPaymentRequest({
        uid: user.uid, email: user.email, displayName: user.displayName,
        username: profile?.username, amount: formatPrice(effectivePriceLabel),
        bankingName, phone, utr, yearSemester: paySemester,
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
      setRedeemMsg({ text: 'Med101 Maxx activated! Enjoy full access.', type: 'success' });
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

  const payFlowVisible = !premiumForThisSemester && !config?.premiumPaused && !isFreeSemester;

  return (
    <div className="std-screen pm">
      {showThankYou && <PremiumThankYou onClose={() => setShowThankYou(false)} />}
      {rejectedOverlay && (
        <PremiumRejected
          reason={rejectedOverlay.reason}
          onRetry={dismissRejectedOverlay}
          onClose={dismissRejectedOverlay}
        />
      )}

      <header className="pm-hero">
        <button className="pm-back" onClick={() => { playTapSound(); onBack(); }} aria-label="Back">←</button>
        <div className="pm-orb" aria-hidden="true"><span>⭐</span></div>
        <h1 className="pm-title">Med101 Maxx</h1>
        <div className="pm-sub">Unlock every question, in every subject.</div>
        <div className="pm-perks">
          <span>♾️ Every question</span>
          <span>📚 Every subject</span>
          <span>🎓 Your semester</span>
        </div>
      </header>

      {isAdmin ? (
        <Banner tone="green" icon="✅" title="Full Access (Admin)">
          Admin accounts always have complete access to every subject and question - no subscription needed.
        </Banner>
      ) : loading ? (
        <LoadingLine />
      ) : (
        <>
          {premiumForThisSemester ? (
            <Banner tone="green" icon="✅" title="Med101 Maxx active">
              {coveringSub && <><strong>{semesterName(coveringSub.semester)}</strong> · </>}
              Valid until <strong>{fmtDay(coveringSub?.expiresAt || premium.premiumUntil)}</strong>
            </Banner>
          ) : config?.premiumPaused ? (
            <Banner tone="cyan" icon="🎉" title="Free for everyone right now">
              All Med101 Maxx features are unlocked for every student at the moment - nothing to pay, nothing to do.
            </Banner>
          ) : isFreeSemester ? (
            <Banner tone="cyan" icon="🎉" title="Free for your semester">
              {activatingFree
                ? 'Activating your full access…'
                : freeActivateError
                  ? freeActivateError
                  : 'Med101 Maxx is free for your semester right now - full access, nothing to pay.'}
              {freeActivateError && (
                <div><button className="btn-ghost pm-retry" onClick={handleActivateFree} disabled={activatingFree}>Try Again</button></div>
              )}
            </Banner>
          ) : hasPendingRequest ? (
            <Banner tone="amber" icon="⏳" title="Waiting for approval">
              We've got your payment details - check below for the current status.
            </Banner>
          ) : null}

          {payFlowVisible && !hidePaymentFlow && config && (
            <div className="pay-card">
              <div className="pay-card-inner">
                <div className="pay-card-eyebrow">Step 1 · Pick your semester &amp; pay</div>

                <label htmlFor="premium-pay-semester" className="pay-sem-label">Which semester is this for?</label>
                <select
                  id="premium-pay-semester"
                  className="auth-input pay-sem-select"
                  value={paySemester || ''}
                  onChange={(e) => { playTapSound(); paySemesterTouched.current = true; setPaySemester(e.target.value); }}
                >
                  {Object.entries(SEMESTER_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}{priceFor(value) ? ` · ${isFreeFor(value) ? 'Free' : formatPrice(priceFor(value))}` : ''}
                    </option>
                  ))}
                </select>

                {payIsFree ? (
                  <div className="pay-free-note">
                    🎉 {semesterName(paySemester)} is free right now - nothing to pay. Switch to it in Settings to unlock it.
                  </div>
                ) : (
                  <div key={`${paySemester}-${effectivePriceLabel}`} className="pay-swap">
                    {effectivePriceLabel && <div className="pay-card-price">{formatPrice(effectivePriceLabel)}</div>}
                    {config.upiId && (
                      <div className="pay-qr-frame">
                        <LiveQrCode upiId={config.upiId} amount={extractAmount(effectivePriceLabel)} />
                      </div>
                    )}
                  </div>
                )}

                {!payIsFree && config.upiId && (
                  <div className="pay-upi-row">
                    <span className="pay-upi-id">{config.upiId}</span>
                    <button type="button" className="pay-upi-copy" onClick={handleCopyUpi}>
                      {copied ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>
                )}

                {!payIsFree && <p className="pm-phone-tip">
                  Paying from this phone? Copy the UPI ID above and pay it in your UPI app, or screenshot the QR and scan it from your gallery.
                </p>}

                <ol className="pm-steps">
                  <li>Pay using any UPI app</li>
                  <li>Submit the transaction ID (UTR) below</li>
                  {config.activationMethod === 'code' ? (
                    <>
                      <li>We verify and send you an activation code</li>
                      <li>Enter the code to unlock full access</li>
                    </>
                  ) : (
                    <li>We verify and activate your account - nothing else to do</li>
                  )}
                </ol>

                {config.instructions && (
                  <div className="pay-instructions">{config.instructions}</div>
                )}
              </div>
            </div>
          )}

          {payFlowVisible && !hidePaymentFlow && !payIsFree && (
            <form className="glass pm-card pm-form" onSubmit={handleSubmit}>
              <div className="pm-card-title">Step 2 · Submit your payment</div>

              <div className="pm-for-sem">For <strong>{semesterName(paySemester)}</strong>{effectivePriceLabel ? <> · <strong>{formatPrice(effectivePriceLabel)}</strong></> : null}</div>

              <label htmlFor="premium-your-banking-name" className="auth-label">Your banking name</label>
              <input id="premium-your-banking-name" className="auth-input" value={bankingName} onChange={(e) => setBankingName(e.target.value)} placeholder="Name on the account you paid from" />

              <label htmlFor="premium-your-contact-number" className="auth-label">Your contact number</label>
              <input id="premium-your-contact-number"
                className="auth-input"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="e.g. 9876543210"
                inputMode="tel"
                maxLength={10}
              />

              <label htmlFor="premium-transaction-id-utr" className="auth-label">Transaction ID (UTR)</label>
              <input id="premium-transaction-id-utr" className="auth-input pm-mono" value={utr} onChange={(e) => setUtr(e.target.value)} placeholder="From your UPI app's payment history" />
              <p className="pm-hint">The UTR / reference number (usually 12 digits) shown on the payment success screen or in your UPI app's history.</p>

              <button className="btn-glow std-save-btn" type="submit" disabled={submitting}>
                {submitting ? 'Submitting…' : 'Submit for review'}
              </button>
              {submitMsg && <div className={`auth-msg ${submitMsg.type}`} style={{ display: 'block' }}>{submitMsg.text}</div>}
            </form>
          )}

          {((premium.subscriptions || []).length > 0 || invoiceRows.length > 0) && (
            <div className={`glass pm-card pm-acc${subsOpen ? ' open' : ''}`}>
              <button
                type="button"
                className="pm-acc-head"
                aria-expanded={subsOpen}
                onClick={() => { playTapSound(); setSubsOpen((o) => !o); }}
              >
                <span className="pm-card-title">Your subscriptions</span>
                <span className="pm-acc-chev" aria-hidden="true">⌄</span>
              </button>
              <div className="pm-acc-body"><div className="pm-acc-inner">
                {hasOtherActiveSub && (
                  <div className="pm-warn">
                    You're viewing {semesterName(profile?.enrolledYearSemester)}, which isn't covered by an active subscription. Your active subscriptions below apply to the semesters listed.
                  </div>
                )}
                <div className="pm-sub-list">
                  {premium.subscriptions.map((sub, i) => (
                    <SubscriptionRow
                      key={`${sub.semester}-${sub.activatedAt.getTime()}-${i}`}
                      sub={sub}
                      isCurrent={sub.semester === null || sub.semester === profile?.enrolledYearSemester}
                    />
                  ))}
                </div>
                {invoiceRows.length > 0 && (
                  <div className="pm-invoices">
                    <div className="pm-invoices-title">Invoices</div>
                    {invoiceRows.map((r) => (
                      <div key={r.utr} className="pm-invoice-row">
                        <div className="pm-invoice-info">
                          <b>{semesterName(r.yearSemester)}</b>
                          <span>{r.amount ? formatPrice(r.amount) : formatPrice(priceFor(r.yearSemester))} · {r.grantedByAdmin ? 'Given by an admin' : r.utr}</span>
                        </div>
                        <button type="button" className="pay-upi-copy" onClick={() => handleInvoice(r)} disabled={invoiceBusy === r.utr}>
                          {invoiceBusy === r.utr ? 'Preparing…' : '⬇ Invoice'}
                        </button>
                      </div>
                    ))}
                    {invoiceError && <div className="auth-msg error" style={{ display: 'block' }}>{invoiceError}</div>}
                  </div>
                )}
              </div></div>
            </div>
          )}

          {payFlowVisible && !hasPendingRequest && config?.activationMethod === 'code' && (
            <form className="glass pm-card pm-form" onSubmit={handleRedeem}>
              <div className="pm-card-title">Have an activation code?</div>
              <input
                className="auth-input pm-mono pm-upper"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="MED-XXXXXXXX" aria-label="Activation code"
              />
              <button className="btn-glow std-save-btn" type="submit" disabled={redeeming}>
                {redeeming ? 'Activating…' : 'Activate'}
              </button>
              {redeemMsg && <div className={`auth-msg ${redeemMsg.type}`} style={{ display: 'block' }}>{redeemMsg.text}</div>}
            </form>
          )}

          {!premiumForThisSemester && !config?.premiumPaused && myRequests.length > 0 && (
            <div className="glass pm-card">
              <div className="pm-card-title">Your submissions</div>
              <div className="pm-req-list">
                {myRequests.map((r) => {
                  const st = STATUS_LABEL[r.status];
                  const tone = r.status === 'approved' ? 'green' : r.status === 'pending' ? 'amber' : 'red';
                  return (
                    <div key={r.utr} className="pm-req">
                      <div className="pm-req-top">
                        <span className="pm-req-utr">{r.utr}</span>
                        <span className={`pm-pill ${tone}`}>{st?.text || r.status}</span>
                      </div>

                      {r.status === 'rejected' && r.rejectionReason && (
                        <div className="pm-req-note">Reason: {r.rejectionReason}</div>
                      )}

                      {r.status === 'revoked' && (
                        <div className="pm-req-note">
                          Your access was ended early by an admin{r.revokedReason ? `: ${r.revokedReason}` : '.'} Subscribe again below if you'd like to continue.
                        </div>
                      )}

                      {r.status === 'approved' && r.code && (
                        <div className="pm-req-code">
                          <span className="pay-upi-id">{r.code}</span>
                          <button type="button" className="pay-upi-copy" onClick={() => { playTapSound(); navigator.clipboard?.writeText(r.code); }}>
                            Copy
                          </button>
                          <button
                            type="button"
                            className="pay-upi-copy pm-activate"
                            onClick={() => { playTapSound(); redeemCode(r.code); }}
                            disabled={redeeming}
                          >
                            {redeeming ? 'Activating…' : '✓ Activate now'}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
