# V1 quality gate

This document tracks the current Fichr V1 readiness for a private beta.

## Ready for a private beta

- Local-first SQLite and Drizzle foundation.
- CSV import, row validation, row correction, column mapping, and reusable
  mapping presets.
- Draft product creation from mapped CSV rows.
- Workspace-scoped import batches linking each CSV source to its created
  products, with a combinable `import` catalog filter and product-level source
  details.
- Imported-batch review with audit-state counts, quick filters, deterministic
  batch audit, product-to-product navigation, and reversible import-scoped
  soft deletion.
- Catalog search, status filters, sorting, simple pagination, and page-scoped
  bulk export selection for validated products.
- Product editing with stale audit state.
- Deterministic product completeness state that works with `AI_ENABLED=false`.
- Catalog completeness indicators, filters, and score sorting.
- Deterministic product completeness quick actions that guide corrections
  without AI or automatic data changes.
- Stable field and section targets for completeness actions, with focused
  correction navigation and compact media empty states.
- Focused primary navigation using `Imports / Catalogue / Exports`, with
  spaces, account, settings, plan details, and logout kept in the session
  drawer or catalog context.
- Shared page headers, empty states, alerts, and translated status badges
  across the core workspace screens.
- Compact responsive header with direct, intentional navigation and no
  hover-triggered catalogue panel.
- In-flow session drawer without a floating account pop-up or plan badge in
  the main header.
- Structured session drawer with separated identity, plan status, account
  links, logout, and close actions.
- Shared inner alignment for large rounded panels across imports, catalogue,
  exports, account, and the product core.
- Catalog metrics rendered as a responsive value/label grid rather than raw
  adjacent text.
- Product core rendered as responsive media and information zones with compact
  batch navigation and an explicit return to the imported lot.
- Compact four-step import progress display with separate labels and statuses.
- Compact import/export history rows with separated filename or export code,
  date, status, and actions.
- Product core view with compact batch navigation, a single-boundary media
  panel, product overview, grouped missing information, audit, origin,
  validation, and explicit export eligibility.
- Compact catalog summary for product states and potential duplicates while
  preserving combined filters, import context, pagination, and workspace
  isolation.
- Full-workspace dashboard counters without adding secondary hover navigation.
- Customer-facing audit and AI messages without raw field keys, provider
  configuration, or mechanical `(s)` plurals.
- Denser catalog and product forms, an integrated local image picker, a compact
  product danger zone, and a clear return path from product pages.
- Local JPG, PNG, and WEBP product image lifecycle with controlled storage,
  replacement, and removal.
- Restorable product soft deletion with exact-title confirmation,
  workspace-scoped server enforcement, and preserved local image assets.
- Simple workspace-scoped spaces managed from `/spaces`, with a compact catalog
  filter, unassigned products, and explicit product association.
- Restorable espace archiving that preserves products and product snapshots,
  excludes archived spaces from normal catalog selectors, and keeps archived
  associations readable on product views.
- Duplicate safeguards using import-source hashes, row-level source identity,
  idempotent `import_row_id` creation, and non-destructive catalog warnings.
- Deterministic CSV `space_name` mapping with workspace-scoped exact reuse or
  creation, without writing the espace into product snapshots.
- Compact CSV organization review with existing/new/unassigned counts and
  explicit archived-space conflicts.
- Project hygiene safeguards, including sensitive-file ignore rules and a
  clean archive command.
- Deterministic product audit with field-level correction links.
- Product validation from `draft_data` to `validated_data`.
- TXT, CSV, and PDF exports from `validated_data` only.
- Selected-product exports with server-side validation.
- Export deletion and download refusal for deleted exports.
- Unique export identity with a visible `export_code`, canonical validated-data
  hash, generated-file hash, controlled filename, and workspace-scoped product
  ID snapshot.
- Standardized PDF identity on every page, including Fichr attribution, export
  code, date, page number, short hash, and a discreet watermark.
- Controlled AI architecture with disabled provider support, proposed/dismissed
  suggestions, and human-applied subtitle/description changes only.
- Private beta server-side sessions with an HttpOnly cookie, normalized email
  allowlist, explicit dev-only login, logout revocation, and central workspace
  membership enforcement.
- Native workspace entitlements with demo fallback, server-side feature gates,
  quotas, and internal Starter/Studio/Pro/Business plans.
- Provider-agnostic billing records and adapter contract, with optional Mollie
  sandbox checkout, authenticated idempotent webhook processing, and no card or
  IBAN storage.
- Client-owned storage boundary with a local provider, workspace-scoped safe
  keys, a minimal file manifest, and no cloud provider enabled by default.
- Read-only workspace storage diagnostics and private local SQLite + storage
  backups with checksums and an explicit non-shareable manifest.
- Controlled dry-run/apply indexing for legacy local files and read-only
  verification of private backup manifests and per-file checksums.
- Optional authenticated local backup encryption using AES-256-GCM with
  scrypt-derived keys and no stored or recoverable passphrase.

## Partially ready

- The secure session/workspace foundation is ready, but production OAuth or
  magic-link identity verification is not integrated yet.
- Catalog pagination is simple and page-scoped. There is no persistent bulk
  selection across pages.
- PDF export is standardized and local, but not yet template-configurable.
- Export verification, revocation, expiration, recipient watermarking, and
  public authenticity checks are not implemented yet.
- AI is architecture-only unless running the isolated test provider in
  `NODE_ENV=test`.

## Not ready yet

- Production OAuth or magic-link login and account management.
- Recurring subscription creation, cancellation synchronization, refunds, and
  fiscal invoice documents.
