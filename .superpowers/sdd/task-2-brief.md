### Task 2: SessionStore.update

**Files:**
- Modify: `src/server/session-store.ts`
- Modify: `tests/server/session-store.test.ts`

**Interfaces:**
- Produces: `update(id: number, input: NewSession): boolean` — returns false if id missing; does not change `created_at`

- [ ] **Step 1: Write failing test** (append to existing session-store tests)

```ts
it('update rewrites status rounds and data for existing id', () => {
  const id = store.save({
    task: 't1',
    status: 'completed',
    rounds: 1,
    data: { progressEvents: [], feedbackHistory: [], messages: [] },
  });
  const ok = store.update(id, {
    task: 't1',
    status: 'completed',
    rounds: 3,
    data: {
      progressEvents: [],
      feedbackHistory: [],
      messages: [{ role: 'user', content: 'again' }],
    },
  });
  expect(ok).toBe(true);
  const row = store.get(id)!;
  expect(row.rounds).toBe(3);
  expect(row.data.messages[0].content).toBe('again');
  expect(store.update(99999, { task: 'x', status: 'error', rounds: 0, data: { progressEvents: [], feedbackHistory: [], messages: [] } })).toBe(false);
});
```

- [ ] **Step 2: Run test — expect FAIL** (update not defined)

Run: `npm test -- tests/server/session-store.test.ts`

- [ ] **Step 3: Implement**

```ts
update(id: number, input: NewSession): boolean {
  const info = this.db
    .prepare('UPDATE sessions SET task = ?, status = ?, rounds = ?, data = ? WHERE id = ?')
    .run(input.task, input.status, input.rounds, JSON.stringify(input.data), id);
  return info.changes > 0;
}
```

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```powershell
git add src/server/session-store.ts tests/server/session-store.test.ts
git commit -m "feat(sessions): support update for resume writes"
```

---


