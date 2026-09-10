// Shared UPI deep-link builder - used by both the live QR generator
// and the tap-to-pay button, so they always encode the exact same
// link rather than two hand-maintained copies drifting apart.
export function buildUpiUri({ upiId, amount, payeeName = 'Med101', note = 'Med101 Premium' }) {
  if (!upiId) return null;
  const params = new URLSearchParams({ pa: upiId, pn: payeeName, cu: 'INR' });
  if (amount) params.set('am', amount);
  if (note) params.set('tn', note);
  return `upi://pay?${params.toString()}`;
}
