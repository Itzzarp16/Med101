// ── FIREBASE SETUP ────────────────────────────────────────────
// Fill these in once you've created the NEW Firebase project.
// Firebase → Project settings → General → "Your apps" → SDK setup
// and configuration → gives you this exact object to copy/paste.
//
// This config is safe to keep in the code (it's not a secret -
// it ships to every browser anyway). Access is actually controlled
// by your Firestore Security Rules, not by hiding this object.

import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: 'AIzaSyD_iSCYOkHdH1DS46dTgBjUnHVJijQa0qs',
  authDomain: 'auth.med101.space',
  projectId: 'med101-1',
  storageBucket: 'med101-1.firebasestorage.app',
  messagingSenderId: '667349814997',
  appId: '1:667349814997:web:e26623e947854bf4dfdc5c',
  measurementId: 'G-FLR7J9DB61',
  databaseURL: 'https://med101-1-default-rtdb.asia-southeast1.firebasedatabase.app',
};

export const app = initializeApp(firebaseConfig);

// ── App Check (bot protection) ───────────────────────────────
// Proves to Firebase that a request comes from THIS website running in a
// real browser, not from a script calling Firebase's public API directly
// (the usual way mass fake signups are made - the apiKey above is public).
// Uses reCAPTCHA v3, which is invisible: students never see a challenge.
//
// Needs VITE_RECAPTCHA_SITE_KEY (public site key, set in Vercel). Without
// it this does nothing, so the app works exactly as before. Once the key
// is set AND "Enforce" is switched on for Authentication in the Firebase
// console (App Check > APIs), unverified requests are rejected.
//
// Must run before the services below are used, so it sits right here.
const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY || '';
if (RECAPTCHA_SITE_KEY) {
  try {
    // Local dev can't pass reCAPTCHA; the SDK prints a debug token in the
    // console that you register under App Check > Apps > Manage debug tokens.
    if (import.meta.env.DEV) self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(RECAPTCHA_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (e) {
    // Never let App Check setup take the whole app down.
    console.warn('App Check could not start:', e);
  }
}

export const auth = getAuth(app);

// Deliberately NOT using persistentLocalCache here - the site is meant
// to require a live connection (no working offline with stale cached
// data), so this uses Firestore's default in-memory-only cache: reads
// and writes fail immediately when there's no connection, rather than
// silently continuing to work from IndexedDB.
export const db = getFirestore(app);

export const storage = getStorage(app);
export const functions = getFunctions(app);
export const rtdb = getDatabase(app);
