import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const dataDir = process.env.FFA_DATA_DIR
  ? path.resolve(process.env.FFA_DATA_DIR)
  : path.join(rootDir, 'data');

/**
 * better-sqlite3 behind the async interface `server/store.js` expects.
 *
 * The schema comes from the files in `migrations/`, applied on boot. They are
 * plain SQL and idempotent, so starting the server is all a deploy has to do.
 */
export function openSqlite(file = path.join(dataDir, 'aquarium.db')) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);

  // WAL keeps reads from blocking on the writer; foreign keys are off by
  // default in SQLite and the schema relies on ON DELETE CASCADE.
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(migrationSql());

  return {
    async get(sql, params = []) {
      return db.prepare(sql).get(...params) ?? null;
    },
    async all(sql, params = []) {
      return db.prepare(sql).all(...params);
    },
    async run(sql, params = []) {
      const info = db.prepare(sql).run(...params);
      return { changes: info.changes };
    },
    close: () => db.close(),
    raw: db,
  };
}

let cachedSql = null;

export function migrationSql() {
  if (cachedSql) return cachedSql;
  const dir = path.join(rootDir, 'migrations');
  cachedSql = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => fs.readFileSync(path.join(dir, name), 'utf8'))
    .join('\n');
  return cachedSql;
}
