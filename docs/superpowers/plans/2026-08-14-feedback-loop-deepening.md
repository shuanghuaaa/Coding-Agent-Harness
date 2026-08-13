# Feedback Loop Deepening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deepen the feedback loop (typed history, repeated-failure detection, richer inject text) and surface a plain-language fail→pass story in the session Agent card, including expandable test-file snippets.

**Architecture:** Keep the existing validate → classify → inject pipeline. Enrich `Feedback` / `feedbackHistory` / `RoundProgress` with structured fields (no full stdout). Add a pure `detectRepeatedFailure` helper. WebUI reads history for a trail + on-demand `getWorkspaceFile` for snippets. Extend mock harness-demo for the full story.

**Tech Stack:** TypeScript, Vitest, existing Express/WS harness, React WebUI (`TaskRoundList`).

## Global Constraints

- Mechanisms must be mock-LLM testable (no network / real LLM in new tests).
- Do not revive ControlDeck as main layout.
- Do not put full test-file contents into `feedbackHistory`; UI loads snippets on demand.
- Extend `RoundProgress` with optional fields only; keep `feedbackStatus` for backward compatibility.
- Prefer Chinese UI copy for trail / pills; inject messages may stay English for LLM clarity (match existing injector style) but must include `type` and repeated-failure WARNING.
- Commits: only when the user explicitly asks (repo preference); otherwise skip commit steps.

**Spec:** `docs/superpowers/specs/2026-08-14-feedback-loop-deepening-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `src/feedback/types.ts` | Extended `Feedback`, `FeedbackHistoryEntry`, `RepeatedFailure` |
| `src/feedback/repeated-failure.ts` | Pure `detectRepeatedFailure` |
| `src/feedback/injector.ts` | Include type + WARNING in fail messages |
| `src/feedback/validator.ts` | Prefer parseable stdout when error also present |
| `src/feedback/summary.ts` | `toFeedbackHistoryEntry` / progress summary helpers (optional thin module) |
| `src/agent/loop.ts` | Wire detect → history → progress.feedback |
| `src/server/session-store.ts` | Persist richer `feedbackHistory` shape (JSON already flexible) |
| `webui/src/types.ts` | Mirror progress/history fields |
| `webui/src/components/FeedbackTrail.tsx` | Plain-language trail + type pills + repeat banner |
| `webui/src/components/TestFileSnippet.tsx` | Load + highlight ±8 lines |
| `webui/src/components/TaskRoundList.tsx` | Mount trail, snippet, fix tool footer labels |
| `webui/src/App.tsx` | Pass `feedbackHistory` into round list / hydrate |
| `webui/src/styles.css` | Trail / snippet styles |
| `tests/feedback/repeated-failure.test.ts` | New |
| `tests/feedback/injector.test.ts` | Extend |
| `tests/feedback/validator.test.ts` | Extend stdout-priority |
| `tests/integration/harness-demo.test.ts` | Extend story |

---

### Task 1: Extend Feedback types + history entry helper

**Files:**
- Modify: `src/feedback/types.ts`
- Create: `src/feedback/summary.ts`
- Test: `tests/feedback/summary.test.ts`

**Interfaces:**
- Produces:
  - `RepeatedFailure { testName: string; streak: number; message: string }`
  - `Feedback` gains optional `failureTypes?: FailureType[]`, `repeatedFailure?: RepeatedFailure`
  - `FeedbackHistoryEntry` = `{ round, status, summary?, failureTypes?, failures?: Array<Pick<TestFailure,'testName'|'type'|'file'|'line'|'expected'|'received'>>, repeatedFailure? }`
  - `toFeedbackHistoryEntry(feedback: Feedback): FeedbackHistoryEntry` (omits `raw`)
  - `failureFingerprint(f: Pick<TestFailure,'testName'|'file'|'line'>): string`

- [ ] **Step 1: Write failing test**

```ts
// tests/feedback/summary.test.ts
import { describe, it, expect } from 'vitest';
import { toFeedbackHistoryEntry, failureFingerprint } from '../../src/feedback/summary';
import type { Feedback } from '../../src/feedback/types';

