# Task 3 Report: Injector includes type + WARNING

## Status: DONE

## Summary

Updated `FeedbackInjector.buildMessage` to include failure `[type]` in each failure line and an optional `WARNING:` block when `feedback.repeatedFailure` is set. Extended injector tests accordingly.

## Files Changed

| Action | Path |
|--------|------|
| Modified | `src/feedback/injector.ts` |
| Modified | `tests/feedback/injector.test.ts` |

## TDD Evidence

### Step 1–2: Tests extended (type + WARNING)

Added `expect(message).toContain('[assertion]')` to the existing failure test and a new test for `repeatedFailure` WARNING output.

### Step 3: Implementation

- Failure lines now: `` `  - ${f.testName}: expected ${f.expected}, got ${f.received} [${f.type}] [${f.file}:${f.line}]` ``
- When `feedback.repeatedFailure` is set, inserts blank line + `` `WARNING: ${feedback.repeatedFailure.message}` `` before the closing instruction

### Step 4: GREEN

**Command:**
```
npx vitest run tests/feedback/injector.test.ts
```

**Result:** Exit code 0

```
 ✓ tests/feedback/injector.test.ts  (4 tests) 14ms

 Test Files  1 passed (1)
      Tests  4 passed (4)
```

## Self-Review

| Check | Result |
|-------|--------|
| Matches brief verbatim | Yes |
| Only injector + tests touched | Yes |
| Consumes `TestFailure.type` and `Feedback.repeatedFailure` | Yes |
| No git commit | Yes — skipped per instruction |

## Concerns

None.

## Commits

None (skipped per user instruction).
