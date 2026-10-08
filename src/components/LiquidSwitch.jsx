import { useEffect, useRef, useState } from 'react';
import './LiquidSwitch.css';

// The app's switch, in the app's own colours, with a liquid knob: it stretches
// into a blob as it slides across, squashes at the far end, then settles.
// variant="set" is the Settings-screen look (green when on).
//
//   <LiquidSwitch on={value} onClick={toggle} label="Sound" />
//
// Without onClick it renders as a decorative (aria-hidden) switch, for rows
// where the whole row is already the clickable switch.
export default function LiquidSwitch({ on, onClick, disabled, label, variant, className = '' }) {
  const prev = useRef(!!on);
  const [anim, setAnim] = useState('');

  useEffect(() => {
    if (prev.current === !!on) return undefined;
    prev.current = !!on;
    setAnim(on ? 'go-on' : 'go-off');
    const t = setTimeout(() => setAnim(''), 800);
    return () => clearTimeout(t);
  }, [on]);

  const cls = ['lq', variant === 'set' ? 'lq-set' : '', on ? 'on' : '', anim, className].filter(Boolean).join(' ');
  const knob = <span className="lq-knob" />;

  if (!onClick) return <span className={cls} aria-hidden="true">{knob}</span>;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!on}
      aria-label={label}
      disabled={disabled}
      className={cls}
      onClick={onClick}
    >
      {knob}
    </button>
  );
}
