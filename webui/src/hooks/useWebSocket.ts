import { useState, useEffect, useRef, useCallback } from 'react';
import type { WSMessage, AgentResult, HITLRequestPayload, RoundProgress, ChatItem } from '../types';

export function useWebSocket(url: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [result, setResult] = useState<AgentResult | null>(null);
  const [status, setStatus] = useState<string>('idle');
  const [hitlRequest, setHitlRequest] = useState<HITLRequestPayload | null>(null);
  const [chat, setChat] = useState<ChatItem[]>([]);
  const idRef = useRef(0);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token') || '';
    const wsUrl = token ? `${url}?token=${encodeURIComponent(token)}` : url;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (event) => {
      const msg: WSMessage = JSON.parse(event.data);
      if (msg.type === 'status') {
        setStatus((msg.payload as { status: string }).status);
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
          },
        ]);
      } else if (msg.type === 'result') {
        const payload = msg.payload as AgentResult;
        setResult(payload);
        setStatus(payload.status || 'idle');
        setHitlRequest(null);
      } else if (msg.type === 'hitl_request') {
        setHitlRequest(msg.payload as HITLRequestPayload);
      }
    };

    return () => ws.close();
  }, [url]);

  const sendTask = useCallback((task: string) => {
    wsRef.current?.send(JSON.stringify({ type: 'task', payload: { task } }));
    setStatus('running');
    setResult(null);
    setHitlRequest(null);
    setChat((prev) => [
      ...prev,
      { id: `user-${++idRef.current}`, kind: 'user', text: task },
    ]);
  }, []);

  const cancel = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: 'cancel' }));
  }, []);

  const respondHITL = useCallback((approved: boolean, modifiedArgs?: Record<string, unknown>) => {
    if (!hitlRequest) return;
    wsRef.current?.send(JSON.stringify({
      type: 'hitl_response',
      payload: { toolCallId: hitlRequest.toolCallId, approved, modifiedArgs },
    }));
    setHitlRequest(null);
  }, [hitlRequest]);

  return { connected, status, result, hitlRequest, chat, sendTask, cancel, respondHITL };
}
