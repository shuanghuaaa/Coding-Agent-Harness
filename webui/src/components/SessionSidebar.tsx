import { History, Trash2 } from 'lucide-react';
import type { SessionSummary } from '../types';

interface SessionSidebarProps {
  sessions: SessionSummary[];
  loading: boolean;
  error: string | null;
  activeId: number | null;
  onRetry: () => void;
  onSelect: (id: number) => void;
  onNew: () => void;
  onDelete: (id: number) => void;
}

const STATUS_LABEL: Record<string, string> = {
  completed: '完成',
  error: '错误',
  cancelled: '取消',
  max_rounds: '超限',
};

function statusClass(status: string): string {
  if (status === 'completed') return 'ok';
  if (status === 'cancelled') return 'dim';
  return 'bad';
}

function relativeTime(iso: string): string {
  // SQLite CURRENT_TIMESTAMP 为 UTC 的 'YYYY-MM-DD HH:MM:SS'
  const then = new Date(iso.replace(' ', 'T') + 'Z').getTime();
  const diff = Date.now() - then;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

export function SessionSidebar({
  sessions,
  loading,
  error,
  activeId,
  onRetry,
  onSelect,
  onNew,
  onDelete,
}: SessionSidebarProps) {
  return (
    <aside className="sidebar panel">
      <div className="sidebar-head">
        <span className="panel-label">
          <History size={12} aria-hidden />
          会话历史
        </span>
        <button type="button" className="btn btn-primary btn-sm" onClick={onNew}>
          ＋ 新任务
        </button>
      </div>

      {loading && <div className="sidebar-note">加载中…</div>}

      {error && (
        <div className="sidebar-note error">
          <span>加载失败：{error}</span>
          <button type="button" className="btn btn-sm" onClick={onRetry}>
            重试
          </button>
        </div>
      )}

      {!loading && !error && sessions.length === 0 && (
        <div className="sidebar-note">暂无历史会话。完成的任务会自动保存在这里。</div>
      )}

      <ul className="session-list">
        {sessions.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              className={`session-item ${activeId === s.id ? 'active' : ''}`}
              onClick={() => onSelect(s.id)}
            >
              <span className="session-task">{s.task}</span>
              <span className="session-meta">
                <span className={`badge ${statusClass(s.status)}`}>
                  {STATUS_LABEL[s.status] ?? s.status}
                </span>
                <span>{s.rounds} 轮</span>
                <span>{relativeTime(s.created_at)}</span>
              </span>
            </button>
            <button
              type="button"
              className="session-delete"
              aria-label="删除会话"
              onClick={() => onDelete(s.id)}
            >
              <Trash2 size={12} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
