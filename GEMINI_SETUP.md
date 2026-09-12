# Med101 Gemini AI setup

The Gemini integration is intentionally server-side. The browser never receives `GEMINI_API_KEY` or the Firebase service-account private key.

## 1. Vercel environment variables

Add these to the **Production** environment in Vercel:

```text
GEMINI_API_KEY=your Google AI Studio API key
GEMINI_MODEL=gemini-3.1-flash-lite
GEMINI_DAILY_GENERATION_LIMIT=50

FIREBASE_PROJECT_ID=med101-1
FIREBASE_CLIENT_EMAIL=the client_email from your Firebase service-account JSON
FIREBASE_PRIVATE_KEY=the private_key from that same JSON
FIREBASE_WEB_API_KEY=your Firebase web API key
```

For `FIREBASE_PRIVATE_KEY`, keep the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines. If Vercel stores the value with `\\n` line breaks, the API converts them back to real newlines automatically.

## 2. Gemini key

Create the key in Google AI Studio and restrict it to the Gemini API if Google's console offers that restriction for the key.

Do not put the Gemini key in `src/`, `public/`, `VITE_*`, or any React component.

## 3. Firebase service account

Firebase Console → Project settings → Service accounts → generate/download the service-account JSON.

Copy only these values into Vercel:

- `project_id` → `FIREBASE_PROJECT_ID`
- `client_email` → `FIREBASE_CLIENT_EMAIL`
- `private_key` → `FIREBASE_PRIVATE_KEY`

Never commit this JSON file to GitHub.

## 4. Firestore rules

The `aiExplanations` and `aiUsage` collections are intentionally server-only. The Vercel endpoint uses the Firebase service account to access them, so normal students do not need Firestore permissions for these collections.

## 5. How the protection works

The API verifies the Firebase user, checks Premium (or the admin Premium-paused setting), verifies that the submitted question/options match the Med101 question bank, checks the shared Firestore cache, and only then calls Gemini.

A per-user daily generation limit is also applied to cache misses. Cached explanations do not consume a new Gemini generation slot.

## 6. Current model

The default model is `gemini-3.1-flash-lite`. You can change `GEMINI_MODEL` in Vercel later without changing the React code.
