import { Activity, Bot, PanelLeft, PanelRight, Wrench } from 'lucide-react';

interface TopBarProps {
  connected: boolean;
  reconnecting: boolean;
  status: string;
  awaitingHITL: boolean;
  currentRound: number;
  toolCallCount: number;
  sidebarOpen: boolean;
  deckOpen: boolean;
  onToggleSidebar: () => void;
  onToggleDeck: () => void;
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
  sidebarOpen,
  deckOpen,
  onToggleSidebar,
  onToggleDeck,
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
      <button
        type="button"
        className={`icon-btn ${sidebarOpen ? 'on' : ''}`}
        onClick={onToggleSidebar}
        aria-label="切换会话历史栏"
      >
        <PanelLeft size={14} aria-hidden />
      </button>
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
        <button
          type="button"
          className={`icon-btn ${deckOpen ? 'on' : ''}`}
          onClick={onToggleDeck}
          aria-label="切换控制台面板"
        >
          <PanelRight size={14} aria-hidden />
        </button>
      </div>
    </header>
  );
}
