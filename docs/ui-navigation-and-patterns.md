# Navigation and core UI patterns

This document records the shared navigation and interface conventions used by
the Fichr private-beta application.

## Navigation

The main navigation exposes the three recurring work areas:

- `Imports`: import CSV files, review mappings, and create draft products.
- `Catalogue`: find, review, edit, audit, and validate product sheets.
- `Exports`: generate and retrieve TXT, CSV, or PDF exports.

Spaces are an organization tool for the catalog. They remain available from
the catalog and the session drawer instead of occupying the primary header.

The Fichr logo returns to an import-oriented workspace entry point. Account,
plan, settings, spaces, and logout live in the session drawer rather than
competing with the primary workflow. The active plan is never displayed in the
main header.

Catalogue is a direct navigation link. It never opens a major panel on hover,
focus, or pointer entry. This keeps the header stable and makes every
navigation change intentional.

The session control opens an in-flow drawer below the header. It is not a
floating pop-up and it only opens after an explicit click on the session
avatar. Escape, the close action, or leaving the drawer focus context closes
it.

The session drawer is divided into three explicit areas: identity and email,
plan and status, then account links and session actions. Account, settings, and
spaces are separate vertical links. Logout and close remain distinct actions,
so labels must never rely on adjacent inline text for spacing.

## Page structure

Core pages use `PageHeader` for a consistent hierarchy:

1. optional context label;
2. clear page title;
3. short operational description;
4. one visible primary action;
5. optional secondary actions.

Page titles describe the current work area rather than marketing the product.
Technical or local-development details stay outside the primary page heading.

## Shared components

- `PageHeader` standardizes page identity, back navigation, and actions.
- `EmptyState` explains why a list is empty and provides a useful next step.
- `InlineAlert` presents concise success, information, and error feedback.
- `StatusBadge` gives status labels a shared visual treatment.

These components remain intentionally small. They consolidate repeated
patterns without introducing a UI framework or changing the Fichr visual
direction.

## Status language

Product, import, export, entitlement, and invoice statuses are translated into
short French labels before display. Raw database values such as `complete`,
`deleted`, or `past_due` must not appear in the customer interface.

Examples:

- export `complete` becomes `Généré`;
- export `deleted` becomes `Révoqué`;
- import `mapped` becomes `Mapping validé`;
- product `needs_review` becomes `À vérifier`;
- entitlement `past_due` becomes `Paiement en retard`.

## Empty states and actions

An empty state must answer two questions:

1. What is currently missing?
2. What can the user do next?

Primary actions create or advance work, such as importing a CSV or opening a
product sheet. Destructive actions remain visually secondary. Links and
buttons must always lead to a real destination or execute a real action.

Archiving a space removes it from normal catalog filters but does not detach or
delete its products. Product-level views may identify the archived association
and allow reassignment to an active space.

Import source files are retained. The UI distinguishes reversible product
masking from source-file deletion and does not expose an inactive delete-import
button.

## Duplicate handling

- An identical CSV hash adds a visible warning to the new import.
- Duplicate rows are skipped when they share a source reference, or the same
  product title and space.
- Re-running product creation for an already processed import remains
  idempotent through `import_row_id`.
- Potential catalog duplicates are identified by SKU, or by title and space.
- Fichr never merges or deletes potential duplicates automatically.

## Density and hierarchy

- Keep operational descriptions short.
- Use icons only alongside recognizable actions or states.
- Group catalog filters by visibility, status, and completeness.
- Show quotas as used capacity and remaining capacity, not as an unexplained
  ratio.
- Keep destructive actions explicit and separated from primary actions.
- Avoid nested visual cards when one container can express the same boundary.
- Keep filenames, export codes, dates, statuses, and actions in distinct
  elements. Never concatenate metadata into a single visual string.
- Secondary titles stay below page-title scale. Histories use compact rows,
  not oversized cards.
- Product media uses one visual boundary. The preview and its controls are
  columns inside that boundary, not cards nested inside cards.
- Batch navigation is a compact secondary bar. Its counter must not compete
  with the product title.
- Card copy starts at the content inset aligned with the beginning of the
  squircle curve.
- Large rounded panels use `content-card` and `content-card-inner`. The outer
  element owns the border, radius, and shadow; the inner element owns the
  optical content inset.
- Metrics always separate the numeric value from its label in distinct
  elements. Adjacent text nodes must not be used as layout.
- Page and card action groups use an explicit flex container with a real gap.

## Copy rules

- No glued labels such as `CompteRéglages`, `StudioActif`, `.csv19 juin`, or
  `Étape 1Fichier`.
- Use short French labels with accents and apostrophes.
- Use real singular and plural forms instead of interface copy such as
  `produit(s)` or `fiche(s)`.
- Keep provider names, environment variable names, and server configuration
  details out of customer-facing AI feedback.
- Empty and unavailable states explain the next action rather than exposing a
  technical status.
- Dangerous actions are named explicitly and remain visually secondary.

## Technical information

Commands intended for local maintenance are kept in the account or settings
area. Long command lists are collapsed by default so they remain available
without dominating normal product workflows.

## Verification

The no-server UI checks are:

```sh
npm run test:ui-navigation
npm run test:ui-status-labels
npm run test:ui-empty-states
npm run test:ui-copy-labels
npm run test:app-header-hydration-copy
npm run test:archived-space-catalog-visibility
npm run test:main-navigation-simplification
npm run test:session-drawer
npm run test:session-drawer-layout
npm run test:visual-regression-copy-fixes
npm run test:import-stepper-layout
npm run test:product-batch-navigation-ui
npm run test:account-plan-limits-copy
npm run test:catalog-ui-cleanup
npm run test:catalog-premium-core
npm run test:product-image-panel
npm run test:product-detail-premium-core
npm run test:product-export-eligibility-ui
npm run test:exports-imports-card-layout
npm run test:product-and-import-delete-actions
npm run test:csv-duplicate-guard
npm run test:ui-spacing-patterns
npm run test:ui-micro-polish
npm run test:ui-no-concatenated-copy
npm run test:session-drawer-real-panel
npm run test:catalog-metrics-layout
npm run test:product-detail-layout-rebuild
npm run test:imports-exports-card-compactness
npm run test:rounded-panel-content-alignment
```
