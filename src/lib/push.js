// Web push notifications (Firebase Cloud Messaging). Used so a friend
// gets a real notification on their phone when someone challenges them,
// even with the app closed.
//
// Setup needed once: Firebase Console -> Project settings -> Cloud
// Messaging -> Web Push certificates -> generate a key pair, then put
// the PUBLIC key in VAPID_KEY below (or the VITE_FIREBASE_VAPID_KEY env
// var). Until then pushConfigured() is false and the UI hides itself.
//
// The messaging SDK is only imported when a student actually enables
// notifications, so it never adds to the main bundle.

import { auth, app } from './firebase';

export const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY || '';
const TOKEN_KEY = 'med101_push_token';

export const pushConfigured = () => !!VAPID_KEY;

export async function pushSupported() {
  if (typeof window === 'undefined') return false;
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  try {
    const { isSupported } = await import('firebase/messaging');
    return await isSupported();
  } catch {
    return false;
  }
}

export const pushPermission = () => ('Notification' in window ? Notification.permission : 'unsupported');

export const pushEnabled = () => pushPermission() === 'granted' && !!localStorage.getItem(TOKEN_KEY);

const SIGNED_OUT_MESSAGE = 'Your sign-in has expired on this device. Please log out and log in again, then turn notifications on.';

// A fresh ID token for the signed-in student. Waits for Firebase Auth to
// finish restoring the session first, and turns "no user" into a readable
// message instead of a raw "Cannot read properties of null (reading
// 'getIdToken')" TypeError.
async function getIdTokenOrThrow() {
  try { await auth.authStateReady?.(); } catch { /* older SDKs: fall through to currentUser */ }
  const user = auth.currentUser;
  if (!user) throw new Error(SIGNED_OUT_MESSAGE);
  return user.getIdToken();
}

async function callApi(path, body, idTokenIn) {
  const idToken = idTokenIn || (await getIdTokenOrThrow());
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed (${res.status})`);
  }
}

async function fetchToken() {
  const { getMessaging, getToken } = await import('firebase/messaging');
  const registration = await navigator.serviceWorker.ready;
  return getToken(getMessaging(app), { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
}

// Asks permission (must be called from a tap), gets this device's token
// and registers it against the signed-in account.
export async function enablePush() {
  if (!pushConfigured()) throw new Error('Notifications are not set up yet.');
  // Get the sign-in token FIRST. The permission pop-up and the service worker
  // can take a while (and the page may be hidden meanwhile), so the session is
  // checked up front and the token is kept, instead of being looked up again
  // at the very end. If the student isn't really signed in, we find out
  // before asking for permission.
  const idToken = await getIdTokenOrThrow();
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications are blocked. Allow them in your browser settings, then try again.');
  const token = await fetchToken();
  if (!token) throw new Error('Could not get a notification token on this device.');
  await callApi('/api/push/register', { action: 'register', token }, idToken);
  localStorage.setItem(TOKEN_KEY, token);
}

export async function disablePush() {
  const token = localStorage.getItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY);
  if (!token) return;
  try {
    await callApi('/api/push/register', { action: 'unregister', token });
  } catch { /* best effort - server prunes dead tokens itself */ }
  try {
    const { getMessaging, deleteToken } = await import('firebase/messaging');
    await deleteToken(getMessaging(app));
  } catch { /* ignore */ }
}

// Tokens can rotate, so on each sign-in quietly re-register if the
// student already allowed notifications. Never prompts.
export async function syncPushToken() {
  if (!pushConfigured() || pushPermission() !== 'granted' || !auth.currentUser) return;
  if (!(await pushSupported())) return;
  try {
    const token = await fetchToken();
    if (!token) return;
    if (token !== localStorage.getItem(TOKEN_KEY)) await callApi('/api/push/register', { action: 'register', token });
    localStorage.setItem(TOKEN_KEY, token);
  } catch { /* non-critical */ }
}
