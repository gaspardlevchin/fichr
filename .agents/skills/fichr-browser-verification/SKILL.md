---
name: fichr-browser-verification
description: Reproduce and verify Fichr user-facing behavior in the real local Next.js application with the official development login and Playwright.
---

# Fichr Browser Verification

Use this skill for UI, UX, navigation, authentication, session, import, catalog, product, export, and visual regression work.

## Environment facts

- Work in the current Fichr workspace.
- Start Next.js inside the same execution that performs browser checks when the environment does not preserve background processes.
- Use the official development login flow.
- PRIVATE_BETA_DEV_EMAIL must be allowed by PRIVATE_BETA_ALLOWED_EMAILS.
- AUTH_DEV_LOGIN_ENABLED must be true in development.
- Use the real `fichr_session` cookie created by the application.

## Required workflow

1. Reproduce the issue before editing.
2. Start the local Next.js server and wait for the target route to respond.
3. Authenticate through the real `/login` form using the configured development email.
4. Open the exact affected route with Playwright.
5. Record the final URL, HTTP status, visible text, controls, console errors, and page errors.
6. Make the scoped change.
7. Repeat the same browser scenario after editing.
8. Capture a screenshot when layout or visual behavior matters.

## Browser rules

- Do not infer rendered behavior only from React or CSS source.
- Do not report a protected route as verified when Playwright only reached `/login`.
- Distinguish expected redirects from failures.
- Ignore development HMR WebSocket noise only when the page itself loads and behaves correctly; report it separately.
- Use localhost consistently when it avoids Next.js development-origin warnings.

## Completion evidence

A user-visible task is not complete without stating:

- route tested;
- authentication state used;
- final URL and status;
- interaction performed;
- result observed;
- console or page errors;
- checks not performed, if any.