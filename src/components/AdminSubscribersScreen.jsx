import { useEffect, useState } from 'react';
import {
  subscribeToAllActivationCodes, revokeActivationCode, grantPremiumDirectly,
  fmtDate, expiryLabel, SEMESTER_LABELS,
} from '../lib/subscription';

const GRANT_PRESETS = [
  { days: 30, label: '1 month' },
  { days: 90, label: '3 months' },
  { days: 180, label: '6 months' },
  { days: 365, label: '1 year' },
];
import { playTapSound } from '../lib/sounds';
import './AdminTheme.css';

// Split out of AdminPaymentsScreen's "Issued Codes" list into its own
// tab, showing only students whose subscription is currently active
// (redeemed and not yet expired) - a quick roster of who's actually
// subscribed right now, separate from the payment-review workflow.
export default function AdminSubscribersScreen({ onBack, hideBack = false }) {
  const [codes, setCodes] = useState(null);
  const [loading, setLoading] = useState(true);
  const [revokingCode, setRevokingCode] = useState(null); // code with the reason box open
  const [revokeReason, setRevokeReason] = useState('');
  const [busyCode, setBusyCode] = useState(null);
  const [revokeError, setRevokeError] = useState(null);
  const [grantingCode, setGrantingCode] = useState(null); // card whose grant panel is open
  const [grantSem, setGrantSem] = useState('');
  const [grantDays, setGrantDays] = useState(30);
  const [grantCustom, setGrantCustom] = useState('');
  const [grantBusy, setGrantBusy] = useState(false);
  const [grantMsg, setGrantMsg] = useState(null); // { ok, text }
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(() => new Set()); // codes whose card is open
  const toggleOpen = (code) => {
    playTapSound();
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  };

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

  function openGrant(c, activeList) {
    playTapSound();
    setGrantMsg(null);
    const covered = new Set(activeList.filter((x) => x.uid === c.uid).map((x) => x.yearSemester));
    setGrantSem(Object.keys(SEMESTER_LABELS).find((id) => !covered.has(id)) || '');
    setGrantDays(30);
    setGrantCustom('');
    setGrantingCode(c.code);
  }

  async function handleGrant(c) {
    const days = grantCustom.trim() ? Number(grantCustom) : grantDays;
    if (!grantSem) return setGrantMsg({ ok: false, text: 'Pick a semester.' });
    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      return setGrantMsg({ ok: false, text: 'Enter a whole number of days between 1 and 3650.' });
    }
    playTapSound();
    setGrantBusy(true);
    setGrantMsg(null);
    try {
      await grantPremiumDirectly(c.uid, days, grantSem);
      setGrantMsg({ ok: true, text: `Granted ${SEMESTER_LABELS[grantSem]} to ${c.studentName} for ${days} days.` });
      setGrantingCode(null);
    } catch (e) {
      setGrantMsg({ ok: false, text: e.message || String(e) });
    } finally {
      setGrantBusy(false);
    }
  }

  const active = codes ? codes.filter((c) => c.used && c.expiresAt && c.expiresAt.getTime() > Date.now()) : [];
  const q = search.trim().toLowerCase();
  const shown = q
    ? active.filter((c) =>
        [c.studentName, c.studentEmail, c.code, c.phone, c.utr, c.bankingName, SEMESTER_LABELS[c.yearSemester] || 'all semesters']
          .some((v) => String(v || '').toLowerCase().includes(q)))
    : active;

  return (
    <div className="std-screen">
      {!hideBack && (
        <button className="btn-ghost std-back" onClick={() => { playTapSound(); onBack(); }}>← Back</button>
      )}
      <div className="std-header">
        <h1 className="std-title">✅ Subscribers</h1>
      </div>
      <p style={{ color: 'var(--text3)', fontSize: 13.5, marginTop: -8, marginBottom: 18 }}>
        Students with an active Med101 Maxx subscription right now.
      </p>

      {grantMsg && (
        <div className={grantMsg.ok ? 'auth-msg success' : 'auth-msg error'} style={{ display: 'block', marginBottom: 10 }}>{grantMsg.text}</div>
      )}
      {revokeError && <div className="auth-msg error" style={{ display: 'block', marginBottom: 10 }}>{revokeError}</div>}

      {loading ? (
        <div className="std-loading">Loading…</div>
      ) : active.length === 0 ? (
        <div className="glass std-card" style={{ textAlign: 'center', color: 'var(--text3)' }}>No active subscriptions right now.</div>
      ) : (
        <>
        <div className="sub-search">
          <input
            className="auth-input"
            type="search"
            placeholder="Search name, email, code, semester…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span className="sub-count">{shown.length === active.length ? `${active.length} subscribers` : `${shown.length} of ${active.length}`}</span>
        </div>
        {shown.length === 0 && (
          <div className="glass std-card" style={{ textAlign: 'center', color: 'var(--text3)' }}>No subscribers match “{search}”.</div>
        )}
        <div className="sub-cards">
        {shown.map((c) => {
          const expiry = expiryLabel(c);
          const revoking = revokingCode === c.code;
          const open = expanded.has(c.code) || grantingCode === c.code || revoking;
          return (
            <div key={c.code} className={open ? 'glass std-card sub-card open' : 'glass std-card sub-card'}>
              <button
                type="button"
                className="sub-top sub-toggle"
                aria-expanded={open}
                onClick={() => toggleOpen(c.code)}
              >
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
                <span className="sub-chevron" aria-hidden="true">▾</span>
              </button>
              {open && (
              <div className="sub-body">
              <dl className="sub-grid">
                {c.bankingName && <div><dt>Paid as</dt><dd>{c.bankingName}</dd></div>}
                {c.phone && <div><dt>Phone</dt><dd>{c.phone}</dd></div>}
                {c.utr && <div><dt>UTR</dt><dd className="mono">{c.utr}</dd></div>}
                <div><dt>Semester</dt><dd>{SEMESTER_LABELS[c.yearSemester] || 'All semesters'}</dd></div>
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
                <>
                  <div className="sub-actions">
                    <button
                      className="btn-ghost sub-grant"
                      onClick={() => (grantingCode === c.code ? setGrantingCode(null) : openGrant(c, active))}
                    >
                      ＋ Grant another semester
                    </button>
                    <button
                      className="btn-ghost sub-revoke"
                      style={{ color: 'var(--red)', fontSize: 13 }}
                      onClick={() => { playTapSound(); setRevokeError(null); setRevokingCode(c.code); }}
                    >
                      🗑️ Revoke Subscription
                    </button>
                  </div>

                  {grantingCode === c.code && (() => {
                    const covered = new Set(active.filter((x) => x.uid === c.uid).map((x) => x.yearSemester));
                    return (
                      <div className="sub-grantpanel">
                        <div className="auth-label">Semester</div>
                        <div className="an-chips">
                          {Object.entries(SEMESTER_LABELS).map(([id, label]) => (
                            <button
                              key={id}
                              disabled={covered.has(id)}
                              className={id === grantSem ? 'an-chip active' : 'an-chip'}
                              title={covered.has(id) ? 'Already active for this student' : undefined}
                              onClick={() => setGrantSem(id)}
                            >
                              {label}{covered.has(id) ? ' ✓' : ''}
                            </button>
                          ))}
                        </div>
                        <div className="auth-label">Duration</div>
                        <div className="an-chips">
                          {GRANT_PRESETS.map((pr) => (
                            <button
                              key={pr.days}
                              className={!grantCustom.trim() && grantDays === pr.days ? 'an-chip active' : 'an-chip'}
                              onClick={() => { setGrantDays(pr.days); setGrantCustom(''); }}
                            >
                              {pr.label}
                            </button>
                          ))}
                          <input
                            className="auth-input sub-custom"
                            inputMode="numeric"
                            placeholder="Custom days"
                            value={grantCustom}
                            onChange={(e) => setGrantCustom(e.target.value.replace(/\D/g, ''))}
                          />
                        </div>
                        <div className="sub-grantrow">
                          <button className="btn-glow" disabled={grantBusy} onClick={() => handleGrant(c)}>
                            {grantBusy ? 'Granting…' : `Grant ${grantSem ? SEMESTER_LABELS[grantSem] : ''}`}
                          </button>
                          <button className="btn-ghost" onClick={() => setGrantingCode(null)}>Cancel</button>
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}
              </div>
              )}
            </div>
          );
        })}
        </div>
        </>
      )}
    </div>
  );
}
