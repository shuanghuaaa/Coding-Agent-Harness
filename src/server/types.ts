export interface WSMessage {
  type:
    | 'task'
    | 'orchestrate'
    | 'cancel'
    | 'hitl_response'
    | 'hitl_request'
    | 'status'
    | 'orchestrator_status'
    | 'result'
    | 'log'
    | 'progress';
  payload: unknown;
}

export interface TaskMessage {
  type: 'task';
  payload: { task: string; sessionId?: number };
}

export interface OrchestrateMessage {
  type: 'orchestrate';
  payload: { task: string; maxRetries?: number; sessionId?: number };
}

export interface HITLResponse {
  type: 'hitl_response';
  payload: { toolCallId: string; approved: boolean; modifiedArgs?: Record<string, unknown> };
}