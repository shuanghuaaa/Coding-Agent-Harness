import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionStore, type SessionData } from '../../src/server/session-store';

const sampleData: SessionData = {
  progressEvents: [
    {
      round: 1,
      assistantContent: 'working',
      actions: [{ tool: 'write_file', result: 'File written: a.ts' }],
      feedbackStatus: 'fail',
    },
  ],
  feedbackHistory: [{ round: 1, status: 'fail' }],
  messages: [{ role: 'user', content: 'task' }],
};

describe('SessionStore', () => {
  let store: SessionStore;

  beforeEach(() => {
    store = new SessionStore(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  it('saves and retrieves a session with data intact', () => {
    const id = store.save({ task: 'write code', status: 'completed', rounds: 2, data: sampleData });
    expect(id).toBeGreaterThan(0);
    const record = store.get(id);
    expect(record).toBeDefined();
    expect(record!.task).toBe('write code');
    expect(record!.status).toBe('completed');
    expect(record!.rounds).toBe(2);
    expect(record!.data).toEqual(sampleData);
    expect(record!.created_at).toBeTruthy();
  });

  it('returns undefined for missing id', () => {
    expect(store.get(999)).toBeUndefined();
  });

  it('lists sessions newest first without data payload', () => {
    store.save({ task: 'older', status: 'completed', rounds: 1, data: sampleData });
    store.save({ task: 'newer', status: 'error', rounds: 3, data: sampleData });
    const list = store.list();
    expect(list).toHaveLength(2);
    expect(list[0].task).toBe('newer');
    expect(list[0]).not.toHaveProperty('data');
  });

  it('deletes a session and reports whether it existed', () => {
    const id = store.save({ task: 'gone', status: 'completed', rounds: 1, data: sampleData });
    expect(store.delete(id)).toBe(true);
    expect(store.get(id)).toBeUndefined();
    expect(store.delete(id)).toBe(false);
  });

  it('update rewrites status rounds and data for existing id', () => {
    const id = store.save({
      task: 't1',
      status: 'completed',
      rounds: 1,
      data: { progressEvents: [], feedbackHistory: [], messages: [] },
    });
    const ok = store.update(id, {
      task: 't1',
      status: 'completed',
      rounds: 3,
      data: {
        progressEvents: [],
        feedbackHistory: [],
        messages: [{ role: 'user', content: 'again' }],
      },
    });
    expect(ok).toBe(true);
    const row = store.get(id)!;
    expect(row.rounds).toBe(3);
    expect(row.data.messages[0].content).toBe('again');
    expect(store.update(99999, { task: 'x', status: 'error', rounds: 0, data: { progressEvents: [], feedbackHistory: [], messages: [] } })).toBe(false);
  });

  it('saveOrUpdate preserves original task when updating by id', () => {
    const id = store.save({ task: 'original task', status: 'running', rounds: 0, data: sampleData });
    const updatedId = store.saveOrUpdate(id, {
      task: 'follow-up message',
      status: 'completed',
      rounds: 2,
      data: {
        ...sampleData,
        messages: [
          { role: 'user', content: 'original task' },
          { role: 'user', content: 'follow-up message' },
        ],
      },
    });
    expect(updatedId).toBe(id);
    const row = store.get(id)!;
    expect(row.task).toBe('original task');
    expect(row.status).toBe('completed');
    expect(row.rounds).toBe(2);
  });

  it('saveOrUpdate creates new session when id is missing or unknown', () => {
    const id = store.saveOrUpdate(undefined, {
      task: 'new task',
      status: 'completed',
      rounds: 1,
      data: sampleData,
    });
    expect(id).toBeGreaterThan(0);
    expect(store.get(id)!.task).toBe('new task');

    const id2 = store.saveOrUpdate(99999, {
      task: 'fallback',
      status: 'error',
      rounds: 0,
      data: sampleData,
    });
    expect(id2).toBeGreaterThan(id);
    expect(store.get(id2)!.task).toBe('fallback');
  });
});
