import { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { doc, getDoc, getDocFromServer, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { startTimeTracking } from './timeTracking';
import { claimUsername } from './profile';
import { getDeviceId } from './deviceId';

// Must exactly match the emails your Firestore isAdmin() security rule checks.
const ADMIN_EMAILS = ['admin.med101@gmail.com', 'admin1.med101@gmail.com', 'admin2.med101@gmail.com'];

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

const AuthContext = createContext(null);

// ── SINGLE-DEVICE SESSION LOCK ──────────────────────────────────────
// Ported from the old site: a fresh sign-in on any device writes this
// browser's random ID to users/{uid}.activeDeviceId. Every other signed-in
// device is listening (onSnapshot) for that field changing away from its
// own ID, and signs itself out the moment it does. Admin is exempt.

async function claimDevice(uid) {
  try {
    await setDoc(
      doc(db, 'users', uid),
      { activeDeviceId: getDeviceId(), activeDeviceAt: serverTimestamp() },
      { merge: true }
    );
  } catch (e) {
    console.warn('claimDevice failed (check Firestore rules):', e);
  }
}

// Runs for a resumed/persisted sign-in - never for a fresh login (which
// claims unconditionally instead). Fails OPEN on read errors so a network
// hiccup never locks a legitimate student out of studying.
async function verifyDevice(uid) {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    const active = snap.exists() ? snap.data().activeDeviceId : null;
    if (!active) {
      await claimDevice(uid);
      return true;
    }
    if (active === getDeviceId()) return true;
    return false;
  } catch (e) {
    console.warn('verifyDevice failed, allowing access:', e);
    return true;
  }
}

// Fire-and-forget - a slow/failed email send should never hold up or
// break account creation. The endpoint itself is idempotent (checks
// users/{uid}.welcomeEmailSent) so a retry or double-call is harmless.
async function sendWelcomeEmail(user) {
  try {
    const idToken = await user.getIdToken();
    await fetch('/api/send-welcome-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: '{}',
    });
  } catch (e) {
    console.warn('Welcome email failed to send:', e);
  }
}

