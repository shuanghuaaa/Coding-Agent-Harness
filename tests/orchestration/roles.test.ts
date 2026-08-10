import { describe, it, expect } from 'vitest';
import { filterToolsForRole, ROLE_DEFINITIONS } from '../../src/orchestration/roles';
import type { Tool } from '../../src/tools/base';

const fake = (name: string): Tool => ({
  name,
  description: name,
  parameters: { type: 'object', properties: {} },
  execute: async () => ({ tool_call_id: '', content: 'ok' }),
});

describe('role tool isolation', () => {
  const all = ['read_file', 'write_file', 'delete_file', 'shell', 'search', 'git_diff', 'run_test'].map(fake);

  it('reviewer cannot get write_file', () => {
    const tools = filterToolsForRole('reviewer', all);
    expect(tools.map((t) => t.name)).not.toContain('write_file');
    expect(tools.map((t) => t.name)).not.toContain('delete_file');
  });

  it('tester cannot get write_file', () => {
    expect(filterToolsForRole('tester', all).map((t) => t.name)).not.toContain('write_file');
  });

  it('coder includes write_file', () => {
    expect(filterToolsForRole('coder', all).map((t) => t.name)).toContain('write_file');
  });

  it('every role has a non-empty systemPrompt', () => {
    for (const r of Object.values(ROLE_DEFINITIONS)) {
      expect(r.systemPrompt.length).toBeGreaterThan(20);
    }
  });
});
