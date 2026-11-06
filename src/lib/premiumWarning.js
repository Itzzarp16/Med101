import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

// The "no guarantee on answer-key timing" notice shown before paying for Premium,
// and the "I understand" tick that goes with it. Admin-editable from
// Admin > Home Notice, stored at config/premiumWarning (readable by signed-in
// users, writable by admins only - see firestore.rules).
export const DEFAULT_PREMIUM_WARNING = {
  enabled: true,
  text: "If we don't get the correct answer key on time, we can't give any guarantee. We will always try our best to provide the latest questions to everyone on time.",
};

const CACHE_KEY = 'med101_premiumWarning_cache';

export function loadCachedPremiumWarning() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function normalize(data) {
  return {
    enabled: data?.enabled !== false,
    // Empty text falls back to the default instead of showing a blank warning.
    text: (data?.text || '').trim() || DEFAULT_PREMIUM_WARNING.text,
  };
}

// Returns the current warning (the default when nothing has been saved yet),
// or null if the fetch fails so callers keep what they already show.
export async function fetchPremiumWarning() {
  try {
    const snap = await getDoc(doc(db, 'config', 'premiumWarning'));
    const warning = snap.exists() ? normalize(snap.data()) : { ...DEFAULT_PREMIUM_WARNING };
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(warning)); } catch { /* storage unavailable */ }
    return warning;
  } catch (e) {
    console.warn('Premium warning fetch failed:', e);
    return null;
  }
}

export async function savePremiumWarning(text, enabled) {
  await setDoc(
    doc(db, 'config', 'premiumWarning'),
    { text, enabled: enabled !== false, updatedAt: serverTimestamp() },
    { merge: true },
  );
}
