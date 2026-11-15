import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { getDeviceId } from '../lib/deviceId';
import LoadingLine from './LoadingLine';
import {
  MAIN_SITE_URL,
  fetchHandoffEnabled,
  readAuthHostParams,
  sendBackToMain,
} from '../lib/authHandoff';

const AuthScreen = lazy(() => import('./AuthScreen'));

// What auth.med101.space shows: only the sign-in / create-account screen.
// Once the student is signed in here, a server check issues a one-time pass and
// they are sent back to med101.space, which signs them in with it (see
// AuthContext.jsx). The session on this address is dropped straight afterwards.
export default function AuthHostApp() {
  const {
    user, profile, loading, isAdminAccount, needsGoogleProfileSetup,
    showOnboardingTour, kickedMessage, setKickedMessage, logOut,
  } = useAuth();

  const [params] = useState(() => {
    const p = readAuthHostParams();
    // Use the same device ID as the site the student came from.
    if (p.d) { try { localStorage.setItem('medDeviceId', p.d); } catch { /* ignore */ } }
    return p;
  });
  const [enabled, setEnabled] = useState(null);
  const [error, setError] = useState(null);
  const [claimWaitOver, setClaimWaitOver] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const startedRef = useRef(false);

  // Switched off in the admin portal -> nothing to do here, send them to the main site.
  useEffect(() => {
    let alive = true;
    fetchHandoffEnabled(true).then((on) => {
      if (!alive) return;
      setEnabled(on);
      if (!on) window.location.replace(params.returnOrigin);
    });
    return () => { alive = false; };
  }, [params.returnOrigin]);

  // Give the "this is my active device" write a moment to land before leaving.
  useEffect(() => {
    if (!user) { setClaimWaitOver(false); return undefined; }
    const t = setTimeout(() => setClaimWaitOver(true), 8000);
    return () => clearTimeout(t);
  }, [user]);

  const ready =
    enabled && !loading && !!user && !!profile && !needsGoogleProfileSetup && !isAdminAccount;
  const deviceClaimed = !!profile && profile.activeDeviceId === getDeviceId();

  useEffect(() => {
    if (!ready || startedRef.current) return;
    if (!deviceClaimed && !claimWaitOver) return;
    startedRef.current = true;
    (async () => {
      try {
        const idToken = await user.getIdToken(true);
        const res = await fetch('/api/auth/handoff', {
          method: 'POST',
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body.token) throw new Error(body.error || 'failed');
        const isNew = !!showOnboardingTour;
        await logOut(); // drop the session on this address; the main site starts its own
        sendBackToMain({ returnOrigin: params.returnOrigin, token: body.token, isNew });
      } catch (e) {
        console.warn('Hand-off failed:', e);
        startedRef.current = false;
        setError(e.message === 'admin' ? 'admin' : 'failed');
      }
    })();
  }, [ready, deviceClaimed, claimWaitOver, user, showOnboardingTour, logOut, params.returnOrigin, attempt]);

  const wrap = (children) => (
    <div className="auth-host-note" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24, textAlign: 'center' }}>
      {children}
    </div>
  );

  if (enabled === null || loading) return <LoadingLine />;
  if (enabled === false) return wrap(<div>Taking you to Med101…</div>);

  if (user && isAdminAccount) {
    return wrap(
      <>
        <div style={{ fontSize: 34 }}>🛡️</div>
        <h2 style={{ margin: 0 }}>Admin accounts sign in on the main site</h2>
        <p style={{ margin: 0, maxWidth: 360, opacity: 0.85 }}>Please use med101.space/admin instead.</p>
        <button type="button" className="btn-glow" onClick={() => { logOut(); window.location.replace(`${MAIN_SITE_URL}/admin`); }}>Go to admin sign-in</button>
      </>
    );
  }

  if (error) {
    return wrap(
      <>
        <div style={{ fontSize: 34 }}>⚠️</div>
        <h2 style={{ margin: 0 }}>Couldn't finish signing you in</h2>
        <p style={{ margin: 0, maxWidth: 360, opacity: 0.85 }}>
          Please try again. If it keeps failing, use the classic sign-in on the main site.
        </p>
        <button type="button" className="btn-glow" onClick={() => { setError(null); setAttempt((n) => n + 1); }}>Try again</button>
        <button type="button" className="btn-ghost" onClick={async () => { await logOut(); window.location.replace(`${params.returnOrigin}/?direct=1`); }}>
          Use classic sign-in
        </button>
      </>
    );
  }

  if (user && !needsGoogleProfileSetup) return wrap(<div>Signing you in…</div>);

  return (
    <>
      {kickedMessage && (
        <div className="kicked-banner" onClick={() => setKickedMessage(null)}>{kickedMessage}</div>
      )}
      <Suspense fallback={<LoadingLine />}>
        <AuthScreen />
      </Suspense>
    </>
  );
}
