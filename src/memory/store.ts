import Database from 'better-sqlite3';
import type { MemoryEntry } from './types';

export class MemoryStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT NOT NULL UNIQUE,
        value TEXT NOT NULL,
        category TEXT NOT NULL CHECK (category IN ('convention', 'decision', 'preference')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  set(key: string, value: string, category: 'convention' | 'decision' | 'preference'): void {
    this.db.prepare(`
      INSERT INTO memories (key, value, category, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, category = excluded.category, updated_at = CURRENT_TIMESTAMP
    `).run(key, value, category);
  }

  get(key: string): MemoryEntry | undefined {
    return this.db.prepare('SELECT * FROM memories WHERE key = ?').get(key) as MemoryEntry | undefined;
  }

  list(): MemoryEntry[] {
    return this.db.prepare('SELECT * FROM memories ORDER BY updated_at DESC').all() as MemoryEntry[];
  }

  delete(key: string): void {
    this.db.prepare('DELETE FROM memories WHERE key = ?').run(key);
  }

  close(): void {
    this.db.close();
  }
}