import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

// Ported from the old site's window.__cloudNotice: an admin-editable
// notice shown to students, stored in Firestore so it can be updated
// from inside the app - no redeploy needed.
//
// Per-semester notices live at config/homeNotice_{semesterId} (e.g.
// config/homeNotice_y2s1); config/homeNotice (no suffix) is the
// "All semesters" default, shown to any semester that doesn't have
// its own notice set. This means setting only the default behaves
// exactly like before this feature existed - per-semester notices are
// opt-in per semester from AdminNoticeScreen, not required.
function noticeDocId(semesterId) {
  return semesterId ? `homeNotice_${semesterId}` : 'homeNotice';
}

export async function fetchHomeNotice(semesterId) {
  try {
    if (semesterId) {
      const semSnap = await getDoc(doc(db, 'config', noticeDocId(semesterId)));
      if (semSnap.exists() && semSnap.data()?.enabled) return semSnap.data();
    }
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
// up any admin edit within a few seconds. Keyed per semester so
// switching semesters (or the cache from before this feature existed)
// never shows another semester's stale cached notice.
const NOTICE_CACHE_KEY_PREFIX = 'med101_homeNotice_cache';

function cacheKey(semesterId) {
  return semesterId ? `${NOTICE_CACHE_KEY_PREFIX}_${semesterId}` : NOTICE_CACHE_KEY_PREFIX;
}

export function loadCachedHomeNotice(semesterId) {
  try {
    const raw = localStorage.getItem(cacheKey(semesterId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveCachedHomeNotice(notice, semesterId) {
  try {
    localStorage.setItem(cacheKey(semesterId), JSON.stringify(notice));
  } catch {
    // Storage full/unavailable - just skips the instant-render benefit.
  }
}

// semesterId omitted (or null) saves the "All semesters" default;
// passed, saves that semester's own override.
export async function saveHomeNotice(text, enabled, semesterId) {
  await setDoc(
    doc(db, 'config', noticeDocId(semesterId)),
    { text, enabled: enabled !== false, updatedAt: serverTimestamp() },
    { merge: true }
  );
}
