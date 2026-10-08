// Dark/light theme - persisted the same way sound-mute already is
// (a plain localStorage flag), toggling the `light-mode` class on
// <body> that tokens.css already defines every color variable for.
// Light is the default (applied unless the user has explicitly
// switched to dark) so every fresh visitor - including on the
// login/signup screen, before any account exists - sees light mode.

const KEY = 'med101_theme';

export function getTheme() {
  return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light';
}

export function isLightMode() {
  return getTheme() === 'light';
}

function apply(theme) {
  document.body.classList.toggle('light-mode', theme === 'light');
  // Also on <html>: the canvas takes its colour from <html> (index.html
  // sets it dark for the loader), so without this a light-mode page shows
  // a black strip wherever the body doesn't fill the viewport.
  document.documentElement.classList.toggle('light-mode', theme === 'light');
}

// Switching themes cross-fades instead of flipping: the new theme fades in
// over the old one. Uses the View Transitions API where available; other
// browsers get a short colour transition instead. People who ask for reduced
// motion get the instant switch.
export function setTheme(theme) {
  localStorage.setItem(KEY, theme === 'light' ? 'light' : 'dark');

  const root = document.documentElement;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduced) { apply(theme); return; }

  if (typeof document.startViewTransition === 'function') {
    root.setAttribute('data-vt-theme', '');
    try {
      const t = document.startViewTransition(() => apply(theme));
      t.ready.catch(() => {});
      t.updateCallbackDone.catch(() => {});
      t.finished.catch(() => {}).finally(() => root.removeAttribute('data-vt-theme'));
    } catch {
      root.removeAttribute('data-vt-theme');
      apply(theme);
    }
    return;
  }

  root.classList.add('theme-fading');
  apply(theme);
  setTimeout(() => root.classList.remove('theme-fading'), 450);
}

// Call once on app boot so a saved preference sticks across reloads
// (nothing in index.html applies it up front, so without this the
// page would flash dark before React mounts - acceptable tradeoff to
// avoid a blocking inline script for a Hobby-scale student app).
export function initTheme() {
  apply(getTheme());
}
