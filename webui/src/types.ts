export type AgentRole = 'coder' | 'reviewer' | 'tester';

export type RoleStatus = 'idle' | 'running' | 'waiting' | 'done' | 'blocked' | 'error';

export interface OrchestratorStatus {
  phase: string;
  roles: Record<AgentRole, RoleStatus>;
  retryCount: number;
  maxRetries: number;
  lastGate?: { from: string; reason: string };
}

export interface WSMessage {
  type: 'status' | 'result' | 'hitl_request' | 'log' | 'progress' | 'orchestrator_status';
  payload: unknown;
}

export type FailureType = 'compile' | 'assertion' | 'timeout' | 'runtime';

export interface FeedbackFailureSummary {
  testName: string;
  type: FailureType;
  file: string;
  line: number;
  expected: string;
  received: string;
}

export interface FeedbackHistoryEntry {
  round: number;
  status: string;
  summary?: string;
  failureTypes?: FailureType[];
  failures?: FeedbackFailureSummary[];
  repeatedFailure?: { testName: string; streak: number; message: string };
}

export interface RoundProgress {
  round: number;
  assistantContent: string;
  actions: Array<{ tool: string; result: string }>;
  feedbackStatus?: string;
  feedback?: FeedbackHistoryEntry;
  agentRole?: string;
}

export interface ChatItem {
  id: string;
  kind: 'user' | 'agent';
  /** user text, or agent round card */
  text?: string;
  round?: number;
  actions?: Array<{ tool: string; result: string }>;
  feedbackStatus?: string;
  feedback?: FeedbackHistoryEntry;
  agentRole?: string;
}

export interface WorkspaceFile {
  path: string;
  content: string;
  size: number;
}

export interface CheckpointDiffPayload {
  id: string;
  files: string[];
  patch: string;
}

export interface AgentResult {
  status: string;
  rounds: number;
  messages: Array<{ role: string; content: string; tool_calls?: unknown[] }>;
  feedbackHistory: FeedbackHistoryEntry[];
  checkpoint?: CheckpointDiffPayload | null;
  sessionId?: number;
}

export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileTreeNode[];
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
  feedbackHistory: FeedbackHistoryEntry[];
  messages: Array<{ role: string; content: string }>;
}

export interface SessionRecord extends SessionSummary {
  data: SessionData;
}
