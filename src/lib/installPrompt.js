// Wraps the browser's `beforeinstallprompt` event (Android/desktop
// Chrome, Edge) so a button anywhere in the app can trigger the native
// install flow. The event only fires once, early, and only if we
// preventDefault() it immediately - so this listener is registered at
// module load time (before any component mounts) and the captured
// event is held onto until something actually calls promptInstall().

let deferredPrompt = null;
let listeners = [];

function notify() {
  listeners.forEach((cb) => cb(!!deferredPrompt));
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });
}

export function isInstallable() {
  return !!deferredPrompt;
}

// Subscribe to installability changing (event captured, or app
// installed). Returns an unsubscribe function.
export function onInstallabilityChange(cb) {
  listeners.push(cb);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}

export async function promptInstall() {
  if (!deferredPrompt) return 'unavailable';
  deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;
  deferredPrompt = null;
  notify();
  return choice.outcome; // 'accepted' | 'dismissed'
}

// Already running as an installed app (standalone window), on either
// Android/desktop (display-mode media query) or iOS (the old
// `navigator.standalone` flag Safari still uses).
export function isStandalone() {
  return (
    (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    (typeof navigator !== 'undefined' && navigator.standalone === true)
  );
}

// iOS Safari never fires beforeinstallprompt - "Add to Home Screen"
// there is only reachable manually via the Share sheet, so we show
// instructions instead of a button.
export function isIOS() {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
}
