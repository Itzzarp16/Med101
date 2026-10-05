// Haptic feedback. Android browsers use navigator.vibrate(); iPhone Safari
// has no vibrate API, so we fall back to the hidden-switch tap (iOS 17.4+),
// which only fires for real taps, not scrolling. Everything here fails
// silently and honours prefers-reduced-motion plus a user on/off flag.
const KEY = 'med101_haptics';
const canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

export function hapticsEnabled() {
  try {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    return localStorage.getItem(KEY) !== 'off';
  } catch { return true; }
}
export function setHapticsEnabled(on) {
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* ignore */ }
}

let iosLabel;
function iosTap() {
  if (!iosLabel) {
    iosLabel = document.createElement('label');
    iosLabel.setAttribute('aria-hidden', 'true');
    iosLabel.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;pointer-events:none';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    iosLabel.appendChild(input);
    document.body.appendChild(iosLabel);
  }
  iosLabel.click();
}

export function haptic(pattern = 10) {
  try {
    if (!hapticsEnabled()) return;
    if (canVibrate) navigator.vibrate(pattern);
    else iosTap();
  } catch { /* never let haptics break the UI */ }
}

// Scroll-synced pulses. The dashboard cards report each animation milestone
// they cross; we merge pulses that land in the same few ms (many cards cross
// together) so the phone gets one clean tick per beat, never a buzzing blur.
let lastPulse = 0;
export function hapticSync(strength = 1) {
  const now = performance.now();
  if (now - lastPulse < 45) return;
  lastPulse = now;
  haptic(Math.round(6 + 8 * strength)); // 6-14ms: light tick -> firmer thud
}
