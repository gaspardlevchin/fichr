# Spaces

Spaces provide a workspace-scoped organization layer for the product catalog.
An espace can represent a collection, project, lot, client mission, range, or
other working set.

## Active and archived spaces

`/spaces` displays active spaces by default and provides a separate archived
view.

Archiving sets the existing `spaces.deleted_at` marker. It does not delete the
space row or any product and never changes product `draft_data` or
`validated_data`.

Products remain technically associated with an archived space:

- they remain visible in the active catalog when the product itself is active;
- the catalog identifies the espace as archived;
- the archived space is removed from normal filter and assignment options;
- a direct filtered catalog URL remains readable;
- the product can be moved to `Sans espace` or another active espace.

Restoring the espace clears the archive marker and makes it available again in
normal filters and assignment controls. There is no permanent espace deletion.

## CSV assignment review

CSV columns named `espace`, `space`, `collection`, `projet`, `project`,
`gamme`, `dossier`, or `folder` can be explicitly mapped to `space_name`.

Before draft products are created, the import page displays a compact review:

- active spaces that will be reused;
- new spaces that will be created;
- product counts per detected name;
- empty values that will remain without an espace;
- conflicts with archived spaces.

An archived espace with the same exact normalized name is never reused
silently. The affected products remain without an espace until the user
restores the espace or assigns another active one.

The mapping is deterministic:

- empty values are ignored;
- whitespace is normalized;
- names are limited to 80 characters;
- exact active names are reused inside the current workspace;
- missing names are created only when `space_name` is explicitly mapped;
- no cross-workspace lookup is used;
- `space_name` is never copied into `draft_data` or `validated_data`;
- no AI interpretation is involved.

## Exports

An espace does not make a product exportable. Exports still require:

- `products.status = validated`;
- a non-null `validated_data` snapshot;
- an active product with `deleted_at = null`.

Archiving an espace does not change product export eligibility.

## Verification

```sh
npm run test:spaces-organization
npm run test:space-archive
npm run test:spaces-import-mapping
npm run test:spaces-import-review
```
