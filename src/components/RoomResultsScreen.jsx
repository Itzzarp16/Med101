import { useEffect, useState } from 'react';
import { fetchRoom, subscribeToParticipants } from '../lib/rooms';
import { useAuth } from '../lib/AuthContext';
import { playTapSound } from '../lib/sounds';

const MEDALS = ['🥇', '🥈', '🥉'];
const LABELS = ['A', 'B', 'C', 'D', 'E'];

export default function RoomResultsScreen({ code, onBack }) {
  const { user } = useAuth();
  const [room, setRoom] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [expandedUid, setExpandedUid] = useState(null);

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

  function toggleExpanded(uid) {
    playTapSound();
    setExpandedUid((prev) => (prev === uid ? null : uid));
  }

  return (
    <div className="std-screen">
      <button className="btn-ghost std-back" onClick={() => { playTapSound(); onBack(); }}>← Back</button>

      <div className="std-header">
        <h1 className="std-title">🏁 Room Results</h1>
        <p className="std-sub">{room ? `${room.mainSubject} · ${room.questions.length} questions · tap anyone for a full breakdown` : 'Loading…'}</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sorted.map((p, i) => {
          const isMe = p.uid === user.uid;
          const isExpanded = expandedUid === p.uid;
          const canExpand = p.finished && Array.isArray(p.answers) && p.answers.length > 0 && room?.questions?.length > 0;
          return (
            <div key={p.uid}>
              <button
                onClick={() => canExpand && toggleExpanded(p.uid)}
                disabled={!canExpand}
                className="glass"
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  border: isMe ? '1px solid rgba(var(--cyan-rgb),0.5)' : undefined,
                  background: isMe ? 'rgba(var(--cyan-rgb),0.06)' : undefined,
                  cursor: canExpand ? 'pointer' : 'default',
                  textAlign: 'left',
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
                {canExpand && (
                  <span style={{ fontSize: 12, color: 'var(--text3)' }}>{isExpanded ? '▲' : '▼'}</span>
                )}
              </button>

              {isExpanded && (
                <div className="results-review-list">
                  {room.questions.map((qq, qi) => {
                    const ua = p.answers?.[qi];
                    const isSkipped = ua === -1;
                    const isTimedOut = ua === -2;
                    const isCorrect = ua === qq.c;
                    const borderColor = (isSkipped || isTimedOut) ? 'var(--pink)' : isCorrect ? 'var(--green)' : 'var(--red)';
                    return (
                      <div key={qi} className="results-review-card" style={{ borderLeftColor: borderColor }}>
                        <div className="results-review-card-head">
                          <span className="results-review-qnum">{qi + 1}. {qq.s}</span>
                          <span className="results-review-status">
                            {isSkipped || isTimedOut ? '⏭️' : isCorrect ? '✅' : '❌'}
                          </span>
                        </div>
                        <p className="results-review-question">{qq.q}</p>
                        <div className="results-review-options">
                          {qq.o.map((opt, oi) => {
                            const isCorrectOpt = oi === qq.c;
                            const isUserPick = oi === ua;
                            return (
                              <div
                                key={oi}
                                className={
                                  isCorrectOpt ? 'results-review-opt correct' :
                                  (isUserPick && !isCorrectOpt) ? 'results-review-opt wrong' :
                                  'results-review-opt'
                                }
                              >
                                <span className="results-review-opt-label">{LABELS[oi]}.</span> {opt}
                                {isCorrectOpt && <span className="results-review-opt-tag correct-tag"> ✓</span>}
                                {isUserPick && !isCorrectOpt && <span className="results-review-opt-tag wrong-tag"> ← {isMe ? 'Your' : `${p.displayName}'s`} answer</span>}
                              </div>
                            );
                          })}
                          {isTimedOut && <div className="results-review-timeout">⏰ Timed out - no answer selected</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
