const KEY = 'med101_navState';

// Saved on every navigation change, read once on app mount. Uses
// sessionStorage (not localStorage) deliberately - it survives a
// refresh within the same tab, but clears when the tab actually
// closes, so nobody ever reopens the site days later to find
// themselves mid-quiz in a stale session.
export function saveNavState(state) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage full or unavailable - refresh just won't restore
    // position this time, nothing else breaks.
  }
}

export function loadNavState() {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearNavState() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
