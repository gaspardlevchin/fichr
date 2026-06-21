import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import Database from "better-sqlite3";

function runEntitlementSet(input) {
  return spawnSync(
    process.execPath,
    [
      "scripts/entitlement-set.mjs",
      "--email",
      input.email,
      "--plan",
      "studio",
      "--status",
      "active",
      "--period-days",
      "30"
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        AUTH_SESSION_SECRET: input.secret,
        DATABASE_URL: `file:${input.databasePath}`,
        NODE_ENV: "development"
      }
    }
  );
}

const tempDir = await mkdtemp(
  path.join(tmpdir(), "fichr-entitlement-script-test-")
);
const databasePath = path.join(tempDir, "entitlements.sqlite");
const allowedEmail = "operator-test@example.com";
const secret = "ENTITLEMENT_SCRIPT_SECRET_MUST_NOT_LEAK";

try {
  const database = new Database(databasePath);
  database.exec(`
    create table users (
      id text primary key,
      email text not null unique
    );
    create table workspaces (
      id text primary key,
      name text not null
    );
    create table workspace_members (
      id text primary key,
      workspace_id text not null,
      user_id text not null,
      role text not null,
      created_at text not null default CURRENT_TIMESTAMP
    );
    create table workspace_entitlements (
      id text primary key,
      workspace_id text not null unique,
      plan_key text not null,
      status text not null,
      source text not null,
      current_period_start text,
      current_period_end text,
      updated_at text not null default CURRENT_TIMESTAMP
    );
    insert into users values ('usr_operator', '${allowedEmail}');
    insert into workspaces values ('wks_operator', 'Operator workspace');
    insert into workspace_members (
      id, workspace_id, user_id, role
    ) values (
      'wkm_operator', 'wks_operator', 'usr_operator', 'owner'
    );
  `);
  database.close();

  const success = runEntitlementSet({
    databasePath,
    email: allowedEmail,
    secret
  });
  assert.equal(success.status, 0, success.stderr);
  assert.match(
    success.stdout,
    /Entitlement studio\/active appliqué au workspace local/
  );
  assert.equal(
    `${success.stdout}${success.stderr}`.includes(secret),
    false
  );

  const verificationDatabase = new Database(databasePath, {
    fileMustExist: true,
    readonly: true
  });
  const entitlement = verificationDatabase
    .prepare(
      `select
         workspace_id as workspaceId,
         plan_key as planKey,
         status,
         source,
         current_period_start as periodStart,
         current_period_end as periodEnd
       from workspace_entitlements`
    )
    .get();
  verificationDatabase.close();

  assert.equal(entitlement.workspaceId, "wks_operator");
  assert.equal(entitlement.planKey, "studio");
  assert.equal(entitlement.status, "active");
  assert.equal(entitlement.source, "manual");
  assert.equal(typeof entitlement.periodStart, "string");
  assert.equal(typeof entitlement.periodEnd, "string");

  const missingUser = runEntitlementSet({
    databasePath,
    email: "missing@example.com",
    secret
  });
  assert.notEqual(missingUser.status, 0);
  assert.match(missingUser.stderr, /Utilisateur ou workspace introuvable/);
  assert.equal(
    `${missingUser.stdout}${missingUser.stderr}`.includes(secret),
    false
  );

  const utilitySource = await readFile(
    "scripts/billing-script-utils.mjs",
    "utf8"
  );
  assert.equal(
    /import\s*\{\s*loadEnvConfig\s*\}\s*from\s*["']@next\/env/.test(
      utilitySource
    ),
    false
  );
  assert.match(utilitySource, /nextEnv\?\.loadEnvConfig/);
} finally {
  await rm(tempDir, { force: true, recursive: true });
}

console.log("Entitlement script coverage passed.");
