### Task 5: Wire AgentLoop history + progress.feedback

**Files:**
- Modify: `src/agent/loop.ts`
- Modify: `webui/src/types.ts` (mirror types for later UI; can be same task or Task 6)
- Test: extend `tests/integration/harness-demo.test.ts` or add `tests/agent/loop-feedback.test.ts`

**Interfaces:**
- Consumes: `detectRepeatedFailure`, `toFeedbackHistoryEntry`
- Produces:
  - `RunResult.feedbackHistory: FeedbackHistoryEntry[]`
  - `RoundProgress.feedback?: FeedbackHistoryEntry` (optional)
  - still sets `feedbackStatus`

- [ ] **Step 1: Write/adjust integration assertion**

In harness-demo after run, assert:

```ts
expect(result.feedbackHistory.some((h) => h.status === 'fail')).toBe(true);
expect(result.feedbackHistory.some((h) => h.status === 'pass')).toBe(true);
expect(result.feedbackHistory.find((h) => h.status === 'fail')?.failureTypes?.length).toBeGreaterThan(0);
```

Add a second demo test with two consecutive failing `run_test` mocks returning same FAIL line, then pass — assert `repeatedFailure` on second fail entry and a system message containing `WARNING`.

- [ ] **Step 2: Run — expect FAIL on new fields**

- [ ] **Step 3: Update loop.ts executeToolCall feedback block**

```ts
let feedback = this.config.validator.validate(result.content, round, result.error);
feedback = detectRepeatedFailure(feedback, this.feedbackHistory);
const entry = toFeedbackHistoryEntry(feedback);
this.feedbackHistory.push(entry);
this.config.injector.inject(this.messages, feedback);
feedbackStatus = feedback.status;
// pass entry into emitProgress as feedback: entry
```

Update `RoundProgress` and `RunResult` types accordingly. Ensure `emitProgress` includes `feedback: entry` when present.

- [ ] **Step 4: Run harness-demo + loop tests — expect PASS**

---
