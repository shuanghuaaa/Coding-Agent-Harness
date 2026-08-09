import { Activity, Bot, Wrench } from 'lucide-react';

interface TopBarProps {
  connected: boolean;
  reconnecting: boolean;
  status: string;
  awaitingHITL: boolean;
  currentRound: number;
  toolCallCount: number;
}

const STATUS_LABEL: Record<string, string> = {
  idle: '空闲',
  running: '执行中',
  completed: '已完成',
  max_rounds: '轮次上限',
  error: '错误',
  cancelled: '已取消',
  review: '回顾中',
};

export function TopBar({
  connected,
  reconnecting,
  status,
  awaitingHITL,
  currentRound,
  toolCallCount,
}: TopBarProps) {
  const connLed = connected ? 'led on' : reconnecting ? 'led warn' : 'led off';
  const agentLed =
    awaitingHITL || status === 'running'
      ? 'led warn'
      : status === 'error'
        ? 'led off'
        : connected
          ? 'led on'
          : 'led off';

  return (
    <header className="topbar panel">
      <div className="brand">
        <span className="brand-logo" aria-hidden>
          <Bot size={14} />
        </span>
        智软训练营 <span>Agent Harness</span>
      </div>
      <div className="topbar-metrics">
        <span className="metric">
          <Activity size={12} aria-hidden />
          轮次 <strong>{currentRound}</strong>
        </span>
        <span className="metric">
          <Wrench size={12} aria-hidden />
          工具 <strong>{toolCallCount}</strong>
        </span>
      </div>
      <div className="status-row">
        <span className="status-item">
          <span className={connLed} aria-hidden />
          {connected ? '已连接' : reconnecting ? '重连中…' : '未连接'}
        </span>
        <span className="status-item">
          <span className={agentLed} aria-hidden />
          {awaitingHITL ? '等待审批' : (STATUS_LABEL[status] ?? status)}
        </span>
      </div>
    </header>
  );
}
