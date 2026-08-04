import { describe, it, expect } from 'vitest';
import { runTestTool } from '../../src/tools/search-git-test-tools';

describe('runTestTool', () => {
  it('runs a test command and returns output', async () => {
    const result = await runTestTool.execute({ command: 'echo "2 passed"' });
    expect(result.content).toContain('2 passed');
  });

  it('returns error for failed test command', async () => {
    const result = await runTestTool.execute({ command: 'exit 1' });
    expect(result.error).toBeDefined();
  });
});