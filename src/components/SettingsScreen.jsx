import { useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { playTapSound } from '../lib/sounds';

// Same options as the signup dropdown — kept in sync there manually
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

        {saved && <div className="auth-msg success" style={{ display: 'block' }}>Saved — your dashboard will update shortly.</div>}
      </div>
    </div>
  );
}
