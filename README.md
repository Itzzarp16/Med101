# Med101

Med101 is a medical-learning website for studying subjects, practicing quizzes, reviewing incorrect or flagged questions, tracking quiz history, and using study/community tools.

## Technology

- React 19 and Vite
- Firebase for authentication and application data
- Vercel for deployment and analytics
- Optional Capacitor work for an Android app wrapper

## Local development

Requirements: a supported Node.js version and npm.

```bash
npm install
npm run dev
```

## Quality checks

```bash
npm run lint
npm run build
```

Run both checks before merging or deploying meaningful changes. A successful local build does not by itself verify Firebase permissions or production behavior.

## Configuration and secrets

Use the environment variables configured for the intended deployment environment. Never commit private API keys, service-account credentials, bot tokens, payment secrets, or real user data. Client-side Firebase configuration is not a substitute for correctly configured Firestore and Storage security rules.

## Deployment

The production website is hosted through Vercel. The `react-rebuild` branch is the current working branch for the React rebuild. Confirm the Vercel build and deployment status before assuming a commit is live.

## Project guidance

See [the Med101 product roadmap](docs/PRODUCT_ROADMAP.md) for the prioritized plan covering reliability, student experience, security, notifications, admin workflows, accessibility, performance, and operations.

## Change guidelines

- Preserve Med101's black/charcoal and muted slate-blue brand palette.
- Keep changes focused and reviewable.
- Protect the core dashboard-to-quiz flow from unnecessary loading or visual changes.
- Test loading, empty, error, and success states.
- Do not overwrite unrelated in-progress work; review patches separately before applying them.
