import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

// Ported from the old site's window.__cloudNotice: a single admin-
// editable notice shown to every student, stored at config/homeNotice
// so it can be updated from inside the app — no redeploy needed.
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

export async function saveHomeNotice(text, enabled) {
  await setDoc(
    doc(db, 'config', 'homeNotice'),
    { text, enabled: enabled !== false, updatedAt: serverTimestamp() },
    { merge: true }
  );
}
