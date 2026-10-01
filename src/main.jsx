import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './styles/motion.css'
import App from './App.jsx'
import { AuthProvider } from './lib/AuthContext'
import { initTheme } from './lib/theme'
import { initViewTransitions } from './lib/viewTransition'
import { startVersionWatcher } from './lib/versionCheck'
import OfflineGuard from './components/OfflineGuard.jsx'
import LegalShell from './components/LegalShell'
import ErrorBoundary from './components/ErrorBoundary'

// App.jsx is what ~99% of visitors land on ("/"), so it stays a
// normal static import - no reason to add a network round trip to
// the common case. Everything below is a route only a handful of
// people ever hit (admin, or a handful of static legal pages), so
// each is its own lazy chunk instead of being bundled into the one
// entry file every single visitor downloads and parses - AdminPortal
// alone statically pulls in all six Admin* screens, which is most of
// what was making the main bundle so large.
const AdminPortal = lazy(() => import('./components/AdminPortal.jsx'))
const PrivacyPolicy = lazy(() => import('./components/PrivacyPolicy.jsx'))
const TermsAndConditions = lazy(() => import('./components/TermsAndConditions.jsx'))
const AboutUs = lazy(() => import('./components/AboutUs.jsx'))
const ContactUs = lazy(() => import('./components/ContactUs.jsx'))
const ResetPassword = lazy(() => import('./components/ResetPassword.jsx'))

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
const isContactRoute = path === '/contact';
const isResetPasswordRoute = path === '/reset-password';

initTheme()
initViewTransitions();
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
      {isPrivacyRoute || isTermsRoute || isAboutRoute || isContactRoute ? (
        // Public pages: readable by anyone, but wrapped in the app's top bar
        // (menu, online count, profile) when someone is signed in.
        <AuthProvider>
          <LegalShell>
            <Suspense fallback={<div className="std-loading">Loading…</div>}>
              {isPrivacyRoute ? <PrivacyPolicy />
                : isTermsRoute ? <TermsAndConditions />
                : isAboutRoute ? <AboutUs />
                : <ContactUs />}
            </Suspense>
          </LegalShell>
        </AuthProvider>
      ) : isResetPasswordRoute ? (
        <Suspense fallback={<div className="std-loading">Loading…</div>}><ResetPassword /></Suspense>
      ) : (
        <AuthProvider>
          {isAdminRoute ? (
            <Suspense fallback={<div className="std-loading">Loading…</div>}><AdminPortal /></Suspense>
          ) : <App />}
        </AuthProvider>
      )}
    </ErrorBoundary>
  </StrictMode>,
)
