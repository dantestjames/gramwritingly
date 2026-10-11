import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type DB = DatabaseSync;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free',
  settings TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Untitled',
  content TEXT NOT NULL DEFAULT '',
  document_type TEXT NOT NULL DEFAULT 'general',
  language TEXT NOT NULL DEFAULT 'en-AU',
  story_canvas TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS documents_user ON documents(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS dictionary (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word TEXT NOT NULL COLLATE NOCASE,
  PRIMARY KEY (user_id, word)
);

CREATE TABLE IF NOT EXISTS style_guides (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  guide TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS snippets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shortcut TEXT NOT NULL,
  body TEXT NOT NULL,
  UNIQUE (user_id, shortcut)
);

CREATE TABLE IF NOT EXISTS usage (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  period TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, kind, period)
);

CREATE TABLE IF NOT EXISTS plagiarism_scans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  result TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

export function openDb(path: string): DB {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  return db;
}
