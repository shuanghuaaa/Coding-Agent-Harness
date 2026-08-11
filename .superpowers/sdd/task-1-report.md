# Task 1 Report: Workspace file read API

## Status

**DONE**

## Commit

- `ce0bd01` — `feat(workspace): add safe read-file API for WebUI`
- Files committed (task-1 only):
  - `src/tools/file-tools.ts`
  - `src/workspace/read-file.ts`
  - `src/server/http-server.ts` (task-1 route + minimal supporting changes)
  - `tests/workspace/read-file.test.ts`

Other uncommitted work (checkpoint, file-tree, WebUI, etc.) was left unstaged. Working-tree `http-server.ts` was restored to include parallel WIP after commit.

## TDD Evidence

### RED — failing test (module not found)

```
> npm test -- tests/workspace/read-file.test.ts

 FAIL  tests/workspace/read-file.test.ts
Error: Failed to load url ../../src/workspace/read-file ... Does the file exist?

 Test Files  1 failed (1)
      Tests  no tests
```

### GREEN — all tests pass

```
> npm test -- tests/workspace/read-file.test.ts

 ✓ tests/workspace/read-file.test.ts  (3 tests) 30ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
```

## Implementation Summary

| Item | Detail |
|------|--------|
| `resolveWorkspacePath` | Exported from `file-tools.ts`; internal `resolvePath` delegates to it |
| `readWorkspaceFile` | Resolves path safely, stats file, enforces 1 MiB max, rejects binary (NUL byte), returns `{ path, content, size }` |
| `GET /api/workspace/file` | Query param `path`; maps errors to 400/404/415/500 |

## Self-Review

### Matches brief

- Test file matches brief verbatim (3 cases: read, traversal, missing).
- `readWorkspaceFile` signature and logic match brief.
- HTTP route and error status mapping match brief.
- `resolveWorkspacePath` exported with correct traversal guard.

### Supporting http-server changes (in commit)

The committed `http-server.ts` diff also includes:

- `workspaceRoot` constructor parameter (required by route handler)
- `requireToken` hoisted outside `sessionStore` block (so workspace route works without session store)

These are minimal prerequisites not listed explicitly in the brief but necessary for the route to function.

### Not covered by tests (implementation only)

- File too large → throws `File too large`
- Binary file (NUL byte) → throws `binary file not supported`
- HTTP route integration (no supertest coverage in this task)

### Concerns

1. **Working tree vs commit:** Restored `http-server.ts` includes checkpoint/file-tree routes from other tasks; differs from committed version until those tasks merge.
2. **No route tests:** HTTP layer untested; relies on unit tests for `readWorkspaceFile`.
3. **Binary/large edge cases:** Implemented per brief but not exercised by tests.

## Verification

```
npm test -- tests/workspace/read-file.test.ts  → 3/3 passed (post-restore)
```

---

## Review Fix (2026-08-10)

### Status

**DONE**

### Commit

- `6fda8ae` — `fix(workspace): map directory reads to 400 and test size/binary gates`
- Files committed:
  - `src/server/http-server.ts` — added `/not a file/i` to 400 status regex
  - `tests/workspace/read-file.test.ts` — added too-large and binary rejection tests; removed unused `mkdirSync` import

### Changes

1. **Directory reads → HTTP 400:** `GET /api/workspace/file` now maps `Not a file:` errors to 400 (same branch as traversal/blocked).
2. **New unit tests:**
   - `rejects files larger than maxBytes` — temp file > 1 MiB
   - `rejects binary files` — temp file with NUL byte

### Verification

```
> $env:Path = 'D:\software\node;' + $env:Path; npm test -- tests/workspace/read-file.test.ts

 ✓ tests/workspace/read-file.test.ts  (5 tests) 53ms

 Test Files  1 passed (1)
      Tests  5 passed (5)
```
