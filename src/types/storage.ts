export const dataOwnershipModes = [
  "local_device",
  "self_hosted",
  "user_cloud",
  "fichr_managed_optional"
] as const;

export const storageProviderKinds = [
  "local",
  "user_cloud_placeholder",
  "self_hosted_placeholder",
  "fichr_managed_placeholder"
] as const;

export const storageObjectTypes = [
  "import_source",
  "product_image",
  "export_file",
  "generated_document",
  "future_attachment"
] as const;

export type DataOwnershipMode = (typeof dataOwnershipModes)[number];
export type StorageProviderKind = (typeof storageProviderKinds)[number];
export type StorageObjectType = (typeof storageObjectTypes)[number];

export type StorageObjectMetadata = {
  indexedAt?: string;
  legacy?: boolean;
  source?: "legacy_indexing";
};
