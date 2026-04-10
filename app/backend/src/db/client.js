import { DatabaseSync } from 'node:sqlite';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export async function createDatabase({ dbFilePath, migrationsDirPath }) {
  await mkdir(path.dirname(dbFilePath), { recursive: true });
  const db = new DatabaseSync(dbFilePath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');

  await runMigrations(db, migrationsDirPath);
  return db;
}

async function runMigrations(db, migrationsDirPath) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const files = (await readdir(migrationsDirPath))
    .filter((name) => name.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));

  const hasMigrationStmt = db.prepare('SELECT 1 FROM schema_migrations WHERE id = ? LIMIT 1');
  const insertMigrationStmt = db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)');

  for (const fileName of files) {
    const migrationId = fileName.replace(/\.sql$/i, '');
    const exists = hasMigrationStmt.get(migrationId);
    if (exists) continue;

    const sql = await readFile(path.join(migrationsDirPath, fileName), 'utf-8');
    db.exec('BEGIN');
    try {
      db.exec(sql);
      insertMigrationStmt.run(migrationId, new Date().toISOString());
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}

