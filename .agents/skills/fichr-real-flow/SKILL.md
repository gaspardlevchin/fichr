---
name: fichr-real-flow
description: Inspect and change Fichr product flows end to end across CSV import, mapping, draft creation, catalog, product detail, validation, audit, deletion, and exports.
---

# Fichr Real Flow

Use this skill for work that affects how data moves through Fichr.

## Product flow

CSV upload -> import record -> mapping -> row review and corrections -> draft products -> catalog -> product detail -> audit and completeness -> validation or review state -> export.

## Required workflow

1. Inspect the existing implementation before editing.
2. Identify the server actions, services, queries, schema fields, status transitions, and UI consumers involved.
3. Reproduce the issue with the local SQLite database and existing project scripts when possible.
4. Preserve validated snapshots, audit state, import origin, workspace ownership, entitlement rules, and soft-delete behavior.
5. Make the smallest complete change that fixes the real flow.
6. Run the most relevant targeted tests already present in package.json.
7. Verify the affected route in the running application with authenticated Playwright when the change is user-visible.

## Guardrails

- Keep real persistence and real server behavior intact.
- Preserve workspace access, entitlements, validation, authentication, and deletion safeguards.
- Preserve validated data and the current review-state model.
- Inspect existing service and action boundaries before adding abstractions.
- Keep unrelated UI and architecture outside the task.

## Useful checks

Use only checks relevant to the change, for example:

- npm run typecheck
- npm run test:csv-import-validation
- npm run test:csv-row-correction
- npm run test:csv-mapping-presets
- npm run test:catalog-filters
- npm run test:catalog-import-filter
- npm run test:product-import-origin
- npm run test:product-completeness
- npm run test:product-soft-delete
- npm run test:exports-selection
- npm run test:export-identity

For user-visible changes, finish with a real browser verification of the affected route.