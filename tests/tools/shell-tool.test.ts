import { describe, it, expect } from 'vitest';
import { shellTool } from '../../src/tools/shell-tool';

describe('shellTool', () => {
  it('executes a command and returns output', async () => {
    const result = await shellTool.execute({ command: 'echo hello' });
    expect(result.content).toContain('hello');
  });

  it('returns error for failed command', async () => {
    const result = await shellTool.execute({ command: 'nonexistent_command_xyz' });
    expect(result.error).toBeDefined();
  });
});