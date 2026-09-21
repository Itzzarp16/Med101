// Vercel serverless endpoint for MED101 account creation notifications.
// Telegram credentials MUST stay in Vercel Environment Variables.

const FIREBASE_LOOKUP_URL =
  'https://identitytoolkit.googleapis.com/v1/accounts:lookup';

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

  if (!apiKey) {
    throw new Error('FIREBASE_WEB_API_KEY is not configured.');
  }

  const response = await fetch(
    `${FIREBASE_LOOKUP_URL}?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        idToken,
      }),
    }
  );

  if (!response.ok) {
    throw new Error('Firebase authentication failed.');
  }

  const data = await response.json();
  const account = data.users?.[0];

  if (!account?.localId) {
    throw new Error('Firebase authentication failed.');
  }

  return account;
}

export default async function handler(req, res) {
  // Only POST requests are allowed.
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');

    return json(res, 405, {
      error: 'Method not allowed.',
    });
  }

  // Reduce accidental cross-site use.
  // Firebase authentication below remains the primary security check.
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

  // Read Firebase ID token.
  const authHeader = req.headers.authorization || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return json(res, 401, {
      error: 'Missing Firebase authentication.',
    });
  }

  try {
    const idToken = match[1];

    // Verify the Firebase account.
    const account = await verifyFirebaseIdToken(idToken);

    const body = req.body || {};

    // These values come directly from the signup form.
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

    // Telegram credentials stay ONLY in Vercel Environment Variables.
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
      console.error(
        'Telegram environment variables are missing.'
      );

      // Telegram failure must not break account creation.
      return json(res, 503, {
        error: 'Telegram notification is not configured.',
      });
    }

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
      '',
      '✅ <b>Status:</b> Account created successfully',
    ].join('\n');

    // Send notification to Telegram.
    const telegramResponse = await fetch(
      `${TELEGRAM_API}/bot${encodeURIComponent(
        botToken
      )}/sendMessage`,
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
        'Telegram sendMessage failed:',
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
      'Telegram account creation notification error:',
      error
    );

    return json(res, 500, {
      error:
        error.message || 'Notification failed.',
    });
  }
