import { useState, useEffect, useRef, useCallback } from 'react';
import type { WSMessage, AgentResult } from '../types';

export function useWebSocket(url: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [result, setResult] = useState<AgentResult | null>(null);
  const [status, setStatus] = useState<string>('idle');

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
      } else if (msg.type === 'result') {
        setResult(msg.payload as AgentResult);
      }
    };

    return () => ws.close();
  }, [url]);

  const sendTask = useCallback((task: string) => {
    wsRef.current?.send(JSON.stringify({ type: 'task', payload: { task } }));
    setStatus('running');
    setResult(null);
  }, []);

  const cancel = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: 'cancel' }));
  }, []);

  return { connected, status, result, sendTask, cancel };
}