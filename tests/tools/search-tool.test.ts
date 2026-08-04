import { describe, it, expect } from 'vitest';
import { searchTool } from '../../src/tools/search-git-test-tools';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('searchTool', () => {
  it('finds matching lines in a directory', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'search-'));
    fs.writeFileSync(path.join(tmpDir, 'a.ts'), 'const x = 1;\nconst y = 2;\n');
    const result = await searchTool.execute({ pattern: 'const', path: tmpDir });
    expect(result.content).toContain('const x = 1');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});