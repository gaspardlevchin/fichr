import path from "node:path";

import nextEnv from "@next/env";
import Database from "better-sqlite3";

const { loadEnvConfig } = nextEnv;

export function loadLocalEnvironment() {
  loadEnvConfig(process.cwd(), true);
}

export function parseStorageArguments(argv) {
  const values = {};

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];

    if (!key?.startsWith("--")) {
      throw new Error("Arguments invalides.");
    }

    const nextValue = argv[index + 1];

    if (nextValue === undefined || nextValue.startsWith("--")) {
      values[key.slice(2)] = true;
      continue;
    }

    values[key.slice(2)] = nextValue;
    index += 1;
  }

  return values;
}

export function resolveLocalDatabasePath() {
  const databaseUrl = process.env.DATABASE_URL ?? "file:./db/fichr.sqlite";
  const rawPath = databaseUrl.startsWith("file:")
    ? databaseUrl.slice("file:".length)
    : databaseUrl;

  return path.isAbsolute(rawPath)
    ? rawPath
    : path.resolve(process.cwd(), rawPath);
}

export function openReadOnlyLocalDatabase() {
  return new Database(resolveLocalDatabasePath(), {
    fileMustExist: true,
    readonly: true
  });
}

export function openWritableLocalDatabase() {
  const database = new Database(resolveLocalDatabasePath(), {
    fileMustExist: true
  });
  database.pragma("foreign_keys = ON");
  return database;
}

export function resolveWorkspace(database, args) {
  if (args.workspace && args.email) {
    throw new Error("Utilisez --workspace ou --email, pas les deux.");
  }

  if (args.workspace) {
    const workspace = database
      .prepare("select id, name from workspaces where id = ?")
      .get(args.workspace);

    if (!workspace) {
      throw new Error("Workspace introuvable.");
    }

    return workspace;
  }

  if (args.email) {
    const workspace = database
      .prepare(
        `select w.id, w.name
         from users u
         join workspace_members wm on wm.user_id = u.id
         join workspaces w on w.id = wm.workspace_id
         where lower(u.email) = lower(?)
         order by wm.created_at asc
         limit 1`
      )
      .get(args.email);

    if (!workspace) {
      throw new Error("Utilisateur ou workspace introuvable.");
    }

    return workspace;
  }

  const workspaces = database
    .prepare("select id, name from workspaces order by created_at asc")
    .all();

  if (workspaces.length === 0) {
    throw new Error("Aucun workspace local.");
  }

  if (workspaces.length > 1) {
    throw new Error(
      "Plusieurs workspaces existent. Utilisez --workspace ou --email."
    );
  }

  return workspaces[0];
}

export function readWorkspaceStorageObjects(database, workspaceId) {
  return database
    .prepare(
      `select
         id,
         workspace_id as workspaceId,
         storage_key as storageKey,
         size_bytes as sizeBytes,
         hash_sha256 as hashSha256,
         metadata,
         deleted_at as deletedAt
       from storage_objects
       where workspace_id = ?
       order by created_at asc`
    )
    .all(workspaceId)
    .map((record) => ({
      ...record,
      metadata: record.metadata ? JSON.parse(record.metadata) : null
    }));
}
