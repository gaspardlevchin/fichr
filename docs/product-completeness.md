# Product completeness

Fichr includes a deterministic product completeness layer that works without
paid AI providers. It reads the current product sheet, calculates what is
complete or missing, and gives next actions without modifying product data.

The calculation never writes to `draft_data`, never writes to `validated_data`,
never creates AI suggestions, and never calls OpenAI.

## Required fields

Required fields are the minimum needed for a reliable product sheet:

- `title`
- `category`
- `description`
- price, through `current_price` or `desired_price`

Missing or invalid required fields become blockers.

## Recommended fields

Recommended fields improve catalog quality but do not block by themselves:

- `subtitle`
- `sku`
- `materials`
- `origin`
- `dimensions`
- `image_url`

Missing recommended fields are shown separately so the user can decide what to
complete next.

## Financial checks

Financial checks stay deterministic:

- non-numeric price values are blockers when they affect required price fields;
- invalid `cost_price` is a warning;
- `desired_price` lower than `cost_price` is a warning.

Fichr does not invent prices or margins.

## Score and status

The score starts at 100 and is reduced by blockers, missing recommended fields,
and warnings. The UI status is translated into user-facing labels:

- `draft` -> `En préparation`
- `needs_info` -> `À compléter`
- `needs_review` -> `À vérifier`
- `validated` -> `Validée`

The completeness status can be:

- `À compléter`
- `À vérifier`
- `Prête à valider`
- `Validée`

## Catalog usage

The catalog shows deterministic completeness directly on each product card:

- the user-facing product status;
- the completeness score as a percentage;
- a simple indicator: `Bloquant`, `À compléter`, `Prêt à valider`, or
  `Complet`.

The catalog also accepts a `completeness` search parameter:

- `all`: all workspace products;
- `blocked`: products with blockers;
- `incomplete`: products without blockers but with recommended fields missing;
- `ready`: products without blockers and without recommended fields missing;
- `complete`: products without blockers, without recommended fields missing,
  and without warnings.

This filter is combinable with `q`, `status`, `sort`, `page`, and `pageSize`.
The optional catalog sorts `completeness_asc` and `completeness_desc` sort by
the calculated score in memory.

`Prêt à valider` and `Complet` do not mean exported. Catalog exports remain
strictly based on products with `status = validated`, and exported content still
comes from `validated_data` only.

## Deterministic recommended actions

Fichr turns completeness results into deterministic recommended actions. These
actions are calculated without AI and never update product data automatically.

Actions can point to an editable field, a value to check, the audit section, or
the existing validation section. They are ordered by product usefulness:

1. required blockers;
2. invalid values;
3. financial warnings;
4. recommended fields;
5. media/image;
6. audit;
7. validation.

Each action has an id, label, short description, priority, type, severity,
optional target field, optional anchor, a blocking flag, and optional completion
state.

Action links use stable product-page targets. Field corrections point to the
matching editable input, while audit, media, edition, and validation actions
point to their dedicated sections. Clicking an action scrolls to the target,
briefly highlights it, and focuses the relevant control when possible. This
guides the correction only and never changes the sheet automatically.

The media area shows the current image URL when available. Its empty state is a
navigation aid to the image field, not a generated image or a replacement for a
real uploaded asset.

The quick actions guide correction only. They do not write to `draft_data`, do
not write to `validated_data`, do not create AI suggestions, and do not call
OpenAI. `Prêt à valider` means the user can review the sheet and use the
existing validation flow; it does not mean the product is validated or
exportable. Exports remain restricted to products with `status = validated`
and continue to read `validated_data` only.

Future AI may enrich these actions later, but only as supervised suggestions.
The deterministic blockers and export rules remain the source of truth.

## AI relationship

This layer is not AI and does not depend on `AI_ENABLED`. Future AI suggestions
may enrich the next actions, but they must stay separate from this deterministic
quality gate and must never replace explicit user validation.
