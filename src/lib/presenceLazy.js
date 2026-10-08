// Same API as presence.js, but the Realtime Database SDK (and presence.js
// itself) is only downloaded after the page is up, instead of being part of
// the first-load JavaScript. Each function still returns its stop/unsubscribe
// function synchronously, even though the real subscription starts a moment
// later; stopping before the module arrives cancels it cleanly.
let mod = null;
const load = () => (mod ? Promise.resolve(mod) : import('./presence').then((m) => (mod = m)));

function lazyStart(fnName, ...args) {
  let stop = null;
  let cancelled = false;
  load()
    .then((m) => { if (!cancelled) stop = m[fnName](...args); })
    .catch((err) => console.warn('presence unavailable:', err));
  return () => { cancelled = true; if (stop) stop(); };
}

export const startPresenceHeartbeat = (uid, displayName) => lazyStart('startPresenceHeartbeat', uid, displayName);
export const subscribeToOnlineCount = (callback) => lazyStart('subscribeToOnlineCount', callback);
export const subscribeToOnlineNames = (callback) => lazyStart('subscribeToOnlineNames', callback);
