# Project hygiene

Fichr stores development data locally. A normal project folder can therefore
contain credentials, a real SQLite database, imported files, generated exports,
and uploaded images.

These working files are client-owned data. See
`docs/client-owned-storage.md` for the ownership model and provider boundary.

## Never share

Do not share or archive:

- `.env.local` or any real `.env.*` file;
- `node_modules`;
- `.next`, `dist`, `build`, or `coverage`;
- `db/fichr.sqlite` or any other SQLite database, WAL, or SHM file;
- real files under `storage`;
- generated local artifacts.

`.env.example` is intentionally shareable because it contains names and safe
defaults only. Real API keys belong in `.env.local` or deployment secrets.

## Clean archive

Create a shareable source archive with:

```sh
npm run archive:clean
```

The command creates:

```text
artifacts/fichr-clean.zip
```

The archive is built from an explicit filtered file list. It excludes
environment files except `.env.example`, generated dependencies/build output,
SQLite files, local storage, Git metadata, macOS metadata, and previous
artifacts. It does not read or print `.env.local`.

The `storage_objects` manifest lives in the excluded local SQLite database.
Real storage keys and file metadata are therefore not included in the archive.

## Private local backup

`npm run backup:local` has the opposite purpose: it creates a private backup
containing the SQLite snapshot and local storage. It must never be shared.
It still excludes `.env.local`, dependencies, build output, and source secrets.

Use `backup:local --encrypt` for any backup that leaves the local development
machine. The passphrase is never stored or recoverable. Avoid leaving it in
shell history and unset `BACKUP_PASSPHRASE` after use.

See `docs/local-backup-and-restore.md`.

Always run `npm run backup:verify -- --file ...` before relying on a private
backup. Encrypted backups require the same temporary passphrase. Verification
reads the archive only; it does not restore it.

Before any manual restoration attempt, run
`npm run backup:restore-preflight -- --file ...`. The preflight extracts only
into a controlled temporary directory, compares the backup with the active
installation in read-only mode, and cleans its temporary files. It never
restores or overwrites active data.

## Sharing with Codex or another AI tool

Share the clean archive or only the source files required for the task. Never
paste real API keys, session secrets, customer databases, imports, exports, or
uploaded media.

If a secret was shared accidentally, revoke or regenerate it immediately and
replace the local value. Removing it from a later message or archive does not
make the original secret safe again.

## Verification

```sh
npm run test:project-hygiene
npm run test:backup-restore-preflight
```
