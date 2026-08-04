import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConfigLoader } from '../../src/config/loader';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('ConfigLoader', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads rules from .rules file', () => {
    const rulesPath = path.join(tmpDir, '.rules');
    fs.writeFileSync(rulesPath, 'Use TypeScript\nNo any types\nPrefer arrow functions\n');
    const loader = new ConfigLoader();
    const rules = loader.load(rulesPath);
    expect(rules).toHaveLength(3);
    expect(rules).toContain('Use TypeScript');
    expect(rules).toContain('No any types');
  });

  it('returns empty array for missing file', () => {
    const loader = new ConfigLoader();
    const rules = loader.load('/nonexistent/path/.rules');
    expect(rules).toEqual([]);
  });

  it('filters empty lines', () => {
    const rulesPath = path.join(tmpDir, '.rules');
    fs.writeFileSync(rulesPath, 'Rule 1\n\n\nRule 2\n  \n');
    const loader = new ConfigLoader();
    const rules = loader.load(rulesPath);
    expect(rules).toEqual(['Rule 1', 'Rule 2']);
  });
});