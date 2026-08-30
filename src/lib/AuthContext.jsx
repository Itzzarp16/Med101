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

// Must exactly match the email your Firestore isAdmin() security rule checks.
const ADMIN_EMAIL = 'abhishekpatel9324@gmail.com';

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

// Runs for a resumed/persisted sign-in — never for a fresh login (which
// claims unconditionally instead). Fails OPEN on read errors so a network
// hiccup never locks a legitimate student out of studying.
async function verifyDevice(uid) {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    const active = snap.exists() ? snap.data().activeDeviceId : null;
    if (!active) {
      await claimDevice(uid); // pre-feature account — adopt it, don't kick
      return true;
    }
    if (active === getDeviceId()) return true;
    return false; // another device claimed it — caller signs out
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
        if (u.email !== ADMIN_EMAIL) {
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
          deviceUnsubRef.current = onSnapshot(doc(db, 'users', u.uid), (snap) => {
            const data = snap.exists() ? snap.data() : {};
            setProfile(data);
            const active = data.activeDeviceId || null;
            if (active && active !== getDeviceId()) {
              setKickedMessage(
                "You've been signed out because this account was signed in on another device."
              );
              signOut(auth);
            }
          });
        } else {
          if (deviceUnsubRef.current) deviceUnsubRef.current();
          deviceUnsubRef.current = onSnapshot(doc(db, 'users', u.uid), (snap) => {
            setProfile(snap.exists() ? snap.data() : null);
          });
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

  async function signIn(email, password) {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    if (cred.user.email !== ADMIN_EMAIL) {
      deviceClaimPendingRef.current = cred.user.uid;
      await claimDevice(cred.user.uid);
    }
    return cred.user;
  }

  // yearSemester: e.g. "y1s1", "y1s2" — the dropdown value from signup
  async function signUp(name, email, password, yearSemester) {
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
    if (cred.user.email !== ADMIN_EMAIL) {
      deviceClaimPendingRef.current = cred.user.uid;
      await claimDevice(cred.user.uid);
    }
    return cred.user;
  }

  async function logOut() {
    await signOut(auth);
  }

  const isAdmin = !!user && user.email === ADMIN_EMAIL;

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
