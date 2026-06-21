---
name: fichr-done-check
description: Verify Fichr changes with targeted tests, real browser evidence when relevant, and an honest final report before declaring work complete.
---

# Fichr Done Check

Use this skill before concluding any code change in Fichr.

## Required checks

1. Review the final diff and confirm every changed file belongs to the requested scope.
2. Run `npm run typecheck`.
3. Run the most relevant targeted tests from `package.json`.
4. Run `npm run lint` and `npm run build` when the change can affect shared application behavior or delivery.
5. For user-visible work, verify the exact affected flow with authenticated Playwright in the real local application.
6. Confirm `git status --short` contains only intentional changes.

## Data and behavior checks

Depending on scope, verify that:

- workspace ownership remains enforced;
- import and product status transitions remain correct;
- validated snapshots are preserved;
- audits become stale or current as intended;
- exports include only eligible records;
- deletion behavior remains soft or guarded where required;
- local SQLite runtime files and secrets remain untracked.

## Final report

State clearly:

- what changed;
- what was reproduced before the change;
- commands and tests executed;
- route and interactions verified in the browser;
- remaining warnings or unverified items.

Do not claim success from code inspection alone when runtime verification is relevant.