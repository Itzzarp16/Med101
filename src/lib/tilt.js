// Pointer-driven 3D tilt shared by the admin portal. Spread `tilt` on any element:
// it sets --rx/--ry (rotation) and --mx/--my (glare position) while the pointer is over it.
// `amount` is the max rotation in degrees.
export function tiltHandlers(amount = 14) {
  const move = (e) => {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty('--ry', ((x - 0.5) * amount).toFixed(2) + 'deg');
    el.style.setProperty('--rx', ((0.5 - y) * amount).toFixed(2) + 'deg');
    el.style.setProperty('--mx', (x * 100).toFixed(1) + '%');
    el.style.setProperty('--my', (y * 100).toFixed(1) + '%');
    el.classList.add('tilting');
  };
  const end = (e) => {
    const el = e.currentTarget;
    el.classList.remove('tilting');
    el.style.removeProperty('--rx');
    el.style.removeProperty('--ry');
  };
  return { onPointerMove: move, onPointerLeave: end, onPointerCancel: end, onPointerUp: (e) => { if (e.pointerType !== 'mouse') end(e); } };
}
export const tilt = tiltHandlers(14);
export const tiltSoft = tiltHandlers(7);
