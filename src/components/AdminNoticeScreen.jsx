import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { saveHomeNotice } from '../lib/homeNotice';
import { playTapSound } from '../lib/sounds';

// Styled with the shared std-screen/glass/auth-input classes.
// semesters/semesterMainSubjects (same shape useSemesterData() returns)
// are optional - without them this just edits the "All semesters"
// default, same as before per-semester notices existed.
export default function AdminNoticeScreen({ onBack, hideBack = false, semesters }) {
  const [semesterId, setSemesterId] = useState(''); // '' = All semesters (the default notice)
  const [text, setText] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSaved(false);
    // fetchHomeNotice() falls back to the default when a semester has
    // no override of its own, which would silently show/re-save the
    // default's text under this semester - fetch that one doc directly
    // instead so the editor only ever shows what's actually set here.
    const docId = semesterId ? `homeNotice_${semesterId}` : 'homeNotice';
    getDoc(doc(db, 'config', docId)).then((snap) => {
      if (cancelled) return;
      const n = snap.exists() ? snap.data() : null;
      setText(n?.text || '');
      setEnabled(n?.enabled !== false);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [semesterId]);

  async function handleSave() {
    playTapSound();
    setSaving(true);
    setSaved(false);
    try {
      await saveHomeNotice(text, enabled, semesterId || undefined);
      setSaved(true);
    } catch (e) {
      alert('Failed to save: ' + (e.message || e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="std-screen">
      {!hideBack && (
        <button className="btn-ghost std-back" onClick={() => { playTapSound(); onBack(); }}>← Back</button>
      )}

      <div className="std-header">
        <h1 className="std-title">📢 Home Notice</h1>
        <p className="std-sub">
          Shown as a scrolling banner on the dashboard. Good for exam updates,
          answer-key corrections, or anything time-sensitive. Set a notice for
          a specific semester, or "All semesters" as the fallback shown to
          any semester without its own.
        </p>
      </div>

      <div className="glass std-card">
        <label className="auth-label">Applies to</label>
        <select className="auth-input" value={semesterId} onChange={(e) => setSemesterId(e.target.value)}>
          <option value="">All semesters (default)</option>
          {(semesters || []).map((s) => (
            <option key={s.id} value={s.id}>{s.label || s.id}</option>
          ))}
        </select>

        {loading ? (
          <div className="std-loading">Loading…</div>
        ) : (
          <>
            <label className="auth-label">Notice Text</label>
            <textarea
              className="auth-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. For Histology, I've updated the quiz based on the new answer key..."
              rows={5}
              style={{ resize: 'vertical', fontFamily: 'inherit' }}
            />

            <label className="qmode-toggle-row" style={{ cursor: 'pointer' }}>
              <div>
                <div className="qmode-toggle-title">Show this notice</div>
                <div className="qmode-toggle-desc">
                  {semesterId ? 'Visible to students in this semester' : 'Visible to any semester without its own notice'}
                </div>
              </div>
              <div className={enabled ? 'toggle-track on' : 'toggle-track'} onClick={() => setEnabled((v) => !v)}>
                <div className="toggle-thumb" />
              </div>
            </label>

            <button className="btn-glow std-save-btn" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save Notice'}
            </button>

            {saved && <div className="auth-msg success" style={{ display: 'block' }}>Saved. Live on the dashboard now.</div>}
          </>
        )}
      </div>
    </div>
  );
}
