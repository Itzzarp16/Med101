// Shared device-identity helper for the single-device session lock
// (see AuthContext.jsx's claimDevice/verifyDevice). Anything that
// writes student data which should only count from the currently
// active device - e.g. a finished quiz's history entry - stamps this
// onto the write, so Firestore rules can reject it server-side if the
// device writing it isn't the one currently claimed on the account.
// That matters because the client-side "kick" is push-based (an
// onSnapshot listener) and can't reach a genuinely offline device -
// this is the server-side backstop for exactly that gap.
export function getDeviceId() {
  let id = localStorage.getItem('medDeviceId');
  if (!id) {
    id = window.crypto?.randomUUID
      ? crypto.randomUUID()
      : 'dev-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem('medDeviceId', id);
  }
  return id;
}
