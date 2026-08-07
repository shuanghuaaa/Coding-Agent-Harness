import type { AgentResult } from '../types';

export function AgentLog({ result }: { result: AgentResult }) {
  return (
    <div className="log">
      <h3 className="log-title">
        任务结束 — {result.rounds} 轮 · {result.status}
      </h3>
      <p style={{ color: 'var(--text-dim)', margin: '0 0 12px' }}>
        下面是本轮 Agent 的执行记录。可在底部继续输入下一轮任务。
      </p>

      <section className="log-section">
        <h4>Feedback history（反馈历史）</h4>
        <p style={{ color: 'var(--text-dim)', margin: '0 0 8px', fontSize: '12px' }}>
          测试失败时 Agent 的自我修正记录；没有跑测试或一次通过则为 (none)。
        </p>
        {result.feedbackHistory.length === 0 && (
          <div className="msg-row" style={{ color: 'var(--text-dim)' }}>
            (none)
          </div>
        )}
        {result.feedbackHistory.map((fb, i) => (
          <div
            key={i}
            className={`fb-row ${fb.status === 'fail' ? 'fail' : 'pass'}`}
          >
            第 {fb.round} 轮: {fb.status}
          </div>
        ))}
      </section>

      <section className="log-section">
        <h4>Messages（对话与工具轨迹）</h4>
        <p style={{ color: 'var(--text-dim)', margin: '0 0 8px', fontSize: '12px' }}>
          system = 系统设定；user = 你的任务；assistant = 模型回复；tool = 工具执行结果（如写文件）。
        </p>
        {result.messages.map((msg, i) => (
          <div key={i} className="msg-row">
            <strong>{msg.role}</strong>
            {msg.content.substring(0, 400)}
            {msg.content.length > 400 ? '…' : ''}
          </div>
        ))}
      </section>
    </div>
  );
}
