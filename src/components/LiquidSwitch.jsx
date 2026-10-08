import { useEffect, useRef, useState } from 'react';
import './LiquidSwitch.css';

// The app's one switch: white pill, glossy black knob that stretches into a
// liquid blob as it slides across, squashes at the far end, then settles.
//
//   <LiquidSwitch on={value} onClick={toggle} label="Sound" />
//
// Without onClick it renders as a decorative (aria-hidden) switch, for rows
// where the whole row is already the clickable switch.
export default function LiquidSwitch({ on, onClick, disabled, label, className = '' }) {
  const prev = useRef(!!on);
  const [anim, setAnim] = useState('');

  useEffect(() => {
    if (prev.current === !!on) return undefined;
    prev.current = !!on;
    setAnim(on ? 'go-on' : 'go-off');
    const t = setTimeout(() => setAnim(''), 800);
    return () => clearTimeout(t);
  }, [on]);

  const cls = ['lq', on ? 'on' : '', anim, className].filter(Boolean).join(' ');
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
