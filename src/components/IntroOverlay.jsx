import { useCallback, useEffect, useRef, useState } from 'react';
import { markIntroSeen } from '../lib/intro';

// Full-screen host for /intro.html (the same page people can open directly),
// shown right after the first loading screen. The page tells us when it is
// ready and when it is finished (end of the film, or the student taps Skip).
// If it never reports ready (offline, blocked), we move on instead of leaving
// a black screen.
export default function IntroOverlay({ onDone }) {
  const [leaving, setLeaving] = useState(false);
  const finished = useRef(false);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    setLeaving(true);
    setTimeout(onDone, 450);
  }, [onDone]);

  useEffect(() => {
    markIntroSeen();
    let ready = false;
    const onMsg = (e) => {
      if (e.origin !== window.location.origin || !e.data) return;
      if (e.data.type === 'med101-intro-ready') ready = true;
      if (e.data.type === 'med101-intro-done') finish();
    };
    window.addEventListener('message', onMsg);
    const notReady = setTimeout(() => { if (!ready) finish(); }, 3500);
    const hardStop = setTimeout(finish, 40000);
    return () => {
      window.removeEventListener('message', onMsg);
      clearTimeout(notReady);
      clearTimeout(hardStop);
    };
  }, [finish]);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100000, background: '#030508',
        opacity: leaving ? 0 : 1, transition: 'opacity 0.45s ease',
      }}
    >
      <iframe
        title="Med101 intro"
        src="/intro.html?embed=1"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0, background: '#030508' }}
      />
    </div>
  );
}
