# Task 3 Report: LLMProvider Interface and MockLLM

## What was implemented

Created the LLM provider abstraction layer:

- **`src/llm/provider.ts`**: `LLMProvider` interface with a single `chat(messages: Message[]): Promise<LLMResponse>` method, consuming the `Message` and `LLMResponse` types from `src/agent/types.ts`.
- **`src/llm/mock-llm.ts`**: `MockLLM` class implementing `LLMProvider`. Preset responses are consumed in order via an internal index. The `receivedMessages` array records every message list passed to `chat()` for test assertions.

## What was tested and test results

- **3 tests, all passing**: preset response ordering, error on exhausted responses, and message tracking via `receivedMessages`.
- **Test file**: `tests/llm/mock-llm.test.ts`

## Files changed

| File | Action |
|------|--------|
| `src/llm/provider.ts` | Created |
| `src/llm/mock-llm.ts` | Created |
| `tests/llm/mock-llm.test.ts` | Created |

## Issues or concerns

- **CRLF warnings**: Git warned about LF-to-CRLF conversion on Windows. Cosmetic only — does not affect functionality.
- **Vite CJS deprecation**: `npx vitest` warns about the CJS build of Vite's Node API being deprecated. Non-blocking.