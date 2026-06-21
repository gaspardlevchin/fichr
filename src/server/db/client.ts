import { mkdirSync } from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import * as schema from "../../../db/schema";
import { getDatabasePath } from "./path";

const databasePath = getDatabasePath();

mkdirSync(path.dirname(databasePath), { recursive: true });

const sqlite = new Database(databasePath);

sqlite.pragma("foreign_keys = ON");
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite, { schema });
export { schema };
