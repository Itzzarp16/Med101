// Dark/light theme - persisted the same way sound-mute already is
// (a plain localStorage flag), toggling the `light-mode` class on
// <body> that tokens.css already defines every color variable for.
// Dark is the default (no class needed) since that's how every
// existing screenshot/screen was designed.

const KEY = 'med101_theme';

export function getTheme() {
  return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark';
}

export function isLightMode() {
  return getTheme() === 'light';
}

function apply(theme) {
  document.body.classList.toggle('light-mode', theme === 'light');
}

export function setTheme(theme) {
  localStorage.setItem(KEY, theme === 'light' ? 'light' : 'dark');
  apply(theme);
}

// Call once on app boot so a saved preference sticks across reloads
// (nothing in index.html applies it up front, so without this the
// page would flash dark before React mounts - acceptable tradeoff to
// avoid a blocking inline script for a Hobby-scale student app).
export function initTheme() {
  apply(getTheme());
}
