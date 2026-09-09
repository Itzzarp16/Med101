import { useEffect, useState } from 'react';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { lookupUsername } from '../lib/invites';
import { playTapSound } from '../lib/sounds';
import { formatDuration } from '../lib/timeTracking';
import { setAccountDisabled, deleteAccount } from '../lib/adminAccountActions';

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
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(!!initialUid);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

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
    setResult(buildResult(u.uid, u.username || null, u));
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
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', initialUid));
        if (cancelled) return;
        if (!snap.exists()) {
          setError('User profile not found.');
          return;
        }
        const data = snap.data();
        setResult(buildResult(initialUid, data.username || null, data));
      } catch (e) {
        if (!cancelled) setError(e.message || String(e));
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [initialUid]);

  async function handleSearch() {
    playTapSound();
    setError(null);
    setResult(null);
    setConfirmingDelete(false);
    setActionError(null);
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

  return (
    <div className="std-screen">
      {!hideBack && (
        <button className="btn-ghost std-back" onClick={() => { playTapSound(); onBack(); }}>← Back</button>
      )}

      <div className="std-header">
        <h1 className="std-title">🔍 View User Detail</h1>
        <p className="std-sub">Look up a student by their unique username.</p>
      </div>

      {!initialUid && !result && (
        <div className="glass std-card">
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="auth-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. priya_2027"
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
          <input
            className="auth-input"
            value={listFilter}
            onChange={(e) => setListFilter(e.target.value)}
            placeholder="Filter by name, username, or email…"
            style={{ marginTop: 8 }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10, maxHeight: 420, overflowY: 'auto' }}>
            {allUsers
              .filter((u) => {
                const q = listFilter.trim().toLowerCase();
                if (!q) return true;
                return (u.username || '').toLowerCase().includes(q)
                  || (u.displayName || '').toLowerCase().includes(q)
                  || (u.email || '').toLowerCase().includes(q);
              })
              .map((u) => (
                <button
                  key={u.uid}
                  className="btn-ghost"
                  style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '8px 12px' }}
                  onClick={() => openUserFromList(u)}
                >
                  <span style={{ fontWeight: 700, fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {u.displayName || '(no name)'}
                    {u.disabled && (
                      <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--red)', border: '1px solid var(--red)', borderRadius: 5, padding: '1px 5px' }}>
                        DISABLED
                      </span>
                    )}
                  </span>
                  <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>{u.username ? `@${u.username} · ` : ''}{u.email || 'no email'}</span>
                </button>
              ))}
          </div>
        </div>
      )}

      {initialUid && busy && <div className="std-loading">Loading…</div>}
      {initialUid && error && <div className="auth-msg error" style={{ display: 'block' }}>{error}</div>}

      {result && (
        <div className="glass std-card" style={{ marginTop: 14 }}>
          {!initialUid && (
            <button
              className="btn-ghost"
              style={{ marginBottom: 12, padding: '6px 12px', fontSize: 12.5 }}
              onClick={() => { playTapSound(); setResult(null); }}
            >
              ← {allUsers ? 'Back to list' : 'Back to search'}
            </button>
          )}
          <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
            {result.displayName || '(no name)'}
            {result.disabled && (
              <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--red)', border: '1px solid var(--red)', borderRadius: 6, padding: '2px 6px' }}>
                DISABLED
              </span>
            )}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text3)' }}>{result.username ? `@${result.username} · ` : ''}{result.email}</div>
          <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 6 }}>
            Enrolled: <strong>{result.enrolledYearSemester || '-'}</strong>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 2 }}>
            Joined: <strong>{formatJoinDate(result.enrolledAt) || 'Unknown'}</strong>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 2 }}>
            Time spent on site: <strong>{formatDuration(result.totalTimeMs)}</strong>
          </div>

          {result.weakest.length > 0 && (
            <>
              <div className="auth-label" style={{ marginTop: 14 }}>Weakest Topics</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {result.weakest.map((t) => (
                  <div key={t.subtopic} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                    <span style={{ color: 'var(--text2)' }}>{t.subtopic}</span>
                    <span style={{ color: t.accuracyPct < 50 ? 'var(--red)' : 'var(--amber)', fontWeight: 700 }}>{t.accuracyPct}%</span>
                  </div>
                ))}
              </div>
            </>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 18, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            {actionError && <div className="auth-msg error" style={{ display: 'block' }}>{actionError}</div>}
            <button className="btn-ghost" style={{ width: '100%' }} onClick={handleToggleDisabled} disabled={actionBusy}>
              {actionBusy ? '…' : result.disabled ? '✅ Enable Account' : '🚫 Disable Account'}
            </button>
            <button
              className="btn-ghost"
              style={{ width: '100%', color: 'var(--red)', borderColor: confirmingDelete ? 'var(--red)' : undefined }}
              onClick={handleDeleteAccount}
              disabled={actionBusy}
            >
              {actionBusy ? '…' : confirmingDelete ? '⚠️ Tap again to permanently delete' : '🗑️ Delete Account'}
            </button>
            {confirmingDelete && (
              <button className="btn-ghost" style={{ width: '100%', fontSize: 12 }} onClick={() => setConfirmingDelete(false)}>
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
