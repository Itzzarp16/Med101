import { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
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

  // Temporary Google profile data for a first-time Google user.
  // The Firebase Auth account is created by Google, but MED101 access/profile
  // setup is completed only after the student finishes our onboarding form.
  const [googleSignupPending, setGoogleSignupPending] = useState(null);

  const deviceUnsubRef = useRef(null);
  const deviceClaimPendingRef = useRef(null);
  const signupGateRef = useRef(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) {
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
              return;
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

              if (
                active &&
                active !== getDeviceId()
              ) {
                setKickedMessage(
                  "You've been signed out because this account was signed in on another device."
                );

                signOut(auth);
              }
            },
            (err) => {
              console.warn(
                'Profile listener failed:',
                err
              );

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
              setProfile(
                snap.exists()
                  ? snap.data()
                  : {}
              );
            },
            (err) => {
              console.warn(
                'Admin profile listener failed:',
                err
              );

              setProfile({});
            }
          );
        }

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

  async function signInWithGoogle() {
    const result = await signInWithPopup(auth, googleProvider);
    const googleUser = result.user;

    if (!googleUser) throw new Error('Google sign-in failed.');

    // Check whether this Google account already has a MED101 profile.
    const snap = await getDoc(doc(db, 'users', googleUser.uid));

    if (!snap.exists()) {
      // A first-time Google user needs MED101-specific information such as
      // username and semester. Keep the account out of the normal app flow
      // until that onboarding is completed.
      const pending = {
        uid: googleUser.uid,
        email: googleUser.email || '',
        name: googleUser.displayName || '',
        photoURL: googleUser.photoURL || '',
      };

      setGoogleSignupPending(pending);
      await signOut(auth);
      return { newUser: true, pending };
    }

    if (!ADMIN_EMAILS.includes(googleUser.email)) {
      if (snap.data().disabled) {
        await signOut(auth);
        throw new Error(
          'This account has been disabled. Contact an admin if you think this is a mistake.'
        );
      }

      setShowWhatsAppPrompt(true);
      deviceClaimPendingRef.current = googleUser.uid;
      await claimDevice(googleUser.uid);
    }

    return { newUser: false, user: googleUser };
  }

  async function completeGoogleSignUp(
    name,
    yearSemester,
    username
  ) {
    if (!googleSignupPending) {
      throw new Error('Google signup session expired. Please start again.');
    }

    const result = await signInWithPopup(auth, googleProvider);
    const googleUser = result.user;

    if (googleUser.uid !== googleSignupPending.uid) {
      await signOut(auth);
      setGoogleSignupPending(null);
      throw new Error('The selected Google account does not match the signup you started.');
    }

    let releaseGate;
    const gate = new Promise((resolve) => { releaseGate = resolve; });
    signupGateRef.current = { uid: googleUser.uid, promise: gate };

    try {
      await updateProfile(googleUser, {
        displayName: name,
        photoURL: googleUser.photoURL || null,
      });

      await setDoc(
        doc(db, 'users', googleUser.uid),
        {
          displayName: name,
          email: googleUser.email || googleSignupPending.email,
          enrolledYearSemester: yearSemester,
          enrolledAt: serverTimestamp(),
          authProvider: 'google',
        },
        { merge: true }
      );

      let usernameClaimError = null;
      if (username) {
        try {
          await googleUser.getIdToken(true);
          let attempt = 0;
          for (;;) {
            try {
              await claimUsername(googleUser, username);
              break;
            } catch (e) {
              const isPermissionIssue =
                e.code === 'permission-denied' || /permission/i.test(e.message || '');
              attempt += 1;
              if (!isPermissionIssue || attempt >= 4) throw e;
              await new Promise((r) => setTimeout(r, 300 * attempt));
              await googleUser.getIdToken(true);
            }
          }
        } catch (e) {
          usernameClaimError = e.message || String(e);
          setSignupNotice(
            `Account created, but the username "${username}" couldn't be set (${usernameClaimError}). You can set one from Settings.`
          );
        }
      }

      if (!ADMIN_EMAILS.includes(googleUser.email)) {
        deviceClaimPendingRef.current = googleUser.uid;
        await claimDevice(googleUser.uid);
        setShowOnboardingTour(true);
      }

      sendWelcomeEmail(googleUser);
      sendAccountCreatedTelegram(googleUser, name, yearSemester, username);
      setGoogleSignupPending(null);

      return { user: googleUser, usernameClaimError };
    } finally {
      releaseGate();
      if (signupGateRef.current?.uid === googleUser.uid) {
        signupGateRef.current = null;
      }
    }
  }

  // yearSemester: e.g. "y1s1", "y1s2".
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
        completeGoogleSignUp,
        signUp,
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
        googleSignupPending,
        setGoogleSignupPending,
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
