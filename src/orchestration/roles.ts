import type { Tool } from '../tools/base';

export type AgentRole = 'coder' | 'reviewer' | 'tester';

export interface RoleDefinition {
  role: AgentRole;
  systemPrompt: string;
  allowedTools: string[];
}

const CODER_TOOLS = [
  'read_file',
  'write_file',
  'delete_file',
  'shell',
  'search',
  'git_diff',
  'run_test',
] as const;

const REVIEWER_TOOLS = ['read_file', 'search', 'git_diff'] as const;

const TESTER_TOOLS = ['read_file', 'run_test', 'search', 'git_diff'] as const;

export const ROLE_DEFINITIONS: Record<AgentRole, RoleDefinition> = {
  coder: {
    role: 'coder',
    systemPrompt:
      'You are a coding agent (编码代理). You implement features, fix bugs, and modify the codebase. ' +
      'You may read, write, and delete files, run shell commands, search code, inspect git diffs, and run tests.',
    allowedTools: [...CODER_TOOLS],
  },
  reviewer: {
    role: 'reviewer',
    systemPrompt:
      'You are a code reviewer (代码审查员). Your job is to review changes for correctness, style, and risks. ' +
      'You must NOT modify code — use read-only tools to inspect files, search the codebase, and view git diffs.',
    allowedTools: [...REVIEWER_TOOLS],
  },
  tester: {
    role: 'tester',
    systemPrompt:
      'You are a test engineer (测试工程师). Your job is to verify behavior by running tests and inspecting results. ' +
      'You must NOT modify code — use read_file, run_test, search, and git_diff to validate changes without writing files.',
    allowedTools: [...TESTER_TOOLS],
  },
};

export function filterToolsForRole(role: AgentRole, tools: Tool[]): Tool[] {
  const allowed = new Set(ROLE_DEFINITIONS[role].allowedTools);
  return tools.filter((tool) => allowed.has(tool.name));
}
