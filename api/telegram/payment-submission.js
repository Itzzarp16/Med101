// Vercel serverless endpoint for MED101 payment notifications.
// Uses the payment-specific Telegram chat.

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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');

    return json(res, 405, {
      error: 'Method not allowed.',
    });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_PAYMENT_CHAT_ID;

  if (!botToken || !chatId) {
    console.error(
      'Missing TELEGRAM_BOT_TOKEN or TELEGRAM_PAYMENT_CHAT_ID.'
    );

    return json(res, 503, {
      error: 'Telegram payment notification is not configured.',
    });
  }

  try {
    const body = req.body || {};

    const name =
      typeof body.name === 'string'
        ? body.name.trim()
        : '';

    const username =
      typeof body.username === 'string'
        ? body.username.trim()
        : '';

    const email =
      typeof body.email === 'string'
        ? body.email.trim()
        : '';

    const amount =
      typeof body.amount === 'string' || typeof body.amount === 'number'
        ? String(body.amount)
        : '11';

    const transactionId =
      typeof body.transactionId === 'string'
        ? body.transactionId.trim()
        : '';

    const message = [
      '🔔 <b>MED101 — New Payment Submission</b>',
      '',
      `👤 <b>Name:</b> ${escapeHtml(name || '(not provided)')}`,
      `🔹 <b>Username:</b> ${escapeHtml(username || '(not provided)')}`,
      `📧 <b>Email:</b> ${escapeHtml(email || '(not provided)')}`,
      `💰 <b>Amount:</b> ₹${escapeHtml(amount)}`,
      `🧾 <b>Transaction ID:</b> ${escapeHtml(
        transactionId || '(not provided)'
      )}`,
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
