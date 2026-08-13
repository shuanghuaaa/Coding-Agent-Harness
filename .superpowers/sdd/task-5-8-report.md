# Task 5–8 report (controller fallback after subagent API limit)

## Status
DONE — implemented inline after Task tool API limit blocked further subagents.

## What changed
- AgentLoop: detectRepeatedFailure + toFeedbackHistoryEntry; RoundProgress.feedback; typed FeedbackHistoryEntry history
- session-store + webui types mirrored
- harness-demo: richer fail/pass asserts + ②b repeated WARNING story
- FeedbackTrail Chinese trail + repeat banner
- TestFileSnippet ±8 lines via getWorkspaceFile
- TaskRoundList mounts trail/snippets; tool footer 测试通过/未通过/执行完成
- useWebSocket + chatFromSession pass feedback

## Tests
`npx vitest run tests/feedback tests/integration/harness-demo.test.ts tests/agent/loop.test.ts`
→ 11 files, 57 tests passed
