import { playTapSound } from '../lib/sounds';
import './ScreenHeader.css';

// Compact back button used across the app's inner screens.
export function BackButton({ onBack, label = 'Back' }) {
  return (
    <button type="button" className="sh-back" onClick={() => { playTapSound(); onBack(); }} aria-label={label}>←</button>
  );
}

// Shared page header: square back button + title + optional one-line subtitle.
export default function ScreenHeader({ onBack, title, children }) {
  return (
    <div className="sh-head">
      <BackButton onBack={onBack} />
      <div className="sh-text">
        <h1 className="sh-title">{title}</h1>
        {children && <div className="sh-sub">{children}</div>}
      </div>
    </div>
  );
}
