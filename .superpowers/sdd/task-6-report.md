# Task 6 Report: Orchestrator state machine

## Done
- `src/orchestration/orchestrator.ts` — Coder→Reviewer→Tester pipeline with gate retries, cancel, status callbacks
- `tests/orchestration/orchestrator.test.ts` — MockLLM flows (happy path, review block+retry, test fail exhaustion)

## Tests
```
npm test -- tests/orchestration/orchestrator.test.ts  → 3/3 pass
```

## Notes
- `getChangedFiles` dep optional (defaults `[]`); `parseStageOutput` + `decideGate` drive retries
- Retry injects user message with gate reason; `retries` counts attempts, `failed` when `retryCount >= maxRetries`
