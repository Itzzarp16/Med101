import { useEffect, useRef } from 'react';
import { tilt } from '../lib/tilt';
import { haptic } from '../lib/haptics';

// A real 3D dice (opposite faces add up to 7). It tumbles slowly by itself; drag or swipe it in
// any direction to spin it yourself, and it keeps rolling with the speed you let go at.
const PIPS = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
const FACES = [['f1', 1], ['f2', 6], ['f3', 2], ['f4', 5], ['f5', 3], ['f6', 4]];

function Dice() {
  const wrap = useRef(null);
  const cube = useRef(null);
  useEffect(() => {
    const el = wrap.current;
    const c = cube.current;
    if (!el || !c) return undefined;
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let rx = -24, ry = 32, vx = 0, vy = 0, drag = false, lx = 0, ly = 0, last = performance.now(), raf = 0, t = 0;
    const frame = (now) => {
      const dt = Math.min(48, now - last) / 16.67;
      last = now;
      t += dt;
      if (!drag) {
        // glide with the let-go speed, then settle into a gentle tumble
        ry += vy * dt; rx += vx * dt;
        const f = Math.pow(0.95, dt);
        vx *= f; vy *= f;
        if (!calm) { ry += 0.42 * dt; rx += Math.sin(t / 70) * 0.12 * dt; }
      }
      c.style.transform = `rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const down = (e) => { drag = true; lx = e.clientX; ly = e.clientY; vx = vy = 0; el.setPointerCapture?.(e.pointerId); el.classList.add('grab'); };
    const move = (e) => {
      if (!drag) return;
      const dx = e.clientX - lx, dy = e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
      ry += dx * 0.7; rx -= dy * 0.7;
      vy = dx * 0.7; vx = -dy * 0.7;
    };
    const up = (e) => { drag = false; el.releasePointerCapture?.(e.pointerId); el.classList.remove('grab'); };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
  }, []);
  return (
    <div className="adm-cube-wrap" ref={wrap} title="Drag to spin">
      <div className="adm-cube" ref={cube}>
        {FACES.map(([cls, n]) => (
          <span key={cls} className={`face ${cls} v${n}`}>
            {PIPS[n].map((cell) => <i key={cell} style={{ gridArea: `${Math.ceil(cell / 3)} / ${((cell - 1) % 3) + 1}` }} />)}
          </span>
        ))}
      </div>
    </div>
  );
}

// Overview screen of the admin portal: a greeting with a spinning 3D cube and
// a launcher of tilting tiles, one per admin tool, grouped by section.
export default function AdminHome({ groups, name, onOpen }) {
  const hour = new Date().getHours();
  const greet = hour < 5 ? 'Working late' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  let n = 0;
  return (
    <div className="adm-home">
      <section className="adm-hero">
        <div className="adm-hero-text">
          <span className="adm-hello">{greet}</span>
          <h2>{name}</h2>
          <p>Everything for Med101 in one place. Pick a tool to get started.</p>
        </div>
        <Dice />
      </section>

      {groups.filter((g) => g.title !== 'Overview').map((g) => (
        <section key={g.title} className="adm-group" style={{ '--h': g.hue }}>
          <h3 className="adm-group-title">{g.title}</h3>
          <div className="adm-tiles">
            {g.tabs.map((t) => (
              <button
                key={t.id}
                className="adm-tile"
                style={{ '--n': n++ }}
                onClick={() => { haptic(8); onOpen(t.id); }}
                {...tilt}
              >
                <span className="adm-glare" aria-hidden="true" />
                <span className="adm-tile-icon" aria-hidden="true">{t.icon}</span>
                <span className="adm-tile-name">{t.label}</span>
                <span className="adm-tile-desc">{t.desc}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
