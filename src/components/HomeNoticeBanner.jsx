import { useEffect, useState } from 'react';
import { fetchHomeNotice, loadCachedHomeNotice, saveCachedHomeNotice } from '../lib/homeNotice';
import { playTapSound } from '../lib/sounds';
import useLockBodyScroll from '../lib/useLockBodyScroll';
import './HomeNoticeBanner.css';

export default function HomeNoticeBanner({ semesterId }) {
  const [notice, setNotice] = useState(() => loadCachedHomeNotice(semesterId));
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  useLockBodyScroll(open);

  // Plays the exit animation before unmounting.
  const close = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(() => { setOpen(false); setClosing(false); }, 200);
  };

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, closing]);

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
        <div className={`home-notice-modal${closing ? ' closing' : ''}`} onClick={close}>
          <div className="home-notice-modal-card" role="dialog" aria-modal="true" aria-label="Notice" onClick={(e) => e.stopPropagation()}>
            <button className="home-notice-close" onClick={() => { playTapSound(); close(); }} aria-label="Close notice">✕</button>
            <div className="home-notice-badge" aria-hidden="true">
              <span className="home-notice-ring" />
              <span className="home-notice-ring r2" />
              <span className="home-notice-mega">📢</span>
            </div>
            <div className="home-notice-modal-title">Notice</div>
            <div className="home-notice-from">From Med101</div>
            <div className="home-notice-modal-body">{notice.text}</div>
            <button className="home-notice-ok" onClick={() => { playTapSound(); close(); }}>Got it</button>
          </div>
        </div>
      )}
    </>
  );
}
