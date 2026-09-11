# MED101 Telegram payment notifications

This adds a secure Vercel serverless endpoint that sends a Telegram alert after a signed-in student successfully submits a payment request.

## Vercel Environment Variables

Add these to the Vercel project (Production, and Preview if you want to test there):

- `TELEGRAM_BOT_TOKEN` = the token from @BotFather
- `TELEGRAM_CHAT_ID` = `8077094125`
- `FIREBASE_WEB_API_KEY` = the `apiKey` value from `src/lib/firebase.js`
- `FIREBASE_PROJECT_ID` = `med101-1`

Do not put the Telegram bot token in React source code or commit it to GitHub.

## How it works

1. `src/lib/subscription.js` creates the existing `paymentRequests/{UTR}` document.
2. After the Firestore write succeeds, it calls `/api/telegram/payment-submission` with the current Firebase ID token and UTR.
3. The Vercel endpoint verifies the Firebase ID token using Firebase Auth's REST API.
4. It reads that exact payment request through the same user's Firebase ID token, so Firestore security rules enforce that the request belongs to that user.
5. It sends the notification through the Telegram Bot API.
6. The existing MED101 admin portal remains responsible for reviewing and approving/rejecting the payment.

The Telegram notification is best-effort. If Telegram is unavailable, the Firestore payment submission remains saved and the existing payment flow still succeeds.
