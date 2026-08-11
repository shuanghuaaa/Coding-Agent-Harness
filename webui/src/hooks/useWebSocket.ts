import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  WSMessage,
  AgentResult,
  HITLRequestPayload,
  RoundProgress,
  ChatItem,
  CheckpointDiffPayload,
  OrchestratorStatus,
} from '../types';

export function useWebSocket(url: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [result, setResult] = useState<AgentResult | null>(null);
  const [status, setStatus] = useState<string>('idle');
  const [hitlRequest, setHitlRequest] = useState<HITLRequestPayload | null>(null);
  const [chat, setChat] = useState<ChatItem[]>([]);
  const [checkpoint, setCheckpoint] = useState<CheckpointDiffPayload | null>(null);
  const [orchestratorStatus, setOrchestratorStatus] = useState<OrchestratorStatus | null>(null);
  const idRef = useRef(0);
  const retryRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const pendingRef = useRef<string[]>([]);

  useEffect(() => {
    let unmounted = false;
    const token = new URLSearchParams(window.location.search).get('token') || '';
    const wsUrl = token ? `${url}?token=${encodeURIComponent(token)}` : url;

    const connect = () => {
      if (unmounted) return;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        retryRef.current = 0;
        setConnected(true);
        setReconnecting(false);
        if (pendingRef.current.length > 0) {
          const messages = [...pendingRef.current];
          pendingRef.current = [];
          for (const msg of messages) {
            ws.send(msg);
          }
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (unmounted) return;
        setReconnecting(true);
        const delay = Math.min(1000 * 2 ** retryRef.current, 10000);
        retryRef.current += 1;
        timerRef.current = window.setTimeout(connect, delay);
      };
      ws.onmessage = (event) => {
        const msg: WSMessage = JSON.parse(event.data);
        if (msg.type === 'status') {
          const next = (msg.payload as { status: string }).status;
          setStatus(next);
          if (next === 'error' || next === 'cancelled') {
            setHitlRequest(null);
          }
        } else if (msg.type === 'orchestrator_status') {
          setOrchestratorStatus(msg.payload as OrchestratorStatus);
        } else if (msg.type === 'progress') {
          const p = msg.payload as RoundProgress;
          setChat((prev) => [
            ...prev,
            {
              id: `agent-${++idRef.current}`,
              kind: 'agent',
              round: p.round,
              text: p.assistantContent,
              actions: p.actions,
              feedbackStatus: p.feedbackStatus,
              ...(p.agentRole ? { agentRole: p.agentRole } : {}),
            },
          ]);
        } else if (msg.type === 'result') {
          const payload = msg.payload as AgentResult;
          setResult(payload);
          setStatus(payload.status || 'idle');
          setHitlRequest(null);
          setCheckpoint(payload.checkpoint ?? null);
        } else if (msg.type === 'hitl_request') {
          setHitlRequest(msg.payload as HITLRequestPayload);
        }
      };
    };

    connect();

    return () => {
      unmounted = true;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [url]);

  const seedChat = useCallback((items: ChatItem[]) => {
    setChat(items);
    idRef.current = items.length;
  }, []);

  const sendTask = useCallback((task: string, opts?: { sessionId?: number }) => {
    const payload: { task: string; sessionId?: number } = { task };
    if (opts?.sessionId != null) payload.sessionId = opts.sessionId;
    const msg = JSON.stringify({ type: 'task', payload });
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(msg);
    } else {
      pendingRef.current.push(msg);
    }
    setStatus('running');
    setResult(null);
    setHitlRequest(null);
    setCheckpoint(null);
    setOrchestratorStatus(null);
    const userItem: ChatItem = { id: `user-${++idRef.current}`, kind: 'user', text: task };
    if (opts?.sessionId != null) {
      setChat((prev) => [...prev, userItem]);
    } else {
      setChat([userItem]);
    }
  }, []);

  const sendOrchestrate = useCallback(
    (task: string, opts?: { maxRetries?: number; sessionId?: number }) => {
      const payload: { task: string; maxRetries?: number; sessionId?: number } = { task };
      if (opts?.maxRetries != null) payload.maxRetries = opts.maxRetries;
      if (opts?.sessionId != null) payload.sessionId = opts.sessionId;
      const msg = JSON.stringify({ type: 'orchestrate', payload });
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(msg);
      } else {
        pendingRef.current.push(msg);
      }
      setStatus('running');
      setResult(null);
      setHitlRequest(null);
      setCheckpoint(null);
      setOrchestratorStatus(null);
      const userItem: ChatItem = { id: `user-${++idRef.current}`, kind: 'user', text: task };
      if (opts?.sessionId != null) {
        setChat((prev) => [...prev, userItem]);
      } else {
        setChat([userItem]);
      }
    },
    [],
  );

  const clearOrchestratorStatus = useCallback(() => setOrchestratorStatus(null), []);

  const clearResult = useCallback(() => setResult(null), []);

  const clearCheckpoint = useCallback(() => setCheckpoint(null), []);

  const cancel = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: 'cancel' }));
  }, []);

  const respondHITL = useCallback(
    (approved: boolean, modifiedArgs?: Record<string, unknown>) => {
      if (!hitlRequest) return;
      wsRef.current?.send(
        JSON.stringify({
          type: 'hitl_response',
          payload: { toolCallId: hitlRequest.toolCallId, approved, modifiedArgs },
        }),
      );
      setHitlRequest(null);
    },
    [hitlRequest],
  );

  return {
    connected,
    reconnecting,
    status,
    result,
    hitlRequest,
    chat,
    checkpoint,
    orchestratorStatus,
    sendTask,
    sendOrchestrate,
    seedChat,
    cancel,
    respondHITL,
    clearCheckpoint,
    clearOrchestratorStatus,
    clearResult,
  };
}
