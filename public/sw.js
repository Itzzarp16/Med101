// Minimal service worker - exists purely to satisfy PWA installability
// criteria (Chrome/Android require a registered service worker with a
// fetch handler before showing "Add to Home Screen"). Deliberately does
// NOT cache anything: the app already has its own offline handling
// (Firestore's IndexedDB persistence + the localStorage question-bank
// fallback in useSemesterData.js), so an SW-level cache here would just
// risk serving stale HTML/JS after a deploy. Every request just passes
// straight through to the network as normal.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});

// ── Push notifications (challenge invites) ───────────────────
// The server sends data-only messages ({title, body, url, tag}) so this
// file stays free of any Firebase code. If the app is open and in front
// of the student, the in-app invite card already shows it, so we skip
// the system notification then.
self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (e) { /* non-JSON push */ }
  const d = payload.data || payload.notification || payload;
  const title = d.title || 'Med101';
  const options = {
    body: d.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: d.tag || 'med101',
    data: { url: d.url || '/', screen: d.screen || '' },
  };
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Invites are already shown in-app, so skip the system notification while
    // the app is in front. Admin broadcasts have no in-app card - always show.
    if (d.kind !== 'broadcast' && wins.some((w) => w.visibilityState === 'visible' && w.focused)) return;
    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const nd = event.notification.data || {};
  const url = nd.url || '/';
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if ('focus' in w) {
        await w.focus();
        // App already open: tell it which screen to show.
        if (nd.screen && nd.screen !== 'home') w.postMessage({ type: 'open-screen', screen: nd.screen });
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
