import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore';
import { useAuth } from '../lib/AuthContext';
import { db } from '../lib/firebase';
import { playTapSound } from '../lib/sounds';

function timeLabel(value) {
  if (!value?.toDate) return 'Recently';
  const ms = Date.now() - value.toDate().getTime();
  if (ms < 60000) return 'Just now';
  if (ms < 3600000) return Math.floor(ms / 60000) + 'm ago';
  if (ms < 86400000) return Math.floor(ms / 3600000) + 'h ago';
  return Math.floor(ms / 86400000) + 'd ago';
}

export default function NotificationCenterScreen({ onBack, onFriends }) {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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

  async function markRead(item) {
    if (item.read) return;
    try { await updateDoc(doc(db, 'users', user.uid, 'notifications', item.id), { read: true }); }
    catch (e) { setError(e.message || 'Could not update notification.'); }
  }
  async function markAllRead() {
    playTapSound();
    await Promise.all(items.filter(x => !x.read).map(markRead));
  }
  const unread = items.filter(x => !x.read).length;
  return (
    <div className="std-screen">
      <button className="btn-ghost std-back" onClick={() => { playTapSound(); onBack(); }}>← Back</button>
      <div className="std-header">
        <h1 className="std-title">🔔 Notifications</h1>
        <p className="std-sub">Friend activity and important updates from Med101.</p>
      </div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, marginBottom:14 }}>
        <span style={{ color:'var(--text3)', fontSize:13 }}>{unread ? unread + ' unread' : 'You’re all caught up'}</span>
        {unread > 0 && <button className="btn-ghost" style={{padding:'8px 12px'}} onClick={markAllRead}>Mark all read</button>}
      </div>
      {error && <div className="auth-msg error" style={{display:'block',marginBottom:12}}>{error}</div>}
      <div className="glass std-card">
        {loading && <div className="std-loading">Loading notifications…</div>}
        {!loading && !items.length && (
          <div style={{textAlign:'center',padding:'28px 10px'}}>
            <div style={{fontSize:34,marginBottom:8}}>🔔</div>
            <strong>No notifications yet</strong>
            <p style={{color:'var(--text3)',fontSize:14,lineHeight:1.5}}>Friend requests and announcements from the Med101 admin will appear here.</p>
            <button className="btn-ghost" onClick={() => { playTapSound(); onFriends?.(); }}>Open Friends</button>
          </div>
        )}
        {items.map((item,i) => (
          <button key={item.id} onClick={() => { playTapSound(); markRead(item); if (item.kind === 'friendRequest' || item.kind === 'invite') onFriends?.(); else if (item.screen && item.screen !== 'home') window.location.assign('/?open=' + encodeURIComponent(item.screen)); }}
            style={{display:'flex',textAlign:'left',width:'100%',gap:12,padding:'14px 4px',border:0,borderTop:i?'1px solid var(--g-border)':'none',background:item.read?'transparent':'rgba(var(--cyan-rgb),0.09)',color:'var(--text)',cursor:'pointer',fontFamily:'inherit',borderRadius:8}}>
            <span style={{fontSize:23,flexShrink:0}}>{item.kind === 'friendRequest' ? '👥' : item.kind === 'invite' ? '⚔️' : '📢'}</span>
            <span style={{flex:1,minWidth:0}}>
              <span style={{display:'flex',alignItems:'center',gap:8,justifyContent:'space-between'}}>
                <strong style={{fontSize:14,overflowWrap:'anywhere'}}>{item.title || 'Med101 update'}</strong>
                {!item.read && <span style={{width:7,height:7,borderRadius:'50%',background:'var(--cyan)',flexShrink:0}} />}
              </span>
              <span style={{display:'block',fontSize:13,lineHeight:1.5,color:'var(--text2)',marginTop:4,overflowWrap:'anywhere'}}>{item.body || 'Open Med101 to see more.'}</span>
              <span style={{display:'block',fontSize:11,color:'var(--text3)',marginTop:6}}>{timeLabel(item.createdAt)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
