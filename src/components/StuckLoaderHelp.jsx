import { useEffect, useState } from 'react';
import './StuckLoaderHelp.css';

// Shown under the loading bar if it has been up for a long time, so nobody
// is ever left staring at an endless loader with no way forward.
// "Reset and reload" clears the service worker and cached files (not the
// saved login), which fixes a browser holding on to a stale copy of the app.
export default function StuckLoaderHelp({ afterMs = 12000, hint }) {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShow(true), afterMs);
    return () => clearTimeout(t);
  }, [afterMs]);

  async function resetAndReload() {
    setBusy(true);
    try {
      const regs = (await navigator.serviceWorker?.getRegistrations?.()) || [];
      await Promise.all(regs.map((r) => r.unregister()));
      if (window.caches) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch { /* reload anyway */ }
    window.location.reload();
  }

  if (!show) return null;
  return (
    <div className="stuck-help" role="status">
      <div className="stuck-help-text">
        Taking longer than usual. Check your connection{hint ? ` (${hint})` : ''}.
      </div>
      <div className="stuck-help-actions">
        <button onClick={() => window.location.reload()}>Reload</button>
        <button onClick={resetAndReload} disabled={busy}>{busy ? 'Resetting…' : 'Reset and reload'}</button>
      </div>
    </div>
  );
}
