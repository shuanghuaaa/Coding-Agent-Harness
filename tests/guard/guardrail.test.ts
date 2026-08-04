import { describe, it, expect } from 'vitest';
import { guardrail } from '../../src/guard/guardrail';

describe('guardrail', () => {
  it('blocks rm -rf', () => {
    const result = guardrail('shell', { command: 'rm -rf /' });
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('rm_rf');
  });

  it('blocks git push --force', () => {
    const result = guardrail('shell', { command: 'git push --force origin main' });
    expect(result.blocked).toBe(true);
  });

  it('blocks DROP TABLE', () => {
    const result = guardrail('shell', { command: 'echo "DROP TABLE users;" | sqlite3 db.sqlite' });
    expect(result.blocked).toBe(true);
  });

  it('allows safe commands', () => {
    const result = guardrail('shell', { command: 'npm test' });
    expect(result.blocked).toBe(false);
  });

  it('allows safe file operations', () => {
    const result = guardrail('write_file', { path: 'src/test.ts', content: 'const x = 1;' });
    expect(result.blocked).toBe(false);
  });

  it('allows safe read operations', () => {
    const result = guardrail('read_file', { path: 'src/test.ts' });
    expect(result.blocked).toBe(false);
  });
});