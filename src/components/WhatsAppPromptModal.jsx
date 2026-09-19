import { playTapSound } from '../lib/sounds';
import useLockBodyScroll from '../lib/useLockBodyScroll';

// Must match the WhatsApp link in TopBar.jsx's side menu and
// api/templates/welcome-email.html.
const WHATSAPP_GROUP_URL = 'https://chat.whatsapp.com/Kn2NDwg7Wij5VQbs35hYMx?s=cl&p=a&mlu=4&ilr=4';

export default function WhatsAppPromptModal({ onClose }) {
  useLockBodyScroll();

  function close() {
    playTapSound();
    onClose();
  }

  return (
    <div className="whatsapp-modal-overlay" onClick={close}>
      <div className="glass whatsapp-modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="whatsapp-modal-close" onClick={close} title="Close">✕</button>

        <img src="/whatsapp-icon.png" width="48" height="48" alt="" style={{ marginBottom: 14 }} />

        <p className="whatsapp-modal-text">
          Join our WhatsApp group to get updates and important information.
        </p>

        <a
          href={WHATSAPP_GROUP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="whatsapp-modal-cta"
          onClick={close}
        >
          Join Group
        </a>
      </div>
    </div>
  );
}
