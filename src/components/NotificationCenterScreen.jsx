import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore';
import { useAuth } from '../lib/AuthContext';
import { db } from '../lib/firebase';
import { playTapSound } from '../lib/sounds';
import {
  acceptFriendRequest, declineFriendRequest,
  subscribeToFriendRequests, subscribeToFriends,
} from '../lib/friends';
import './NotificationCenterScreen.css';

function timeLabel(value) {
  if (!value?.toDate) return 'Just now';
  const ms = Date.now() - value.toDate().getTime();
  if (ms < 60000) return 'Just now';
  if (ms < 3600000) return Math.floor(ms / 60000) + 'm ago';
  if (ms < 86400000) return Math.floor(ms / 3600000) + 'h ago';
  return Math.floor(ms / 86400000) + 'd ago';
}

function isToday(value) {
  if (!value?.toDate) return true; // still being written by the server
  return value.toDate().toDateString() === new Date().toDateString();
}

// Titles arrive with a leading emoji ("👥 Admin wants to be your friend");
// the card draws its own icon, so drop it to avoid showing it twice.
function cleanTitle(title) {
  const t = String(title || '').replace(/^[\p{Extended_Pictographic}️‍\s]+/u, '').trim();
  return t || 'Med101 update';
}

function senderName(item, req) {
  if (req?.fromName) return req.fromName;
  const m = /^(.+?) wants to be your friend/.exec(cleanTitle(item.title));
  return m ? m[1] : 'A student';
}

const KIND = {
  friendRequest: { icon: '👥', tone: 'friend' },
  invite: { icon: '⚔️', tone: 'invite' },
  default: { icon: '📢', tone: 'news' },
};

