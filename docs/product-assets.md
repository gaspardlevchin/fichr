# Product image assets

Fichr supports one local working image per product. This first asset lifecycle
is intentionally small and does not depend on an external storage provider.

## Accepted files

- JPEG: `.jpg` or `.jpeg`, MIME type `image/jpeg`
- PNG: `.png`, MIME type `image/png`
- WEBP: `.webp`, MIME type `image/webp`
- Maximum size: 5 MB

SVG, GIF, PDF, HEIC, empty files, mismatched extensions, and files with invalid
binary signatures are refused.

## Local storage

Files are stored under:

```text
storage/images/<workspace_id>/<product_id>/
```

The server generates the stored filename. The original user filename is never
used as a storage path. Workspace IDs, product IDs, filenames, and resolved
paths are checked before every read or deletion.

The UI and database store a controlled URL such as:

```text
/products/<product_id>/image?asset=<generated_filename>
```

The filesystem path is never exposed to the client. Image reads pass through a
workspace-scoped route.

## Draft and validation rules

Adding, replacing, or removing an image is an explicit user action. It updates
`draft_data.image_url` and the flat `image_url` field only.

It never updates `validated_data`. If the product was already validated, the
product returns to `needs_review` and its current audit becomes stale. A new
explicit validation is required before the image can enter a future validated
snapshot.

`Prêt à valider` does not mean `Validé`. Exports remain restricted to products
with `status = validated` and continue to read `validated_data` only.

## Replacement and removal

Replacement writes the new file first, updates the product, then removes the
previous file only when its URL is recognized as a controlled local asset.

Removal detaches the draft reference and deletes the physical file only when it
is inside the controlled product image directory. External URLs and arbitrary
paths are never deleted.

## AI and providers

Images are not analyzed, sent to OpenAI, or sent to any external provider.
This lifecycle works with `AI_ENABLED=false`.

## Verification

```sh
npm run test:product-image-assets
```
