import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { buildUpiUri } from '../lib/upi';

// Generates a real, scannable UPI QR code on the fly from the admin's
// configured UPI ID (and price, if it's a clean number) - so it's
// always in sync with whatever's set in Subscription Settings, rather
// than depending on someone uploading a fresh photo every time the
// UPI ID or price changes. Renders as SVG so it stays crisp at any
// size and can be styled to match the app instead of shipping
// whatever background color the scanning app's screenshot happened
// to have. Colors are kept true black-on-white regardless of theme -
// that's what gives QR scanners reliable contrast to lock onto.
export default function LiveQrCode({ upiId, amount, payeeName = 'Med101', note = 'Med101 Premium' }) {
  const [svg, setSvg] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!upiId) { setSvg(null); return; }
    let cancelled = false;
    setFailed(false);

    const upiUri = buildUpiUri({ upiId, amount, payeeName, note });

    QRCode.toString(upiUri, { type: 'svg', margin: 1, color: { dark: '#000000', light: '#ffffff' } })
      .then((str) => { if (!cancelled) setSvg(str); })
      .catch(() => { if (!cancelled) setFailed(true); });

    return () => { cancelled = true; };
  }, [upiId, amount, payeeName, note]);

  if (!upiId) return null;
  if (failed) return <div className="pay-qr-loading">Couldn't generate QR</div>;
  if (!svg) return <div className="pay-qr-loading">Generating QR…</div>;
  // eslint-disable-next-line react/no-danger -- svg is generated locally by the qrcode library, not user input
  return <div className="pay-qr-svg" dangerouslySetInnerHTML={{ __html: svg }} />;
}
