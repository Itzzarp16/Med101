// Vercel serverless endpoint for MED101 account creation notifications.
// Uses the account-specific Telegram chat.

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

  const origin = req.headers.origin;

  if (
    origin &&
    ![
      'https://med101.space',
      'https://www.med101.space',
    ].includes(origin)
  ) {
    return json(res, 403, {
      error: 'Origin not allowed.',
    });
  }

  const authHeader = req.headers.authorization || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return json(res, 401, {
      error: 'Missing Firebase authentication.',
    });
  }

  try {
    const idToken = match[1];

    const account = await verifyFirebaseIdToken(idToken);

    const body = req.body || {};

    const name =
      typeof body.name === 'string'
        ? body.name.trim()
        : '';

    const username =
      typeof body.username === 'string'
        ? body.username.trim()
        : '';

    const yearSemester =
      typeof body.yearSemester === 'string'
        ? body.yearSemester.trim()
        : '';

    const email =
      account.email || '(not provided)';

    // IMPORTANT:
    // Account-creation notifications use a DIFFERENT chat.
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_ACCOUNT_CHAT_ID;

    if (!botToken || !chatId) {
      console.error(
        'Missing TELEGRAM_BOT_TOKEN or TELEGRAM_ACCOUNT_CHAT_ID.'
      );

      return json(res, 503, {
        error:
          'Telegram account notification is not configured.',
      });
    }

    const now = new Date();
    const joinedAt = now.toLocaleString('en-US', {
      timeZone: 'Asia/Bishkek',
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    const message = [
      '🆕 <b>MED101 — New Account Created</b>',
      '',
      `👤 <b>Name:</b> ${escapeHtml(
        name || '(not provided)'
      )}`,
      `🔹 <b>Username:</b> ${escapeHtml(
        username || '(not provided)'
      )}`,
      `📧 <b>Email:</b> ${escapeHtml(email)}`,
      `🎓 <b>Year/Semester:</b> ${escapeHtml(
        yearSemester || '(not provided)'
      )}`,
      `🆔 <b>UID:</b> <code>${escapeHtml(
        account.localId
      )}</code>`,
      `📅 <b>Joined:</b> ${escapeHtml(joinedAt)} (Bishkek time)`,
      '',
      '✅ <b>Status:</b> Account created successfully',
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
          text: message,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      }
    );

    const telegramData =
      await telegramResponse.json().catch(() => null);

    if (
      !telegramResponse.ok ||
      !telegramData?.ok
    ) {
      console.error(
        'Telegram account notification failed:',
        telegramData || telegramResponse.status
      );

      return json(res, 502, {
        error: 'Telegram notification failed.',
      });
    }

    return json(res, 200, {
      ok: true,
      uid: account.localId,
    });
  } catch (error) {
    console.error(
      'Account creation Telegram notification error:',
      error
    );

    return json(res, 500, {
      error:
        error.message || 'Notification failed.',
    });
  }
}
