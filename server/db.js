import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const dataDir = process.env.FFA_DATA_DIR
  ? path.resolve(process.env.FFA_DATA_DIR)
  : path.join(rootDir, 'data');

export const faceDir = path.join(dataDir, 'faces');

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  avatar_url   TEXT,
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tanks (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  invite_code TEXT NOT NULL UNIQUE,
  created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tank_members (
  tank_id      TEXT NOT NULL REFERENCES tanks(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'member',
  joined_at    INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  PRIMARY KEY (tank_id, user_id)
);

CREATE TABLE IF NOT EXISTS fish (
  id                   TEXT PRIMARY KEY,
  tank_id              TEXT NOT NULL REFERENCES tanks(id) ON DELETE CASCADE,
  owner_user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  face_asset_url       TEXT NOT NULL,
  body_variant         TEXT NOT NULL,
  fin_variant          TEXT NOT NULL,
  body_color           TEXT NOT NULL,
  scale                REAL NOT NULL,
  fullness             REAL NOT NULL,
  fullness_updated_at  INTEGER NOT NULL,
  status               TEXT NOT NULL,
  created_at           INTEGER NOT NULL
);

-- One fish per user per tank (spec §10 "Duplicate fish"); re-creating replaces.
CREATE UNIQUE INDEX IF NOT EXISTS fish_one_per_owner
  ON fish (tank_id, owner_user_id);

CREATE TABLE IF NOT EXISTS interactions (
  id             TEXT PRIMARY KEY,
  tank_id        TEXT NOT NULL REFERENCES tanks(id) ON DELETE CASCADE,
  actor_user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_fish_id TEXT NOT NULL,
  type           TEXT NOT NULL,
  result         TEXT NOT NULL,
  created_at     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS interactions_recent
  ON interactions (target_fish_id, actor_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS activity_events (
  id         TEXT PRIMARY KEY,
  tank_id    TEXT NOT NULL REFERENCES tanks(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  actor_id   TEXT,
  target_id  TEXT,
  payload    TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS activity_by_tank
  ON activity_events (tank_id, created_at DESC);

CREATE TABLE IF NOT EXISTS analytics_events (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  user_id    TEXT,
  props      TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
`;

export function openDatabase(file = path.join(dataDir, 'aquarium.db')) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.mkdirSync(faceDir, { recursive: true });
  const db = new Database(file);
  db.exec(SCHEMA);
  return db;
}
