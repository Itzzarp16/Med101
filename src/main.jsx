import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import App from './App.jsx'
import AdminPortal from './components/AdminPortal.jsx'
import PrivacyPolicy from './components/PrivacyPolicy.jsx'
import TermsAndConditions from './components/TermsAndConditions.jsx'
import AboutUs from './components/AboutUs.jsx'
import { AuthProvider } from './lib/AuthContext'
import { initTheme } from './lib/theme'
import { startVersionWatcher } from './lib/versionCheck'
import OfflineGuard from './components/OfflineGuard.jsx'
import ErrorBoundary from './components/ErrorBoundary'

// App.jsx's own navigation (screen state + pushState) never changes
// the URL path - the whole student SPA lives at "/". So a real path
// check here is all it takes to give /admin (and other static routes)
// their own dedicated page, without touching that existing navigation
// system at all.
const path = window.location.pathname.replace(/\/+$/, '');
const isAdminRoute = path === '/admin';
const isPrivacyRoute = path === '/privacy-policy';
const isTermsRoute = path === '/terms';
const isAboutRoute = path === '/about-us';

initTheme();
startVersionWatcher();

// Register the service worker so the browser will actually offer
// "Add to Home Screen" / install (Chrome requires one to be present,
// even though it doesn't cache anything - see public/sw.js).
//
// It also doubles as our "new version deployed" signal: every time the
// browser fetches a changed sw.js, the new worker skips waiting and
// takes control (see public/sw.js), firing 'controllerchange' below -
// at which point we reload so the user gets the new build automatically
// instead of needing a manual hard refresh. We also poll for updates
// periodically so a tab left open for a while still picks up a new
// deploy, not just ones caught on next navigation.
if ('serviceWorker' in navigator) {
  // If there's already a controller, this page was previously served by
  // an older service worker - a controllerchange from here on means a
  // newer one just took over, i.e. a real update. On a brand-new
  // visitor's first-ever load there's no controller yet, so we skip the
  // reload then (that initial claim isn't an "update").
  const hadController = !!navigator.serviceWorker.controller;
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((registration) => {
      setInterval(() => registration.update(), 60 * 1000);
    }).catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <OfflineGuard />
      {isPrivacyRoute ? (
        <PrivacyPolicy />
      ) : isTermsRoute ? (
        <TermsAndConditions />
      ) : isAboutRoute ? (
        <AboutUs />
      ) : (
        <AuthProvider>
          {isAdminRoute ? <AdminPortal /> : <App />}
        </AuthProvider>
      )}
    </ErrorBoundary>
  </StrictMode>,
)
