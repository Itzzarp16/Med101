import { useEffect, useState } from 'react';
import './OfflineGuard.css';

// The site is meant to require a live connection - no working offline
// from cached data. This is the blunt, universal half of that: the
// instant the browser itself reports no connectivity, block the whole
// screen everywhere (student app, admin portal, auth screen alike)
// with nothing more clever than the browser's own online/offline
// events. It's deliberately not trying to detect a slow/half-working
// connection - navigator.onLine only reliably reports "definitely no
// network interface" - anything spottier than that will still surface
// through individual features failing (Firestore reads/writes,
// question-data fetches) with no offline fallback of their own now.
export default function OfflineGuard() {
  const [offline, setOffline] = useState(!navigator.onLine);

  useEffect(() => {
    function goOffline() { setOffline(true); }
    function goOnline() { setOffline(false); }
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="offline-guard">
      <div className="offline-guard-card">
        <div className="offline-guard-icon">📡</div>
        <div className="offline-guard-title">You're offline</div>
        <p className="offline-guard-text">
          Med101 needs an internet connection to work. Reconnect and this
          will continue automatically.
        </p>
      </div>
    </div>
  );
}
