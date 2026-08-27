import { useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import './SettingsScreen.css';

// Same options as the signup dropdown — kept in sync there manually
// since there are only a handful of semesters right now.
const YEAR_SEMESTER_OPTIONS = [
  { value: 'y1s1', label: 'Year 1 · Semester 1' },
  { value: 'y1s2', label: 'Year 1 · Semester 2' },
  { value: 'y2s1', label: 'Year 2 · Semester 1' },
  { value: 'y2s2', label: 'Year 2 · Semester 2' },
];

export default function SettingsScreen({ onBack }) {
  const { user, profile } = useAuth();
  const [yearSemester, setYearSemester] = useState(profile?.enrolledYearSemester || 'y1s1');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
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
    <div className="settings-screen">
      <button className="settings-back" onClick={onBack}>← Back</button>

      <div className="settings-header">
        <h1 className="settings-title">Settings</h1>
      </div>

      <div className="settings-form glass">
        <label>Year &amp; Semester</label>
        <select value={yearSemester} onChange={(e) => setYearSemester(e.target.value)}>
          {YEAR_SEMESTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <p className="settings-note">
          Changes which subjects you see. If you've moved to a new semester, update it here.
        </p>

        <button className="settings-save-btn" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>

        {saved && <div className="settings-saved">Saved — your dashboard will update shortly.</div>}
      </div>
    </div>
  );
}
