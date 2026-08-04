import React, { useState } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { AgentLog } from './AgentLog';

export function ChatPanel() {
  const [task, setTask] = useState('');
  const { connected, status, result, sendTask, cancel } = useWebSocket('ws://localhost:3000');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (task.trim()) {
      sendTask(task.trim());
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: '20px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ flex: 1, overflow: 'auto', marginBottom: '20px' }}>
        <div style={{ marginBottom: '10px', fontSize: '14px' }}>
          Status: {connected ? '🟢 Connected' : '🔴 Disconnected'} | Agent: {status}
        </div>
        {result && <AgentLog result={result} />}
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '10px' }}>
        <input
          type="text"
          value={task}
          onChange={(e) => setTask(e.target.value)}
          placeholder="Enter a coding task..."
          disabled={status === 'running'}
          style={{ flex: 1, padding: '10px', fontSize: '16px', borderRadius: '8px', border: '1px solid #ccc' }}
        />
        <button type="submit" disabled={status === 'running' || !connected}
          style={{ padding: '10px 20px', fontSize: '16px', borderRadius: '8px', border: 'none', background: '#4a90d9', color: 'white', cursor: 'pointer' }}>
          Send
        </button>
        {status === 'running' && (
          <button type="button" onClick={cancel}
            style={{ padding: '10px 20px', fontSize: '16px', borderRadius: '8px', border: 'none', background: '#e74c3c', color: 'white', cursor: 'pointer' }}>
            Cancel
          </button>
        )}
      </form>
    </div>
  );
}