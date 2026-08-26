import { useEffect, useState } from 'react';
import { fetchHomeNotice } from '../lib/homeNotice';
import { playTapSound } from '../lib/sounds';
import './HomeNoticeBanner.css';

export default function HomeNoticeBanner() {
  const [notice, setNotice] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchHomeNotice().then((n) => {
      if (!cancelled) setNotice(n);
    });
    return () => { cancelled = true; };
  }, []);

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
