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
import { getFirestore } from 'firebase/firestore';
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
  // TODO: paste the Realtime Database URL here once created in the
  // Firebase console (Build → Realtime Database → Data tab, shown at
  // the top). Something like:
  // databaseURL: 'https://med101-1-default-rtdb.firebaseio.com',
  databaseURL: 'PASTE_REALTIME_DATABASE_URL_HERE',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);
export const rtdb = getDatabase(app);
