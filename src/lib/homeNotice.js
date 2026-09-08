import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

// Ported from the old site's window.__cloudNotice: a single admin-
// editable notice shown to every student, stored at config/homeNotice
// so it can be updated from inside the app - no redeploy needed.
export async function fetchHomeNotice() {
  try {
    const snap = await getDoc(doc(db, 'config', 'homeNotice'));
    if (!snap.exists()) return null;
    return snap.data(); // { text, enabled, updatedAt }
  } catch (e) {
    console.warn('Notice fetch failed:', e);
    return null;
  }
}

// The banner used to stay blank until this Firestore round trip
// finished, so it visibly popped in a few seconds after the rest of
// the dashboard rendered. Caching the last-seen notice in localStorage
// lets the banner render instantly (from cache) on every load after
// the first, while a fresh fetch still runs in the background to pick
// up any admin edit within a few seconds.
const NOTICE_CACHE_KEY = 'med101_homeNotice_cache';

export function loadCachedHomeNotice() {
  try {
    const raw = localStorage.getItem(NOTICE_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveCachedHomeNotice(notice) {
  try {
    localStorage.setItem(NOTICE_CACHE_KEY, JSON.stringify(notice));
  } catch {
    // Storage full/unavailable - just skips the instant-render benefit.
  }
}

export async function saveHomeNotice(text, enabled) {
  await setDoc(
    doc(db, 'config', 'homeNotice'),
    { text, enabled: enabled !== false, updatedAt: serverTimestamp() },
    { merge: true }
  );
}
