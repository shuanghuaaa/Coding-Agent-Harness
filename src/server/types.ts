export interface WSMessage {
  type: 'task' | 'cancel' | 'hitl_response' | 'hitl_request' | 'status' | 'result' | 'log';
  payload: unknown;
}

export interface TaskMessage {
  type: 'task';
  payload: { task: string };
}

export interface HITLResponse {
  type: 'hitl_response';
  payload: { toolCallId: string; approved: boolean; modifiedArgs?: Record<string, unknown> };
}