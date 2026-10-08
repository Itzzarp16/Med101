import { useEffect, useMemo, useState } from 'react';
import { shuffledLines } from '../lib/loadingLines';
import './LoadingLine.css';

// One funny line at a time, fading to the next every few seconds. The text is
// aria-hidden so a screen reader hears a single "Loading" instead of a stream
// of jokes.
export default function LoadingLine({ className = '', intervalMs = 2800, spinner = true }) {
  const lines = useMemo(shuffledLines, []);
  const [i, setI] = useState(0);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    let swap;
    const id = setInterval(() => {
      setFading(true);
      swap = setTimeout(() => { setI((n) => (n + 1) % lines.length); setFading(false); }, 260);
    }, intervalMs);
    return () => { clearInterval(id); clearTimeout(swap); };
  }, [intervalMs, lines.length]);

  return (
    <div className={`loading-line ${className}`} role="status" aria-label="Loading">
      {spinner && <span className="loading-line-spin" aria-hidden="true" />}
      <span className={`loading-line-text ${fading ? 'is-fading' : ''}`} aria-hidden="true">{lines[i]}</span>
    </div>
  );
}
