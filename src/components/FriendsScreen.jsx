import { useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { addFriendByUsername, removeFriend, subscribeToFriends } from '../lib/friends';
import { playTapSound } from '../lib/sounds';
import ScreenHeader from './ScreenHeader';
import './FriendsScreen.css';

// Laid out as three plain steps so it reads top to bottom:
//   1. your own username (how friends find YOU)
//   2. add a friend (how YOU find them)
//   3. your friends, then what you can do together.
export default function FriendsScreen({ onBack, onChallenge, onLeaderboard, onProfile }) {
  const { user, profile } = useAuth();
  const myUsername = profile?.username || '';
  const [friends, setFriends] = useState([]);
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { type: 'ok' | 'error', text }
  const [copied, setCopied] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(null); // friend uid awaiting a 2nd tap

  useEffect(() => {
    const unsub = subscribeToFriends(user.uid, setFriends);
    return unsub;
  }, [user.uid]);

  async function handleAdd() {
    playTapSound();
    setMsg(null);
    if (!username.trim()) {
      setMsg({ type: 'error', text: "Type your friend's username first." });
      return;
    }
    setBusy(true);
    try {
      const alreadyFriends = friends.map((f) => f.uid);
      const found = await addFriendByUsername(user.uid, username);
      setUsername('');
      setMsg({
        type: 'ok',
        text: alreadyFriends.includes(found.uid)
          ? `@${found.username} is already your friend.`
          : `Added @${found.username} ✓`,
      });
    } catch (e) {
      setMsg({ type: 'error', text: e.message || String(e) });
    } finally {
      setBusy(false);
    }
  }

  function handleRemoveTap(friendUid) {
    playTapSound();
    if (confirmRemove === friendUid) {
      setConfirmRemove(null);
      removeFriend(user.uid, friendUid);
      return;
    }
    setConfirmRemove(friendUid);
    setTimeout(() => setConfirmRemove((c) => (c === friendUid ? null : c)), 3000);
  }

  async function handleCopy() {
    playTapSound();
    try {
      await navigator.clipboard.writeText(myUsername);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked - nothing useful to do */
    }
  }

  function handleShare() {
    playTapSound();
    const text = `Add me on Med101! My username is ${myUsername}`;
    if (navigator.share) {
      navigator.share({ title: 'Med101', text, url: window.location.origin }).catch(() => {});
    } else {
      handleCopy();
    }
  }

  return (
    <div className="std-screen">
      <ScreenHeader onBack={onBack} title={<>👥 Friends</>}>
        Add people you study with, then compete or challenge them.
      </ScreenHeader>

      {/* 1 - your username */}
      <div className="fr-step"><span className="fr-step-num">1</span><span className="fr-step-title">Share your username</span></div>
      <div className="glass std-card">
        {myUsername ? (
          <>
            <div className="fr-me">
              <div className="fr-me-name">@{myUsername}</div>
              <div className="fr-btn-row">
                <button className="btn-ghost fr-small-btn" onClick={handleCopy}>{copied ? 'Copied ✓' : 'Copy'}</button>
                {typeof navigator !== 'undefined' && navigator.share && (
                  <button className="btn-glow fr-small-btn" onClick={handleShare}>Share</button>
                )}
              </div>
            </div>
            <p className="fr-note">Friends type this to add you. You can change it in Your Profile.</p>
          </>
        ) : (
          <>
            <p className="fr-note" style={{ marginTop: 0 }}>You haven't picked a username yet, so friends can't find you.</p>
            <button className="btn-glow fr-small-btn" style={{ marginTop: 10 }} onClick={() => { playTapSound(); onProfile?.(); }}>
              Pick a username
            </button>
          </>
        )}
      </div>

      {/* 2 - add a friend */}
      <div className="fr-step"><span className="fr-step-num">2</span><span className="fr-step-title">Add a friend</span></div>
      <div className="glass std-card">
        <label className="auth-label" htmlFor="friend-username">Their username</label>
        <div className="fr-add-row">
          <div className="fr-at-wrap">
            <span className="fr-at">@</span>
            <input
              id="friend-username"
              className="auth-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
              placeholder="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
          <button className="btn-glow fr-add-btn" onClick={handleAdd} disabled={busy}>
            {busy ? '…' : 'Add'}
          </button>
        </div>
        {msg && <div className={`fr-msg ${msg.type}`} role="status">{msg.text}</div>}
        <p className="fr-note">Ask them to open Your Profile - their username is shown there.</p>
      </div>

      {/* 3 - your friends */}
      <div className="fr-step"><span className="fr-step-num">3</span><span className="fr-step-title">Your friends ({friends.length})</span></div>
      {friends.length === 0 ? (
        <div className="glass std-card empty-state">
          <div className="empty-state-icon">👥</div>
          <div>No friends yet</div>
          <div className="fr-note" style={{ marginTop: 6 }}>Add someone above, or send them your username.</div>
        </div>
      ) : (
        <div className="fr-list">
          {friends.map((f, i) => (
            <div key={f.uid} className="glass fr-row stagger-in" style={{ '--stagger-i': Math.min(i, 8) }}>
              <div className="fr-avatar" aria-hidden="true">{(f.username || '?').charAt(0).toUpperCase()}</div>
              <div className="fr-row-name">@{f.username}</div>
              <button className="btn-ghost fr-small-btn" onClick={() => { playTapSound(); onChallenge?.(f); }}>
                Challenge
              </button>
              <button
                className={confirmRemove === f.uid ? 'fr-remove confirm' : 'fr-remove'}
                onClick={() => handleRemoveTap(f.uid)}
                aria-label={`Remove @${f.username} from friends`}
              >
                {confirmRemove === f.uid ? 'Remove?' : '✕'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* what to do with them */}
      <div className="fr-step" style={{ marginTop: 24 }}><span className="fr-step-title">Do something together</span></div>
      <div className="fr-actions">
        <button className="glass fr-action" onClick={() => { playTapSound(); onLeaderboard?.(); }}>
          <span className="fr-action-icon">🏆</span>
          <span>
            <span className="fr-action-title">Friends leaderboard</span>
            <span className="fr-action-desc">See who is ahead, just among your friends.</span>
          </span>
          <span className="fr-action-chev">›</span>
        </button>
        <button className="glass fr-action" onClick={() => { playTapSound(); onChallenge?.(null); }}>
          <span className="fr-action-icon">⚔️</span>
          <span>
            <span className="fr-action-title">Challenge room</span>
            <span className="fr-action-desc">Everyone answers the same questions. Create a room or join one with a code.</span>
          </span>
          <span className="fr-action-chev">›</span>
        </button>
      </div>
    </div>
  );
}
