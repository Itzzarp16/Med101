// Vercel serverless endpoint for MED101 payment notifications.
// Sends payment notifications to the Payment Notification topic
// inside the MED101 Telegram group.

import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

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

// Same pattern as api/telegram/account-created.js: the request must carry a
// valid Firebase session before anything is sent to the admin Telegram group,
// rather than trusting whatever the client claims in the body.
// Verifies the request carries a valid Firebase session, via the Admin SDK.
// (This used to call Google's accounts:lookup REST endpoint with the public
// web API key; that kind of call is rejected once App Check enforcement is
// switched on for Authentication, which would silently kill these alerts.)
// Returns the same shape the callers always used: { localId, email, displayName }.
function initAdmin() {
  if (getApps().length) return;
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    }),
  });
}

async function verifyFirebaseIdToken(idToken) {
  initAdmin();
  let decoded;
  try {
    decoded = await getAuth().verifyIdToken(idToken);
  } catch {
    throw new Error('Firebase authentication failed.');
  }
  // getUser, not the token's claims: the token can lag a just-changed display name.
  const user = await getAuth().getUser(decoded.uid);
  return { localId: user.uid, email: user.email || '', displayName: user.displayName || '' };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');

    return json(res, 405, {
      error: 'Method not allowed.',
    });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  // Your MED101 Telegram group
  const chatId = '-1004372584895';

  // Payment notification topic
  const messageThreadId = 8;

  if (!botToken) {
    console.error('Missing TELEGRAM_BOT_TOKEN.');

    return json(res, 503, {
      error: 'Telegram payment notification is not configured.',
    });
  }

  const authHeader = req.headers.authorization || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return json(res, 401, { error: 'Missing Firebase authentication.' });
  }

  try {
    const account = await verifyFirebaseIdToken(match[1]);
    const body = req.body || {};

    const username =
      typeof body.username === 'string' ? body.username.trim() : '';

    const amount =
      typeof body.amount === 'string' || typeof body.amount === 'number'
        ? String(body.amount)
        : '';

    const transactionId =
      typeof body.transactionId === 'string'
        ? body.transactionId.trim()
        : '';

    const name = account.displayName || '';
    const email = account.email || '(not provided)';

    const now = new Date();
    const submittedAt = now.toLocaleString('en-US', {
      timeZone: 'Asia/Bishkek',
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    const message = [
      '🔔 <b>MED101 — New Payment Submission</b>',
      '',
      `👤 <b>Name:</b> ${escapeHtml(name || '(not provided)')}`,
      `🔹 <b>Username:</b> ${escapeHtml(username || '(not provided)')}`,
      `📧 <b>Email:</b> ${escapeHtml(email)}`,
      `💰 <b>Amount:</b> ${escapeHtml(amount || '(not provided)')}`,
      `🧾 <b>Transaction ID:</b> ${escapeHtml(
        transactionId || '(not provided)'
      )}`,
      `📅 <b>Submitted:</b> ${escapeHtml(submittedAt)} (Bishkek time)`,
      '',
      '⏳ <b>Status:</b> Pending admin review',
    ].join('\n');

    const telegramResponse = await fetch(
      `${TELEGRAM_API}/bot${encodeURIComponent(botToken)}/sendMessage`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          message_thread_id: messageThreadId,
          text: message,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      }
    );

    const telegramData =
      await telegramResponse.json().catch(() => null);

    if (!telegramResponse.ok || !telegramData?.ok) {
      console.error(
        'Telegram payment notification failed:',
        telegramData || telegramResponse.status
      );

      return json(res, 502, {
        error: 'Telegram notification failed.',
      });
    }

    return json(res, 200, {
      ok: true,
    });
  } catch (error) {
    console.error(
      'Payment Telegram notification error:',
      error
    );

    return json(res, 500, {
      error:
        error.message || 'Notification failed.',
    });
  }
}
