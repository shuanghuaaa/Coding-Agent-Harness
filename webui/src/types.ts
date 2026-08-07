export interface WSMessage {
  type: 'status' | 'result' | 'hitl_request' | 'log' | 'progress';
  payload: unknown;
}

export interface RoundProgress {
  round: number;
  assistantContent: string;
  actions: Array<{ tool: string; result: string }>;
  feedbackStatus?: string;
}

export interface ChatItem {
  id: string;
  kind: 'user' | 'agent';
  /** user text, or agent round card */
  text?: string;
  round?: number;
  actions?: Array<{ tool: string; result: string }>;
  feedbackStatus?: string;
}

export interface AgentResult {
  status: string;
  rounds: number;
  messages: Array<{ role: string; content: string; tool_calls?: unknown[] }>;
  feedbackHistory: Array<{ round: number; status: string }>;
}

export interface HITLRequestPayload {
  toolCallId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  reason: string;
  severity: 'high' | 'critical';
}

export interface SessionSummary {
  id: number;
  task: string;
  status: string;
  rounds: number;
  created_at: string;
}

export interface SessionData {
  progressEvents: RoundProgress[];
  feedbackHistory: Array<{ round: number; status: string }>;
  messages: Array<{ role: string; content: string }>;
}

export interface SessionRecord extends SessionSummary {
  data: SessionData;
}
