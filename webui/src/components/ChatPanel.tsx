import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { HITLModal } from './HITLModal';
import type { ChatItem } from '../types';

const BUSY = new Set(['running']);

function AgentBubble({ item }: { item: ChatItem }) {
  const hasText = Boolean(item.text?.trim());
  const hasActions = Boolean(item.actions && item.actions.length > 0);

  return (
    <div className="bubble-row agent">
      <div className="bubble agent">
        <div className="bubble-meta">
          第 {item.round} 轮
          {item.feedbackStatus && (
            <span className={`fb-tag ${item.feedbackStatus}`}>
              {item.feedbackStatus === 'fail' ? '测试未通过' : '测试通过'}
            </span>
          )}
        </div>
        {hasText && <div className="bubble-text">{item.text}</div>}
        {hasActions && (
          <div className="action-list">
            {item.actions!.map((a, i) => (
              <div key={i} className="action-block">
                <div className="action-tool">工具 · {a.tool}</div>
                <pre className="action-result">{a.result.slice(0, 800)}{a.result.length > 800 ? '…' : ''}</pre>
              </div>
            ))}
          </div>
        )}
        {!hasText && !hasActions && (
          <div className="bubble-text dim">（本轮无文字输出）</div>
        )}
      </div>
    </div>
  );
}

export function ChatPanel() {
  const [task, setTask] = useState('');
  const scrollerRef = useRef<HTMLDivElement>(null);
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsHost = import.meta.env.DEV ? 'localhost:3000' : window.location.host;
  const wsUrl = `${protocol}//${wsHost}`;
  const { connected, status, hitlRequest, chat, sendTask, cancel, respondHITL } = useWebSocket(wsUrl);

  const busy = BUSY.has(status);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat, status]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (task.trim() && !busy) {
      sendTask(task.trim());
      setTask('');
    }
  };

  const ledClass = connected ? 'led on' : 'led off';
  const agentLed =
    status === 'running' ? 'led warn' : hitlRequest ? 'led warn' : status === 'error' ? 'led off' : connected ? 'led on' : 'led off';

  return (
    <div className="app-shell">
      {hitlRequest && (
        <HITLModal
          request={hitlRequest}
          onApprove={(modifiedArgs) => respondHITL(true, modifiedArgs)}
          onReject={() => respondHITL(false)}
        />
      )}

      <header className="topbar">
        <div className="brand">
          Coding Agent <span>Harness</span>
        </div>
        <div className="status-row">
          <span className="status-item">
            <span className={ledClass} aria-hidden />
            {connected ? '已连接' : '未连接'}
          </span>
          <span className="status-item">
            <span className={agentLed} aria-hidden />
            {status === 'running' ? '执行中' : status === 'idle' ? '空闲' : status}
            {hitlRequest ? ' · 等待审批' : ''}
          </span>
        </div>
      </header>

      <main className="main chat-main" ref={scrollerRef}>
        {chat.length === 0 && (
          <div className="hint-box">
            <p>在下方输入编码任务。你的话在右侧，Agent 每完成一轮会在左侧更新（模型说明 + 工具结果合并显示）。</p>
            {!connected && (
              <p>
                未连接后端。若设置了 <code>HARNESS_TOKEN</code>，请用 <code>?token=…</code> 打开。
              </p>
            )}
          </div>
        )}

        {chat.map((item) =>
          item.kind === 'user' ? (
            <div key={item.id} className="bubble-row user">
              <div className="bubble user">
                <div className="bubble-meta">你</div>
                <div className="bubble-text">{item.text}</div>
              </div>
            </div>
          ) : (
            <AgentBubble key={item.id} item={item} />
          ),
        )}
      </main>

      <form className="composer" onSubmit={handleSubmit}>
        <div className="prompt-wrap">
          <span className="prompt-prefix" aria-hidden>
            &gt;
          </span>
          <input
            type="text"
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="输入编码任务…"
            disabled={busy}
            aria-label="Coding task"
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy || !connected}>
          发送
        </button>
        {busy && (
          <button type="button" className="btn btn-danger" onClick={cancel}>
            取消
          </button>
        )}
      </form>
    </div>
  );
}
