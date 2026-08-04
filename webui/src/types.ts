export interface WSMessage {
  type: 'status' | 'result' | 'log';
  payload: unknown;
}

export interface AgentResult {
  status: string;
  rounds: number;
  messages: Array<{ role: string; content: string; tool_calls?: unknown[] }>;
  feedbackHistory: Array<{ round: number; status: string }>;
}