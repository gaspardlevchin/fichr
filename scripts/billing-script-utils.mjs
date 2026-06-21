import { randomUUID } from "node:crypto";
import path from "node:path";

import nextEnv from "@next/env";
import Database from "better-sqlite3";

function loadScriptEnvironment() {
  const loadEnvConfig =
    nextEnv?.loadEnvConfig ?? nextEnv?.default?.loadEnvConfig;

  if (typeof loadEnvConfig !== "function") {
    throw new Error(
      "Impossible de charger l’environnement local avec @next/env."
    );
  }

  loadEnvConfig(process.cwd(), true);
}

export const planKeys = ["demo", "starter", "studio", "pro", "business"];
export const entitlementStatuses = [
  "demo",
  "trialing",
  "active",
  "pending_payment",
  "overdue",
  "canceled",
  "expired",
  "suspended"
];

export function assertDevelopmentScript() {
  loadScriptEnvironment();

  if (process.env.NODE_ENV === "production") {
    throw new Error("Ce script est désactivé en production.");
  }
}

export function parseArguments(argv) {
  const values = {};

  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];

    if (!key?.startsWith("--") || value === undefined) {
      throw new Error("Arguments invalides.");
    }

    values[key.slice(2)] = value;
  }

  return values;
}

export function openLocalDatabase() {
  const databaseUrl = process.env.DATABASE_URL ?? "file:./db/fichr.sqlite";
  const rawPath = databaseUrl.startsWith("file:")
    ? databaseUrl.slice("file:".length)
    : databaseUrl;
  const databasePath = path.isAbsolute(rawPath)
    ? rawPath
    : path.resolve(process.cwd(), rawPath);
  const database = new Database(databasePath);
  database.pragma("foreign_keys = ON");
  return database;
}

export function getWorkspaceForEmail(database, email) {
  const normalizedEmail = email.trim().toLowerCase();
  const record = database
    .prepare(
      `select u.id as user_id, wm.workspace_id
       from users u
       join workspace_members wm on wm.user_id = u.id
       where lower(u.email) = ?
       order by wm.created_at asc
       limit 1`
    )
    .get(normalizedEmail);

  if (!record) {
    throw new Error("Utilisateur ou workspace introuvable.");
  }

  return record;
}

export function createId(prefix) {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}

export function getPeriod(periodDays) {
  const start = new Date();
  const end = new Date(start.getTime() + periodDays * 24 * 60 * 60 * 1000);
  return { end: end.toISOString(), start: start.toISOString() };
}

export function upsertEntitlement(database, input) {
  database
    .prepare(
      `insert into workspace_entitlements (
        id, workspace_id, plan_key, status, source,
        current_period_start, current_period_end, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      on conflict(workspace_id) do update set
        plan_key = excluded.plan_key,
        status = excluded.status,
        source = excluded.source,
        current_period_start = excluded.current_period_start,
        current_period_end = excluded.current_period_end,
        updated_at = CURRENT_TIMESTAMP`
    )
    .run(
      createId("ent"),
      input.workspaceId,
      input.plan,
      input.status,
      input.source,
      input.periodStart,
      input.periodEnd
    );
}
