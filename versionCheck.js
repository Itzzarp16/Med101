// __BUILD_ID__ is injected at build time (see vite.config.js) - it's
// this tab's own build, fixed for the lifetime of the page. No amount
// of server-side cache-busting can swap the JS a tab already has
// loaded and running in memory - only an actual reload can do that.
// So instead of just making sure a *fresh* page load always gets the
// latest code (already true via vercel.json's no-cache headers on
// index.html), this actively watches for a newer deploy and reloads
// the tab itself, at natural moments rather than an abrupt random
// interruption: coming back to the tab, reconnecting to the network,
// and periodically while the tab is actually visible.
const CHECK_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes

export function startVersionWatcher() {
  let checking = false;

  async function check() {
    if (checking) return;
    checking = true;
    try {
      const res = await fetch('/version.json', { cache: 'no-store' });
      const { buildId } = await res.json();
      if (buildId && buildId !== __BUILD_ID__) {
        window.location.reload();
      }
    } catch {
      // Offline or a transient error - try again on the next trigger.
    } finally {
      checking = false;
    }
  }

  function onVisible() {
    if (document.visibilityState === 'visible') check();
  }

  window.addEventListener('online', check);
  document.addEventListener('visibilitychange', onVisible);
  const intervalId = setInterval(() => {
    if (document.visibilityState === 'visible') check();
  }, CHECK_INTERVAL_MS);

  check(); // also check once right away, in case a deploy landed while this tab was closed

  return () => {
    window.removeEventListener('online', check);
    document.removeEventListener('visibilitychange', onVisible);
    clearInterval(intervalId);
  };
}
