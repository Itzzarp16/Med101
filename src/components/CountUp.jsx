import { useEffect, useRef, useState } from 'react';

// Counts up from 0 to `to` (ease-out), once per value change. Skipped for
// reduced motion. With `whenVisible`, the count waits until the number first
// scrolls into view, so cards below the fold don't finish counting off-screen.
export default function CountUp({ to, suffix = '', duration = 900, whenVisible = false }) {
  const target = Number(to) || 0;
  const [n, setN] = useState(0);
  const [started, setStarted] = useState(!whenVisible);
  const ref = useRef(null);

  useEffect(() => {
    if (started) return undefined;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setStarted(true); return undefined; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setStarted(true); io.disconnect(); }
    }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, [started]);

  useEffect(() => {
    if (!started) return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setN(target); return undefined; }
    let raf;
    const t0 = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / duration);
      setN(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, started, duration]);

  return <span ref={ref}>{n}{suffix}</span>;
}
