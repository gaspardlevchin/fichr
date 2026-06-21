import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import Database from "better-sqlite3";

import {
  assertDevLoginEmailAllowed,
  createSessionToken,
  getPrivateBetaDevLoginConfiguration,
  getPrivateBetaDevLoginConfigurationMessage,
  getSessionCookieOptions,
  hashSessionToken,
  isDevLoginEnabled,
  isEmailAllowed,
  normalizeEmail,
  parseAllowedEmails,
  sessionTokenHashesMatch
} from "../src/server/auth/core.ts";
import { resolveWorkspaceAccess } from "../src/server/auth/access-core.ts";

async function main() {
  const secret = "test-session-secret-with-at-least-32-characters";
  const allowedEmails = " beta@example.com,OWNER@EXAMPLE.COM ";
  const validConfiguration = {
    allowedEmails,
    devEmail: "owner@example.com",
    devLoginEnabled: "true",
    environment: "development",
    sessionSecret: secret
  };

  assert.equal(normalizeEmail("  OWNER@Example.COM "), "owner@example.com");
  assert.deepEqual(
    [...parseAllowedEmails(allowedEmails)],
    ["beta@example.com", "owner@example.com"]
  );
  assert.equal(isEmailAllowed(" OWNER@example.com ", allowedEmails), true);
  assert.equal(isEmailAllowed("outsider@example.com", allowedEmails), false);
  assert.equal(isDevLoginEnabled("production", "true"), false);
  assert.equal(isDevLoginEnabled("test", "true"), false);
  assert.equal(isDevLoginEnabled(undefined, "true"), false);
  assert.equal(isDevLoginEnabled("development", "false"), false);
  assert.equal(isDevLoginEnabled("development", "true"), true);
  assert.deepEqual(getPrivateBetaDevLoginConfiguration(validConfiguration), {
    configured: true,
    devEmail: "owner@example.com"
  });
  assert.deepEqual(
    getPrivateBetaDevLoginConfiguration({
      ...validConfiguration,
      allowedEmails: "beta@example.com"
    }),
    { configured: false, reason: "missing_allowed_emails" }
  );
  assert.deepEqual(
    getPrivateBetaDevLoginConfiguration({
      ...validConfiguration,
      devEmail: ""
    }),
    { configured: false, reason: "missing_dev_email" }
  );
  const shortSecretConfiguration = getPrivateBetaDevLoginConfiguration({
    ...validConfiguration,
    sessionSecret: "too-short"
  });
  assert.deepEqual(shortSecretConfiguration, {
    configured: false,
    reason: "invalid_session_secret"
  });
  assert.match(
    getPrivateBetaDevLoginConfigurationMessage(shortSecretConfiguration),
    /au moins 32 caractères/
  );
  assert.deepEqual(
    getPrivateBetaDevLoginConfiguration({
      ...validConfiguration,
      environment: "production"
    }),
    { configured: false, reason: "production" }
  );

  process.env.NODE_ENV = "development";
  process.env.AUTH_DEV_LOGIN_ENABLED = "true";
  process.env.PRIVATE_BETA_DEV_EMAIL = "owner@example.com";
  process.env.PRIVATE_BETA_ALLOWED_EMAILS = allowedEmails;
  process.env.AUTH_SESSION_SECRET = secret;

  assert.equal(
    assertDevLoginEmailAllowed(" OWNER@Example.com "),
    "owner@example.com"
  );
  assert.throws(
    () => assertDevLoginEmailAllowed("outsider@example.com"),
    /autorisée/
  );

  const token = createSessionToken();
  const tokenHash = hashSessionToken(token, secret);

  assert.equal(token.length > 32, true);
  assert.equal(tokenHash.length, 64);
  assert.equal(tokenHash.includes(token), false);
  assert.equal(sessionTokenHashesMatch(token, tokenHash, secret), true);
  assert.equal(sessionTokenHashesMatch("invalid", tokenHash, secret), false);
  assert.deepEqual(getSessionCookieOptions("development"), {
    httpOnly: true,
    maxAge: 604800,
    path: "/",
    sameSite: "lax",
    secure: false
  });
  assert.equal(getSessionCookieOptions("production").secure, true);

  const sqlite = new Database(":memory:");
  sqlite.exec(`
    create table users (
      id text primary key,
      email text not null unique
    );
    create table workspaces (
      id text primary key,
      owner_user_id text not null
    );
    create table workspace_members (
      id text primary key,
      workspace_id text not null,
      user_id text not null,
      role text not null,
      unique(workspace_id, user_id)
    );
    create table sessions (
      id text primary key,
      user_id text not null,
      token_hash text not null,
      expires_at text not null,
      revoked_at text
    );
  `);
  const ensureAccount = (email) => {
    let user = sqlite.prepare("select id from users where email = ?").get(email);

    if (!user) {
      sqlite
        .prepare("insert into users (id, email) values (?, ?)")
        .run("usr_test", email);
      user = { id: "usr_test" };
    }

    let membership = sqlite
      .prepare("select * from workspace_members where user_id = ?")
      .get(user.id);

    if (!membership) {
      sqlite
        .prepare("insert into workspaces (id, owner_user_id) values (?, ?)")
        .run("wks_test", user.id);
      sqlite
        .prepare(
          `insert into workspace_members
           (id, workspace_id, user_id, role) values (?, ?, ?, ?)`
        )
        .run("wmb_test", "wks_test", user.id, "owner");
      membership = sqlite
        .prepare("select * from workspace_members where user_id = ?")
        .get(user.id);
    }

    return { membership, user };
  };
  const firstAccount = ensureAccount("owner@example.com");
  const secondAccount = ensureAccount("owner@example.com");
  assert.equal(firstAccount.user.id, secondAccount.user.id);
  assert.equal(firstAccount.membership.workspace_id, "wks_test");
  assert.equal(
    sqlite.prepare("select count(*) as count from users").get().count,
    1
  );
  assert.equal(
    sqlite.prepare("select count(*) as count from workspaces").get().count,
    1
  );
  assert.equal(
    sqlite.prepare("select count(*) as count from workspace_members").get()
      .count,
    1
  );
  assert.deepEqual(
    resolveWorkspaceAccess(
      firstAccount.user.id,
      [
        {
          role: firstAccount.membership.role,
          workspaceId: firstAccount.membership.workspace_id
        }
      ],
      ["owner", "admin", "editor", "viewer"]
    ),
    {
      role: "owner",
      userId: "usr_test",
      workspaceId: "wks_test"
    }
  );
  sqlite
    .prepare(
      `insert into sessions (id, user_id, token_hash, expires_at)
       values (?, ?, ?, ?)`
    )
    .run(
      "ses_test",
      "usr_test",
      tokenHash,
      new Date(Date.now() + 60_000).toISOString()
    );

  const activeSession = sqlite
    .prepare(
      `select id from sessions
       where token_hash = ? and revoked_at is null and expires_at > ?`
    )
    .get(hashSessionToken(token, secret), new Date().toISOString());
  assert.equal(activeSession.id, "ses_test");

  sqlite
    .prepare("update sessions set revoked_at = CURRENT_TIMESTAMP where id = ?")
    .run("ses_test");
  assert.equal(
    sqlite
      .prepare(
        `select id from sessions
         where token_hash = ? and revoked_at is null and expires_at > ?`
      )
      .get(hashSessionToken(token, secret), new Date().toISOString()),
    undefined
  );
  sqlite.close();

  const [
    envExample,
    coreSource,
    sessionSource,
    workspaceSource,
    loginSource,
    actionsSource,
    allSource
  ] = await Promise.all([
    readFile(".env.example", "utf8"),
    readFile("src/server/auth/core.ts", "utf8"),
    readFile("src/server/auth/session.ts", "utf8"),
    readFile("src/server/auth/workspace.ts", "utf8"),
    readFile("src/app/login/page.tsx", "utf8"),
    readFile("src/server/auth/actions.ts", "utf8"),
    Promise.all(
      [
        "src/server/auth/session.ts",
        "src/server/auth/actions.ts",
        "src/components/app-header.tsx"
      ].map((file) => readFile(file, "utf8"))
    ).then((sources) => sources.join("\n"))
  ]);

  assert.match(sessionSource, /cookies\(\)/);
  assert.match(coreSource, /httpOnly:\s*true/);
  assert.match(sessionSource, /revokedAt/);
  assert.match(workspaceSource, /redirect\(\"\/login\"\)/);
  assert.match(loginSource, /loginPrivateBetaAction/);
  assert.match(actionsSource, /assertDevLoginEmailAllowed/);
  assert.equal(allSource.includes("localStorage"), false);
  assert.equal(allSource.includes("password"), false);
  assert.match(envExample, /^AUTH_SESSION_SECRET=$/m);
  assert.match(envExample, /^PRIVATE_BETA_ALLOWED_EMAILS=$/m);
  assert.match(envExample, /^AUTH_DEV_LOGIN_ENABLED=false$/m);
  assert.match(envExample, /^PRIVATE_BETA_DEV_EMAIL=$/m);
  assert.equal(/AUTH_SESSION_SECRET=.+/m.test(envExample), false);
  assert.equal(/PRIVATE_BETA_ALLOWED_EMAILS=.+/m.test(envExample), false);

  console.log("Private beta authentication coverage passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
