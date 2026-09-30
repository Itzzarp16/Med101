import { useEffect, useState } from 'react';
import { playTapSound } from '../lib/sounds';
import { pushConfigured, pushSupported, pushPermission, pushEnabled, enablePush } from '../lib/push';

// One-time banner (Friends screen): offers to turn on challenge-invite
// notifications. Hidden when they're already on, blocked, unsupported,
// not set up yet, or the student dismissed it.
const DISMISS_KEY = 'med101_push_prompt_dismissed';

export default function PushPrompt() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!pushConfigured() || localStorage.getItem(DISMISS_KEY)) return;
      if (pushEnabled() || pushPermission() !== 'default') return;
      if (await pushSupported() && alive) setShow(true);
    })();
    return () => { alive = false; };
  }, []);

  if (!show) return null;

  async function handleEnable() {
    playTapSound();
    setBusy(true);
    setErr(null);
    try {
      await enablePush();
      setShow(false);
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  function handleDismiss() {
    playTapSound();
    localStorage.setItem(DISMISS_KEY, '1');
    setShow(false);
  }

  return (
    <div className="glass std-card" style={{ marginTop: 12 }}>
      <div style={{ fontWeight: 700, fontSize: 14 }}>🔔 Get notified when a friend challenges you</div>
      <div style={{ fontSize: 12.5, color: 'var(--text3)', lineHeight: 1.5 }}>
        We&apos;ll send a notification the moment someone invites you to a quiz room, even when Med101 is closed.
      </div>
      {err && <div className="auth-msg error" style={{ display: 'block' }}>{err}</div>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn-glow" style={{ flex: 1 }} disabled={busy} onClick={handleEnable}>
          {busy ? 'Enabling…' : 'Turn on notifications'}
        </button>
        <button className="btn-ghost" onClick={handleDismiss}>Not now</button>
      </div>
    </div>
  );
}
