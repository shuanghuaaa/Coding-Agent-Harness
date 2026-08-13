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
