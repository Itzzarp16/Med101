import { useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import {
  findFriendCandidate, sendFriendRequest, acceptFriendRequest, declineFriendRequest,
  removeFriend, subscribeToFriends, subscribeToFriendRequests,
} from '../lib/friends';
import useLockBodyScroll from '../lib/useLockBodyScroll';
import { playTapSound } from '../lib/sounds';
import ScreenHeader from './ScreenHeader';
import PushPrompt from './PushPrompt';
import './FriendsScreen.css';
import EmptyIllustration from './EmptyIllustration';

// "Send @name a friend request?" - shown after the username is looked up and
// before anything is sent. Cancel / overlay tap / Escape all back out.
function ConfirmAddSheet({ candidate, busy, onCancel, onConfirm }) {
  useLockBodyScroll();
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <div className="fr-confirm-overlay" onClick={onCancel}>
      <div className="glass fr-confirm-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`Send @${candidate.username} a friend request?`}>
        <div className="fr-confirm-avatar" aria-hidden="true">{(candidate.username || '?').charAt(0).toUpperCase()}</div>
        <h3 className="fr-confirm-title">Send @{candidate.username} a request?</h3>
        <p className="fr-confirm-text">
          They'll get a notification and need to accept. Once they do, you'll both be on each other's friends list and can challenge each other.
        </p>
        <div className="fr-confirm-actions">
          <button className="btn-ghost" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className="btn-glow" onClick={onConfirm} disabled={busy} autoFocus>{busy ? '…' : 'Send request'}</button>
        </div>
      </div>
    </div>
  );
}

// Layout, top to bottom: the two actions (Challenge / Leaderboard) first so
// they're visible without scrolling, then adding friends (and sharing your
// own username), then the friends list.
export default function FriendsScreen({ onBack, onChallenge, onLeaderboard, onProfile }) {
  const { user, profile } = useAuth();
  const myUsername = profile?.username || '';
  const [friends, setFriends] = useState([]);
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { type: 'ok' | 'error', text }
  const [copied, setCopied] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(null); // friend uid awaiting a 2nd tap
  const [candidate, setCandidate] = useState(null); // looked-up student awaiting "Send request?" confirmation
  const [requests, setRequests] = useState([]); // incoming friend requests awaiting my answer
  const [answering, setAnswering] = useState(null); // request id being accepted/declined

  useEffect(() => {
    const unsub = subscribeToFriends(user.uid, setFriends);
    return unsub;
  }, [user.uid]);

  useEffect(() => {
    const unsub = subscribeToFriendRequests(user.uid, setRequests);
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
      // Look the student up first; nothing is saved until they confirm.
      const found = await findFriendCandidate(user.uid, username);
      if (friends.some((f) => f.uid === found.uid)) {
        setUsername('');
        setMsg({ type: 'ok', text: `@${found.username} is already your friend.` });
      } else {
        setCandidate(found);
      }
    } catch (e) {
      setMsg({ type: 'error', text: e.message || String(e) });
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmAdd() {
    if (!candidate) return;
    playTapSound();
    setBusy(true);
    try {
      const result = await sendFriendRequest(user.uid, myUsername, candidate);
      setMsg({
        type: 'ok',
        text: result === 'accepted'
          ? `@${candidate.username} had already asked you - you're friends now ✓`
          : `Request sent to @${candidate.username} ✓ They'll show up here once they accept.`,
      });
      setUsername('');
    } catch (e) {
      setMsg({ type: 'error', text: e.message || String(e) });
    } finally {
      setCandidate(null);
      setBusy(false);
    }
  }

  async function handleAnswer(req, accept) {
    playTapSound();
    setAnswering(req.id);
    setMsg(null);
    try {
      if (accept) {
        await acceptFriendRequest(user.uid, myUsername, req);
        setMsg({ type: 'ok', text: `You and @${req.fromName} are friends now ✓` });
      } else {
        await declineFriendRequest(user.uid, req.fromUid);
      }
    } catch (e) {
      setMsg({ type: 'error', text: e.message || String(e) });
    } finally {
      setAnswering(null);
    }
  }

  function handleCancelAdd() {
    playTapSound();
    setCandidate(null);
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
      {candidate && (
        <ConfirmAddSheet candidate={candidate} busy={busy} onCancel={handleCancelAdd} onConfirm={handleConfirmAdd} />
      )}
      <ScreenHeader onBack={onBack} title={<>👥 Friends</>}>
        Challenge friends and see who's ahead.
      </ScreenHeader>

      <PushPrompt />

      {/* The two things people come here to DO sit right under the title,
          so they're visible without scrolling. */}
      <div className="fr-tiles">
        <button className="glass fr-tile" onClick={() => { playTapSound(); onChallenge?.(null); }}>
          <span className="fr-tile-icon">⚔️</span>
          <span className="fr-tile-title">Challenge</span>
          <span className="fr-tile-desc">Same questions, live scores. Create or join a room.</span>
        </button>
        <button className="glass fr-tile" onClick={() => { playTapSound(); onLeaderboard?.(); }}>
          <span className="fr-tile-icon">🏆</span>
          <span className="fr-tile-title">Leaderboard</span>
          <span className="fr-tile-desc">See who's ahead, just among your friends.</span>
        </button>
      </div>

      {/* incoming requests - they only become friends once I accept */}
      {requests.length > 0 && (
        <>
          <div className="fr-section">Friend requests ({requests.length})</div>
          <div className="fr-list">
            {requests.map((r) => (
              <div key={r.id} className="glass fr-row fr-request stagger-in">
                <div className="fr-avatar" aria-hidden="true">{(r.fromName || '?').charAt(0).toUpperCase()}</div>
                <div className="fr-row-name">@{r.fromName}</div>
                <button className="btn-ghost fr-small-btn" onClick={() => handleAnswer(r, false)} disabled={answering === r.id}>
                  Decline
                </button>
                <button className="btn-glow fr-small-btn" onClick={() => handleAnswer(r, true)} disabled={answering === r.id}>
                  {answering === r.id ? '…' : 'Accept'}
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* add a friend + share my own username */}
      <div className="fr-section">Add a friend</div>
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

        <div className="fr-divider" />
        {myUsername ? (
          <>
            <div className="fr-me-label">Your username - friends type this to send you a request</div>
            <div className="fr-me">
              <div className="fr-me-name">@{myUsername}</div>
              <div className="fr-btn-row">
                <button className="btn-ghost fr-small-btn" onClick={handleCopy}>{copied ? 'Copied ✓' : 'Copy'}</button>
                {typeof navigator !== 'undefined' && navigator.share && (
                  <button className="btn-glow fr-small-btn" onClick={handleShare}>Share</button>
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="fr-me-label">You haven't picked a username yet, so friends can't find you.</div>
            <button className="btn-glow fr-small-btn" style={{ marginTop: 10 }} onClick={() => { playTapSound(); onProfile?.(); }}>
              Pick a username
            </button>
          </>
        )}
      </div>

      {/* friends list */}
      <div className="fr-section">Your friends ({friends.length})</div>
      {friends.length === 0 ? (
        <div className="glass std-card empty-state">
          <EmptyIllustration kind="friends" />
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
    </div>
  );
}