describe('feedback summary', () => {
  it('toFeedbackHistoryEntry drops raw and sets failureTypes', () => {
    const feedback: Feedback = {
      status: 'fail',
      round: 2,
      summary: '1 test failed',
      failureTypes: ['assertion'],
      failures: [{
        testName: 'add',
        expected: '3',
        received: '-1',
        file: 'src/math.test.ts',
        line: 10,
        type: 'assertion',
        raw: 'HUGE RAW',
      }],
    };
    const entry = toFeedbackHistoryEntry(feedback);
    expect(entry.failures?.[0]).not.toHaveProperty('raw');
    expect(entry.failureTypes).toEqual(['assertion']);
    expect(JSON.stringify(entry)).not.toContain('HUGE RAW');
  });

  it('failureFingerprint prefers testName', () => {
    expect(failureFingerprint({ testName: 'add', file: 'a.ts', line: 1 })).toBe('add');
    expect(failureFingerprint({ testName: '(unknown test)', file: 'a.ts', line: 3 })).toBe('a.ts:3');
  });
});
```

- [ ] **Step 2: Run test — expect FAIL (module missing)**

Run: `npx vitest run tests/feedback/summary.test.ts`
Expected: FAIL cannot find module

- [ ] **Step 3: Implement types + summary.ts**

Update `types.ts` with `RepeatedFailure`, optional fields on `Feedback`, export `FeedbackHistoryEntry`.

Implement `summary.ts`:

```ts
import type { Feedback, FeedbackHistoryEntry, TestFailure } from './types';

export function failureFingerprint(f: Pick<TestFailure, 'testName' | 'file' | 'line'>): string {
  const name = f.testName?.trim();
  if (name && name !== '(unknown test)') return name;
  if (f.file && f.file !== '(unknown)' && f.line > 0) return `${f.file}:${f.line}`;
  if (f.file && f.file !== '(unknown)') return f.file;
  return 'unknown';
}

export function toFeedbackHistoryEntry(feedback: Feedback): FeedbackHistoryEntry {
  return {
    round: feedback.round,
    status: feedback.status,
    summary: feedback.summary,
    failureTypes: feedback.failureTypes ?? [...new Set(feedback.failures.map((x) => x.type))],
    failures: feedback.failures.map(({ testName, type, file, line, expected, received }) => ({
      testName, type, file, line, expected, received,
    })),
    repeatedFailure: feedback.repeatedFailure,
  };
}
```

When building Feedback in validator later, set `failureTypes`; for now helper derives them.

- [ ] **Step 4: Run test — expect PASS**

Run: `npx vitest run tests/feedback/summary.test.ts`

- [ ] **Step 5: Commit** (skip unless user asked)

---

### Task 2: Repeated-failure detection (pure)

**Files:**
- Create: `src/feedback/repeated-failure.ts`
- Test: `tests/feedback/repeated-failure.test.ts`

**Interfaces:**
- Consumes: `Feedback`, `FeedbackHistoryEntry`, `failureFingerprint`
- Produces: `detectRepeatedFailure(current: Feedback, history: FeedbackHistoryEntry[]): Feedback` (returns new object with `repeatedFailure` set when streak ≥ 2)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { detectRepeatedFailure } from '../../src/feedback/repeated-failure';
import type { Feedback, FeedbackHistoryEntry } from '../../src/feedback/types';

const fail = (round: number, testName: string): Feedback => ({
  status: 'fail',
  round,
  summary: '1 test failed',
  failures: [{
    testName, expected: '3', received: '-1', file: 't.ts', line: 1, type: 'assertion', raw: '',
  }],
});

describe('detectRepeatedFailure', () => {
  it('marks streak when same test failed in previous history entry', () => {
    const history: FeedbackHistoryEntry[] = [
      { round: 1, status: 'fail', failures: [{ testName: 'add', type: 'assertion', file: 't.ts', line: 1, expected: '3', received: '-1' }] },
    ];
    const out = detectRepeatedFailure(fail(2, 'add'), history);
    expect(out.repeatedFailure?.streak).toBe(2);
    expect(out.repeatedFailure?.testName).toBe('add');
    expect(out.repeatedFailure?.message).toMatch(/2 times/i);
  });

  it('does not mark on first failure', () => {
    const out = detectRepeatedFailure(fail(1, 'add'), []);
    expect(out.repeatedFailure).toBeUndefined();
  });

  it('resets when intervening pass', () => {
    const history: FeedbackHistoryEntry[] = [
      { round: 1, status: 'fail', failures: [{ testName: 'add', type: 'assertion', file: 't.ts', line: 1, expected: '3', received: '-1' }] },
      { round: 2, status: 'pass', failures: [] },
    ];
    const out = detectRepeatedFailure(fail(3, 'add'), history);
    expect(out.repeatedFailure).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run tests/feedback/repeated-failure.test.ts`