- Hosted deployment hardening.
- Team invitations and real support access approval.
- Import/export retention policies beyond manual export deletion.
- Notion, Shopify, Stripe, and real AI provider integrations.

## Known risks

- `db/fichr.sqlite` is a disposable local development database. Use
  `npm run db:reset:dev` only when local data can be deleted.
- Browser and localhost flows should still be checked manually before demos.
- Large catalogs may need database-level search and pagination later.
- Bulk export selection currently applies only to the visible catalog page.
- Permanent product deletion is intentionally unavailable until production
  authentication, roles, and retention rules exist.
- Local images are single-file product assets, not a complete asset library.
- Primary catalogue navigation remains available at every viewport without
  relying on a drawer or hover behavior.
- Products that are ready to validate remain non-exportable until their status
  is explicitly `validated`.
- The deterministic completeness flow and product UI remain compatible with
  `AI_ENABLED=false`.

## Verification commands

Run the no-server checks before sharing a V1 beta build:

```sh
npm run test:csv-import-validation
npm run test:csv-import-entitlements
npm run test:import-creation-preflight
npm run test:import-ux-states
npm run test:csv-mapping-presets
npm run test:csv-row-correction
npm run test:exports-selection
npm run test:export-identity
npm run test:ai-architecture
npm run test:catalog-filters
npm run test:catalog-import-filter
npm run test:imported-batch-review
npm run test:batch-audit-actions
npm run test:product-batch-navigation
npm run test:import-bulk-soft-delete
npm run test:catalog-bulk-export
npm run test:catalog-completeness
npm run test:product-completeness
npm run test:product-completeness-actions
npm run test:product-completeness-navigation
npm run test:product-import-origin
npm run test:product-image-assets
npm run test:product-delete-safety
npm run test:product-soft-delete
npm run test:spaces-organization
npm run test:space-archive
npm run test:spaces-import-mapping
npm run test:spaces-import-review
npm run test:project-hygiene
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
npm run test:ui-navigation
npm run test:ui-status-labels
npm run test:ui-empty-states
npm run test:ui-copy-labels
npm run test:ui-micro-polish
npm run test:ui-no-concatenated-copy
npm run test:session-drawer-real-panel
npm run test:catalog-metrics-layout
npm run test:product-detail-layout-rebuild
npm run test:imports-exports-card-compactness
npm run test:rounded-panel-content-alignment
npm run test:auth-private-beta
npm run test:workspace-access
npm run test:entitlements
npm run test:entitlement-scripts
npm run test:demo-mode
npm run test:plan-limits
npm run test:billing-provider
npm run test:mollie-billing
npm run test:storage-ownership
npm run test:storage-provider
npm run test:storage-path-safety
npm run test:storage-health
npm run test:local-backup
npm run test:legacy-storage-indexing
npm run test:backup-verification
npm run test:encrypted-backup
npm run test:backup-restore-preflight
npm run lint
npm run typecheck
npm run build
```

Manual local browser check:

```sh
npm run dev
```

Then verify the main flow:

1. Import a CSV.
2. Correct invalid rows if needed.
3. Map columns.
   Confirm `Titre` is marked as required and unused columns are described as
   non-blocking.
4. Review the visible creation preflight, then create draft products.
   Confirm the stepper, line counts, space counts, plan and remaining quotas
   match the actual creation result.
   Confirm a Demo workspace refuses a 30-line import with a quota message and
   creates no partial products or spaces. Confirm Studio accepts the same
   import.
5. Search/filter/sort the catalog.
   Open « Voir les produits créés » from a processed import and confirm the
   catalog keeps `import=<importId>` while combining status, completeness,
   space, deleted-state and pagination filters. Confirm the batch summary and
   product source links use only the current workspace.
   Launch the deterministic batch audit, navigate between adjacent imported
   products, then soft-delete and restore a disposable import after typing the
   exact source filename. Confirm historical exports and local files remain
   present.
6. Edit, audit, and validate a product.
7. Add, replace, and remove a local product image.
8. Export validated products from `/exports`.
9. Export a selected validated product from `/catalog`.
10. Delete an export and confirm download is refused.
11. Soft-delete a test product after exact-title confirmation, then restore it.
12. Create an espace from `/spaces`, assign a product, and filter the catalog.
13. Archive and restore an espace, confirming its products remain intact.
14. Review CSV espace assignments before creating draft products.
15. Generate `artifacts/fichr-clean.zip` with `npm run archive:clean`.
16. Log in through `/login`, verify an allowlisted address succeeds, then log
    out and confirm the session is revoked.
17. Open `/account`, verify the demo badge and quotas, then use a local
    entitlement script to confirm server-side feature changes.
    Confirm `entitlement:set` applies `studio/active` without an `@next/env`
    import error.
18. Run `npm run storage:doctor`, then create a private backup with
    `npm run backup:local` while no writes are occurring.
19. Review `storage:index-legacy --dry-run` before any explicit `--apply`, and
    verify private backups with `backup:verify`.
20. Create and verify an encrypted `.fichrbackup`, then unset the temporary
    `BACKUP_PASSPHRASE`.
21. Run `backup:restore-preflight` and confirm it reports workspace/storage
    conflicts without changing the active SQLite or storage.

## Recommended priorities

1. Add database-level catalog pagination/search when catalogs become larger.
2. Integrate a real OAuth or magic-link provider behind the existing allowlist.
3. Add recurring provider subscriptions and cancellation synchronization.
4. Add permanent product deletion only after roles and retention are defined.
5. Add a real AI provider only behind the existing controlled server actions.
