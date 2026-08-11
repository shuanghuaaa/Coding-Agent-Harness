### Task 9: Frontend — App UX (file viewer, resume, multi-agent)

**Files:**
- Modify: `webui/src/App.tsx`
- Modify: `webui/src/styles.css` (viewer + role badges + orchestrator cards)

**Behavior checklist (must all work):**
1. Click file in tree → load content → show readonly viewer with close button
2. Select recent session → show history, composer **enabled**, send with `sessionId`; remove review-only lock
3. New session clears `activeSessionId`
4. Multi-agent page: remove MOCK_AGENTS metrics; show role cards from `orchestratorStatus`; input + maxRetries + start orchestrate; navigate/show progress with role labels
5. Activity feed remains real sessions

- [ ] **Step 1: Implement file viewer state** `selectedFile: { path, content } | null`

- [ ] **Step 2: Replace review lock with `activeSessionId` + hydrate chat from session via new hook method `seedChat(items)` or setChat export

Add to useWebSocket:

```ts
const seedChat = useCallback((items: ChatItem[]) => {
  setChat(items);
  idRef.current = items.length;
}, []);
```

- [ ] **Step 3: Multi-agent page real wiring**

- [ ] **Step 4: Build** `cd webui; npm run build` Expected: success

- [ ] **Step 5: Commit**

```powershell
git add webui/src/App.tsx webui/src/styles.css webui/src/hooks/useWebSocket.ts
git commit -m "feat(webui): file viewer, session resume, live multi-agent page"
```

---


