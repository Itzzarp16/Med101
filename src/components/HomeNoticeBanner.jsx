import { useEffect, useState } from 'react';
import { fetchHomeNotice, loadCachedHomeNotice, saveCachedHomeNotice, saveHomeNotice } from '../lib/homeNotice';
import { useAuth } from '../lib/AuthContext';
import { playTapSound } from '../lib/sounds';
import useLockBodyScroll from '../lib/useLockBodyScroll';
import './HomeNoticeBanner.css';

export default function HomeNoticeBanner({ semesterId }) {
  const [notice, setNotice] = useState(() => loadCachedHomeNotice(semesterId));
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  // Admin-only inline editor (same Firestore doc the Admin > Home Notice screen edits).
  const { isAdmin } = useAuth();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [scope, setScope] = useState(''); // '' = all-semesters default, else a semesterId
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');
  useLockBodyScroll(open);

  // Plays the exit animation before unmounting.
  const close = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(() => { setOpen(false); setClosing(false); setEditing(false); setEditError(''); }, 200);
  };

  const cancelEdit = () => { setEditing(false); setEditError(''); };

  // Fetch fresh so we edit whichever doc is really being shown right now
  // (this semester's own notice, or the all-semesters default).
  async function startEdit() {
    playTapSound();
    setEditError('');
    setLoadingEdit(true);
    const fresh = await fetchHomeNotice(semesterId);
    setLoadingEdit(false);
    const src = fresh || notice;
    setScope(src?.scope ?? '');
    setDraft(src?.text || '');
    setEditing(true);
  }

  async function saveEdit() {
    playTapSound();
    const text = draft.trim();
    setSaving(true);
    setEditError('');
    try {
      // Empty text switches the notice off instead of saving a blank banner.
      await saveHomeNotice(text, text !== '', scope || undefined);
      const next = { ...(notice || {}), text, enabled: text !== '', scope };
      setNotice(next);
      saveCachedHomeNotice(next, semesterId);
      setEditing(false);
      if (!text) setOpen(false);
    } catch (e) {
      setEditError('Could not save: ' + (e.message || e));
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') { if (editing) cancelEdit(); else close(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, closing, editing]);

  useEffect(() => {
    let cancelled = false;
    // Re-run whenever the active semester changes (e.g. admin testing,
    // or a student's calendar-resolved semester rolling over) so the
    // right notice - semester-specific if one's set, else the default
    // - is always what's shown and cached.
    setNotice(loadCachedHomeNotice(semesterId));
    fetchHomeNotice(semesterId).then((n) => {
      if (cancelled) return;
      setNotice(n);
      saveCachedHomeNotice(n, semesterId);
    });
    return () => { cancelled = true; };
  }, [semesterId]);

  if (!notice || !notice.enabled || !notice.text) return null;

  return (
    <>
      <div
        className="home-notice"
        onClick={() => { playTapSound(); setOpen(true); }}
        title="Tap for full notice"
      >
        <div className="home-notice-track">
          <span className="home-notice-text">{notice.text}</span>
          <span className="home-notice-text" aria-hidden="true">{notice.text}</span>
        </div>
      </div>

      {open && (
        <div className={`home-notice-modal${closing ? ' closing' : ''}`} onClick={editing ? undefined : close}>
          <div className="home-notice-modal-card" role="dialog" aria-modal="true" aria-label="Notice" onClick={(e) => e.stopPropagation()}>
            <button className="home-notice-close" onClick={() => { playTapSound(); if (editing) cancelEdit(); else close(); }} aria-label="Close notice">✕</button>
            <div className="home-notice-badge" aria-hidden="true">
              <span className="home-notice-ring" />
              <span className="home-notice-ring r2" />
              <span className="home-notice-mega">📢</span>
            </div>
            <div className="home-notice-modal-title">Notice</div>
            <div className="home-notice-from">From Med101</div>
            {editing ? (
              <>
                <textarea
                  className="home-notice-edit-area"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Type the notice students will see…"
                  rows={6}
                  autoFocus
                  aria-label="Notice text"
                />
                <div className="home-notice-edit-scope">
                  Applies to: {scope ? 'this semester only' : 'all semesters (default)'} · leave empty to hide the notice
                </div>
                {editError && <div className="home-notice-edit-error" role="alert">{editError}</div>}
                <div className="home-notice-edit-row">
                  <button className="home-notice-edit-ghost" onClick={() => { playTapSound(); cancelEdit(); }} disabled={saving}>Cancel</button>
                  <button
                    className="home-notice-ok"
                    onClick={saveEdit}
                    disabled={saving || draft.trim() === (notice.text || '').trim()}
                  >
                    {saving ? 'Saving…' : 'Save notice'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="home-notice-modal-body">{notice.text}</div>
                <button className="home-notice-ok" onClick={() => { playTapSound(); close(); }}>Got it</button>
                {isAdmin && (
                  <button className="home-notice-edit-link" onClick={startEdit} disabled={loadingEdit}>
                    {loadingEdit ? 'Loading…' : '✎ Edit notice · admin'}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
