import { useEffect, useState } from 'react';
import { subscribeToSubscriptionConfig } from './subscription';

// Live "Free for everyone right now" flag (Admin -> Payments pause toggle).
// Defaults to false, so anything that can't read the setting (e.g. signed-out
// visitors, since config reads need sign-in) shows the normal paid content.
export default function usePremiumPaused() {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    try {
      return subscribeToSubscriptionConfig((c) => setPaused(!!c?.premiumPaused));
    } catch {
      return undefined;
    }
  }, []);
  return paused;
}
