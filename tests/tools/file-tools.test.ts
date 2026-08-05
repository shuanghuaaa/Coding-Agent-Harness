import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileTool, writeFileTool, deleteFileTool, setWorkspaceRoot } from '../../src/tools/file-tools';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('File tools', () => {
  let tmpDir: string;
  let originalRoot: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-test-'));
    originalRoot = process.cwd();
    setWorkspaceRoot(tmpDir);
  });

  afterEach(() => {
    setWorkspaceRoot(originalRoot);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('readFileTool reads a file', async () => {
    const filePath = path.join(tmpDir, 'test.txt');
    fs.writeFileSync(filePath, 'hello world');
    const result = await readFileTool.execute({ path: filePath });
    expect(result.content).toContain('hello world');
  });

  it('readFileTool returns error for non-existent file', async () => {
    const result = await readFileTool.execute({ path: path.join(tmpDir, 'nope.txt') });
    expect(result.error).toBeDefined();
    expect(result.error).toContain('Failed to read');
  });

  it('writeFileTool creates a file', async () => {
    const filePath = path.join(tmpDir, 'new.txt');
    await writeFileTool.execute({ path: filePath, content: 'new content' });
    const actual = fs.readFileSync(filePath, 'utf-8');
    expect(actual).toBe('new content');
  });

  it('writeFileTool creates nested directories', async () => {
    const filePath = path.join(tmpDir, 'a', 'b', 'nested.txt');
    await writeFileTool.execute({ path: filePath, content: 'nested' });
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('nested');
  });

  it('deleteFileTool deletes a file', async () => {
    const filePath = path.join(tmpDir, 'to-delete.txt');
    fs.writeFileSync(filePath, 'temp');
    await deleteFileTool.execute({ path: filePath });
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('deleteFileTool returns error for non-existent file', async () => {
    const result = await deleteFileTool.execute({ path: path.join(tmpDir, 'no.txt') });
    expect(result.error).toBeDefined();
    expect(result.error).toContain('Failed to delete');
  });

  it('blocks path traversal attempts', async () => {
    const result = await readFileTool.execute({ path: '../outside.txt' });
    expect(result.error).toContain('Path traversal');
  });
});