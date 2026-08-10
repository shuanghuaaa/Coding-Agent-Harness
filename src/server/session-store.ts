import Database from 'better-sqlite3';
import type { RoundProgress } from '../agent/loop';
import type { Message } from '../agent/types';

export interface SessionData {
  progressEvents: RoundProgress[];
  feedbackHistory: Array<{ round: number; status: string }>;
  messages: Message[];
}

export interface NewSession {
  task: string;
  status: string;
  rounds: number;
  data: SessionData;
}

export interface SessionSummary {
  id: number;
  task: string;
  status: string;
  rounds: number;
  created_at: string;
}

export interface SessionRecord extends SessionSummary {
  data: SessionData;
}

interface SessionRow extends SessionSummary {
  data: string;
}

export class SessionStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task TEXT NOT NULL,
        status TEXT NOT NULL,
        rounds INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        data TEXT NOT NULL
      )
    `);
  }

  save(input: NewSession): number {
    const info = this.db
      .prepare('INSERT INTO sessions (task, status, rounds, data) VALUES (?, ?, ?, ?)')
      .run(input.task, input.status, input.rounds, JSON.stringify(input.data));
    return Number(info.lastInsertRowid);
  }

  list(): SessionSummary[] {
    return this.db
      .prepare('SELECT id, task, status, rounds, created_at FROM sessions ORDER BY created_at DESC, id DESC')
      .all() as SessionSummary[];
  }

  get(id: number): SessionRecord | undefined {
    const row = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as SessionRow | undefined;
    if (!row) return undefined;
    return {
      id: row.id,
      task: row.task,
      status: row.status,
      rounds: row.rounds,
      created_at: row.created_at,
      data: JSON.parse(row.data) as SessionData,
    };
  }

  delete(id: number): boolean {
    return this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id).changes > 0;
  }

  update(id: number, input: NewSession): boolean {
    const info = this.db
      .prepare('UPDATE sessions SET task = ?, status = ?, rounds = ?, data = ? WHERE id = ?')
      .run(input.task, input.status, input.rounds, JSON.stringify(input.data), id);
    return info.changes > 0;
  }

  /** Save new session, or update existing by id preserving its original task. */
  saveOrUpdate(sessionId: number | undefined, input: NewSession): number {
    if (sessionId !== undefined) {
      const existing = this.get(sessionId);
      if (existing) {
        const ok = this.update(sessionId, {
          task: existing.task,
          status: input.status,
          rounds: input.rounds,
          data: input.data,
        });
        if (ok) return sessionId;
      }
    }
    return this.save(input);
  }

  close(): void {
    this.db.close();
  }
}
