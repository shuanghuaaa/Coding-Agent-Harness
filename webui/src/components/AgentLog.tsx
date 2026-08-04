import React from 'react';
import type { AgentResult } from '../types';

export function AgentLog({ result }: { result: AgentResult }) {
  return (
    <div>
      <h3>Task Complete — {result.rounds} round(s)</h3>
      <div>
        <h4>Feedback History</h4>
        {result.feedbackHistory.map((fb, i) => (
          <div key={i} style={{ padding: '5px', background: fb.status === 'fail' ? '#ffe0e0' : '#e0ffe0' }}>
            Round {fb.round}: {fb.status}
          </div>
        ))}
      </div>
      <div>
        <h4>Messages</h4>
        {result.messages.map((msg, i) => (
          <div key={i} style={{ padding: '5px', borderBottom: '1px solid #eee' }}>
            <strong>{msg.role}:</strong> {msg.content.substring(0, 200)}
          </div>
        ))}
      </div>
    </div>
  );
}