- [ ] **Step 3: Implement**

```ts
// src/feedback/repeated-failure.ts
import type { Feedback, FeedbackHistoryEntry } from './types';
import { failureFingerprint } from './summary';

export function detectRepeatedFailure(
  current: Feedback,
  history: FeedbackHistoryEntry[],
): Feedback {
  if (current.status !== 'fail' || current.failures.length === 0) return current;
  const fp = failureFingerprint(current.failures[0]);
  let streak = 1;
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    if (h.status === 'pass') break;
    if (h.status !== 'fail' || !h.failures?.length) break;
    if (failureFingerprint(h.failures[0]) !== fp) break;
    streak += 1;
  }
  if (streak < 2) return current;
  const testName = current.failures[0].testName !== '(unknown test)'
    ? current.failures[0].testName
    : fp;
  return {
    ...current,
    repeatedFailure: {
      testName,
      streak,
      message: `"${testName}" failed ${streak} times in a row. Try a different fix.`,
    },
  };
}
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit** (skip unless user asked)

---

### Task 3: Injector includes type + WARNING

**Files:**
- Modify: `src/feedback/injector.ts`
- Modify: `tests/feedback/injector.test.ts`

**Interfaces:**
- Consumes: `Feedback.repeatedFailure`, `TestFailure.type`
- Produces: `buildMessage` string containing `[type]` and optional `WARNING:`

- [ ] **Step 1: Extend failing assertions in injector.test.ts**

Add to existing fail test:

```ts
expect(message).toContain('[assertion]');
```

Add new test:

```ts
it('includes WARNING when repeatedFailure is set', () => {
  const feedback: Feedback = {
    status: 'fail',
    round: 3,
    summary: '1 test failed',
    failures: [{
      testName: 'add', expected: '3', received: '-1', file: 't.ts', line: 1, type: 'assertion', raw: '',
    }],
    repeatedFailure: {
      testName: 'add',
      streak: 3,
      message: '"add" failed 3 times in a row. Try a different fix.',
    },
  };
  const message = injector.buildMessage(feedback);
  expect(message).toContain('WARNING:');
  expect(message).toContain('3 times');
});
```

- [ ] **Step 2: Run — expect FAIL on missing type/WARNING**

Run: `npx vitest run tests/feedback/injector.test.ts`

- [ ] **Step 3: Update buildMessage**

```ts
...feedback.failures.map(
  (f) =>
    `  - ${f.testName}: expected ${f.expected}, got ${f.received} [${f.type}] [${f.file}:${f.line}]`
),
...(feedback.repeatedFailure
  ? ['', `WARNING: ${feedback.repeatedFailure.message}`]
  : []),
