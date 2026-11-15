// One serverless function for both Telegram alerts, so the project stays within the
// Hobby plan's 12-function limit. URLs are unchanged:
//   /api/telegram/account-created   -> _account-created.js
//   /api/telegram/payment-submission -> _payment-submission.js
// (Files starting with "_" are bundled but are not functions of their own.)
import accountCreated from './_account-created.js';
import paymentSubmission from './_payment-submission.js';

const HANDLERS = {
  'account-created': accountCreated,
  'payment-submission': paymentSubmission,
};

export default function handler(req, res) {
  const fromQuery = req.query && req.query.action;
  const fromPath = String(req.url || '').split('?')[0].split('/').filter(Boolean).pop();
  const action = Array.isArray(fromQuery) ? fromQuery[0] : (fromQuery || fromPath);
  const target = HANDLERS[action];
  if (!target) return res.status(404).json({ error: 'Not found' });
  return target(req, res);
}
