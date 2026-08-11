### Task 7: Wire HTTP/WS server

**Files:**
- Modify: `src/server/types.ts`
- Modify: `src/server/http-server.ts`
- Modify: `src/index.ts` only if tool list must be passed into server for orchestrator
- Test: extend or add `tests/server/orchestrate-ws.test.ts` (optional if heavy — prefer unit orchestrator already covered; add one integration with MockLLM + WS if time)

**Interfaces:**
- `WSMessage.type` includes `'orchestrate' | 'orchestrator_status'`
- `task` payload: `{ task: string; sessionId?: number }`
- `orchestrate` payload: `{ task: string; maxRetries?: number; sessionId?: number }`
- `saveSession` → if sessionId provided and `update` succeeds, use it; else `save`
- If `runningLoops.has(ws)` already when new task/orchestrate: send status error `busy` and return
- Default maxRetries: `Number(process.env.ORCHESTRATOR_MAX_RETRIES ?? 2)`

Implementation notes:
- Refactor `handleMessage` task branch to read `sessionId`, load prior messages from store
- Build orchestrator with `createLoop(role)` cloning `this.loop.config` but replacing `contextBuilder` system prompt from role + `dispatcher: new ToolDispatcher(filterToolsForRole(role, allTools))`
- Server needs access to full `Tool[]` — add constructor arg `tools: Tool[]` or read from `this.loop.config.dispatcher` by adding `ToolDispatcher.listTools(): Tool[]`

Add to dispatcher:

```ts
listTools(): Tool[] {
  return Array.from(this.tools.values());
}
```

- [ ] **Step 1: Add dispatcher.listTools + failing test in dispatcher.test.ts**

- [ ] **Step 2: Implement listTools**

- [ ] **Step 3: Wire http-server task resume + orchestrate + status broadcasts**

- [ ] **Step 4: Run** `npm test -- tests/tools/dispatcher.test.ts tests/orchestration/orchestrator.test.ts tests/agent/loop-resume.test.ts`

- [ ] **Step 5: Commit**

```powershell
git add src/tools/dispatcher.ts src/server/types.ts src/server/http-server.ts tests/tools/dispatcher.test.ts
git commit -m "feat(server): session resume and orchestrate WebSocket protocol"
```

---


