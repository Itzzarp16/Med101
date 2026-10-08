import { useEffect, useState } from 'react';
import { LOADING_LINES, randomLineIndex } from '../lib/loadingLines';
import './LoadingLine.css';

// One funny line at a time, fading to the next every few seconds. The text is
// aria-hidden so a screen reader hears a single "Loading" instead of a stream
// of jokes.
export default function LoadingLine({ className = '', intervalMs = 2800, spinner = true }) {
  const [i, setI] = useState(() => randomLineIndex());
  const [fading, setFading] = useState(false);

  useEffect(() => {
    let swap;
    const id = setInterval(() => {
      setFading(true);
      swap = setTimeout(() => { setI((n) => randomLineIndex(n)); setFading(false); }, 260);
    }, intervalMs);
    return () => { clearInterval(id); clearTimeout(swap); };
  }, [intervalMs]);

  return (
    <div className={`loading-line ${className}`} role="status" aria-label="Loading">
      {spinner && <span className="loading-line-spin" aria-hidden="true" />}
      <span className={`loading-line-text ${fading ? 'is-fading' : ''}`} aria-hidden="true">{LOADING_LINES[i]}</span>
    </div>
  );
}
