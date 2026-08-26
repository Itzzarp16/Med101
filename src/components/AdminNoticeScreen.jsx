import { useEffect, useState } from 'react';
import { fetchHomeNotice, saveHomeNotice } from '../lib/homeNotice';
import './AdminNoticeScreen.css';

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
    <div className="admin-notice-screen">
      <button className="admin-notice-back" onClick={onBack}>← Back</button>

      <div className="admin-notice-header">
        <h1 className="admin-notice-title">Home Notice</h1>
        <p className="admin-notice-sub">
          Shown as a scrolling banner on every student's dashboard. Good for
          exam updates, answer-key corrections, or anything time-sensitive.
        </p>
      </div>

      {loading ? (
        <div className="admin-notice-loading">Loading…</div>
      ) : (
        <div className="admin-notice-form glass">
          <div className="admin-notice-field">
            <label>Notice Text</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. For Histology, I've updated the quiz based on the new answer key..."
              rows={5}
            />
          </div>

          <label className="admin-notice-toggle">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <span>Show this notice to students</span>
          </label>

          <button className="admin-notice-save-btn" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Notice'}
          </button>

          {saved && <div className="admin-notice-saved">Saved — live on the dashboard now.</div>}
        </div>
      )}
    </div>
  );
}
