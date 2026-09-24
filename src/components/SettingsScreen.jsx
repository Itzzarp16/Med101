import { useEffect, useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { playTapSound } from '../lib/sounds';
import { isInstallable, isStandalone, isIOS, onInstallabilityChange, promptInstall } from '../lib/installPrompt';
import { emailMyDataExport } from '../lib/dataExport';
import LegalFooter from './LegalFooter';

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
export default function SettingsScreen({ onBack }) {
  const { user, profile } = useAuth();
  const [yearSemester, setYearSemester] = useState(profile?.enrolledYearSemester || 'y1s1');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [installable, setInstallable] = useState(isInstallable());
  const [installMsg, setInstallMsg] = useState(null);
  const [dataExportBusy, setDataExportBusy] = useState(false);
  const [dataExportError, setDataExportError] = useState(null);
  const [dataExportSentTo, setDataExportSentTo] = useState(null);
  const standalone = isStandalone();
  const ios = isIOS();

  useEffect(() => onInstallabilityChange(setInstallable), []);

  async function handleInstall() {
    playTapSound();
    const outcome = await promptInstall();
    if (outcome === 'accepted') setInstallMsg('Installed! Check your home screen.');
    else if (outcome === 'dismissed') setInstallMsg(null);
  }

  async function handleEmailMyData() {
    playTapSound();
    setDataExportError(null);
    setDataExportSentTo(null);
    setDataExportBusy(true);
    try {
      const { to } = await emailMyDataExport(user);
      setDataExportSentTo(to);
    } catch (e) {
      setDataExportError(e.message || String(e));
    } finally {
      setDataExportBusy(false);
    }
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
    <>
    <div className="std-screen">
      <button className="btn-ghost std-back" onClick={() => { playTapSound(); onBack(); }}>← Back</button>

      <div className="std-header">
        <h1 className="std-title">⚙️ Settings</h1>
      </div>

      <div className="glass std-card" style={{ marginBottom: 14 }}>
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

      <div className="glass std-card" style={{ marginBottom: 14 }}>
        <label className="auth-label">📄 Your Data</label>
        <p className="std-note">
          Get a full copy of everything Med101 stores about your account (profile, quiz history, flagged/wrong questions, payments, etc.) emailed to you as a PDF - usually within a few seconds.
        </p>
        <button className="btn-ghost std-save-btn" onClick={handleEmailMyData} disabled={dataExportBusy}>
          {dataExportBusy ? 'Preparing your export…' : '✉️ Email My Data Export'}
        </button>
        {dataExportError && <div className="auth-msg error" style={{ display: 'block' }}>{dataExportError}</div>}
        {dataExportSentTo && <div className="auth-msg success" style={{ display: 'block' }}>Sent to {dataExportSentTo} - check your inbox in a moment.</div>}
      </div>

      {!standalone && (installable || ios) && (
        <div className="glass std-card">
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
    </div>
      <LegalFooter />
    </>
  );
}
