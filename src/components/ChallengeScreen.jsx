import { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { createRoom, joinRoom } from '../lib/rooms';
import { playTapSound } from '../lib/sounds';

const TIME_PRESETS = [5, 10, 15, 20, 30];
const COUNT_PRESETS = [
  { label: 'Random 25', value: 25 },
  { label: 'Random 50', value: 50 },
];

function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// mainSubjectMeta/scopedQuestions/subjectGroup come from the currently
// active semester — a room's question set is always drawn from
// whatever the host can currently see.
export default function ChallengeScreen({ mainSubjectMeta, scopedQuestions, subjectGroup, onEnterRoom, onBack }) {
  const { user } = useAuth();
  const [tab, setTab] = useState('create');
  const [subject, setSubject] = useState(Object.keys(mainSubjectMeta || {})[0] || '');
  const [count, setCount] = useState(25);
  const [timeLimit, setTimeLimit] = useState(10);
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleCreate() {
    setError(null);
    const pool = scopedQuestions.filter((q) => subjectGroup[q.s] === subject);
    if (pool.length === 0) {
      setError('This subject has no questions to challenge with.');
      return;
    }
    setBusy(true);
    playTapSound();
    try {
      const questions = shuffled(pool).slice(0, Math.min(count, pool.length))
        .map((q) => ({ s: q.s, q: q.q, o: q.o, c: q.c }));
      const code = await createRoom({
        hostUid: user.uid,
        hostName: user.displayName || user.email,
        mainSubject: subject,
        questions,
        timeLimitMinutes: timeLimit,
      });
      onEnterRoom(code, true);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin() {
    setError(null);
    const code = joinCode.trim();
    if (!/^\d{8}$/.test(code)) {
      setError('Enter the full 8-digit code.');
      return;
    }
    setBusy(true);
    playTapSound();
    try {
      const room = await joinRoom(code, user.uid, user.displayName || user.email);
      if (!room) {
        setError("That code doesn't match any active room.");
        setBusy(false);
        return;
      }
      onEnterRoom(code, false);
    } catch (e) {
      setError(e.message || String(e));
      setBusy(false);
    }
  }

  return (
    <div className="std-screen">
      <button className="btn-ghost std-back" onClick={() => { playTapSound(); onBack(); }}>← Back</button>

      <div className="std-header">
        <h1 className="std-title">👥 Challenge a Friend</h1>
        <p className="std-sub">Practice the exact same questions together and compare scores.</p>
      </div>

      <div className="auth-tabs" style={{ marginBottom: 16 }}>
        <button type="button" className={tab === 'create' ? 'auth-tab active' : 'auth-tab'} onClick={() => { setTab('create'); setError(null); }}>Create Room</button>
        <button type="button" className={tab === 'join' ? 'auth-tab active' : 'auth-tab'} onClick={() => { setTab('join'); setError(null); }}>Join Room</button>
      </div>

      {tab === 'create' ? (
        <div className="glass std-card">
          <label className="auth-label">Subject</label>
          <select className="auth-input" value={subject} onChange={(e) => setSubject(e.target.value)}>
            {Object.keys(mainSubjectMeta || {}).map((name) => (
              <option key={name} value={name}>{mainSubjectMeta[name]?.emoji} {name}</option>
            ))}
          </select>

          <label className="auth-label">Number of Questions</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {COUNT_PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                className={count === p.value ? 'tpreset sel' : 'tpreset'}
                style={{ flex: 1 }}
                onClick={() => { playTapSound(); setCount(p.value); }}
              >
                {p.label}
              </button>
            ))}
          </div>

          <label className="auth-label">Time Limit</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {TIME_PRESETS.map((m) => (
              <button
                key={m}
                type="button"
                className={timeLimit === m ? 'tpreset sel' : 'tpreset'}
                onClick={() => { playTapSound(); setTimeLimit(m); }}
              >
                {m} min
              </button>
            ))}
          </div>

          {error && <div className="auth-msg error" style={{ display: 'block' }}>{error}</div>}

          <button className="btn-glow std-save-btn" onClick={handleCreate} disabled={busy}>
            {busy ? 'Creating…' : 'Create Room →'}
          </button>
        </div>
      ) : (
        <div className="glass std-card">
          <label className="auth-label">8-Digit Room Code</label>
          <input
            className="auth-input"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
            placeholder="e.g. 40928371"
            inputMode="numeric"
            style={{ fontFamily: 'var(--font-mono)', fontSize: 20, letterSpacing: '0.1em', textAlign: 'center' }}
          />

          {error && <div className="auth-msg error" style={{ display: 'block' }}>{error}</div>}

          <button className="btn-glow std-save-btn" onClick={handleJoin} disabled={busy}>
            {busy ? 'Joining…' : 'Join Room →'}
          </button>
        </div>
      )}
    </div>
  );
}
