# Med101 Product & Engineering Roadmap

Scope: the full Med101 website  
Working branch: `react-rebuild`  
Stack: React 19 + Vite, Firebase, Vercel

This roadmap prioritizes a dependable study experience before adding more features. It is a planning document, not a claim that every item below has already been tested.

## Guiding principles

- Keep the existing Med101 black / charcoal / muted slate-blue visual identity.
- Prefer simple, readable interfaces over decorative banners, excess gradients, and unnecessary animation.
- Protect the core student flow: Dashboard → subject/topic → quiz → results/review.
- Make changes in small, reviewable commits; avoid unrelated screen redesigns in one change.
- Never expose secrets, payment credentials, private student data, or admin-only actions to public clients.
- Preserve in-progress work. In particular, review and apply the existing notification redesign patch separately; do not overwrite it during unrelated changes.

## Phase 0 — Stabilize and establish a baseline (first)

### 0.1 Production and repository checks
- Run the production build and lint checks against `react-rebuild`.
- Review the Vercel deployment result and browser console for runtime errors.
- Check direct URL refresh, browser back/forward, mobile viewport overflow, and loading/error states.
- Remove or replace template documentation that still describes this as a generic Vite starter.

**Done when:** build and lint outcomes are recorded; critical console errors are resolved; direct navigation and refresh work for the important routes.

### 0.2 Authentication, permissions, and data safety
- Audit sign-up/login, Google login, logout, account deletion/export, and session restoration.
- Verify admin permissions are enforced by trusted server rules/functions, not just hidden UI.
- Review Firestore and Storage rules for least privilege and user-to-user data isolation.
- Check that environment secrets are not committed and that error messages do not leak private data.

**Done when:** each access path has a documented pass/fail result; unauthorized users cannot perform admin actions or read another user's private data.

### 0.3 Quiz reliability
- Test question loading, topic/mode selection, answer selection, timer behavior, result calculation, retry-wrong, flagged/wrong lists, and resume after refresh.
- Check empty, malformed, and offline question data; prevent duplicate submissions or lost progress.
- Verify the result/history/analytics values agree for the same attempt.

**Done when:** a repeatable smoke-test checklist passes on desktop and mobile.

## Phase 1 — Make the everyday student experience excellent

### 1.1 Consistent, simple UI
- Apply shared spacing, typography, buttons, cards, focus states, and error messages across screens.
- Keep the original palette and theme support consistent; avoid introducing a new accent palette for individual menus.
- Check small phones first: no clipped text, horizontal scrolling, or tiny tap targets.
- Respect reduced-motion settings and provide visible keyboard focus.

### 1.2 Study continuity
- Verify quiz resume and cloud/local progress recovery.
- Make History, Retry Wrong, Flagged Questions, Weak Topics, and Search feel like one connected revision workflow.
- Add clear empty states and explain what the user can do next.
- Ensure loading indicators never get stuck and network errors offer a sensible retry.

### 1.3 Search and content quality
- Make subject/question search predictable and fast.
- Provide clear reporting for incorrect or ambiguous questions.
- Track question corrections through an admin review process and avoid silently changing student answers/history.

**Done when:** a student can find a topic, take a quiz, review mistakes, and return later without confusing state or missing feedback.

## Phase 2 — Trust, notifications, and community features

- Test friend requests, challenge invitations, room participation, and notification read/unread behavior end-to-end.
- Review the notification redesign patch as its own change and test Firestore state plus push delivery before release.
- Prevent duplicate, stale, or misleading notifications; make notification preferences understandable.
- Test presence and live-room cleanup after disconnects and app backgrounding.
- Add rate limits and abuse protection to user-generated actions where appropriate.

**Done when:** in-app state and any external push notification agree, and a user's actions cannot affect unrelated accounts.

## Phase 3 — Admin operations and content maintenance

- Test question/PDF upload, manifest updates, semester targeting, and recovery after failed uploads.
- Validate uploaded files (type, size, path, and naming) and provide clear success/failure feedback.
- Review admin analytics, payments, announcements, calendar, reports, and backup/restore flows.
- Document a safe backup and restore procedure; test restoration instead of assuming a backup is usable.
- Keep admin-only code and data out of student-facing UI where practical.

**Done when:** routine content updates are repeatable and failures are visible and recoverable.

## Phase 4 — Performance, accessibility, and installability

- Measure initial load and quiz navigation before optimizing; keep the core quiz path responsive.
- Review lazy-loaded screens, prefetching, Firebase subscriptions, and cleanup of listeners.
- Reduce unnecessary rerenders and repeated reads only where measurements show a problem.
- Test contrast, labels, keyboard navigation, screen-reader names, reduced motion, and touch targets.
- Verify the PWA/mobile install experience and test the Capacitor Android build separately if it remains in scope.

**Done when:** measured performance and accessibility issues are prioritized and critical issues are resolved without breaking the quiz flow.

## Phase 5 — Payments, policies, and operational trust

- Verify payment submission, admin approval/rejection, activation, duplicate handling, and user-visible status.
- Keep the payment explanation transparent: clearly state what the contribution unlocks; do not describe access-gated payments as a purely optional donation.
- Review Terms, Privacy Policy, data export/deletion, retention, and analytics disclosures for consistency with actual behavior.
- Check production environment variables and deployment settings without printing secret values.

**Done when:** payment and account states are auditable, understandable to users, and consistent across UI and backend.

## Release checklist for every meaningful change

- [ ] Scope is limited to the intended feature.
- [ ] Production build passes.
- [ ] Lint passes or remaining warnings are documented.
- [ ] Mobile layout checked at narrow width.
- [ ] Loading, empty, failure, and success states checked.
- [ ] Auth/permissions and user-data boundaries checked when relevant.
- [ ] No secrets or private user data in the diff.
- [ ] Existing quiz flow and related screens smoke-tested.
- [ ] Commit and deployment result recorded; do not claim a deployment is live until verified.

## First implementation sequence

1. Establish build/lint/deployment baseline and review the current diff.
2. Fix any verified critical build, security, or quiz-flow issue first.
3. Replace this repository's generic starter README with Med101-specific setup and deployment guidance.
4. Run a focused end-to-end smoke test on the main quiz and account flows.
5. Move through the phases above in small commits, validating each before proceeding.
