import { describe, it, expect } from 'vitest';
import { gitDiffTool } from '../../src/tools/search-git-test-tools';

describe('gitDiffTool', () => {
  it('runs git diff in current directory', async () => {
    const result = await gitDiffTool.execute({});
    expect(result).toBeDefined();
  });
});