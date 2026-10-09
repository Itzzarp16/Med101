import { playTapSound } from '../lib/sounds';
import useLockBodyScroll from '../lib/useLockBodyScroll';
import './InstagramPromptModal.css';

// Same look as WhatsAppPromptModal (shares its .whatsapp-modal-* styles) and
// shown right after it closes. Keep the URL in step with ContactUs.jsx.
const INSTAGRAM_URL = 'https://www.instagram.com/med101.space/';

export default function InstagramPromptModal({ onClose }) {
  useLockBodyScroll();

  function close() {
    playTapSound();
    onClose();
  }

  return (
    <div className="whatsapp-modal-overlay" onClick={close}>
      <div className="glass whatsapp-modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="whatsapp-modal-close" onClick={close} title="Close" aria-label="Close">✕</button>

        <span className="ig-modal-ico" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="5" />
            <circle cx="12" cy="12" r="4" />
            <circle cx="17.5" cy="6.5" r="0.7" fill="currentColor" />
          </svg>
        </span>

        <p className="whatsapp-modal-text">
          Follow us on Instagram for study tips, updates and new features.
        </p>

        <a
          href={INSTAGRAM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="whatsapp-modal-cta ig-modal-cta"
          onClick={close}
        >
          Follow on Instagram
        </a>
      </div>
    </div>
  );
}
