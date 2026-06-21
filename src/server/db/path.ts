import path from "node:path";

const DEFAULT_DATABASE_URL = "file:./db/fichr.sqlite";

export function getDatabasePath(databaseUrl = process.env.DATABASE_URL): string {
  const configuredUrl = databaseUrl ?? DEFAULT_DATABASE_URL;
  const rawPath = configuredUrl.startsWith("file:")
    ? configuredUrl.slice("file:".length)
    : configuredUrl;

  return path.isAbsolute(rawPath)
    ? rawPath
    : path.resolve(/*turbopackIgnore: true*/ process.cwd(), rawPath);
}
