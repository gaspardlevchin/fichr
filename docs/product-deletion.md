# Product deletion

Fichr uses restorable soft deletion for products.

## Confirmation and transport

Deletion requires an explicit POST server action. The user must type the exact
current product title. Empty or incorrect confirmation is refused.

There is no GET deletion or restoration route, no bulk deletion, and no
permanent product deletion in this version.

## Soft deletion

Deleting a product sets `products.deleted_at`. The row, `draft_data`,
`validated_data`, audit history, AI suggestion history, export history, and
image reference remain unchanged.

The physical image file is intentionally retained. This allows the product to
recover its complete state when restored.

Deleted products:

- are excluded from the active catalog;
- remain visible through `/catalog?deleted=deleted`;
- remain accessible by their direct product URL;
- cannot be edited, audited, validated, assigned to another space, or used for
  AI suggestions until restored;
- are never selectable or eligible for TXT, CSV, or PDF export.

## Restoration

Restoration uses a POST server action and sets `products.deleted_at` back to
`null`. The product then returns to the active catalog with its previous
working and validated snapshots intact.

## Workspace access

Deletion and restoration queries check both `product_id` and `workspace_id`.
The current local-development access layer restricts these operations to owner
or admin roles. Production authentication remains future work.

## Future permanent deletion

Permanent deletion requires production authentication, explicit roles,
retention rules, and a separate irreversible workflow. It is intentionally not
available in this version.

## Verification

```sh
npm run test:product-delete-safety
npm run test:product-soft-delete
```
