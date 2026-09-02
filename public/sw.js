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
