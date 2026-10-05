import { useEffect, useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { playTapSound, isMuted, setMuted } from '../lib/sounds';
import { isLightMode, setTheme } from '../lib/theme';
import { pushConfigured, pushSupported, pushPermission, pushEnabled, enablePush, disablePush } from '../lib/push';
import { isInstallable, isStandalone, isIOS, onInstallabilityChange, promptInstall } from '../lib/installPrompt';
import LegalFooter from './LegalFooter';
import './SettingsScreen.css';

// Same options as the signup dropdown - kept in sync there manually
// since there are only a handful of semesters right now.
const YEAR_SEMESTER_OPTIONS = [
  { value: 'y1s1', label: 'Semester 1' },
  { value: 'y1s2', label: 'Semester 2' },
  { value: 'y2s1', label: 'Semester 3' },
  { value: 'y2s2', label: 'Semester 4' },
  { value: 'y3s1', label: 'Semester 5' },
  { value: 'y3s2', label: 'Semester 6' },
];

// Styled with the same shared classes as the rest of the app (auth
// inputs/labels, glass cards, btn-glow) rather than bespoke CSS, since
// this screen has no old-site equivalent to port from.
export default function SettingsScreen({ onBack, onProfile }) {
  const { user, profile, logOut } = useAuth();
  const [light, setLight] = useState(isLightMode());
  const [muted, setMutedState] = useState(isMuted());
  const [pushOk, setPushOk] = useState(false);       // supported + set up on this device
  const [pushOn, setPushOn] = useState(pushEnabled());
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMsg, setPushMsg] = useState(null);
  useEffect(() => {
    let alive = true;
    if (pushConfigured()) pushSupported().then((ok) => { if (alive) setPushOk(ok); });
    return () => { alive = false; };
  }, []);
  const [yearSemester, setYearSemester] = useState(profile?.enrolledYearSemester || 'y1s1');
  const [status, setStatus] = useState(null); // { type: 'saving' | 'ok' | 'err', text }
  const [installable, setInstallable] = useState(isInstallable());
  const [installMsg, setInstallMsg] = useState(null);
  const standalone = isStandalone();
  const ios = isIOS();

  useEffect(() => onInstallabilityChange(setInstallable), []);

  function toggleTheme() {
    const next = !light;
    playTapSound();
    setLight(next);
    setTheme(next ? 'light' : 'dark');
  }

  async function togglePush() {
    if (pushBusy) return;
    playTapSound();
    setPushBusy(true);
    setPushMsg(null);
    try {
      if (pushOn) { await disablePush(); setPushOn(false); }
      else { await enablePush(); setPushOn(true); }
    } catch (e) {
      setPushMsg(e.message || String(e));
    } finally {
      setPushBusy(false);
    }
  }

  function toggleSound() {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
    if (!next) playTapSound(); // only chime when turning sound back ON
  }

  async function handleInstall() {
    playTapSound();
    const outcome = await promptInstall();
    if (outcome === 'accepted') setInstallMsg('Installed! Check your home screen.');
    else if (outcome === 'dismissed') setInstallMsg(null);
  }

  // Tap a semester to switch: saves straight away (no separate Save button)
  // and rolls back if the write fails.
  async function handlePick(value) {
    if (value === yearSemester || status?.type === 'saving') return;
    playTapSound();
    const previous = yearSemester;
    setYearSemester(value);
    setStatus({ type: 'saving', text: 'Saving…' });
    try {
      await setDoc(doc(db, 'users', user.uid), { enrolledYearSemester: value }, { merge: true });
      setStatus({ type: 'ok', text: 'Saved. Your dashboard will update shortly.' });
    } catch (e) {
      setYearSemester(previous);
      setStatus({ type: 'err', text: 'Could not save: ' + (e.message || e) });
    }
  }

  return (
    <>
    <div className="std-screen">
      <div className="set-head">
        <button className="set-back" onClick={() => { playTapSound(); onBack(); }} aria-label="Back">←</button>
        <div>
          <h1 className="set-title">Settings</h1>
          <div className="set-sub">Account, preferences and semester.</div>
        </div>
      </div>

      <div className="set-section-label">Account</div>
      <div className="glass set-card set-rows">
        <button className="set-row set-link" onClick={() => { playTapSound(); onProfile?.(); }}>
          <span>🙍 Your Profile</span><span className="set-chev">›</span>
        </button>
      </div>

      <div className="set-section-label">Preferences</div>
      <div className="glass set-card set-rows">
        <div className="set-row set-tap" onClick={toggleTheme}>
          <span>{light ? '☀️ Light mode' : '🌙 Dark mode'}</span>
          <button
            type="button"
            role="switch"
            aria-checked={light}
            aria-label="Light mode"
            className={light ? 'set-switch on' : 'set-switch'}
            onClick={(e) => { e.stopPropagation(); toggleTheme(); }}
          />
        </div>
        <div className="set-row set-tap" onClick={toggleSound}>
          <span>{muted ? '🔇 Sound off' : '🔊 Sound on'}</span>
          <button
            type="button"
            role="switch"
            aria-checked={!muted}
            aria-label="Sound"
            className={!muted ? 'set-switch on' : 'set-switch'}
            onClick={(e) => { e.stopPropagation(); toggleSound(); }}
          />
        </div>
        {pushOk && (
          <div
            className={'set-row set-tap' + ((pushBusy || (pushPermission() === 'denied' && !pushOn)) ? ' is-disabled' : '')}
            onClick={() => { if (!(pushBusy || (pushPermission() === 'denied' && !pushOn))) togglePush(); }}
          >
            <span>{pushOn ? '🔔 Notifications on' : '🔕 Notifications off'}</span>
            <button
              type="button"
              role="switch"
              aria-checked={pushOn}
              aria-label="Notifications"
              disabled={pushBusy || (pushPermission() === 'denied' && !pushOn)}
              className={pushOn ? 'set-switch on' : 'set-switch'}
              onClick={(e) => { e.stopPropagation(); togglePush(); }}
            />
          </div>
        )}
      </div>
        {pushMsg && <div className="auth-msg error" style={{ display: 'block', margin: '6px 0' }}>{pushMsg}</div>}
        {pushOk && pushPermission() === 'denied' && !pushOn && (
          <div style={{ fontSize: 12, color: 'var(--text3)', padding: '6px 0' }}>
            Notifications are blocked for this site. Allow them in your browser&apos;s site settings, then come back.
          </div>
        )}

      <div className="set-section-label">Study</div>
      <div className="glass set-card">
        <div className="set-card-title">Year &amp; Semester</div>
        <p className="set-card-note">Changes which subjects you see. If you've moved to a new semester, update it here.</p>
        <div className="set-sem-grid" role="radiogroup" aria-label="Year and semester">
          {YEAR_SEMESTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={yearSemester === opt.value}
              className={yearSemester === opt.value ? 'set-sem on' : 'set-sem'}
              disabled={status?.type === 'saving'}
              onClick={() => handlePick(opt.value)}
            >
              <span className="set-sem-year">Semester</span>
              <span className="set-sem-num">{opt.label.replace('Semester ', '')}</span>
            </button>
          ))}
        </div>
        <div className={`set-status${status?.type === 'ok' ? ' ok' : status?.type === 'err' ? ' err' : ''}`} role="status" aria-live="polite">
          {status?.text}
        </div>
      </div>

      {!standalone && (installable || ios) && (
        <>
          <div className="set-section-label">App</div>
          <div className="glass set-card">
            <div className="set-card-title">📲 Install Med101</div>
            {installable ? (
              <>
                <p className="set-card-note">
                  Add Med101 to your home screen for quick access, its own app icon, and a full-screen experience with no browser bar.
                </p>
                <button className="btn-glow set-install-btn" onClick={handleInstall}>Install App</button>
                {installMsg && <div className="set-status ok">{installMsg}</div>}
              </>
            ) : (
              <p className="set-card-note">
                Tap the Share button in Safari, then "Add to Home Screen", to install Med101 with its own icon and full-screen view.
              </p>
            )}
          </div>
        </>
      )}

      <div className="glass set-card set-rows" style={{ marginTop: 24 }}>
        <button className="set-row set-link set-signout" onClick={() => { playTapSound(); logOut(); }}>
          <span>⏏ Sign Out</span>
        </button>
      </div>
    </div>
      <LegalFooter />
    </>
  );
}
