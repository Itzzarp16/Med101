import { useEffect, useState } from 'react';
import { playTapSound } from '../lib/sounds';
import useLockBodyScroll from '../lib/useLockBodyScroll';
import { pushConfigured, pushSupported, pushPermission, enablePush } from '../lib/push';

// After sign-in, asks every student who hasn't allowed notifications to
// turn them on. Browsers only show the real permission popup from a tap,
// so this modal's button is what triggers it. "Maybe later" hides it for
// the rest of this browser session; it comes back on the next sign-in
// until they allow. Students who allowed (or switched them off on
// purpose in Settings) are never shown it. If the browser has them
// blocked, we show how to unblock instead, since sites can't re-ask.
const snoozeKey = (uid) => `med101_notif_gate_snoozed_${uid}`;

export default function NotificationGateModal({ uid }) {
  const [mode, setMode] = useState(null); // null | 'ask' | 'blocked'
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!uid || !pushConfigured()) return;
      if (sessionStorage.getItem(snoozeKey(uid))) return;
      const perm = pushPermission();
      if (perm !== 'default' && perm !== 'denied') return;
      if (!(await pushSupported()) || !alive) return;
      setMode(perm === 'denied' ? 'blocked' : 'ask');
    })();
    return () => { alive = false; };
  }, [uid]);

  useLockBodyScroll(!!mode);
  if (!mode) return null;

  function later() {
    playTapSound();
    sessionStorage.setItem(snoozeKey(uid), '1');
    setMode(null);
  }

  async function allow() {
    playTapSound();
    setBusy(true);
    setErr(null);
    try {
      await enablePush();
      setMode(null);
    } catch (e) {
      // Tapping "Block" in the browser popup lands here.
      if (pushPermission() === 'denied') setMode('blocked');
      else setErr(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="whatsapp-modal-overlay" style={{ zIndex: 320 }}>
      <div className="glass whatsapp-modal-card" onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>🔔</div>

        {mode === 'ask' ? (
          <>
            <p className="whatsapp-modal-text" style={{ marginBottom: 8 }}>Turn on notifications</p>
            <p style={{ color: 'var(--text3)', fontSize: 13, lineHeight: 1.5, margin: '0 0 18px' }}>
              Get notified when a friend challenges you, and when new questions or important Med101 updates are added, even when the app is closed.
            </p>
            {err && <div className="auth-msg error" style={{ display: 'block', marginBottom: 12 }}>{err}</div>}
            <button className="whatsapp-modal-cta" style={{ border: 0, cursor: 'pointer' }} disabled={busy} onClick={allow}>
              {busy ? 'Enabling…' : 'Allow notifications'}
            </button>
          </>
        ) : (
          <>
            <p className="whatsapp-modal-text" style={{ marginBottom: 8 }}>Notifications are blocked</p>
            <p style={{ color: 'var(--text3)', fontSize: 13, lineHeight: 1.5, margin: '0 0 18px' }}>
              Your browser is blocking Med101 notifications. Tap the 🔒 icon next to the website address, open Site settings, set Notifications to Allow, then reload the page.
            </p>
          </>
        )}

        <button className="btn-ghost" style={{ marginTop: 12 }} onClick={later}>
          {mode === 'ask' ? 'Maybe later' : 'Got it'}
        </button>
      </div>
    </div>
  );
}
