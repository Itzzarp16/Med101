import { useEffect, useState } from 'react';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import LiquidSwitch from './LiquidSwitch';

// Admin portal tab: turn the "sign in on auth.med101.space" page on or off.
// ON  -> students who tap Sign in on med101.space go to auth.med101.space, sign in there,
//        and are sent back signed in (api/auth/handoff.py hands over the login).
// OFF -> the normal sign-in screen on med101.space, exactly as before.
// Stored at config/authHandoff { enabled }, which the site reads through
// api/auth/handoff.py (GET) (visitors who aren't signed in can't read Firestore).
export default function AdminSignInPageScreen() {
  const [enabled, setEnabled] = useState(null); // null = still loading
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => onSnapshot(
    doc(db, 'config', 'authHandoff'),
    (snap) => setEnabled(snap.exists() && snap.data().enabled === true),
    (e) => { console.warn('Could not read sign-in page setting:', e); setEnabled(false); },
  ), []);

  async function toggle() {
    const next = !enabled;
    setBusy(true);
    setMsg(null);
    try {
      await setDoc(doc(db, 'config', 'authHandoff'), { enabled: next, updatedAt: serverTimestamp() }, { merge: true });
      setMsg({ type: 'success', text: next
        ? 'Turned on. Students now sign in on auth.med101.space (can take a few seconds to apply).'
        : 'Turned off. Students sign in on med101.space again.' });
    } catch (e) {
      setMsg({ type: 'error', text: `Couldn't save: ${e.message || e}` });
    } finally { setBusy(false); }
  }

  return (
    <div className="std-wrap">
      <div className="glass std-card">
        <div style={{ fontWeight: 700, fontSize: 17 }}>🔑 Sign-in page (auth.med101.space)</div>
        <label className="qmode-toggle-row" style={{ cursor: busy || enabled === null ? 'default' : 'pointer', marginTop: 8 }}>
          <div>
            <div className="qmode-toggle-title" style={{ color: enabled ? 'var(--green, #4ade80)' : undefined }}>
              Students sign in on auth.med101.space
            </div>
            <div className="qmode-toggle-desc">
              {enabled === null ? 'Loading…' : enabled
                ? 'ON - Sign in on med101.space sends students to auth.med101.space and back.'
                : 'OFF - Students sign in on med101.space (the normal screen).'}
            </div>
          </div>
          <LiquidSwitch on={!!enabled} onClick={busy || enabled === null ? undefined : toggle} disabled={busy || enabled === null} label="Sign in on auth.med101.space" />
        </label>
        {msg && <div className={`auth-msg ${msg.type}`} style={{ display: 'block', marginTop: 10 }}>{msg.text}</div>}
      </div>

      <div className="glass std-card" style={{ marginTop: 12, fontSize: 13.5, lineHeight: 1.6, opacity: 0.9 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Good to know</div>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>Admin accounts are not affected: they keep signing in on med101.space/admin (two-step login).</li>
          <li>If students ever can't sign in, turn this off. The normal sign-in screen works again within seconds.</li>
          <li>A page that fails to finish signing someone in also offers them a "classic sign-in" button.</li>
        </ul>
      </div>
    </div>
  );
}
