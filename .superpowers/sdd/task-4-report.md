# Task 4 Report: Role registry + tool allowlist

## Status
**Complete**

## Changes
- `src/orchestration/roles.ts`: `AgentRole`, `RoleDefinition`, `ROLE_DEFINITIONS` (coder/reviewer/tester with bilingual prompts), `filterToolsForRole`.
- `tests/orchestration/roles.test.ts`: Tool isolation and systemPrompt coverage.

## Tool allowlists (verified against `src/index.ts`)
| Role | Tools |
|------|-------|
| coder | read_file, write_file, delete_file, shell, search, git_diff, run_test |
| reviewer | read_file, search, git_diff |
| tester | read_file, run_test, search, git_diff |

## Commits
- `feat(orchestration): role registry with tool allowlists`

## Tests
```
✓ tests/orchestration/roles.test.ts (4 tests)
4/4 passed
```

## TDD
1. RED: import failed — `roles.ts` missing
2. GREEN: implemented registry + filter; all 4 tests pass

## Concerns
- None. Tester uses `git_diff` instead of `shell` per brief preference.
