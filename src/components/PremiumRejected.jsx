import { playTapSound } from '../lib/sounds';
import './PremiumRejected.css';

// Shown the instant a payment request flips to "rejected" while the
// student is watching (see PremiumScreen's live detection - this
// never fires for an old rejection just sitting there from a past
// session, only a transition that happens live). Unlike
// PremiumThankYou, this has no auto-dismiss countdown - a rejection
// needs to actually be read, not blinked past.
export default function PremiumRejected({ reason, onRetry, onClose }) {
  return (
    <div className="rejected-overlay">
      <div className="rejected-card">
        <div className="rejected-card-inner">
          <button
            type="button"
            className="rejected-close"
            onClick={() => { playTapSound(); onClose(); }}
            aria-label="Close"
          >
            ✕
          </button>

          <div className="rejected-icon">❌</div>
          <h2 className="rejected-title">Payment Rejected</h2>
          <p className="rejected-sub">Your submission couldn't be approved.</p>

          {reason && (
            <div className="rejected-reason">
              <div className="rejected-reason-label">Reason</div>
              <div className="rejected-reason-text">{reason}</div>
            </div>
          )}

          <button
            type="button"
            className="rejected-retry-btn"
            onClick={() => { playTapSound(); onRetry(); }}
          >
            Retry Payment
          </button>
        </div>
      </div>
    </div>
  );
}
