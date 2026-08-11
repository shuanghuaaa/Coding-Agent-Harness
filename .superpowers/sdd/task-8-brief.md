### Task 8: Frontend — types, API, WebSocket hook

**Files:**
- Modify: `webui/src/types.ts`
- Modify: `webui/src/api/workspace.ts`
- Modify: `webui/src/hooks/useWebSocket.ts`

**Interfaces:**
- `getWorkspaceFile(path: string): Promise<{ path; content; size }>`
- `sendTask(task: string, opts?: { sessionId?: number })`
- `sendOrchestrate(task: string, opts?: { maxRetries?: number; sessionId?: number })`
- State: `orchestratorStatus`, `activeSessionId` can live in App; hook exposes status + clear
- Progress type includes `agentRole?: string`
- On progress, if agentRole present, include in chat item (extend ChatItem with `agentRole?: string`)

- [ ] **Step 1: Implement API + types**

- [ ] **Step 2: Update useWebSocket** for new message types and send signatures; seed chat when App passes history separately is OK

- [ ] **Step 3: `npm run build` in webui** — fix TS errors

- [ ] **Step 4: Commit**

```powershell
git add webui/src/types.ts webui/src/api/workspace.ts webui/src/hooks/useWebSocket.ts
git commit -m "feat(webui): APIs and WS for file read, resume, orchestrate"
```

---


