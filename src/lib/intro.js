// When to play the cinematic intro (public/intro.html, embedded by
// IntroOverlay) after the first loading screen.
//   - once per browser session (a new tab / a fresh app launch plays it again)
//   - not for people who asked for reduced motion
//   - not when the page was opened from a notification deep link (?open=...)
//   - add ?intro=1 to the address to force it to play again
const SEEN_KEY = 'med101_intro_seen';

export function shouldPlayIntro() {
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.get('intro') === '1') return true;
    if (q.has('open')) return false;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    return !sessionStorage.getItem(SEEN_KEY);
  } catch {
    return false;
  }
}

export function markIntroSeen() {
  try {
    sessionStorage.setItem(SEEN_KEY, '1');
    // Drop ?intro=1 so a refresh doesn't replay it forever.
    const url = new URL(window.location.href);
    if (url.searchParams.has('intro')) {
      url.searchParams.delete('intro');
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
  } catch { /* storage blocked: it just plays again next time */ }
}
