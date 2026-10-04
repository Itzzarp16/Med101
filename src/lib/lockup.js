// Logo lockup: the "Learn. Practice. Improve." tagline sits under the
// Med101 wordmark with exactly the same width (same left and right
// edges) - the way the wordmark and tagline line up in the PDF export.
// A fixed letter-spacing can't do that: the wordmark (Syne) and tagline
// (Inter) have different widths per size, and the web font loading
// changes both. So the tagline's letter-spacing is solved from the
// wordmark's measured width, for every lockup on the site.
//
// Measured with Range rects (text only, not the element box) and
// divided by the lockup's current scale, so it stays correct while the
// splash lockup is mid-transform flying into the top bar.
const LOCKUPS = [
  { box: '.topbar-logo-stack', mark: '.topbar-logo', tag: '.topbar-tagline' },
  { box: '.app-loading-logo-stack', mark: '.app-loading-logo', tag: '.app-loading-tagline' },
];

function textWidth(el) {
  const r = document.createRange();
  r.selectNodeContents(el);
  return r.getBoundingClientRect().width;
}

function fitOne(box, markSel, tagSel) {
  const mark = box.querySelector(markSel);
  const tag = box.querySelector(tagSel);
  if (!mark || !tag || !box.offsetWidth) return;
  const scale = box.getBoundingClientRect().width / box.offsetWidth || 1;
  tag.style.letterSpacing = '0px';
  const natural = textWidth(tag);
  const target = textWidth(mark);
  const gaps = Math.max(1, (tag.textContent || '').length - 1);
  const ls = (target - natural) / gaps / scale;
  if (Number.isFinite(ls)) tag.style.letterSpacing = `${ls.toFixed(3)}px`;
  box.setAttribute('data-lockup-fit', '1');
}

function fitAll(onlyUnfitted) {
  for (const { box, mark, tag } of LOCKUPS) {
    document.querySelectorAll(box).forEach((b) => {
      if (onlyUnfitted && b.hasAttribute('data-lockup-fit')) return;
      fitOne(b, mark, tag);
    });
  }
}

let started = false;
export function startLockupFit() {
  if (started || typeof document === 'undefined') return;
  started = true;
  let raf = 0;
  const later = (onlyUnfitted) => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => fitAll(onlyUnfitted));
  };
  // New lockups mounting (React renders them after this runs).
  new MutationObserver(() => later(true)).observe(document.body, { childList: true, subtree: true });
  // Fonts arriving changes both widths: refit everything.
  if (document.fonts) {
    document.fonts.ready.then(() => later(false));
    document.fonts.addEventListener?.('loadingdone', () => later(false));
  }
  window.addEventListener('resize', () => later(false));
  later(false);
}
