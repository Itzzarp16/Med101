// Vercel serverless endpoint for MED101 payment notifications.
// The Telegram bot token MUST stay in Vercel Environment Variables.
// This endpoint verifies the signed-in Firebase user before sending a notification.

const FIREBASE_LOOKUP_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup';
const TELEGRAM_API = 'https://api.telegram.org';

function json(res, status, body) {
  return res.status(status).json(body);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function verifyFirebaseIdToken(idToken) {
  const apiKey = process.env.FIREBASE_WEB_API_KEY;
  if (!apiKey) throw new Error('FIREBASE_WEB_API_KEY is not configured.');

  const response = await fetch(`${FIREBASE_LOOKUP_URL}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });

  if (!response.ok) throw new Error('Firebase authentication failed.');
  const data = await response.json();
  const account = data.users?.[0];
  if (!account?.localId) throw new Error('Firebase authentication failed.');
  return account;
}

function firestoreString(fields, name) {
  return fields?.[name]?.stringValue || '';
}

async function getOwnPaymentRequest(idToken, utr) {
  const projectId = process.env.FIREBASE_PROJECT_ID || 'med101-1';
  const encodedUtr = encodeURIComponent(utr);
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/paymentRequests/${encodedUtr}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${idToken}` },
  });

  if (response.status === 404) throw new Error('Payment submission was not found.');
  if (!response.ok) throw new Error('Could not verify the payment submission.');
  return response.json();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Method not allowed.' });
  }

  // Reduce accidental cross-site use. This is not the primary security check;
  // Firebase ID-token verification above is the important one.
  const origin = req.headers.origin;
  if (origin && !['https://med101.space', 'https://www.med101.space'].includes(origin)) {
    return json(res, 403, { error: 'Origin not allowed.' });
  }

  const authHeader = req.headers.authorization || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return json(res, 401, { error: 'Missing Firebase authentication.' });

  try {
    const idToken = match[1];
    const account = await verifyFirebaseIdToken(idToken);
    const { utr } = req.body || {};

    if (!utr || typeof utr !== 'string') {
      return json(res, 400, { error: 'Missing UTR.' });
    }

    // Read the payment request through the student's own Firebase ID token.
    // Firestore rules then enforce that the document belongs to this user.
    // This prevents someone from inventing a UTR/name and using this endpoint
    // as an unrestricted Telegram spam endpoint.
    const paymentDoc = await getOwnPaymentRequest(idToken, utr.trim());
    const fields = paymentDoc.fields || {};
    const paymentUid = firestoreString(fields, 'uid');
    const paymentStatus = firestoreString(fields, 'status');
    if (paymentUid !== account.localId) throw new Error('Payment submission does not belong to this account.');
    if (paymentStatus !== 'pending') throw new Error('Only pending payment submissions can trigger a notification.');

    const displayName = firestoreString(fields, 'displayName');
    const bankingName = firestoreString(fields, 'bankingName');
    const phone = firestoreString(fields, 'phone');

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!botToken || !chatId) {
      console.error('Telegram environment variables are missing.');
      // The payment itself has already been written to Firestore, so don't
      // make a successful payment submission look like a failed submission.
      return json(res, 503, { error: 'Telegram notification is not configured.' });
    }

    const message = [
  '\u{1F514} <b>MED101 — New Payment Submission</b>',
  '',
  '\u{1F4B0} <b>Amount:</b> \u20B911',
  `\u{1F464} <b>User:</b> ${escapeHtml(displayName || '(not provided)')}`,
  `\u{1F4E7} <b>Email:</b> ${escapeHtml(account.email || '(not provided)')}`,
  `\u{1F3E6} <b>Banking Name:</b> ${escapeHtml(bankingName || '(not provided)')}`,
  `\u{1F4F1} <b>Phone:</b> ${escapeHtml(phone || '(not provided)')}`,
  `\u{1F522} <b>UTR:</b> <code>${escapeHtml(utr.trim())}</code>`,
  '',
  '\u{23F3} <b>Status:</b> Pending admin review',
  '',
  'Open the MED101 Admin Portal to verify and approve.',
].join('\n');

    const telegramResponse = await fetch(`${TELEGRAM_API}/bot${encodeURIComponent(botToken)}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    const telegramData = await telegramResponse.json().catch(() => null);
    if (!telegramResponse.ok || !telegramData?.ok) {
      console.error('Telegram sendMessage failed:', telegramData || telegramResponse.status);
      return json(res, 502, { error: 'Telegram notification failed.' });
    }

    return json(res, 200, { ok: true, uid: account.localId });
  } catch (error) {
    console.error('Telegram payment notification error:', error);
    return json(res, 500, { error: error.message || 'Notification failed.' });
  }
}
