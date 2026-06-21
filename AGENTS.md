# Fichr agent guidance

Work from the real implementation and the current local workspace.

## Skill selection

Use only the skills relevant to the task:

- `$fichr-real-flow` for imports, mapping, row corrections, products, catalog, validation, audits, deletion, and exports.
- `$fichr-browser-verification` for user-visible behavior, navigation, authentication, sessions, layout, and interaction checks.
- `$fichr-done-check` before concluding a code change.
- `$surgical-change` when available to keep the change narrowly scoped.
- `$product-ui-master` or another general UI skill only when the task is genuinely UI or product design work; preserve Fichr's existing direction rather than imposing a template.

Do not invoke every skill by default. Select the smallest useful combination.

## Working rules

1. Inspect the existing code, schema, scripts, and runtime behavior before editing.
2. Reproduce bugs in the real local application whenever possible.
3. Use the official development authentication flow for protected routes.
4. When background processes do not persist, start Next.js and run Playwright within the same execution.
5. Keep SQLite runtime files, local storage, and secrets untracked.
6. Prefer existing targeted tests from `package.json` over creating redundant checks.
7. Do not report a user-visible task complete without browser evidence when browser verification is relevant.
8. Keep unrelated refactors and visual changes outside the requested scope.

## Completion

Before finishing, review the diff, run relevant checks, verify the affected flow, and state honestly what was and was not tested.