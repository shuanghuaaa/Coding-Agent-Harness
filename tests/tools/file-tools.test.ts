import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileTool, writeFileTool, deleteFileTool } from '../../src/tools/file-tools';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('File tools', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('readFileTool reads a file', async () => {
    const filePath = path.join(tmpDir, 'test.txt');
    fs.writeFileSync(filePath, 'hello world');
    const result = await readFileTool.execute({ path: filePath });
    expect(result.content).toContain('hello world');
  });

  it('writeFileTool creates a file', async () => {
    const filePath = path.join(tmpDir, 'new.txt');
    await writeFileTool.execute({ path: filePath, content: 'new content' });
    const actual = fs.readFileSync(filePath, 'utf-8');
    expect(actual).toBe('new content');
  });

  it('deleteFileTool deletes a file', async () => {
    const filePath = path.join(tmpDir, 'to-delete.txt');
    fs.writeFileSync(filePath, 'temp');
    await deleteFileTool.execute({ path: filePath });
    expect(fs.existsSync(filePath)).toBe(false);
  });
});