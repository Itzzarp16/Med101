import { useEffect, useState } from 'react';
import { SEMESTER_ORDER, fetchAcademicCalendar, saveAcademicCalendar } from '../lib/academicCalendar';
import { playTapSound } from '../lib/sounds';

const LABELS = {
  y1s1: 'Year 1 · Semester 1',
  y1s2: 'Year 1 · Semester 2',
  y2s1: 'Year 2 · Semester 1',
  y2s2: 'Year 2 · Semester 2',
};

// Admin sets/adjusts when each semester "starts" — students enrolled in
// an earlier semester automatically roll forward once today's date
// passes the next one's start date. No official term calendar exists
// yet, so this is meant to be edited by hand as real dates get decided.
// Styled with the shared std-screen/glass/auth-input classes.
export default function AdminCalendarScreen({ onBack }) {
  const [dates, setDates] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchAcademicCalendar().then((cal) => {
      if (!cancelled) {
        setDates(cal);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  async function handleSave() {
    playTapSound();
    setSaving(true);
    setSaved(false);
    try {
      await saveAcademicCalendar(dates);
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
        <h1 className="std-title">⚙️ Academic Calendar</h1>
        <p className="std-sub">
          Set when each semester starts. Students automatically move to the next
          semester once its start date passes — no need to touch individual accounts.
        </p>
      </div>

      {loading ? (
        <div className="std-loading">Loading…</div>
      ) : (
        <div className="glass std-card">
          {SEMESTER_ORDER.map((semId) => (
            <div key={semId}>
              <label className="auth-label">{LABELS[semId] || semId}</label>
              <input
                className="auth-input"
                type="date"
                value={dates[semId] || ''}
                onChange={(e) => setDates((d) => ({ ...d, [semId]: e.target.value }))}
              />
            </div>
          ))}

          <button className="btn-glow std-save-btn" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Calendar'}
          </button>

          {saved && <div className="auth-msg success" style={{ display: 'block' }}>Saved — students will pick this up within a few minutes.</div>}
        </div>
      )}
    </div>
  );
}
