import { useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { addFriendByUsername, removeFriend, subscribeToFriends } from '../lib/friends';
import { playTapSound } from '../lib/sounds';

export default function FriendsScreen({ onBack }) {
  const { user } = useAuth();
  const [friends, setFriends] = useState([]);
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const unsub = subscribeToFriends(user.uid, setFriends);
    return unsub;
  }, [user.uid]);

  async function handleAdd() {
    playTapSound();
    setError(null);
    if (!username.trim()) return;
    setBusy(true);
    try {
      await addFriendByUsername(user.uid, username);
      setUsername('');
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(friendUid) {
    playTapSound();
    await removeFriend(user.uid, friendUid);
  }

  return (
    <div className="std-screen">
      <button className="btn-ghost std-back" onClick={() => { playTapSound(); onBack(); }}>← Back</button>

      <div className="std-header">
        <h1 className="std-title">👥 Friends</h1>
        <p className="std-sub">Add friends by username to compare on a friends-only leaderboard.</p>
      </div>

      <div className="glass std-card">
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="auth-input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. priya_2027"
            style={{ fontFamily: 'var(--font-mono)' }}
          />
          <button className="tpreset sel" style={{ flexShrink: 0, padding: '0 16px' }} onClick={handleAdd} disabled={busy}>
            {busy ? '…' : 'Add'}
          </button>
        </div>
        {error && <div className="auth-msg error" style={{ display: 'block' }}>{error}</div>}
      </div>

      <div className="std-header" style={{ marginTop: 20 }}>
        <h2 className="auth-label" style={{ fontSize: 12 }}>Your Friends ({friends.length})</h2>
      </div>

      {friends.length === 0 ? (
        <div className="glass std-card" style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
          No friends added yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {friends.map((f) => (
            <div key={f.uid} className="glass" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>@{f.username}</span>
              <button onClick={() => handleRemove(f.uid)} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 13 }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