export default function NotificationCenterScreen({ onBack, onFriends }) {
  const { user, profile } = useAuth();
  const myUsername = profile?.username || '';
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [requests, setRequests] = useState(null); // null until the first snapshot arrives
  const [friends, setFriends] = useState([]);
  const [filter, setFilter] = useState('all'); // 'all' | 'unread'
  const [answering, setAnswering] = useState(null); // notification id being accepted/declined

  useEffect(() => {
    if (!user?.uid) return undefined;
    const q = query(collection(db, 'users', user.uid, 'notifications'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, snap => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
      setError('');
    }, e => {
      setError(e.message || 'Could not load notifications.');
      setLoading(false);
    });
  }, [user?.uid]);

  useEffect(() => (user?.uid ? subscribeToFriendRequests(user.uid, setRequests) : undefined), [user?.uid]);
  useEffect(() => (user?.uid ? subscribeToFriends(user.uid, setFriends) : undefined), [user?.uid]);

  async function markRead(item) {
    if (item.read) return;
    try { await updateDoc(doc(db, 'users', user.uid, 'notifications', item.id), { read: true }); }
    catch (e) { setError(e.message || 'Could not update notification.'); }
  }
  async function markAllRead() {
    playTapSound();
    await Promise.all(items.filter(x => !x.read).map(markRead));
  }

  const pendingFrom = useMemo(() => {
    const map = new Map();
    (requests || []).forEach(r => map.set(r.fromUid || r.id, r));
    return map;
  }, [requests]);
  const friendIds = useMemo(() => new Set(friends.map(f => f.uid)), [friends]);

  async function answer(item, req, accept) {
    playTapSound();
    setAnswering(item.id);
    setError('');
    try {
      if (accept) await acceptFriendRequest(user.uid, myUsername, { fromUid: item.fromUid, fromName: senderName(item, req) });
      else await declineFriendRequest(user.uid, item.fromUid);
      markRead(item);
    } catch (e) {
      setError(e.message || 'Could not answer that request.');
    } finally {
      setAnswering(null);
    }
  }

  function openItem(item) {
    playTapSound();
    markRead(item);
    if (item.kind === 'friendRequest' || item.kind === 'invite') onFriends?.();
    else if (item.screen && item.screen !== 'home') window.location.assign('/?open=' + encodeURIComponent(item.screen));
  }

  const unread = items.filter(x => !x.read).length;
  const waiting = items.filter(x => x.kind === 'friendRequest' && pendingFrom.has(x.fromUid)).length;
  const shown = filter === 'unread' ? items.filter(x => !x.read) : items;
  const groups = [
    { label: 'Today', rows: shown.filter(x => isToday(x.createdAt)) },
    { label: 'Earlier', rows: shown.filter(x => !isToday(x.createdAt)) },
  ].filter(g => g.rows.length);

  let summary = 'You’re all caught up';
  if (waiting) summary = waiting === 1 ? '1 friend request waiting for you' : waiting + ' friend requests waiting for you';
  else if (unread) summary = unread + ' unread';

  let n = 0; // running index for the staggered entrance
  function renderCard(item) {
    const kind = KIND[item.kind] || KIND.default;
    const req = pendingFrom.get(item.fromUid);
    const isFriendReq = item.kind === 'friendRequest';
    const pending = isFriendReq && !!req;
    const name = isFriendReq ? senderName(item, req) : '';
    const busy = answering === item.id;

    let title = cleanTitle(item.title);
    let body = item.body || '';
    if (isFriendReq) {
      title = `${name} wants to be your friend`;
      body = 'Accept to add each other, challenge them and compare on the leaderboard.';
    }

    let resolved = null;
    if (isFriendReq && requests !== null && !pending) {
      resolved = friendIds.has(item.fromUid) ? 'You’re friends now ✓' : 'Request closed';
    }

    return (
      <article key={item.id} className={`nc-card ${kind.tone}${item.read ? '' : ' unread'}`} style={{ '--i': Math.min(n++, 8) }}>
        <div className="nc-main" role="button" tabIndex={0}
          onClick={() => openItem(item)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openItem(item); } }}>
          <span className="nc-icon" aria-hidden="true">
            {isFriendReq ? name.slice(0, 1).toUpperCase() : kind.icon}
            {isFriendReq && <span className="nc-badge">{kind.icon}</span>}
          </span>
          <span className="nc-text">
            <span className="nc-top">
              <strong className="nc-title">{title}</strong>
              {!item.read && <span className="nc-dot" aria-label="Unread" />}
            </span>
            {body && <span className="nc-body">{body}</span>}
            <span className="nc-time">{timeLabel(item.createdAt)}</span>
          </span>
        </div>

        {pending && (
          <div className="nc-actions">
            <button className="nc-btn accept" disabled={busy} onClick={() => answer(item, req, true)}>
              {busy ? 'Working…' : 'Accept'}
            </button>
            <button className="nc-btn decline" disabled={busy} onClick={() => answer(item, req, false)}>Decline</button>
          </div>
        )}
        {resolved && <div className="nc-resolved">{resolved}</div>}
        {item.kind === 'invite' && (
          <div className="nc-actions">
            <button className="nc-btn accept" onClick={() => openItem(item)}>Open challenge</button>
          </div>
        )}
      </article>
    );
  }

  return (
    <div className="std-screen nc-screen">
      <button className="btn-ghost std-back" onClick={() => { playTapSound(); onBack(); }}>← Back</button>
      <div className="std-header">
        <h1 className="std-title">🔔 Notifications</h1>
        <p className="std-sub">Friend activity and important updates from Med101.</p>
      </div>

      <div className="nc-toolbar">
        <div className="nc-seg" role="tablist" aria-label="Filter notifications">
          <span className={`nc-seg-pill${filter === 'unread' ? ' right' : ''}`} />
          <button role="tab" aria-selected={filter === 'all'} className={filter === 'all' ? 'on' : ''}
            onClick={() => { playTapSound(); setFilter('all'); }}>All</button>
          <button role="tab" aria-selected={filter === 'unread'} className={filter === 'unread' ? 'on' : ''}
            onClick={() => { playTapSound(); setFilter('unread'); }}>
            Unread{unread > 0 && <span className="nc-count">{unread}</span>}
          </button>
        </div>
        {unread > 0 && <button className="nc-markall" onClick={markAllRead}>Mark all read</button>}
      </div>
      <div className={`nc-summary${waiting ? ' alert' : ''}`}>{summary}</div>

      {error && <div className="auth-msg error" style={{ display: 'block', marginBottom: 12 }}>{error}</div>}
      {loading && <div className="std-loading">Loading notifications…</div>}

      {!loading && !items.length && (
        <div className="glass nc-empty">
          <div className="nc-empty-icon">🔔</div>
          <strong>No notifications yet</strong>
          <p>Friend requests and announcements from the Med101 admin will appear here.</p>
          <button className="btn-ghost" onClick={() => { playTapSound(); onFriends?.(); }}>Open Friends</button>
        </div>
      )}
      {!loading && items.length > 0 && !shown.length && (
        <div className="glass nc-empty">
          <div className="nc-empty-icon">✅</div>
          <strong>Nothing unread</strong>
          <p>You’ve seen everything. Switch to “All” to look back.</p>
        </div>
      )}

      {groups.map(g => (
        <section key={g.label} className="nc-group">
          <h2 className="nc-group-title">{g.label}</h2>
          <div className="nc-list">{g.rows.map(renderCard)}</div>
        </section>
      ))}
    </div>
  );
}
