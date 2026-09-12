import { useEffect, useState } from 'react';
import { fetchRoom, subscribeToParticipants } from '../lib/rooms';
import { lookupUsername, sendInvite } from '../lib/invites';
import { useAuth } from '../lib/AuthContext';
import { playTapSound } from '../lib/sounds';

export default function RoomLobbyScreen({ code, isHost, onStart, onViewResults, onBack }) {
  const { user } = useAuth();
  const [room, setRoom] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [copied, setCopied] = useState(false);
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteMsg, setInviteMsg] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchRoom(code).then((r) => { if (!cancelled) setRoom(r); });
    const unsub = subscribeToParticipants(code, setParticipants);
    return () => { cancelled = true; unsub(); };
  }, [code]);

  const me = participants.find((p) => p.uid === user.uid);
  const alreadyFinished = me?.finished;

  function handleCopy() {
    playTapSound();
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  async function handleInvite() {
    playTapSound();
    setInviteMsg(null);
    if (!inviteUsername.trim()) return;
    setInviteBusy(true);
    try {
      const target = await lookupUsername(inviteUsername);
      if (!target) {
        setInviteMsg({ type: 'error', text: "No one has that username." });
        return;
      }
      await sendInvite({
        fromUid: user.uid,
        fromName: user.displayName || user.email,
        toUid: target.uid,
        roomCode: code,
        mainSubject: room?.mainSubject,
      });
      setInviteMsg({ type: 'success', text: `Invite sent to @${target.username}!` });
      setInviteUsername('');
    } catch (e) {
      setInviteMsg({ type: 'error', text: e.message || String(e) });
    } finally {
      setInviteBusy(false);
    }
  }

  return (
    <div className="std-screen">
      <button className="btn-ghost std-back" onClick={() => { playTapSound(); onBack(); }}>← Back</button>

      <div className="std-header">
        <h1 className="std-title">👥 {room?.mainSubject || 'Challenge Room'}</h1>
        <p className="std-sub">
          {room ? `${room.questions.length} questions · ${room.timeLimitMinutes} min limit` : 'Loading…'}
        </p>
      </div>

      <div className="glass std-card" style={{ alignItems: 'center', textAlign: 'center' }}>
        <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Room Code</div>
        <div
          style={{ fontFamily: 'var(--font-mono)', fontSize: 32, fontWeight: 800, color: 'var(--cyan)', letterSpacing: '0.12em', cursor: 'pointer' }}
          onClick={handleCopy}
        >
          {code}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text3)' }}>{copied ? 'Copied!' : 'Tap to copy · share this with friends'}</div>
      </div>

      <div className="glass std-card" style={{ marginTop: 14 }}>
        <label className="auth-label">Or Invite by Username</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="auth-input"
            value={inviteUsername}
            onChange={(e) => setInviteUsername(e.target.value)}
            placeholder="e.g. priya_2027"
            style={{ fontFamily: 'var(--font-mono)' }}
          />
          <button className="tpreset sel" style={{ flexShrink: 0, padding: '0 16px' }} onClick={handleInvite} disabled={inviteBusy}>
            {inviteBusy ? '…' : 'Invite'}
          </button>
        </div>
        {inviteMsg && <div className={`auth-msg ${inviteMsg.type}`} style={{ display: 'block' }}>{inviteMsg.text}</div>}
      </div>

      <div className="std-header" style={{ marginTop: 20 }}>
        <h2 className="auth-label" style={{ fontSize: 12 }}>Who's here ({participants.length})</h2>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {participants.map((p) => (
          <div key={p.uid} className="glass" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>
              {p.displayName}{p.uid === user.uid ? ' (You)' : ''}{p.uid === room?.hostUid ? ' 👑' : ''}
            </span>
            <span style={{ fontSize: 11.5, color: p.finished ? 'var(--green)' : 'var(--text3)' }}>
              {p.finished ? `✅ ${p.pct}%` : '⏳ In progress'}
            </span>
          </div>
        ))}
      </div>

      {alreadyFinished ? (
        <button className="btn-glow std-save-btn" onClick={() => { playTapSound(); onViewResults(); }}>
          View Results →
        </button>
      ) : (
        <button className="btn-glow std-save-btn" onClick={() => { playTapSound(); onStart(room); }} disabled={!room}>
          Start Challenge →
        </button>
      )}
    </div>
  );
}
