# Local development database

Fichr uses a local SQLite database for development. By default, Drizzle reads
and writes:

```sh
db/fichr.sqlite
```

This file is local-only and ignored by Git. It can contain test imports,
products, audits, exports, and local development workspace data.

## Migrations first

Use migrations for the local development database:

```sh
npm run db:migrate
```

`db:migrate` applies the SQL files in `db/migrations` and records them in
Drizzle's migration table.

Avoid using `npm run db:push` on `db/fichr.sqlite` during normal development.
`drizzle push` compares the current schema directly with the database and can
leave a local SQLite database in a drifted state when it has already been
created by tests, manual SQL, or previous push attempts. In that state, some
tables may exist while Drizzle does not know which migrations have run.

`db:push` remains available as a Drizzle tool, but the recommended workflow for
this project is:

1. Change `db/schema.ts`.
2. Run `npm run db:generate`.
3. Run `npm run db:migrate`.

## When to reset

Use a reset only when the local development database is disposable, for
example:

- `npm run db:migrate` fails because the local DB is already drifted.
- A route crashes locally because a table from migrations is missing.
- You want to clear local test imports, exports, images, and generated rows.

The reset deletes local data. Do not run it if you need to keep the contents of
`db/fichr.sqlite` or files under `storage/`.

## Reset command

```sh
npm run db:reset:dev
```

This command is intentionally named `reset:dev` because it is destructive and
only for local development. It does not run when the app starts.

It removes:

- `db/fichr.sqlite`
- `db/fichr.sqlite-wal`
- `db/fichr.sqlite-shm`
- everything inside `storage/imports` except `.gitkeep`
- everything inside `storage/exports` except `.gitkeep`
- everything inside `storage/images` except `.gitkeep`

Then it runs:

```sh
npm run db:migrate
```

The migration step recreates a fresh local SQLite database with the expected
tables:

- `users`
- `sessions`
- `workspaces`
- `workspace_members`
- `event_logs`
- `imports`
- `import_rows`
- `products`
- `product_audits`
- `audit_findings`
- `exports`

## Useful commands

```sh
npm run db:generate
npm run db:migrate
npm run db:reset:dev
npm run db:studio
```

`db:studio` opens Drizzle Studio against the configured local database.
