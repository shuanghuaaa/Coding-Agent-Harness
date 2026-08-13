# Task 1 Report: Extend Feedback types + history entry helper

## Status: DONE

## Summary

Extended feedback types with `RepeatedFailure`, optional `failureTypes`/`repeatedFailure` on `Feedback`, and new `FeedbackHistoryEntry` type. Implemented `summary.ts` with `failureFingerprint` and `toFeedbackHistoryEntry` helpers that strip `raw` from failures and derive failure types when not explicitly set.

## Files Changed

| Action | Path |
|--------|------|
| Modified | `src/feedback/types.ts` |
| Created | `src/feedback/summary.ts` |
| Created | `tests/feedback/summary.test.ts` |

## TDD Evidence

### RED — Step 1–2: Failing test written, module missing

**Command:**
```
npx vitest run tests/feedback/summary.test.ts
```

**Result:** Exit code 1

```
 FAIL  tests/feedback/summary.test.ts [ tests/feedback/summary.test.ts ]
Error: Failed to load url ../../src/feedback/summary (resolved id: ../../src/feedback/summary) in .../tests/feedback/summary.test.ts. Does the file exist?

 Test Files  1 failed (1)
      Tests  no tests
```

Failure reason matches expectation: module `src/feedback/summary` did not exist yet.

### GREEN — Step 3–4: Implementation added, tests pass

**Command:**
```
npx vitest run tests/feedback/summary.test.ts
```

**Result:** Exit code 0

```
 ✓ tests/feedback/summary.test.ts  (2 tests) 11ms

 Test Files  1 passed (1)
      Tests  2 passed (2)
```

### Final verification

**Command:**
```
npx vitest run tests/feedback/summary.test.ts
```

**Result:** Exit code 0 — 2/2 tests passed.

**Regression check:**
```
npx vitest run tests/feedback/
```

**Result:** Exit code 0 — 8 files, 43/43 tests passed.

## Implementation Details

### `src/feedback/types.ts`

- Added `RepeatedFailure { testName, streak, message }`
- Extended `Feedback` with optional `failureTypes?: FailureType[]` and `repeatedFailure?: RepeatedFailure`
- Exported `FeedbackHistoryEntry` with slim failure picks (no `raw`)

### `src/feedback/summary.ts`

- `failureFingerprint(f)` — prefers trimmed `testName` unless `(unknown test)`; falls back to `file:line`, then `file`, then `'unknown'`
- `toFeedbackHistoryEntry(feedback)` — copies round/status/summary/repeatedFailure; maps failures omitting `raw`; uses explicit `failureTypes` or derives from failure set

## Self-Review

| Check | Result |
|-------|--------|
| Matches brief verbatim | Yes — types and helpers match plan spec |
| TDD order respected | Yes — test first, RED confirmed, then implement, GREEN confirmed |
| No unrelated changes | Yes — only the three files listed |
| Linter clean | Yes — no diagnostics on changed files |
| Existing tests unaffected | Yes — all 43 feedback tests pass |
| Commits | Skipped per user preference |

## Concerns

None. Optional fields on `Feedback` are backward-compatible; `failureTypes` derivation in `toFeedbackHistoryEntry` will be superseded when validator sets them explicitly in a later task.

## Commits

None (skipped per user instruction).