'',
'Please analyze the failures and fix the code. Run the tests again after making changes.',
```

- [ ] **Step 4: Run — expect PASS**

---

### Task 4: Validator stdout priority + failureTypes

**Files:**
- Modify: `src/feedback/validator.ts`
- Modify: `tests/feedback/validator.test.ts`

**Interfaces:**
- Produces: `Feedback` with `failureTypes` always set; when `error` present but `testOutput` parses failures, use parsed failures (status fail)

- [ ] **Step 1: Add test**

```ts
it('prefers parseable stdout over generic stderr error', () => {
  const output = 'FAIL: add(1, 2) expected 3, got -1 at src/math.ts:3:12';
  const result = validator.validate(output, 1, 'Command failed with exit code 1');
  expect(result.status).toBe('fail');
  expect(result.failures[0].testName).toBe('add(1, 2)');
  expect(result.failureTypes).toContain('assertion');
});
```

- [ ] **Step 2: Run — expect FAIL (current code uses error-only path)**

- [ ] **Step 3: Implement**

Reorder `validate`: if `testOutput` has FAIL/fail content, parse chain first; only if no failures from stdout, fall back to classifying `error`. Always set:

```ts
failureTypes: [...new Set(failures.map((f) => f.type))]
```

on both pass (empty) and fail.

- [ ] **Step 4: Run — expect PASS**

---

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

### Task 6: WebUI FeedbackTrail (plain language) + wire into TaskRoundList

**Files:**
- Modify: `webui/src/components/FeedbackTrail.tsx`
- Modify: `webui/src/components/TaskRoundList.tsx`
- Modify: `webui/src/App.tsx` (pass `feedbackHistory` from session result / live aggregation)
- Modify: `webui/src/styles.css`
- Modify: `webui/src/types.ts`

**Interfaces:**
- Consumes: `FeedbackHistoryEntry[]`
- Produces: UI trail `第 N 轮 ✕ 断言失败 → 第 M 轮 ✓ 通过` + repeat banner

Type labels map:

```ts
const TYPE_LABEL: Record<string, string> = {
  assertion: '断言失败',
  compile: '编译错误',
  timeout: '超时',
  runtime: '运行时错误',
};
```

- [ ] **Step 1: Rewrite FeedbackTrail props**

```tsx
export function FeedbackTrail({
  history,
}: {
  history: Array<{
    round: number;
    status: string;
    failureTypes?: string[];
    repeatedFailure?: { testName: string; streak: number; message: string };
  }>;
}) { ... }
```

Render Chinese nodes; show last `repeatedFailure` banner if any entry has it.

- [ ] **Step 2: App / TaskRoundList**

- Aggregate live feedback from progress events into state already available via chat items; also pass `result.feedbackHistory` when task completes.
- Add prop `feedbackHistory` to `TaskRoundList` or derive from rounds' details.
- Mount `<FeedbackTrail />` under Agent header / above expand hint.
- Fix tool footer:

```tsx
{item.feedbackStatus ? (
  <div className={`tool-call-result ${item.feedbackStatus === 'fail' ? 'error' : 'success'}`}>
    {item.feedbackStatus === 'fail' ? '测试未通过' : '测试通过'}
  </div>
) : (
  <div className="tool-call-result success">执行完成</div>
)}
```

Only show feedback wording when `feedbackStatus` is defined (already the case if gated).

- [ ] **Step 3: CSS** for `.trail`, `.trail-node.fail/.pass`, pills, banner — match CaseAI mono tokens.

- [ ] **Step 4: `cd webui && npm run build`** — expect success

---

### Task 7: Test file snippet viewer

**Files:**
- Create: `webui/src/components/TestFileSnippet.tsx`
- Modify: `webui/src/components/TaskRoundList.tsx` (or trail detail under fail steps)
- Modify: `webui/src/styles.css`
- Reuse: `webui/src/api/workspace.ts` `getWorkspaceFile`

**Interfaces:**
- Props: `{ file: string; line: number; context?: number }` default context 8
- On expand: fetch file; slice lines `[line-1-context, line+context]`; highlight `line`

- [ ] **Step 1: Implement TestFileSnippet**

```tsx
// Pseudocode structure
export function TestFileSnippet({ file, line, context = 8 }: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<{ n: number; text: string }[]>([]);
  // when open flips true → getWorkspaceFile(file) → split → slice
  // invalid file '(unknown)' → don't render button
}
```

- [ ] **Step 2: Mount for each failure with valid file** on the feedback detail area of a round that has fail feedback (use data from `feedback` on progress / history failures).

Hydrate: ensure `ChatItem` or round details can carry `feedback` summary from progress (`useWebSocket` already maps progress — extend to copy `feedback` onto the chat item).

- [ ] **Step 3: Build webui**

Run: `cd webui && npm run build`

---

### Task 8: End-to-end verification

- [ ] **Step 1: Run backend tests**

Run: `npx vitest run tests/feedback tests/integration/harness-demo.test.ts`
Expected: all PASS

- [ ] **Step 2: Manual checklist**
  - Start harness + webui
  - Run a task that fails then passes tests
  - Confirm trail text readable
  - Expand test snippet when path valid
  - Confirm non-test tools say「执行完成」not「测试未通过」

- [ ] **Step 3: Tick spec §8 acceptance boxes in the design doc** (optional note in AGENT_LOG if exists)

---

## Spec coverage check

| Spec section | Task |
|--------------|------|
| 3.1 Rich history | 1, 5 |
| 3.2 Repeated failure | 2, 5 |
| 3.3 Injector | 3 |
| 3.4 Loop/progress | 5 |
| 3.5 Validator stdout | 4 |
| 4.1 Trail UI | 6 |
| 4.2 Tool footer | 6 |
| 4.3 Test snippet | 7 |
| 5 harness-demo | 5, 8 |

## Placeholder scan

No TBD / "implement later" left in steps.

---

**Plan complete and saved to `docs/superpowers/plans/2026-08-14-feedback-loop-deepening.md`.**

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — execute tasks in this session with checkpoints  

Which approach?
