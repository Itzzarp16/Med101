import { useEffect, useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { playTapSound, isMuted, setMuted } from '../lib/sounds';
import { isLightMode, setTheme } from '../lib/theme';
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
export default function SettingsScreen({ onBack, onYourData }) {
  const { user, profile, logOut } = useAuth();
  const [light, setLight] = useState(isLightMode());
  const [muted, setMutedState] = useState(isMuted());
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
          <div className="set-sub">Semester, preferences and account.</div>
        </div>
      </div>

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

      <div className="set-section-label">Preferences</div>
      <div className="glass set-card set-rows">
        <div className="set-row">
          <span>{light ? '☀️ Light mode' : '🌙 Dark mode'}</span>
          <button
            type="button"
            role="switch"
            aria-checked={light}
            aria-label="Light mode"
            className={light ? 'set-switch on' : 'set-switch'}
            onClick={toggleTheme}
          />
        </div>
        <div className="set-row">
          <span>{muted ? '🔇 Sound off' : '🔊 Sound on'}</span>
          <button
            type="button"
            role="switch"
            aria-checked={!muted}
            aria-label="Sound"
            className={!muted ? 'set-switch on' : 'set-switch'}
            onClick={toggleSound}
          />
        </div>
      </div>

      <div className="set-section-label">Account &amp; community</div>
      <div className="glass set-card set-rows">
        <button className="set-row set-link" onClick={() => { playTapSound(); onYourData?.(); }}>
          <span>📄 Your Data</span><span className="set-chev">›</span>
        </button>
        <a
              className="set-row"
              href="https://chat.whatsapp.com/Kn2NDwg7Wij5VQbs35hYMx?s=cl&p=a&mlu=4&ilr=4"
              target="_blank"
              rel="noopener noreferrer"
              
              onClick={() => { playTapSound(); ; }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" style={{ verticalAlign: '-3px' }}>
                <circle cx="12" cy="12" r="12" fill="#25D366" />
                <path
                  fill="#fff"
                  transform="translate(2.5, 2.5) scale(0.79)"
                  d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.148-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"
                />
              </svg>
              WhatsApp Group
        </a>
        <button className="set-row set-link set-signout" onClick={() => { playTapSound(); logOut(); }}>
          <span>⏏ Sign Out</span>
        </button>
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
    </div>
      <LegalFooter />
    </>
  );
}
