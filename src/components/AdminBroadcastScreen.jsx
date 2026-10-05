import { useEffect, useMemo, useState } from 'react';
import { auth } from '../lib/firebase';
import { SEMESTER_ORDER } from '../lib/academicCalendar';
import { playTapSound } from '../lib/sounds';

async function callApi(body) {
  const idToken = await auth.currentUser.getIdToken();
  const res = await fetch('/api/admin/send-broadcast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const semLabel = (id) => `Semester ${SEMESTER_ORDER.indexOf(id) + 1}`;

const SCREENS = [
  { value: 'home', label: 'Home' },
  { value: 'leaderboard', label: 'Leaderboard' },
  { value: 'challenge', label: 'Challenge a Friend' },
  { value: 'friends', label: 'Friends' },
  { value: 'weak-topics', label: 'Weak Topics' },
  { value: 'history', label: 'Quiz History' },
];

const TEMPLATES = [
  { icon: '📚', name: 'New questions', title: '📚 New questions added', body: 'Fresh questions are now live. Open Med101 and give them a try!', screen: 'home' },
  { icon: '📅', name: 'Exam reminder', title: '📅 Exam reminder', body: 'Your exam is coming up. A quick quiz today keeps the marks coming.', screen: 'home' },
  { icon: '🏆', name: 'Leaderboard', title: '🏆 Leaderboard is moving', body: 'Check where you rank this week and climb a few spots.', screen: 'leaderboard' },
  { icon: '⚔️', name: 'Challenge', title: '⚔️ Challenge a friend', body: 'Start a quiz room and see who scores higher.', screen: 'challenge' },
  { icon: '🔧', name: 'Maintenance', title: '🔧 Short maintenance', body: 'Med101 may be briefly unavailable. Thanks for your patience!', screen: 'home' },
];

function ago(iso) {
  if (!iso) return '';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const chip = (active, disabled) => ({
  padding: '8px 12px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
  border: `1px solid ${active ? 'var(--amber)' : 'var(--g-border)'}`,
  background: active ? 'rgba(255, 204, 42, 0.16)' : 'transparent',
  color: 'var(--text)', opacity: disabled ? 0.4 : 1, fontFamily: 'inherit',
});

const labelStyle = { display: 'block', marginTop: 14, marginBottom: 6 };
const countStyle = { fontSize: 12, opacity: 0.6, textAlign: 'right', marginTop: 4 };

export default function AdminBroadcastScreen({ onBack, hideBack = false }) {
  const [audType, setAudType] = useState('all'); // all | semesters | student
  const [sems, setSems] = useState([]);
  const [username, setUsername] = useState('');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [screen, setScreen] = useState('home');

  const [stats, setStats] = useState(null);
  const [statsErr, setStatsErr] = useState('');
  const [history, setHistory] = useState(null);
  const [busy, setBusy] = useState(null); // 'send' | 'test' | null
  const [result, setResult] = useState(null); // { type, text }

  function loadStats() {
    setStatsErr('');
    callApi({ action: 'stats' }).then(setStats).catch((e) => setStatsErr(e.message || String(e)));
  }
  function loadHistory() {
    callApi({ action: 'history' }).then((r) => setHistory(r.history)).catch(() => setHistory([]));
  }
  useEffect(() => { loadStats(); loadHistory(); }, []);

  const reach = useMemo(() => {
    if (!stats) return null;
    if (audType === 'all') return { devices: stats.devices, students: stats.students };
    if (audType === 'semesters') {
      return sems.reduce((a, s) => ({
        devices: a.devices + (stats.bySemester[s]?.devices || 0),
        students: a.students + (stats.bySemester[s]?.students || 0),
      }), { devices: 0, students: 0 });
    }
    return null; // single student: checked server-side on send
  }, [stats, audType, sems]);

  const audience = audType === 'semesters'
    ? { type: 'semesters', semesters: sems }
    : audType === 'student' ? { type: 'student', username } : { type: 'all' };
  const audienceText = audType === 'all' ? 'all students'
    : audType === 'semesters' ? sems.map((s) => semLabel(s)).join(' + ')
      : `@${username.replace(/^@/, '')}`;

  const audienceReady = audType === 'all' || (audType === 'semesters' && sems.length > 0)
    || (audType === 'student' && username.trim().length > 0);
  const canSend = !busy && title.trim() && message.trim() && audienceReady
    && !(reach && reach.devices === 0);

  function toggleSem(id) {
    playTapSound();
    setSems((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  function applyTemplate(t) {
    playTapSound();
    setTitle(t.title); setMessage(t.body); setScreen(t.screen); setResult(null);
  }

  async function run(action) {
    playTapSound();
    setResult(null);
    if (action === 'send') {
      const n = reach ? `${reach.devices} device${reach.devices === 1 ? '' : 's'}` : 'this student';
      if (!window.confirm(`Send to ${audienceText} (${n})? This cannot be undone.`)) return;
    }
    setBusy(action);
    try {
      const r = await callApi({ action, title, body: message, screen, audience });
      if (r.reason === 'no-devices') {
        setResult({ type: 'error', text: action === 'test'
          ? 'You have not turned on notifications on any device yet (Settings → Notifications).'
          : 'Nobody in that audience has notifications turned on.' });
      } else if (action === 'test') {
        setResult({ type: 'success', text: `Test sent to ${r.sent} of your device${r.devices === 1 ? '' : 's'}.` });
      } else {
        setResult({ type: 'success', text: `Delivered to ${r.sent} of ${r.devices} devices (${r.students} student${r.students === 1 ? '' : 's'}).${r.failed ? ` ${r.failed} failed.` : ''}` });
        setTitle(''); setMessage('');
        loadStats(); loadHistory();
      }
    } catch (e) {
      setResult({ type: 'error', text: e.message || String(e) });
    } finally {
      setBusy(null);
    }
  }

  const segBtn = (id, text) => (
    <button key={id} style={chip(audType === id)} onClick={() => { playTapSound(); setAudType(id); setResult(null); }}>{text}</button>
  );

  return (
    <div className="std-screen">
      {!hideBack && (
        <button className="btn-ghost std-back" onClick={() => { playTapSound(); onBack(); }}>← Back</button>
      )}
      <div className="std-header">
        <h1 className="std-title">🔔 Send Notification</h1>
        <p className="std-sub">Push a message to students who have notifications turned on.</p>
      </div>

      <div className="bc-grid">
      <div className="bc-aud">
      {/* 1. Audience */}
      <div className="glass std-card">
        <label className="auth-label" style={{ marginTop: 0 }}>Send to</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {segBtn('all', 'All students')}
          {segBtn('semesters', 'By semester')}
          {segBtn('student', 'One student')}
        </div>

        {audType === 'semesters' && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            {SEMESTER_ORDER.map((id) => {
              const d = stats?.bySemester[id]?.devices;
              const empty = stats && !d;
              return (
                <button key={id} style={chip(sems.includes(id), empty)} disabled={empty} onClick={() => toggleSem(id)}>
                  {semLabel(id)}{stats ? ` · ${d || 0}` : ''}
                </button>
              );
            })}
          </div>
        )}

        {audType === 'student' && (
          <input className="auth-input" style={{ marginTop: 12 }} value={username} onChange={(e) => setUsername(e.target.value)}
            placeholder="Their unique username" autoCapitalize="none" autoCorrect="off" />
        )}

        <div style={{ ...countStyle, textAlign: 'left', marginTop: 12 }}>
          {statsErr ? <>Couldn&apos;t load reach: {statsErr} <button className="btn-ghost" style={{ padding: '2px 8px' }} onClick={loadStats}>Retry</button></>
            : !stats ? 'Counting devices…'
              : audType === 'student' ? `${stats.devices} devices in total across ${stats.students} students`
                : reach ? `Reaches ${reach.devices} device${reach.devices === 1 ? '' : 's'} · ${reach.students} student${reach.students === 1 ? '' : 's'}` : ''}
          {stats && !statsErr && (
            <button className="btn-ghost" style={{ padding: '2px 8px', marginLeft: 8 }} onClick={() => { playTapSound(); loadStats(); }}>↻</button>
          )}
        </div>
        {audType === 'semesters' && (
          <div style={{ ...countStyle, textAlign: 'left' }}>Counts use each student&apos;s current semester (their enrolled semester moved forward by the academic calendar).</div>
        )}
      </div>

      </div>

      <div className="bc-msg">
      {/* 2. Message */}
      <div className="glass std-card" style={{ marginTop: 14 }}>
        <label className="auth-label" style={{ marginTop: 0 }}>Quick start</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {TEMPLATES.map((t) => (
            <button key={t.name} style={chip(false)} onClick={() => applyTemplate(t)}>{t.icon} {t.name}</button>
          ))}
        </div>

        <label className="auth-label" style={labelStyle}>Title</label>
        <input className="auth-input" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. 📚 New Histology questions" />
        <div style={countStyle}>{title.length}/60</div>

        <label className="auth-label" style={labelStyle}>Message</label>
        <textarea className="auth-input" rows={3} maxLength={200} value={message} onChange={(e) => setMessage(e.target.value)}
          placeholder="Keep it short - it shows on the lock screen" style={{ resize: 'vertical', fontFamily: 'inherit' }} />
        <div style={countStyle}>{message.length}/200</div>

        <label className="auth-label" style={labelStyle}>Tapping it opens</label>
        <select className="auth-input" value={screen} onChange={(e) => setScreen(e.target.value)}>
          {SCREENS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      </div>

      <div className="bc-prev">
      {/* 3. Preview */}
      <div style={{ margin: '14px 4px 0', fontSize: 12, opacity: 0.6, letterSpacing: 1 }}>PREVIEW</div>
      <div className="glass std-card" style={{ marginTop: 6, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <img src="/icon-192.png" alt="" width="40" height="40" style={{ borderRadius: 10, flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, opacity: 0.6 }}>Med101 · now</div>
          <div style={{ fontWeight: 700, marginTop: 2, wordBreak: 'break-word' }}>{title || 'Your title appears here'}</div>
          <div style={{ fontSize: 14, opacity: 0.85, marginTop: 2, wordBreak: 'break-word' }}>{message || 'Your message appears here.'}</div>
        </div>
      </div>

      </div>

      <div className="bc-act">
      {/* 4. Actions */}
      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <button className="btn-ghost" style={{ flex: 1 }} disabled={!!busy || !title.trim() || !message.trim()} onClick={() => run('test')}>
          {busy === 'test' ? 'Sending…' : 'Send test to me'}
        </button>
        <button className="btn-glow" style={{ flex: 2 }} disabled={!canSend} onClick={() => run('send')}>
          {busy === 'send' ? 'Sending…' : `Send to ${audType === 'all' ? 'everyone' : audType === 'semesters' ? 'selected semesters' : 'student'}`}
        </button>
      </div>
      {result && (
        <div className={`auth-msg ${result.type}`} style={{ display: 'block', marginTop: 12 }}>{result.text}</div>
      )}

      </div>

      <div className="bc-hist">
      {/* 5. History */}
      <div style={{ margin: '22px 4px 6px', fontSize: 12, opacity: 0.6, letterSpacing: 1 }}>RECENTLY SENT</div>
      <div className="glass std-card">
        {history === null && <div style={{ opacity: 0.6 }}>Loading…</div>}
        {history && history.length === 0 && <div style={{ opacity: 0.6 }}>Nothing sent yet.</div>}
        {history && history.map((h, i) => (
          <div key={h.id} style={{ padding: '10px 0', borderTop: i ? '1px solid var(--g-border)' : 'none' }}>
            <div style={{ fontWeight: 600, wordBreak: 'break-word' }}>{h.title}</div>
            <div style={{ fontSize: 13, opacity: 0.8, wordBreak: 'break-word' }}>{h.body}</div>
            <div style={{ fontSize: 12, opacity: 0.55, marginTop: 4 }}>
              {h.audience} · {h.sent}/{h.devices} delivered · {ago(h.sentAt)}
            </div>
            <button className="btn-ghost" style={{ padding: '2px 10px', marginTop: 6, fontSize: 12 }}
              onClick={() => { playTapSound(); setTitle(h.title || ''); setMessage(h.body || ''); setScreen(h.screen || 'home'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
              Reuse
            </button>
          </div>
        ))}
      </div>
      </div>
      </div>
    </div>
  );
}
