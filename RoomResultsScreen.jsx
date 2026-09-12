import { useEffect, useState } from 'react';
import { fetchRoom, subscribeToParticipants } from '../lib/rooms';
import { useAuth } from '../lib/AuthContext';
import { playTapSound } from '../lib/sounds';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function RoomResultsScreen({ code, onBack }) {
  const { user } = useAuth();
  const [room, setRoom] = useState(null);
  const [participants, setParticipants] = useState([]);

  useEffect(() => {
    let cancelled = false;
    fetchRoom(code).then((r) => { if (!cancelled) setRoom(r); });
    const unsub = subscribeToParticipants(code, setParticipants);
    return () => { cancelled = true; unsub(); };
  }, [code]);

  const sorted = [...participants].sort((a, b) => {
    if (!!b.finished !== !!a.finished) return (b.finished ? 1 : 0) - (a.finished ? 1 : 0);
    if (!a.finished) return 0;
    if (b.pct !== a.pct) return b.pct - a.pct;
    return (a.timeMs || 0) - (b.timeMs || 0);
  });

  return (
    <div className="std-screen">
      <button className="btn-ghost std-back" onClick={() => { playTapSound(); onBack(); }}>← Back</button>

      <div className="std-header">
        <h1 className="std-title">🏁 Room Results</h1>
        <p className="std-sub">{room ? `${room.mainSubject} · ${room.questions.length} questions` : 'Loading…'}</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sorted.map((p, i) => {
          const isMe = p.uid === user.uid;
          return (
            <div
              key={p.uid}
              className="glass"
              style={{
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                border: isMe ? '1px solid rgba(24,232,255,0.5)' : undefined,
                background: isMe ? 'rgba(24,232,255,0.06)' : undefined,
              }}
            >
              <span style={{ width: 30, fontWeight: 800, fontSize: 15 }}>{p.finished ? (MEDALS[i] || `#${i + 1}`) : '⏳'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text)' }}>
                  {p.displayName}{isMe ? ' (You)' : ''}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                  {p.finished ? `✅ ${p.correct}/${p.total} · ⏱ ${((p.timeMs || 0) / 1000).toFixed(0)}s` : 'Still solving…'}
                </div>
              </div>
              {p.finished && <div style={{ fontWeight: 800, fontSize: 15, color: '#facc15' }}>{p.pct}%</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
