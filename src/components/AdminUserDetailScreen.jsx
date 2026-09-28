import { useEffect, useState } from 'react';
import { doc, getDoc, collection, getDocs, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { lookupUsername } from '../lib/invites';
import { playTapSound } from '../lib/sounds';
import { formatDuration } from '../lib/timeTracking';
import { setAccountDisabled, deleteAccount } from '../lib/adminAccountActions';
import { buildUserDataExportPdf, emailDataExportToUser } from '../lib/dataExport';
import { subscribeToMyPremiumStatus, grantPremiumDirectly } from '../lib/subscription';
import './AdminUserDetailScreen.css';

// Just for the "· Semester N only" note next to an active subscription
// below - same 6 values AuthScreen/SettingsScreen use for
// enrolledYearSemester, as a plain lookup map rather than the full
// {value,label} array those files use, since that's all this needs.
const SEMESTER_LABELS = {
  y1s1: 'Semester 1', y1s2: 'Semester 2',
  y2s1: 'Semester 3', y2s2: 'Semester 4',
  y3s1: 'Semester 5', y3s2: 'Semester 6',
};

const MAXX_DURATION_PRESETS = [
  { label: '1 Month', days: 30 },
  { label: '3 Months', days: 90 },
  { label: '6 Months', days: 180 },
  { label: '1 Year', days: 365 },
];

function formatJoinDate(ts) {
  if (!ts) return null;
  try {
    const d = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return null;
  }
}

function buildResult(uid, username, data) {
  const topicStats = data.topicStats || {};
  const weakest = Object.entries(topicStats)
    .map(([subtopic, s]) => ({ subtopic, mainSubject: s.mainSubject, accuracyPct: s.answered ? Math.round((s.correct / s.answered) * 100) : 0, answered: s.answered }))
    .filter((t) => t.answered >= 5)
    .sort((a, b) => a.accuracyPct - b.accuracyPct)
    .slice(0, 5);
  return { uid, username, ...data, weakest };
}

// initialUid lets this screen be opened already-loaded for a specific
// student - e.g. tapping their name in the admin "who's online" list -
// skipping the username search entirely.
export default function AdminUserDetailScreen({ onBack, initialUid , hideBack = false }) {
  const { user: adminUser } = useAuth();
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(!!initialUid);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState(null);
  const [emailExportBusy, setEmailExportBusy] = useState(false);
  const [emailExportError, setEmailExportError] = useState(null);
  const [emailExportSentTo, setEmailExportSentTo] = useState(null);
  const [premiumStatus, setPremiumStatus] = useState(null);
  const [maxxDuration, setMaxxDuration] = useState(30);
  const [maxxCustomDays, setMaxxCustomDays] = useState('');
  const [maxxBusy, setMaxxBusy] = useState(false);
  const [maxxError, setMaxxError] = useState(null);
  const [maxxGrantedCode, setMaxxGrantedCode] = useState(null);

  // "View All Users" - a separate flow from the single-username search
  // above. Fetched on demand (not on screen open) since it's one read
  // per signed-up student - fine for an occasional admin action, but
  // not something to run automatically. Once fetched, filtering by the
  // search box below is purely client-side (no extra reads), and
  // tapping a row reuses the already-fetched data instead of re-reading
  // that user's doc.
  const [allUsers, setAllUsers] = useState(null);
  const [loadingAll, setLoadingAll] = useState(false);
  const [allUsersError, setAllUsersError] = useState(null);
  const [listFilter, setListFilter] = useState('');
  const [listSort, setListSort] = useState('name');

  async function handleViewAllUsers() {
    playTapSound();
    setAllUsersError(null);
    setLoadingAll(true);
    try {
      const snap = await getDocs(collection(db, 'users'));
      const users = snap.docs
        .map((d) => ({ uid: d.id, ...d.data() }))
        .sort((a, b) => (a.username || a.displayName || '').localeCompare(b.username || b.displayName || ''));
      setAllUsers(users);
    } catch (e) {
      setAllUsersError(e.message || String(e));
    } finally {
      setLoadingAll(false);
    }
  }

  function openUserFromList(u) {
    playTapSound();
    setConfirmingDelete(false);
    setActionError(null);
    setEmailExportSentTo(null);
    setEmailExportError(null);
    setResult(buildResult(u.uid, u.username || null, u));
  }

  async function handleExportData() {
    playTapSound();
    setExportError(null);
    setExportBusy(true);
    try {
      const doc = await buildUserDataExportPdf(result.uid);
      const safeName = (result.username || result.email || result.uid).replace(/[^a-zA-Z0-9._-]/g, '_');
      doc.save(`med101-data-export-${safeName}.pdf`);
    } catch (e) {
      setExportError(e.message || String(e));
    } finally {
      setExportBusy(false);
    }
  }

  async function handleEmailExportToUser() {
    playTapSound();
    setEmailExportError(null);
    setEmailExportSentTo(null);
    setEmailExportBusy(true);
    try {
      const doc = await buildUserDataExportPdf(result.uid);
      // jsPDF's datauristring is "data:application/pdf;filename=...;base64,<data>" -
      // split on the first comma to keep just the base64 payload.
      const base64 = doc.output('datauristring').split(',').slice(1).join(',');
      const { to } = await emailDataExportToUser(adminUser, result.uid, base64);
      setEmailExportSentTo(to);
    } catch (e) {
      setEmailExportError(e.message || String(e));
    } finally {
      setEmailExportBusy(false);
    }
  }

  useEffect(() => {
    if (!result?.uid) {
      setPremiumStatus(null);
      return;
    }
    setMaxxGrantedCode(null);
    setMaxxError(null);
    return subscribeToMyPremiumStatus(result.uid, setPremiumStatus);
  }, [result?.uid]);

  async function handleGrantMaxx() {
    if (!result) return;
    playTapSound();
    setMaxxError(null);
    setMaxxGrantedCode(null);
    const days = maxxDuration === 'custom' ? parseInt(maxxCustomDays, 10) : maxxDuration;
    if (!days || days <= 0) {
      setMaxxError('Enter a valid number of days.');
      return;
    }
    setMaxxBusy(true);
    try {
      const { code } = await grantPremiumDirectly(result.uid, days);
      setMaxxGrantedCode({ code, days });
    } catch (e) {
      setMaxxError(e.message || String(e));
    } finally {
      setMaxxBusy(false);
    }
  }

  async function handleToggleDisabled() {
    if (!result) return;
    playTapSound();
    setActionError(null);
    setActionBusy(true);
    try {
      const next = !result.disabled;
      await setAccountDisabled(result.uid, next);
      setResult((r) => ({ ...r, disabled: next }));
      // Keep the all-users list in sync so it doesn't show stale status
      // if the admin goes back to it.
      setAllUsers((list) => list && list.map((u) => (u.uid === result.uid ? { ...u, disabled: next } : u)));
    } catch (e) {
      setActionError(e.message || String(e));
    } finally {
      setActionBusy(false);
    }
  }

  async function handleDeleteAccount() {
    if (!result) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    playTapSound();
    setActionError(null);
    setActionBusy(true);
    try {
      await deleteAccount(result.uid);
      setAllUsers((list) => list && list.filter((u) => u.uid !== result.uid));
      setResult(null);
      setConfirmingDelete(false);
    } catch (e) {
      setActionError(e.message || String(e));
      setActionBusy(false);
    }
  }

  useEffect(() => {
    if (!initialUid) return;
    setBusy(true);
    const unsub = onSnapshot(doc(db, 'users', initialUid), (snap) => {
      if (!snap.exists()) {
        setError('User profile not found.');
        setBusy(false);
        return;
      }
      const data = snap.data();
      setResult(buildResult(initialUid, data.username || null, data));
      setBusy(false);
    }, (e) => {
      setError(e.message || String(e));
      setBusy(false);
    });
    return unsub;
  }, [initialUid]);

  async function handleSearch() {
    playTapSound();
    setError(null);
    setResult(null);
    setConfirmingDelete(false);
    setActionError(null);
    setEmailExportSentTo(null);
    setEmailExportError(null);
    if (!username.trim()) return;
    setBusy(true);
    try {
      const found = await lookupUsername(username);
      if (!found) {
        setError('No student has claimed that username.');
        return;
      }
      const snap = await getDoc(doc(db, 'users', found.uid));
      if (!snap.exists()) {
        setError('User profile not found.');
        return;
      }
      setResult(buildResult(found.uid, found.username, snap.data()));
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  // Display values for the detail view (only meaningful once `result` is set).
  const semesterLabel = SEMESTER_LABELS[result?.enrolledYearSemester] || result?.enrolledYearSemester || 'Not set';
  const maxxDays = maxxDuration === 'custom' ? parseInt(maxxCustomDays, 10) : maxxDuration;
  const maxxDurationLabel = maxxDuration === 'custom'
    ? (maxxDays > 0 ? `${maxxDays} day${maxxDays === 1 ? '' : 's'}` : 'custom')
    : (MAXX_DURATION_PRESETS.find((p) => p.days === maxxDuration)?.label || '').toLowerCase();

  return (
    <div className="std-screen">
      {!hideBack && (
        <button className="btn-ghost std-back" onClick={() => { playTapSound(); onBack(); }}>← Back</button>
      )}

      {!result && !initialUid && (
        <div className="std-header">
          <h1 className="std-title">🔍 View User Detail</h1>
          <p className="std-sub">Look up a student by their unique username.</p>
        </div>
      )}

      {!initialUid && !result && (
        <div className="glass std-card">
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="auth-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. sanjana_2027"
              style={{ fontFamily: 'var(--font-mono)' }}
            />
            <button className="tpreset sel" style={{ flexShrink: 0, padding: '0 16px' }} onClick={handleSearch} disabled={busy}>
              {busy ? '…' : 'Search'}
            </button>
          </div>
          {error && <div className="auth-msg error" style={{ display: 'block' }}>{error}</div>}

          <button
            className="btn-ghost"
            style={{ width: '100%', marginTop: 10 }}
            onClick={handleViewAllUsers}
            disabled={loadingAll}
          >
            {loadingAll ? 'Loading…' : allUsers ? '🔄 Refresh All Users' : '📋 View All Users'}
          </button>
          {allUsersError && <div className="auth-msg error" style={{ display: 'block' }}>{allUsersError}</div>}
        </div>
      )}

      {!initialUid && !result && allUsers && (
        <div className="glass std-card" style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="auth-label" style={{ margin: 0 }}>{allUsers.length} students signed up</div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input
              className="auth-input"
              value={listFilter}
              onChange={(e) => setListFilter(e.target.value)}
              placeholder="Filter by name, username, or email…"
              style={{ flex: 1 }}
            />
            <select
              className="auth-input"
              value={listSort}
              onChange={(e) => setListSort(e.target.value)}
              style={{ width: 'auto', flexShrink: 0 }}
            >
              <option value="name">Name (A-Z)</option>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="email">Email (A-Z)</option>
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10, maxHeight: 420, overflowY: 'auto' }}>
            {allUsers
              .filter((u) => {
                const q = listFilter.trim().toLowerCase();
                if (!q) return true;
                return (u.username || '').toLowerCase().includes(q)
                  || (u.displayName || '').toLowerCase().includes(q)
                  || (u.email || '').toLowerCase().includes(q);
              })
              .sort((a, b) => {
                if (listSort === 'email') {
                  return (a.email || '').localeCompare(b.email || '');
                }
                if (listSort === 'newest' || listSort === 'oldest') {
                  // enrolledAt is a Firestore Timestamp on accounts
                  // created after that field was added - older
                  // accounts without it sort to the end regardless of
                  // direction, rather than clumping at whichever end
                  // a missing-value-as-0 comparison would put them.
                  const aMs = a.enrolledAt?.toMillis ? a.enrolledAt.toMillis() : null;
                  const bMs = b.enrolledAt?.toMillis ? b.enrolledAt.toMillis() : null;
                  if (aMs == null && bMs == null) return 0;
                  if (aMs == null) return 1;
                  if (bMs == null) return -1;
                  return listSort === 'newest' ? bMs - aMs : aMs - bMs;
                }
                return (a.username || a.displayName || '').localeCompare(b.username || b.displayName || '');
              })
              .map((u) => (
                <button
                  key={u.uid}
                  className="btn-ghost"
                  style={{ textAlign: 'left', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 10, padding: '8px 12px' }}
                  onClick={() => openUserFromList(u)}
                >
                  <div
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: '50%',
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 13,
                      fontWeight: 800,
                      color: '#fff',
                      background: u.photoURL ? undefined : 'var(--brand-gradient)',
                      backgroundImage: u.photoURL ? `url(${u.photoURL})` : undefined,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }}
                  >
                    {!u.photoURL && (u.displayName || u.username || '?').trim().charAt(0).toUpperCase()}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
                    <span style={{ fontWeight: 700, fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {u.displayName || '(no name)'}
                      {u.disabled && (
                        <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--red)', border: '1px solid var(--red)', borderRadius: 5, padding: '1px 5px' }}>
                          DISABLED
                        </span>
                      )}
                    </span>
                    <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>{u.username ? `@${u.username} · ` : ''}{u.email || 'no email'}</span>
                    {u.enrolledAt?.toDate && (
                      <span style={{ fontSize: 10.5, color: 'var(--text3)', opacity: 0.75 }}>
                        Joined {u.enrolledAt.toDate().toLocaleDateString('en-US', { dateStyle: 'medium' })}
                      </span>
                    )}
                  </div>
                </button>
              ))}
          </div>
        </div>
      )}

      {initialUid && busy && <div className="std-loading">Loading…</div>}
      {initialUid && error && <div className="auth-msg error" style={{ display: 'block' }}>{error}</div>}

      {result && (
        <div className="aud">
          {!initialUid && (
            <button className="aud-back" onClick={() => { playTapSound(); setResult(null); }}>
              ← {allUsers ? 'Back to list' : 'Back to search'}
            </button>
          )}

          {/* Who is this? */}
          <div className="aud-card stagger-in" style={{ '--stagger-i': 0 }}>
            <div className="aud-hero">
              <div
                className="aud-avatar"
                aria-hidden="true"
                style={result.photoURL ? { backgroundImage: `url(${result.photoURL})` } : undefined}
              >
                {!result.photoURL && (result.displayName || result.username || '?').trim().charAt(0).toUpperCase()}
              </div>
              <div className="aud-hero-text">
                <div className="aud-name">{result.displayName || '(no name)'}</div>
                {result.username && <div className="aud-username">@{result.username}</div>}
                <div className="aud-email">{result.email || 'no email'}</div>
              </div>
            </div>
            <div className="aud-chips">
              {premiumStatus?.isPremium
                ? <span className="aud-chip ok">⭐ Maxx active</span>
                : <span className="aud-chip">Free plan</span>}
              {result.disabled && <span className="aud-chip bad">Account disabled</span>}
            </div>
          </div>

          {/* Quick facts */}
          <div className="aud-stats stagger-in" style={{ '--stagger-i': 1 }}>
            <div className="aud-stat">
              <div className="aud-stat-label">Semester</div>
              <div className="aud-stat-value">{semesterLabel}</div>
            </div>
            <div className="aud-stat">
              <div className="aud-stat-label">Joined</div>
              <div className="aud-stat-value">{formatJoinDate(result.enrolledAt) || 'Unknown'}</div>
            </div>
            <div className="aud-stat">
              <div className="aud-stat-label">Time on site</div>
              <div className="aud-stat-value">{formatDuration(result.totalTimeMs)}</div>
            </div>
            <div className="aud-stat">
              <div className="aud-stat-label">Streak</div>
              <div className="aud-stat-value">🔥 {result.streakCount || 0}</div>
              <div className="aud-stat-sub">Best: {result.longestStreak || 0}</div>
            </div>
          </div>

          {/* Med101 Maxx */}
          <div className="aud-card stagger-in" style={{ '--stagger-i': 2 }}>
            <div className="aud-section-head">
              <div className="aud-section-title">⭐ Med101 Maxx</div>
              {premiumStatus === null
                ? <span className="aud-badge">Checking…</span>
                : premiumStatus.isPremium
                  ? <span className="aud-badge on">Active</span>
                  : <span className="aud-badge">Not active</span>}
            </div>
            <div className="aud-hint">
              {premiumStatus === null
                ? 'Checking subscription status…'
                : premiumStatus.isPremium
                  ? `Until ${premiumStatus.premiumUntil.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })} · ${premiumStatus.premiumSemester ? `${SEMESTER_LABELS[premiumStatus.premiumSemester] || premiumStatus.premiumSemester} only` : 'all semesters'}`
                  : 'No active subscription.'}
            </div>

            <div className="aud-divider" />

            <div className="aud-field-label">Grant access for</div>
            <div className="aud-seg" role="group" aria-label="Grant duration">
              {MAXX_DURATION_PRESETS.map((p) => (
                <button
                  key={p.days}
                  className={maxxDuration === p.days ? 'aud-seg-btn sel' : 'aud-seg-btn'}
                  aria-pressed={maxxDuration === p.days}
                  onClick={() => { playTapSound(); setMaxxDuration(p.days); }}
                >
                  {p.label}
                </button>
              ))}
              <button
                className={maxxDuration === 'custom' ? 'aud-seg-btn sel' : 'aud-seg-btn'}
                aria-pressed={maxxDuration === 'custom'}
                onClick={() => { playTapSound(); setMaxxDuration('custom'); }}
              >
                Custom
              </button>
            </div>
            {maxxDuration === 'custom' && (
              <input
                className="aud-input"
                type="number"
                min="1"
                value={maxxCustomDays}
                onChange={(e) => setMaxxCustomDays(e.target.value)}
                placeholder="Number of days"
                aria-label="Number of days"
              />
            )}

            <button className="aud-primary" onClick={handleGrantMaxx} disabled={maxxBusy}>
              {maxxBusy ? 'Granting…' : `⭐ Grant Maxx · ${maxxDurationLabel}`}
            </button>

            {maxxError && <div className="auth-msg error" style={{ display: 'block' }}>{maxxError}</div>}
            {maxxGrantedCode && (
              <div className="auth-msg success" style={{ display: 'block' }}>
                Granted {maxxGrantedCode.days} days of Med101 Maxx, effective now (code {maxxGrantedCode.code}).
              </div>
            )}
          </div>

          {/* Weakest topics */}
          {result.weakest.length > 0 && (
            <div className="aud-card stagger-in" style={{ '--stagger-i': 3 }}>
              <div className="aud-section-title">Weakest topics</div>
              <div className="aud-hint" style={{ marginBottom: 6 }}>Lowest accuracy, topics with 5+ answers only.</div>
              {result.weakest.map((t) => {
                const color = t.accuracyPct < 50 ? 'var(--red)' : 'var(--amber)';
                return (
                  <div key={t.subtopic} className="aud-topic">
                    <div className="aud-topic-row">
                      <div>
                        <div className="aud-topic-name">{t.subtopic}</div>
                        {t.mainSubject && <div className="aud-topic-sub">{t.mainSubject} · {t.answered} answered</div>}
                      </div>
                      <div className="aud-topic-pct" style={{ color }}>{t.accuracyPct}%</div>
                    </div>
                    <div className="aud-bar" aria-hidden="true">
                      <span style={{ width: `${Math.max(t.accuracyPct, 3)}%`, background: color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Data */}
          <div className="aud-card stagger-in" style={{ '--stagger-i': 4 }}>
            <div className="aud-section-title" style={{ marginBottom: 4 }}>Data</div>
            {exportError && <div className="auth-msg error" style={{ display: 'block' }}>{exportError}</div>}
            {emailExportError && <div className="auth-msg error" style={{ display: 'block' }}>{emailExportError}</div>}
            {emailExportSentTo && <div className="auth-msg success" style={{ display: 'block' }}>Sent to {emailExportSentTo}</div>}
            <div className="aud-actions">
              <button className="aud-action" onClick={handleExportData} disabled={exportBusy}>
                <span className="aud-action-icon" aria-hidden="true">📥</span>
                <span className="aud-action-body">
                  <div className="aud-action-title">{exportBusy ? 'Gathering data…' : 'Download data export'}</div>
                  <div className="aud-action-sub">PDF of everything stored, for a data request</div>
                </span>
              </button>
              <button className="aud-action" onClick={handleEmailExportToUser} disabled={emailExportBusy}>
                <span className="aud-action-icon" aria-hidden="true">✉️</span>
                <span className="aud-action-body">
                  <div className="aud-action-title">{emailExportBusy ? 'Sending…' : 'Email export to student'}</div>
                  <div className="aud-action-sub">Sends the PDF to {result.email || 'their account email'}</div>
                </span>
              </button>
            </div>
          </div>

          {/* Account */}
          <div className="aud-card stagger-in" style={{ '--stagger-i': 5 }}>
            <div className="aud-section-title danger" style={{ marginBottom: 4 }}>Danger zone</div>
            {actionError && <div className="auth-msg error" style={{ display: 'block' }}>{actionError}</div>}
            <div className="aud-actions">
              <button className="aud-action warn" onClick={handleToggleDisabled} disabled={actionBusy}>
                <span className="aud-action-icon" aria-hidden="true">{result.disabled ? '✅' : '🚫'}</span>
                <span className="aud-action-body">
                  <div className="aud-action-title">{actionBusy ? '…' : result.disabled ? 'Enable account' : 'Disable account'}</div>
                  <div className="aud-action-sub">{result.disabled ? 'Let them sign in again' : 'Blocks sign-in; data is kept'}</div>
                </span>
              </button>
              {!confirmingDelete && (
                <button className="aud-action danger" onClick={handleDeleteAccount} disabled={actionBusy}>
                  <span className="aud-action-icon" aria-hidden="true">🗑️</span>
                  <span className="aud-action-body">
                    <div className="aud-action-title">Delete account</div>
                    <div className="aud-action-sub">Permanently removes the account and its data</div>
                  </span>
                </button>
              )}
            </div>
            {confirmingDelete && (
              <div className="aud-confirm" role="alertdialog" aria-label="Confirm account deletion">
                <p>
                  Permanently delete <strong>{result.displayName || result.email || 'this account'}</strong>? This removes the
                  account and all its data and can't be undone.
                </p>
                <div className="aud-confirm-actions">
                  <button className="aud-btn" onClick={() => setConfirmingDelete(false)} disabled={actionBusy}>Cancel</button>
                  <button className="aud-btn danger" onClick={handleDeleteAccount} disabled={actionBusy}>
                    {actionBusy ? 'Deleting…' : 'Yes, delete'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
