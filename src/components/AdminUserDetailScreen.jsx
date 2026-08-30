import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { lookupUsername } from '../lib/invites';
import { playTapSound } from '../lib/sounds';

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
// student — e.g. tapping their name in the admin "who's online" list —
// skipping the username search entirely.
export default function AdminUserDetailScreen({ onBack, initialUid }) {
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(!!initialUid);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

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
      <button className="btn-ghost std-back" onClick={() => { playTapSound(); onBack(); }}>← Back</button>

      <div className="std-header">
        <h1 className="std-title">🔍 View User Detail</h1>
        <p className="std-sub">Look up a student by their unique username.</p>
      </div>

      {!initialUid && (
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
        </div>
      )}

      {initialUid && busy && <div className="std-loading">Loading…</div>}
      {initialUid && error && <div className="auth-msg error" style={{ display: 'block' }}>{error}</div>}

      {result && (
        <div className="glass std-card" style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--text)' }}>{result.displayName || '(no name)'}</div>
          <div style={{ fontSize: 12.5, color: 'var(--text3)' }}>{result.username ? `@${result.username} · ` : ''}{result.email}</div>
          <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 6 }}>
            Enrolled: <strong>{result.enrolledYearSemester || '—'}</strong>
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
        </div>
      )}
    </div>
  );
}