// Fire-and-forget account creation Telegram notification.
// Telegram credentials remain safely on the Vercel server.
async function sendAccountCreatedTelegram(
  user,
  name,
  yearSemester,
  username
) {
  try {
    const idToken = await user.getIdToken();

    await fetch('/api/telegram/account-created', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        name,
        yearSemester,
        username,
      }),
    });
  } catch (e) {
    // Telegram failure must never break account creation.
    console.warn(
      'Account creation Telegram notification failed:',
      e
    );
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // updateProfile() mutates auth.currentUser in place rather than
  // replacing it, so setUser(auth.currentUser) after a photo/name
  // change would be setting state to the exact same reference React
  // already has - a same-reference setState is a no-op bail-out.
  const [, bumpUserTick] = useState(0);

  const [kickedMessage, setKickedMessage] = useState(null);

  // Surfaced when signup succeeds but the username claim didn't.
  const [signupNotice, setSignupNotice] = useState(null);

  // Shown once right after a successful sign-in or signup.
  const [showWhatsAppPrompt, setShowWhatsAppPrompt] = useState(false);

  // Only set on signUp() (new accounts), never signIn().
  const [showOnboardingTour, setShowOnboardingTour] = useState(false);

  // Message shown on the login screen for Google redirect errors or
  // Google accounts that do not have a MED101 profile yet.
  const [authMessage, setAuthMessage] = useState(null);

  // True while a Google account is signed in to Firebase Auth but still
  // needs its MED101 Firestore profile finished (username + year/semester -
  // name and email already came from the Google account). App.jsx keeps
  // showing AuthScreen while this is true, and AuthScreen renders the
  // short "finish setting up" form instead of the normal login/signup UI.
  const [needsGoogleProfileSetup, setNeedsGoogleProfileSetup] = useState(false);

  const deviceUnsubRef = useRef(null);
  const deviceClaimPendingRef = useRef(null);
  const signupGateRef = useRef(null);

  // Builds the MED101 Firestore profile for a Google account - either
  // right after Google sign-in (see the onAuthStateChanged effect below,
  // which is only reachable this way for a first-time Google user with a
  // pending signup intent) or once completeGoogleProfileSetup below has
  // collected the username/year+semester. name/email come straight off
  // the Google account, never asked for again.
  async function completeGoogleSignup(user, yearSemester, username) {
    if (!ADMIN_EMAILS.includes(user.email)) {
      setShowOnboardingTour(true);
    }

    const name = user.displayName || '';

    await setDoc(
      doc(db, 'users', user.uid),
      {
        displayName: name,
        email: user.email,
        enrolledYearSemester: yearSemester,
        enrolledAt: serverTimestamp(),
      },
      { merge: true }
    );

    let usernameClaimError = null;

    if (username) {
      try {
        await user.getIdToken(true);

        let attempt = 0;

        for (;;) {
          try {
            await claimUsername(user, username);
            break;
          } catch (e) {
            const isPermissionIssue =
              e.code === 'permission-denied' ||
              /permission/i.test(e.message || '');

            attempt += 1;

            if (!isPermissionIssue || attempt >= 4) {
              throw e;
            }

            await new Promise((r) => setTimeout(r, 300 * attempt));
            await user.getIdToken(true);
          }
        }
      } catch (e) {
        usernameClaimError = e.message || String(e);

        setSignupNotice(
          `Account created, but the username "${username}" couldn't be set (${usernameClaimError}). You can set one from Settings.`
        );
      }
    }

    // Fire-and-forget, same as email/password signup - never block on these.
    sendWelcomeEmail(user);
    sendAccountCreatedTelegram(user, name, yearSemester, username);

    return { usernameClaimError };
  }

  // Runs the same device-claim + live profile listener that a normal
  // sign-in gets, for a uid whose Firestore profile is known to exist
  // (or was just created). Shared by onAuthStateChanged below and by
  // completeGoogleProfileSetup, which needs to attach this manually
  // since Firebase auth state itself doesn't change again just because
  // the Firestore doc was created after the fact.
  // Returns false if the device check signed the user out.
  async function attachProfileSession(u) {
    if (!ADMIN_EMAILS.includes(u.email)) {
      if (deviceClaimPendingRef.current === u.uid) {
        deviceClaimPendingRef.current = null;
      } else {
        const ok = await verifyDevice(u.uid);

        if (!ok) {
          setKickedMessage(
            "You've been signed out because this account was signed in on another device."
          );

          await signOut(auth);
          return false;
        }
      }

      if (deviceUnsubRef.current) {
        deviceUnsubRef.current();
      }

      deviceUnsubRef.current = onSnapshot(
        doc(db, 'users', u.uid),
        (snap) => {
          const data = snap.exists() ? snap.data() : {};

          setProfile(data);

          if (data.disabled) {
            setKickedMessage(
              'This account has been disabled. Contact an admin if you think this is a mistake.'
            );

            signOut(auth);
            return;
          }

          const active = data.activeDeviceId || null;

          if (active && active !== getDeviceId()) {
            setKickedMessage(
              "You've been signed out because this account was signed in on another device."
            );

            signOut(auth);
          }
        },
        (err) => {
          console.warn('Profile listener failed:', err);
          setProfile({});
        }
      );
    } else {
      if (deviceUnsubRef.current) {
        deviceUnsubRef.current();
      }

      deviceUnsubRef.current = onSnapshot(
        doc(db, 'users', u.uid),
        (snap) => {
          setProfile(snap.exists() ? snap.data() : {});
        },
        (err) => {
          console.warn('Admin profile listener failed:', err);
          setProfile({});
        }
      );
    }

    return true;
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setAuthMessage(null);

        // Google can now also be used to CREATE a MED101 account. A
        // Google account with no MED101 profile yet is either (a) an
        // in-progress Google signup - the "Continue with Google" button
        // on Create Account sets med101GoogleIntent = 'signup' before
        // the redirect - in which case we keep them signed in and let
        // AuthScreen collect username + year/semester, or (b) a plain
        // login attempt on a Google account that never created a MED101
        // account, which still gets signed back out as before.
        const isGoogleUser = u.providerData?.some(
          (provider) => provider.providerId === 'google.com'
        );

        if (isGoogleUser) {
          const googleProfileSnap = await getDoc(
            doc(db, 'users', u.uid)
          );

          if (!googleProfileSnap.exists()) {
            const intent = sessionStorage.getItem('med101GoogleIntent');

            if (intent === 'signup') {
              // Deliberately NOT cleared yet - if the page reloads while
              // they're on the "finish setting up" form, this lets that
              // form reappear instead of silently signing them out.
              setNeedsGoogleProfileSetup(true);
              setUser(u);
              setLoading(false);
              return;
            }

            sessionStorage.removeItem('med101GoogleIntent');
            await signOut(auth);
            setAuthMessage(
              'No MED101 account was found for this Google account. Please create your MED101 account first, then use Continue with Google to sign in.'
            );
            return;
          }

          sessionStorage.removeItem('med101GoogleIntent');
          setNeedsGoogleProfileSetup(false);
        }

        // If this uid just came from signUp(), wait for it to fully
        // finish before doing anything else.
        if (
          signupGateRef.current &&
          signupGateRef.current.uid === u.uid
        ) {
          await signupGateRef.current.promise;

          // Give AuthScreen a moment to receive the signup result.
          await new Promise((r) => setTimeout(r, 1200));
        }

        const ok = await attachProfileSession(u);
        if (!ok) return;

        setUser(u);
      } else {
        if (deviceUnsubRef.current) {
          deviceUnsubRef.current();
          deviceUnsubRef.current = null;
        }

        deviceClaimPendingRef.current = null;

        setUser(null);
        setProfile(null);
      }

      setLoading(false);
    });

    return () => unsub();
  }, []);

  // Google sign-in uses Firebase's redirect flow instead of a popup.
  // This is much more reliable on mobile browsers. After Google returns,
  // onAuthStateChanged above performs the normal MED101 profile/device checks.
  //
  // getRedirectResult() resolves to a real UserCredential only on the
  // page load that's the direct return from signInWithRedirect() - a
  // normal page load with an already-signed-in persisted session
  // resolves to null. That's what makes this (not onAuthStateChanged)
  // the right place to fire the WhatsApp prompt: it's the only signal
  // that distinguishes "just finished a fresh Google sign-in" from
  // "resumed an existing session", same distinction signIn()/signUp()
  // get for free by only running on an actual button click.
  useEffect(() => {
    let active = true;

    getRedirectResult(auth)
      .then(async (result) => {
        if (!active) return;

        const wasPending = sessionStorage.getItem('med101PendingGoogleRedirect') === '1';
        sessionStorage.removeItem('med101PendingGoogleRedirect');

        if (!result?.user) {
          // We started a Google redirect and came back with nothing -
          // not a normal page load, an actual silent failure (usually
          // the browser blocking Firebase's cross-site storage read).
          if (wasPending) {
            sessionStorage.removeItem('med101GoogleIntent');
            setAuthMessage(
              "Google sign-in didn't complete. This can happen because of your browser's privacy settings. Please try again, or sign in with your email and password instead."
            );
          }
          return;
        }

        if (ADMIN_EMAILS.includes(result.user.email)) return;

        // Re-check profile existence/disabled status here rather than
        // trusting onAuthStateChanged already did - that check runs in
        // a separate effect and may not have resolved yet, and this
        // must never show the prompt to an account that's about to be
        // signed back out (no MED101 profile, or disabled) or that
        // still needs to finish the username/year+semester step.
        const snap = await getDoc(doc(db, 'users', result.user.uid));
        if (!active) return;
        if (snap.exists() && !snap.data().disabled) {
          setShowWhatsAppPrompt(true);
        }
      })
      .catch((err) => {
        sessionStorage.removeItem('med101PendingGoogleRedirect');
        sessionStorage.removeItem('med101GoogleIntent');

        if (!active) return;

        const messages = {
          'auth/network-request-failed': 'Network error. Check your connection.',
          'auth/unauthorized-domain': 'This domain is not authorized for Google sign-in in Firebase.',
          'auth/account-exists-with-different-credential':
            'An account already exists with this email using a different sign-in method. Please sign in with your email and password.',
        };

        setAuthMessage(
          messages[err.code] ||
            err.message ||
            'Google sign-in failed. Please try again.'
        );
      });

    return () => {
      active = false;
    };
  }, []);

  // ── Close the offline bypass window ────────────────────────────

  useEffect(() => {
    if (!user || ADMIN_EMAILS.includes(user.email)) {
      return;
    }

    async function recheck() {
      try {
        const snap = await getDocFromServer(
          doc(db, 'users', user.uid)
        );

        const active = snap.exists()
          ? snap.data().activeDeviceId
          : null;

        if (
          active &&
          active !== getDeviceId()
        ) {
          setKickedMessage(
            "You've been signed out because this account was signed in on another device."
          );

          await signOut(auth);
        }
      } catch (e) {
        console.warn(
          'Device re-check failed (likely offline):',
          e
        );
      }
    }

    function onVisible() {
      if (
        document.visibilityState === 'visible'
      ) {
        recheck();
      }
    }

    window.addEventListener(
      'online',
      recheck
    );

    document.addEventListener(
      'visibilitychange',
      onVisible
    );

    return () => {
      window.removeEventListener(
        'online',
        recheck
      );

      document.removeEventListener(
        'visibilitychange',
        onVisible
      );
    };
  }, [user]);

  // Tracks how long this student has the app open in the foreground.
  useEffect(() => {
    if (!user?.uid) return;

    return startTimeTracking(user.uid);
  }, [user?.uid]);

  async function signIn(email, password) {
    const cred =
      await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

    if (!ADMIN_EMAILS.includes(cred.user.email)) {
      const snap = await getDoc(
        doc(db, 'users', cred.user.uid)
      );

      if (
        snap.exists() &&
        snap.data().disabled
      ) {
        await signOut(auth);

        throw new Error(
          'This account has been disabled. Contact an admin if you think this is a mistake.'
        );
      }

      setShowWhatsAppPrompt(true);

      deviceClaimPendingRef.current =
        cred.user.uid;

      await claimDevice(
        cred.user.uid
      );
    }

    return cred.user;
  }

  // Google is used for BOTH login and account creation. We use redirect
  // instead of popup because popup flows can be reported as "cancelled"
  // by mobile browsers.
  //
  // intent: pass 'signup' from the Create Account tab so, if this Google
  // account turns out to have no MED101 profile yet, onAuthStateChanged
  // above treats it as a new signup (asks for username/year+semester)
  // instead of signing the user back out. Login's "Continue with Google"
  // button omits it.
  async function signInWithGoogle(intent) {
    setAuthMessage(null);

    // Firebase reads the pending redirect state back via a hidden iframe
    // on authDomain (med101-1.firebaseapp.com), which is third-party
    // relative to our custom domain. Some browsers (Chrome's storage
    // partitioning, Safari ITP, in-app browsers) block that read, and
    // getRedirectResult() then just resolves to null with no error at
    // all - the user silently lands back on a blank login screen. This
    // flag lets us tell that case apart from "no redirect was pending"
    // and show a real message instead of failing silently.
    sessionStorage.setItem('med101PendingGoogleRedirect', '1');

    if (intent === 'signup') {
      sessionStorage.setItem('med101GoogleIntent', 'signup');
    } else {
      // Plain login - clear out any stale signup attempt that never
      // made it back (e.g. the user abandoned Create Account mid-redirect).
      sessionStorage.removeItem('med101GoogleIntent');
    }

    await signInWithRedirect(auth, googleProvider);
  }

  // Called from AuthScreen's "finish setting up your account" form once
  // the Google account is signed in but still needs a MED101 profile.
  // Only username + year/semester are asked for here - name and email
  // already came from the Google account via completeGoogleSignup.
  async function completeGoogleProfileSetup(username, yearSemester) {
    const u = auth.currentUser;

    if (!u) {
      throw new Error('You were signed out. Please try Continue with Google again.');
    }

    const { usernameClaimError } = await completeGoogleSignup(u, yearSemester, username);

    sessionStorage.removeItem('med101GoogleIntent');
    setNeedsGoogleProfileSetup(false);

    if (!ADMIN_EMAILS.includes(u.email)) {
      deviceClaimPendingRef.current = u.uid;
      await claimDevice(u.uid);
    }

    // onAuthStateChanged already ran (and returned early) for this uid
    // back when Google sign-in first completed, so it won't fire again
    // just because the Firestore doc now exists - attach the device
    // claim/profile listener ourselves, same as signUp() effectively
    // gets from onAuthStateChanged running a second time.
    await attachProfileSession(u);

    return { usernameClaimError };
  }

  // Backs out of an in-progress Google signup (e.g. they picked the
  // wrong Google account, or want to go back and use email/password
  // instead) - signs out of the half-finished Google session entirely.
  async function cancelGoogleProfileSetup() {
    sessionStorage.removeItem('med101GoogleIntent');
    setNeedsGoogleProfileSetup(false);
    await signOut(auth);
  }
  // username is claimed here rather than left to the caller because
  // onAuthStateChanged fires independently of this function.

  async function signUp(
    name,
    email,
    password,
    yearSemester,
    username
  ) {
    const cred =
      await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

    // Show onboarding immediately after Firebase account creation.
    if (!ADMIN_EMAILS.includes(cred.user.email)) {
      setShowOnboardingTour(true);
    }

    let releaseGate;

    const gate = new Promise((resolve) => {
      releaseGate = resolve;
    });

    signupGateRef.current = {
      uid: cred.user.uid,
      promise: gate,
    };

    try {
      if (cred.user) {
        await updateProfile(
          cred.user,
          {
            displayName: name,
          }
        );
      }

      await setDoc(
        doc(
          db,
          'users',
          cred.user.uid
        ),
        {
          displayName: name,
          email,
          enrolledYearSemester:
            yearSemester,
          enrolledAt:
            serverTimestamp(),
        },
        {
          merge: true,
        }
      );

      let usernameClaimError = null;

      if (username) {
        try {
          await cred.user.getIdToken(true);

          let attempt = 0;

          for (;;) {
            try {
              await claimUsername(
                cred.user,
                username
              );

              break;
            } catch (e) {
              const isPermissionIssue =
                e.code ===
                  'permission-denied' ||
                /permission/i.test(
                  e.message || ''
                );

              attempt += 1;

              if (
                !isPermissionIssue ||
                attempt >= 4
              ) {
                throw e;
              }

              await new Promise(
                (r) =>
                  setTimeout(
                    r,
                    300 * attempt
                  )
              );

              await cred.user.getIdToken(
                true
              );
            }
          }
        } catch (e) {
          usernameClaimError =
            e.message ||
            String(e);

          setSignupNotice(
            `Account created, but the username "${username}" couldn't be set (${usernameClaimError}). You can set one from Settings.`
          );
        }
      }

      if (
        !ADMIN_EMAILS.includes(
          cred.user.email
        )
      ) {
        deviceClaimPendingRef.current =
          cred.user.uid;

        await claimDevice(
          cred.user.uid
        );
      }

      // Existing welcome email.
      // Fire-and-forget - never blocks signup.
      sendWelcomeEmail(
        cred.user
      );

      // NEW:
      // Telegram notification for successful account creation.
      // Fire-and-forget - never blocks signup.
      sendAccountCreatedTelegram(
        cred.user,
        name,
        yearSemester,
        username
      );

      return {
        user: cred.user,
        usernameClaimError,
      };
    } finally {
      releaseGate();

      if (
        signupGateRef.current?.uid ===
        cred.user.uid
      ) {
        signupGateRef.current = null;
      }
    }
  }

  async function logOut() {
    await signOut(auth);
  }

  // Called when the onboarding tour finishes or is skipped.
  function finishOnboardingTour() {
    setShowOnboardingTour(false);
    setShowWhatsAppPrompt(true);
  }

  // Call after anything that mutates auth.currentUser directly.
  async function refreshUser() {
    if (!auth.currentUser) return;

    await auth.currentUser.reload();

    bumpUserTick(
      (n) => n + 1
    );
  }

  const isAdmin =
    !!user &&
    ADMIN_EMAILS.includes(
      user.email
    );

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        isAdmin,
        signIn,
        signInWithGoogle,
        signUp,
        needsGoogleProfileSetup,
        completeGoogleProfileSetup,
        cancelGoogleProfileSetup,
        logOut,
        refreshUser,
        kickedMessage,
        setKickedMessage,
        signupNotice,
        setSignupNotice,
        showWhatsAppPrompt,
        setShowWhatsAppPrompt,
        showOnboardingTour,
        finishOnboardingTour,
        authMessage,
        setAuthMessage,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(
    AuthContext
  );

  if (!ctx) {
    throw new Error(
      'useAuth must be used inside AuthProvider'
    );
  }

  return ctx;
                }
