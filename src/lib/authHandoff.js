// Sign-in on auth.med101.space, then hand the login back to med101.space.
// Switched on/off in Admin portal -> Sign-in page (config/authHandoff.enabled).
// Server side: api/auth/handoff.py (GET = the switch, POST = one-time pass).

export const AUTH_HOST = 'auth.med101.space';
export const MAIN_SITE_URL = 'https://med101.space';
// Sites that may start / receive a hand-off login.
export const MAIN_ORIGINS = ['https://med101.space', 'https://www.med101.space', 'https://abhishekmed101.space'];

export const IS_AUTH_HOST =
  typeof window !== 'undefined' && window.location.hostname === AUTH_HOST;

export function canUseHandoffHere() {
  return typeof window !== 'undefined' && MAIN_ORIGINS.includes(window.location.origin);
}

// ── the on/off switch (read through the server; visitors cannot read Firestore) ──
let flagPromise = null;
let flagAt = 0;
export function fetchHandoffEnabled(fresh = false) {
  if (fresh || !flagPromise || Date.now() - flagAt > 15000) {
    flagAt = Date.now();
    flagPromise = fetch('/api/auth/handoff', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : {}))
      .then((j) => j.enabled === true)
      .catch(() => false);
  }
  return flagPromise;
}

// ── "classic sign-in" escape hatch: med101.space/?direct=1 ──
// Read once at load, then removed from the address bar.
export const OPENED_DIRECT = (() => {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('direct') === '1') {
      sessionStorage.setItem('med101_direct_login', '1');
      params.delete('direct');
      const qs = params.toString();
      window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash);
      return true;
    }
  } catch { /* ignore */ }
  return false;
})();

export function directLoginRequested() {
  try { return sessionStorage.getItem('med101_direct_login') === '1'; } catch { return false; }
}

// ── main site -> auth host ──
export function startHandoffLogin(deviceId) {
  const params = new URLSearchParams({ return: window.location.origin });
  // Same device ID on both sites, so the single-device lock stays consistent.
  if (deviceId && /^[A-Za-z0-9-]{8,80}$/.test(deviceId)) params.set('d', deviceId);
  window.location.assign(`https://${AUTH_HOST}/?${params.toString()}`);
}

// ── auth host: remember where to send the student back to ──
export function readAuthHostParams() {
  const out = { returnOrigin: MAIN_SITE_URL };
  try {
    const params = new URLSearchParams(window.location.search);
    const stored = JSON.parse(sessionStorage.getItem('med101_auth_host') || '{}');
    const ret = params.get('return') || stored.returnOrigin;
    if (ret && MAIN_ORIGINS.includes(ret)) out.returnOrigin = ret;
    const d = params.get('d') || stored.d;
    if (d && /^[A-Za-z0-9-]{8,80}$/.test(d)) out.d = d;
    if (params.get('return') || params.get('d')) {
      sessionStorage.setItem('med101_auth_host', JSON.stringify(out));
    }
  } catch { /* ignore */ }
  return out;
}

export function sendBackToMain({ returnOrigin, token, isNew }) {
  const hash = `#handoff=${encodeURIComponent(token)}&n=${isNew ? 1 : 0}`;
  try { sessionStorage.removeItem('med101_auth_host'); } catch { /* ignore */ }
  window.location.replace(`${returnOrigin}/${hash}`);
}

// ── main site: pick the pass out of the address bar (once, then erase it) ──
export function takeHandoffFromUrl() {
  if (typeof window === 'undefined' || !canUseHandoffHere()) return null;
  const m = window.location.hash.match(/^#handoff=([^&]+)(?:&n=([01]))?/);
  if (!m) return null;
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  try {
    return { token: decodeURIComponent(m[1]), isNew: m[2] === '1' };
  } catch {
    return null;
  }
}
