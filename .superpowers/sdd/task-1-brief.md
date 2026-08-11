### Task 1: Workspace file read API

**Files:**
- Modify: `src/tools/file-tools.ts` — export `resolveWorkspacePath`
- Create: `src/workspace/read-file.ts`
- Modify: `src/server/http-server.ts` — add GET route near `/api/workspace/files`
- Test: `tests/workspace/read-file.test.ts`

**Interfaces:**
- Produces: `readWorkspaceFile(root: string, relativePath: string, maxBytes?: number): { path: string; content: string; size: number }`
- Throws / returns error codes used by HTTP: traversal → throw; missing → throw with message; too large / binary → throw with message containing `too large` or `binary`

- [ ] **Step 1: Write the failing test**

Create `tests/workspace/read-file.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readWorkspaceFile } from '../../src/workspace/read-file';

describe('readWorkspaceFile', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ws-read-'));
    writeFileSync(join(root, 'hello.txt'), 'hello world', 'utf-8');
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('reads a text file relative to root', () => {
    const r = readWorkspaceFile(root, 'hello.txt');
    expect(r.content).toBe('hello world');
    expect(r.path).toBe('hello.txt');
    expect(r.size).toBeGreaterThan(0);
  });

  it('blocks path traversal', () => {
    expect(() => readWorkspaceFile(root, '../secret')).toThrow(/traversal|blocked/i);
  });

  it('rejects missing files', () => {
    expect(() => readWorkspaceFile(root, 'nope.txt')).toThrow(/not found|ENOENT|Failed/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/workspace/read-file.test.ts`  
Expected: FAIL (module not found)

- [ ] **Step 3: Implement**

In `file-tools.ts`, export the existing resolver:

```ts
export function resolveWorkspacePath(inputPath: string, root: string = workspaceRoot): string {
  const resolved = path.resolve(root, inputPath);
  const relative = path.relative(path.resolve(root), resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Path traversal blocked: ${inputPath}`);
  }
  return resolved;
}
```

Refactor internal `resolvePath` to call `resolveWorkspacePath(inputPath)`.

Create `src/workspace/read-file.ts`:

```ts
import { readFileSync, statSync } from 'node:fs';
import { relative } from 'node:path';
import { resolveWorkspacePath } from '../tools/file-tools';

const DEFAULT_MAX = 1 * 1024 * 1024;

export function readWorkspaceFile(
  root: string,
  relativePath: string,
  maxBytes: number = DEFAULT_MAX,
): { path: string; content: string; size: number } {
  const abs = resolveWorkspacePath(relativePath, root);
  let st;
  try {
    st = statSync(abs);
  } catch {
    throw new Error(`File not found: ${relativePath}`);
  }
  if (!st.isFile()) throw new Error(`Not a file: ${relativePath}`);
  if (st.size > maxBytes) throw new Error(`File too large: ${relativePath}`);
  const buf = readFileSync(abs);
  if (buf.includes(0)) throw new Error(`binary file not supported: ${relativePath}`);
  const content = buf.toString('utf-8');
  const rel = relative(root, abs).replace(/\\/g, '/');
  return { path: rel, content, size: st.size };
}
```

In `http-server.ts` after files route:

```ts
this.app.get('/api/workspace/file', requireToken, (req, res) => {
  const p = typeof req.query.path === 'string' ? req.query.path : '';
  if (!p) {
    res.status(400).json({ error: 'missing path' });
    return;
  }
  try {
    res.json(readWorkspaceFile(this.workspaceRoot, p));
  } catch (err) {
    const msg = String(err);
    const status = /traversal|blocked/i.test(msg) ? 400
      : /not found/i.test(msg) ? 404
      : /too large|binary/i.test(msg) ? 415
      : 500;
    res.status(status).json({ error: msg });
  }
});
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npm test -- tests/workspace/read-file.test.ts`

- [ ] **Step 5: Commit**

```powershell
git add src/tools/file-tools.ts src/workspace/read-file.ts src/server/http-server.ts tests/workspace/read-file.test.ts
git commit -m "feat(workspace): add safe read-file API for WebUI"
```

---


