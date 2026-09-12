import { useEffect, useRef, useState } from 'react';

// Synchronized swipe transition (like paging between home-screen
// pages): the outgoing screen visibly slides out to the left while
// the incoming one slides in from the right, together, instead of
// the app's default fade-in-only transition. Scoped to just the
// Subtopic -> Quiz Mode -> Quiz flow per user request, not applied
// to every screen in the app.
//
// Renders both the outgoing and incoming screen briefly, side by side
// in a flex track twice the container's width, then animates the
// track by -50% so it settles on just the incoming screen - after
// which the outgoing one is dropped entirely.
export default function SlideStack({ activeKey, children }) {
  const [state, setState] = useState({ key: activeKey, current: children, outgoing: null, outgoingKey: null });
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const prev = stateRef.current;
    if (prev.key === activeKey) {
      if (prev.current !== children) {
        setState({ ...prev, current: children });
      }
      return;
    }
    setState({ key: activeKey, current: children, outgoing: prev.current, outgoingKey: prev.key });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, children]);

  useEffect(() => {
    if (!state.outgoing) return;
    const t = setTimeout(() => {
      setState((s) => (s.key === state.key ? { ...s, outgoing: null, outgoingKey: null } : s));
    }, 480);
    return () => clearTimeout(t);
  }, [state.outgoing, state.key]);

  const transitioning = !!state.outgoing;

  return (
    <div className="slide-stack">
      <div className={transitioning ? 'slide-track slide-track-transitioning' : 'slide-track'}>
        {transitioning && (
          <div className="slide-pane" key={'out-' + state.outgoingKey}>
            {state.outgoing}
          </div>
        )}
        <div className="slide-pane" key={'in-' + state.key}>
          {state.current}
        </div>
      </div>
    </div>
  );
}
