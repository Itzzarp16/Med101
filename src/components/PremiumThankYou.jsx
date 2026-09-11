import { useEffect, useState } from 'react';
import { playTapSound } from '../lib/sounds';
import './PremiumThankYou.css';

const AUTO_CLOSE_SECONDS = 10;

export default function PremiumThankYou({ onClose }) {
  const [secondsLeft, setSecondsLeft] = useState(AUTO_CLOSE_SECONDS);

  useEffect(() => {
    if (secondsLeft <= 0) {
      onClose();
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft, onClose]);

  return (
    <div className="thanks-overlay">
      <div className="thanks-card">
        <div className="thanks-card-inner">
          <button
            type="button"
            className="thanks-close"
            onClick={() => { playTapSound(); onClose(); }}
            aria-label="Close"
          >
            ✕
          </button>

          <div className="thanks-icon">🎉</div>
          <h2 className="thanks-title">You're Premium!</h2>
          <p className="thanks-sub">Your subscription is active - full access unlocked.</p>

          <p className="thanks-note">
            Thank you for supporting Med101. Subscriptions like yours are what
            keep this service running and let us keep bringing more content
            and features to every student here.
          </p>

          <div className="thanks-countdown">
            Closing in {secondsLeft}s
          </div>
        </div>
      </div>
    </div>
  );
}
