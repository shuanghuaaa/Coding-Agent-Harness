import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { guardrail } from '../../src/guard/guardrail';
import { readFileSync } from 'node:fs';

vi.mock('node:fs');

const mockReadFileSync = readFileSync as Mock;

describe('guardrail config', () => {
  beforeEach(() => {
    mockReadFileSync.mockReset();
    mockReadFileSync.mockReturnValue('{}');
  });

  it('blocks rm -rf (built-in rule)', () => {
    const result = guardrail('shell', { command: 'rm -rf /' });
    expect(result.blocked).toBe(true);
    if (result.blocked) {
      expect(result.reason).toContain('rm_rf');
    }
  });

  it('blocks chmod 777 (custom rule)', () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({
      patterns: [{
        name: 'chmod_777',
        toolName: 'shell',
        argKey: 'command',
        pattern: '\\bchmod\\s+777\\b',
        severity: 'high',
        description: 'chmod 777 - overly permissive file permissions',
      }],
      disabled: [],
    }));
    const result = guardrail('shell', { command: 'chmod 777 /var/www' });
    expect(result.blocked).toBe(true);
    if (result.blocked) {
      expect(result.reason).toContain('chmod_777');
    }
  });

  it('filters out disabled rules', () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({
      patterns: [],
      disabled: ['rm_rf'],
    }));
    const result = guardrail('shell', { command: 'rm -rf /' });
    expect(result.blocked).toBe(false);
  });

  it('allows safe commands', () => {
    const result = guardrail('shell', { command: 'npm test' });
    expect(result.blocked).toBe(false);
  });
});