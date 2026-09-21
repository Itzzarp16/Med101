// Vercel serverless endpoint for MED101 account creation notifications.
// Telegram credentials MUST stay in Vercel Environment Variables.

const FIREBASE_LOOKUP_URL =
  'https://identitytoolkit.googleapis.com/v1/accounts:lookup';

const FIRESTORE_URL =
  'https://firestore.googleapis.com/v1/projects';

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
      body: JSON.stringify({ idToken }),
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

function firestoreString(fields, name) {
  return fields?.[name]?.stringValue || '';
}

async function getUserProfile(idToken, uid) {
  const projectId = process.env.FIREBASE_PROJECT_ID || 'med101-1';

  const url =
    `${FIRESTORE_URL}/${encodeURIComponent(projectId)}` +
    `/databases/(default)/documents/users/${encodeURIComponent(uid)}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error('Could not read the new account profile.');
  }

  return response.json();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, {
      error: 'Method not allowed.',
    });
  }

  // Only allow requests originating from MED101.
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

    // Verify that the request comes from a real Firebase user.
    const account = await verifyFirebaseIdToken(idToken);

    // Read the profile that AuthContext already created.
    const userDoc = await getUserProfile(idToken, account.localId);

    const fields = userDoc?.fields || {};

    const displayName = firestoreString(fields, 'displayName');
    const email =
      firestoreString(fields, 'email') ||
      account.email ||
      '(not provided)';

    const yearSemester = firestoreString(
      fields,
      'enrolledYearSemester'
    );

    const username =
      firestoreString(fields, 'username') ||
      '(not set)';

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
      console.error('Telegram environment variables are missing.');

      // Don't make account creation fail because Telegram is unavailable.
      return json(res, 503, {
        error: 'Telegram notification is not configured.',
      });
    }

    const message = [
      '🆕 <b>MED101 — New Account Created</b>',
      '',
      `👤 <b>Name:</b> ${escapeHtml(displayName || '(not provided)')}`,
      `🔹 <b>Username:</b> ${escapeHtml(username)}`,
      `📧 <b>Email:</b> ${escapeHtml(email)}`,
      `🎓 <b>Year/Semester:</b> ${escapeHtml(yearSemester || '(not provided)')}`,
      `🆔 <b>UID:</b> <code>${escapeHtml(account.localId)}</code>`,
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

    const telegramData = await telegramResponse.json().catch(() => null);

    if (!telegramResponse.ok || !telegramData?.ok) {
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
      error: error.message || 'Notification failed.',
    });
  }
        }
