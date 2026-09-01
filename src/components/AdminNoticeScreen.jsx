import { useEffect, useState } from 'react';
import { fetchHomeNotice, saveHomeNotice } from '../lib/homeNotice';
import { playTapSound } from '../lib/sounds';

// Styled with the shared std-screen/glass/auth-input classes.
export default function AdminNoticeScreen({ onBack }) {
  const [text, setText] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchHomeNotice().then((n) => {
      if (cancelled) return;
      if (n) {
        setText(n.text || '');
        setEnabled(n.enabled !== false);
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  async function handleSave() {
    playTapSound();
    setSaving(true);
    setSaved(false);
    try {
      await saveHomeNotice(text, enabled);
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
        <h1 className="std-title">📢 Home Notice</h1>
        <p className="std-sub">
          Shown as a scrolling banner on every student's dashboard. Good for
          exam updates, answer-key corrections, or anything time-sensitive.
        </p>
      </div>

      {loading ? (
        <div className="std-loading">Loading…</div>
      ) : (
        <div className="glass std-card">
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
              <div className="qmode-toggle-desc">Visible to every signed-in student</div>
            </div>
            <div className={enabled ? 'toggle-track on' : 'toggle-track'} onClick={() => setEnabled((v) => !v)}>
              <div className="toggle-thumb" />
            </div>
          </label>

          <button className="btn-glow std-save-btn" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Notice'}
          </button>

          {saved && <div className="auth-msg success" style={{ display: 'block' }}>Saved. Live on the dashboard now.</div>}
        </div>
      )}
    </div>
  );
}
