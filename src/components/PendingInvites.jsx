import { useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { subscribeToMyInvites, dismissInvite } from '../lib/invites';
import { playTapSound } from '../lib/sounds';

export default function PendingInvites({ onAccept }) {
  const { user } = useAuth();
  const [invites, setInvites] = useState([]);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToMyInvites(user.uid, setInvites);
    return () => unsub();
  }, [user]);

  if (invites.length === 0) return null;

  return (
    <div className="glass std-card" style={{ maxWidth: 640, margin: '16px auto 0', borderColor: 'rgba(24,232,255,0.35)' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>👥 Challenge Invites</div>
      {invites.map((inv) => (
        <div key={inv.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12.5, color: 'var(--text2)' }}>
            <strong style={{ color: 'var(--cyan)' }}>{inv.fromName}</strong> invited you — {inv.mainSubject}
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button
              className="tpreset sel"
              onClick={() => { playTapSound(); onAccept(inv.roomCode); dismissInvite(user.uid, inv.id); }}
            >
              Join
            </button>
            <button className="tpreset" onClick={() => { playTapSound(); dismissInvite(user.uid, inv.id); }}>✕</button>
          </div>
        </div>
      ))}
    </div>
  );
}
