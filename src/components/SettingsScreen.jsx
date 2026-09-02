import { useEffect, useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { playTapSound, isMuted, setMuted } from '../lib/sounds';
import { isLightMode, setTheme } from '../lib/theme';
import { isInstallable, isStandalone, isIOS, onInstallabilityChange, promptInstall } from '../lib/installPrompt';

// Same options as the signup dropdown - kept in sync there manually
// since there are only a handful of semesters right now.
const YEAR_SEMESTER_OPTIONS = [
  { value: 'y1s1', label: 'Year 1 · Semester 1' },
  { value: 'y1s2', label: 'Year 1 · Semester 2' },
  { value: 'y2s1', label: 'Year 2 · Semester 1' },
  { value: 'y2s2', label: 'Year 2 · Semester 2' },
];

// Styled with the same shared classes as the rest of the app (auth
// inputs/labels, glass cards, btn-glow) rather than bespoke CSS, since
// this screen has no old-site equivalent to port from.
export default function SettingsScreen({ onBack }) {
  const { user, profile } = useAuth();
  const [yearSemester, setYearSemester] = useState(profile?.enrolledYearSemester || 'y1s1');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [lightMode, setLightMode] = useState(isLightMode());
  const [soundMuted, setSoundMuted] = useState(isMuted());
  const [installable, setInstallable] = useState(isInstallable());
  const [installMsg, setInstallMsg] = useState(null);
  const standalone = isStandalone();
  const ios = isIOS();

  useEffect(() => onInstallabilityChange(setInstallable), []);

  async function handleInstall() {
    playTapSound();
    const outcome = await promptInstall();
    if (outcome === 'accepted') setInstallMsg('Installed! Check your home screen.');
    else if (outcome === 'dismissed') setInstallMsg(null);
  }

  function toggleLightMode() {
    const next = !lightMode;
    playTapSound(); // fires before the state flips, so a mute-toggle-off still gets an audible confirmation
    setLightMode(next);
    setTheme(next ? 'light' : 'dark');
  }

  function toggleSound() {
    const next = !soundMuted;
    setMuted(next);
    setSoundMuted(next);
    if (!next) playTapSound(); // only chime when turning sound back ON
  }

  async function handleSave() {
    playTapSound();
    setSaving(true);
    setSaved(false);
    try {
      await setDoc(doc(db, 'users', user.uid), { enrolledYearSemester: yearSemester }, { merge: true });
      setSaved(true);
    } catch (e) {
      alert('Failed to save: ' + (e.message || e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="std-screen">
      <button className="btn-ghost std-back" onClick={() => { playTapSound(); onBack(); }}>← Back</button>

      <div className="std-header">
        <h1 className="std-title">⚙️ Settings</h1>
      </div>

      <div className="glass std-card" style={{ marginBottom: 14 }}>
        <div className="toggle-row">
          <div>
            <div className="toggle-row-label">🌗 Dark / Light Mode</div>
            <div className="toggle-row-sub">{lightMode ? 'Light mode is on' : 'Dark mode is on'}</div>
          </div>
          <button
            type="button"
            className={lightMode ? 'toggle-switch on' : 'toggle-switch'}
            role="switch"
            aria-checked={lightMode}
            onClick={toggleLightMode}
          >
            <span className="toggle-knob" />
          </button>
        </div>

        <div className="toggle-row">
          <div>
            <div className="toggle-row-label">🔊 Sound</div>
            <div className="toggle-row-sub">{soundMuted ? 'Sound effects are off' : 'Sound effects are on'}</div>
          </div>
          <button
            type="button"
            className={!soundMuted ? 'toggle-switch on' : 'toggle-switch'}
            role="switch"
            aria-checked={!soundMuted}
            onClick={toggleSound}
          >
            <span className="toggle-knob" />
          </button>
        </div>
      </div>

      {!standalone && (installable || ios) && (
        <div className="glass std-card" style={{ marginBottom: 14 }}>
          <label className="auth-label">📲 Install Med101</label>
          {installable ? (
            <>
              <p className="std-note">
                Add Med101 to your home screen for quick access, its own app icon, and a full-screen experience with no browser bar.
              </p>
              <button className="btn-glow std-save-btn" onClick={handleInstall}>Install App</button>
              {installMsg && <div className="auth-msg success" style={{ display: 'block' }}>{installMsg}</div>}
            </>
          ) : (
            <p className="std-note">
              Tap the Share button in Safari, then "Add to Home Screen", to install Med101 with its own icon and full-screen view.
            </p>
          )}
        </div>
      )}

      <div className="glass std-card">
        <label className="auth-label">Year &amp; Semester</label>
        <select className="auth-input" value={yearSemester} onChange={(e) => setYearSemester(e.target.value)}>
          {YEAR_SEMESTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <p className="std-note">
          Changes which subjects you see. If you've moved to a new semester, update it here.
        </p>

        <button className="btn-glow std-save-btn" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>

        {saved && <div className="auth-msg success" style={{ display: 'block' }}>Saved. Your dashboard will update shortly.</div>}
      </div>
    </div>
  );
}
