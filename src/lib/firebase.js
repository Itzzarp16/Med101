// ── FIREBASE SETUP ────────────────────────────────────────────
// Fill these in once you've created the NEW Firebase project.
// Firebase → Project settings → General → "Your apps" → SDK setup
// and configuration → gives you this exact object to copy/paste.
//
// This config is safe to keep in the code (it's not a secret —
// it ships to every browser anyway). Access is actually controlled
// by your Firestore Security Rules, not by hiding this object.

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentSingleTabManager } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: 'AIzaSyD_iSCYOkHdH1DS46dTgBjUnHVJijQa0qs',
  authDomain: 'med101-1.firebaseapp.com',
  projectId: 'med101-1',
  storageBucket: 'med101-1.firebasestorage.app',
  messagingSenderId: '667349814997',
  appId: '1:667349814997:web:e26623e947854bf4dfdc5c',
  measurementId: 'G-FLR7J9DB61',
  databaseURL: 'https://med101-1-default-rtdb.asia-southeast1.firebasedatabase.app',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Offline persistence: caches every document Firestore has read into
// IndexedDB, so migrated question subjects, the student's own profile,
// leaderboard data, etc. remain readable with no network at all —
// Firebase handles the cache/sync entirely on its own once this is on.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentSingleTabManager({}) }),
});

export const storage = getStorage(app);
export const functions = getFunctions(app);
export const rtdb = getDatabase(app);
