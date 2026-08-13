# Task 2 Report: Repeated-failure detection (pure)

## Status: DONE

## Summary

Implemented pure `detectRepeatedFailure(current, history)` in `src/feedback/repeated-failure.ts`. The function walks history backwards from the most recent entry, counts consecutive failures with the same fingerprint (via Task 1's `failureFingerprint`), stops on pass or fingerprint mismatch, and sets `repeatedFailure` when streak ≥ 2.

## Files Changed

| Action | Path |
|--------|------|
| Created | `src/feedback/repeated-failure.ts` |
| Created | `tests/feedback/repeated-failure.test.ts` |

## TDD Evidence

### RED — Step 1–2: Failing test written, module missing

**Command:**
```
npx vitest run tests/feedback/repeated-failure.test.ts
```

**Result:** Exit code 1

```
 FAIL  tests/feedback/repeated-failure.test.ts [ tests/feedback/repeated-failure.test.ts ]
Error: Failed to load url ../../src/feedback/repeated-failure (resolved id: ../../src/feedback/repeated-failure) in .../tests/feedback/repeated-failure.test.ts. Does the file exist?

 Test Files  1 failed (1)
      Tests  no tests
```

Failure reason matches expectation: module `src/feedback/repeated-failure` did not exist yet.

### GREEN — Step 3–4: Implementation added, tests pass

**Command:**
```
npx vitest run tests/feedback/repeated-failure.test.ts
```

**Result:** Exit code 0

```
 ✓ tests/feedback/repeated-failure.test.ts  (3 tests) 8ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
```

### Final verification

**Command:**
```
npx vitest run tests/feedback/
```

**Result:** Exit code 0 — all feedback tests passed (including 3 new repeated-failure tests).

## Implementation Details

### `src/feedback/repeated-failure.ts`

- Early return when `current.status !== 'fail'` or no failures
- Fingerprint primary failure via `failureFingerprint` from `./summary`
- Walk history backwards; break on `pass`, non-fail, missing failures, or fingerprint mismatch
- When streak ≥ 2, return new object with `repeatedFailure: { testName, streak, message }`
- `testName` uses failure's testName unless `(unknown test)`, then falls back to fingerprint

### Test coverage

1. **Streak on repeat** — same test failed in prior history → streak 2, message matches `/2 times/i`
2. **First failure** — empty history → no `repeatedFailure`
3. **Intervening pass** — pass between failures resets streak → no `repeatedFailure`

## Self-Review

| Check | Result |
|-------|--------|
| Matches brief verbatim | Yes — test and implementation copied from brief |
| Depends on Task 1 helpers | Yes — uses `failureFingerprint`, does not reimplement |
| TDD order respected | Yes — test first, RED confirmed, then implement, GREEN confirmed |
| No unrelated changes | Yes — only the two files listed |
| Existing tests unaffected | Yes — full feedback suite green |
| Commits | Skipped per user instruction |

## Concerns

None. Pure function with no side effects; ready for Task 5 integration in `AgentLoop`.

## Commits

None (skipped per user instruction).
