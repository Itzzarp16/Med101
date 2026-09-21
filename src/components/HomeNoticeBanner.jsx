import { useEffect, useState } from 'react';
import { fetchHomeNotice, loadCachedHomeNotice, saveCachedHomeNotice } from '../lib/homeNotice';
import { playTapSound } from '../lib/sounds';
import useLockBodyScroll from '../lib/useLockBodyScroll';
import './HomeNoticeBanner.css';

export default function HomeNoticeBanner({ semesterId }) {
  const [notice, setNotice] = useState(() => loadCachedHomeNotice(semesterId));
  const [open, setOpen] = useState(false);
  useLockBodyScroll(open);

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
        <div className="home-notice-modal" onClick={() => setOpen(false)}>
          <div className="home-notice-modal-card glass-hi" onClick={(e) => e.stopPropagation()}>
            <button className="home-notice-close" onClick={() => setOpen(false)} aria-label="Close notice">✕</button>
            <div className="home-notice-modal-title">📢 Notice</div>
            <div className="home-notice-modal-body">{notice.text}</div>
          </div>
        </div>
      )}
    </>
  );
}
