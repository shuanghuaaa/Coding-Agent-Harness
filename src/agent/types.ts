// src/agent/types.ts
export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  tool_call_id: string;
  content: string;
  error?: string;
}

export interface LLMResponse {
  content: string | null;
  tool_calls: ToolCall[];
  finish_reason: 'stop' | 'tool_calls' | 'length';
}

export type AgentStatus = 'idle' | 'running' | 'waiting_approval' | 'completed' | 'error';

export interface AgentState {
  messages: Message[];
  currentRound: number;
  maxRounds: number;
  status: AgentStatus;
}