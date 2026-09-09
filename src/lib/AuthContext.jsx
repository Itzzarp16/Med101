import { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { startTimeTracking } from './timeTracking';
import { claimUsername } from './profile';

// Must exactly match the emails your Firestore isAdmin() security rule checks.
const ADMIN_EMAILS = ['admin.med101@gmail.com', 'admin1.med101@gmail.com'];

const AuthContext = createContext(null);

// ── SINGLE-DEVICE SESSION LOCK ──────────────────────────────────────
// Ported from the old site: a fresh sign-in on any device writes this
// browser's random ID to users/{uid}.activeDeviceId. Every other signed-in
// device is listening (onSnapshot) for that field changing away from its
// own ID, and signs itself out the moment it does. Admin is exempt.
function getDeviceId() {
  let id = localStorage.getItem('medDeviceId');
  if (!id) {
    id = window.crypto?.randomUUID
      ? crypto.randomUUID()
      : 'dev-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem('medDeviceId', id);
  }
  return id;
}

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
      await claimDevice(uid); // pre-feature account - adopt it, don't kick
      return true;
    }
    if (active === getDeviceId()) return true;
    return false; // another device claimed it - caller signs out
  } catch (e) {
    console.warn('verifyDevice failed, allowing access:', e);
    return true;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null); // users/{uid} doc data
  const [loading, setLoading] = useState(true);
  const [kickedMessage, setKickedMessage] = useState(null);
  const deviceUnsubRef = useRef(null);
  const deviceClaimPendingRef = useRef(null); // uid just claimed via explicit login

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) {
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
              return; // onAuthStateChanged fires again with u=null
            }
          }
          if (deviceUnsubRef.current) deviceUnsubRef.current();
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
              // A permissions error or dropped connection here used to
              // leave `profile` stuck at null forever, which in turn
              // hung the whole app on "Loading questions...". Falling
              // back to an empty profile at least lets the student in;
              // App.jsx's own timeout is the second safety net.
              console.warn('Profile listener failed:', err);
              setProfile({});
            }
          );
        } else {
          if (deviceUnsubRef.current) deviceUnsubRef.current();
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

  // Tracks how long this student has the app open in the foreground -
  // see timeTracking.js. Runs for the whole signed-in session and
  // restarts cleanly if the user changes (sign-out then a different
  // sign-in), since it's keyed on user?.uid.
  useEffect(() => {
    if (!user?.uid) return;
    return startTimeTracking(user.uid);
  }, [user?.uid]);

  async function signIn(email, password) {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    if (!ADMIN_EMAILS.includes(cred.user.email)) {
      const snap = await getDoc(doc(db, 'users', cred.user.uid));
      if (snap.exists() && snap.data().disabled) {
        await signOut(auth);
        throw new Error('This account has been disabled. Contact an admin if you think this is a mistake.');
      }
      deviceClaimPendingRef.current = cred.user.uid;
      await claimDevice(cred.user.uid);
    }
    return cred.user;
  }

  // yearSemester: e.g. "y1s1", "y1s2" - the dropdown value from signup.
  // username is claimed here (not left to the caller) because
  // onAuthStateChanged fires independently of this function and can
  // swap the whole screen away as soon as the account exists - doing
  // the claim as part of signUp guarantees it actually runs to
  // completion as part of account creation, not as a race against
  // whatever the UI does once `user` becomes truthy.
  async function signUp(name, email, password, yearSemester, username) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (cred.user) await updateProfile(cred.user, { displayName: name });
    await setDoc(
      doc(db, 'users', cred.user.uid),
      {
        displayName: name,
        email,
        enrolledYearSemester: yearSemester,
        enrolledAt: serverTimestamp(),
      },
      { merge: true }
    );
    let usernameClaimError = null;
    if (username) {
      try {
        // A Firestore write immediately after account creation can be
        // rejected with "permission-denied" if the client hasn't yet
        // picked up the freshly-minted ID token - force a refresh
        // first so this definitely carries valid auth.
        await cred.user.getIdToken(true);
        await claimUsername(cred.user, username);
      } catch (e) {
        // Don't fail the whole signup over a username collision/glitch
        // - the account is real either way. Reported back separately
        // so the caller can tell username-claim failures apart from
        // account-creation failures and message accordingly.
        usernameClaimError = e.message || String(e);
      }
    }
    if (!ADMIN_EMAILS.includes(cred.user.email)) {
      deviceClaimPendingRef.current = cred.user.uid;
      await claimDevice(cred.user.uid);
    }
    return { user: cred.user, usernameClaimError };
  }

  async function logOut() {
    await signOut(auth);
  }

  const isAdmin = !!user && ADMIN_EMAILS.includes(user.email);

  return (
    <AuthContext.Provider
      value={{ user, profile, loading, isAdmin, signIn, signUp, logOut, kickedMessage, setKickedMessage }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
