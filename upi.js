// URLSearchParams encodes spaces as '+' (application/x-www-form-
// urlencoded convention) - correct for form submissions, but the UPI
// deep-link spec expects standard percent-encoding (%20). Most apps
// tolerate '+' anyway, but this keeps the link strictly spec-correct.
function strictPercentEncode(queryString) {
  return queryString.replace(/\+/g, '%20');
}

// Shared UPI deep-link builder - used by both the live QR generator
// and the tap-to-pay button, so they always encode the exact same
// link rather than two hand-maintained copies drifting apart.
export function buildUpiUri({ upiId, amount, payeeName = 'Med101', note = 'Med101 Premium' }) {
  if (!upiId) return null;
  const params = new URLSearchParams({ pa: upiId, pn: payeeName, cu: 'INR' });
  if (amount) params.set('am', amount);
  if (note) params.set('tn', note);
  return `upi://pay?${strictPercentEncode(params.toString())}`;
}

// Android's more explicit "intent://" link format, for opening a UPI
// app from a browser tap specifically. A plain `upi://pay?...` link
// clicked from a web page is known to be unreliable across Android/
// Chrome versions - some UPI apps reject the resulting transaction
// with a generic "can't send money to this person using this method"
// error, even though the exact same string works fine when the SAME
// app scans it directly as a QR code (confirmed: QR uses this same
// buildUpiUri output and works - only the tap-to-pay link failed,
// which points at how the browser hands the link to the app, not the
// link's content). `intent://` is Chrome's own documented, more
// robust way to hand a custom URI scheme off to an installed app, and
// is what production UPI checkout buttons generally use for this
// reason. The QR code should keep using the plain upi:// format from
// buildUpiUri above - it's decoded directly by each app's own
// scanner, never passed through a browser at all, so it was never the
// part that needed fixing.
export function buildUpiIntentUri(args) {
  const plain = buildUpiUri(args);
  if (!plain) return null;
  const query = plain.slice('upi://pay?'.length);
  return `intent://pay?${query}#Intent;scheme=upi;end`;
}
