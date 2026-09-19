import { useEffect } from 'react';

// Fixed-position overlays don't stop the page underneath from
// scrolling on mobile (touch-scroll can still move the body behind a
// fixed element) - locking overflow on <html>/<body> while mounted is
// what actually prevents it. Restores whatever was there before on
// unmount, so stacking two of these (tour -> WhatsApp prompt) or
// nesting with some other scroll lock doesn't clobber each other.
export default function useLockBodyScroll() {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
    };
  }, []);
}
