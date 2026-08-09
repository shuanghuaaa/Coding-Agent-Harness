import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useSessions } from './hooks/useSessions';
import { getSession } from './api/sessions';
import { ChatTimeline, type EndSummary } from './components/ChatTimeline';
import { HITLModal } from './components/HITLModal';
import {
  Plus,
  Search,
  Clock,
  Grid3X3,
  BookOpen,
  Paperclip,
  Mic,
  ChevronDown,
  Sun,
  Moon,
  History,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { ChatItem, SessionRecord } from './types';

const BUSY = new Set(['running']);
const MODELS = ['K2.5', 'K2.5 Agent', 'K1.5'];

const NAV_ITEMS: Array<{ icon: LucideIcon; label: string; active?: boolean }> = [
  { icon: Clock, label: '历史会话', active: true },
  { icon: Grid3X3, label: 'Agent' },
  { icon: BookOpen, label: '知识库' },
];

const HINT_CARDS = [
  { icon: '◆', title: '反馈闭环', desc: '自动执行测试并修复失败' },
  { icon: '⚡', title: '工具治理', desc: '危险操作需人工审批' },
  { icon: '↻', title: '检查点', desc: '任务出错可一键回滚' },
  { icon: '☰', title: '会话持久化', desc: '历史记录自动保存' },
];

function chatFromSession(s: SessionRecord): ChatItem[] {
  const items: ChatItem[] = [{ id: 'user-0', kind: 'user', text: s.task }];
  s.data.progressEvents.forEach((p, i) => {
    items.push({
      id: `agent-${i}`,
      kind: 'agent',
      round: p.round,
      text: p.assistantContent,
      actions: p.actions,
      feedbackStatus: p.feedbackStatus,
    });
  });
  return items;
}

function relativeTime(iso: string): string {
  const then = new Date(iso.replace(' ', 'T') + 'Z').getTime();
  const diff = Date.now() - then;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

function statusBadge(status: string): { label: string; className: string } {
  const map: Record<string, { label: string; className: string }> = {
    completed: { label: '完成', className: 'ok' },
    error: { label: '错误', className: 'bad' },
    cancelled: { label: '取消', className: 'dim' },
    max_rounds: { label: '超限', className: 'bad' },
  };
  return map[status] ?? { label: status, className: 'dim' };
}

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [task, setTask] = useState('');
  const [review, setReview] = useState<SessionRecord | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [model, setModel] = useState(MODELS[0]);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [composerFocused, setComposerFocused] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsHost = import.meta.env.DEV ? 'localhost:3000' : window.location.host;
  const { connected, status, result, hitlRequest, chat, sendTask, cancel, respondHITL } =
    useWebSocket(`${protocol}//${wsHost}`);
  const { sessions, loading, error, refresh, remove } = useSessions();

  const busy = BUSY.has(status);

  useEffect(() => {
    if (result || status === 'error' || status === 'cancelled') {
      void refresh();
    }
  }, [result, status, refresh]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const items = review ? chatFromSession(review) : chat;
  const agentItems = items.filter((it) => it.kind === 'agent');
  const currentRound = agentItems.length;

  const end: EndSummary | null = review
    ? { status: review.status, rounds: review.rounds, feedbackHistory: review.data.feedbackHistory }
    : result
      ? { status: result.status, rounds: result.rounds, feedbackHistory: result.feedbackHistory }
      : null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if ((task.trim() || attachedFiles.length > 0) && !busy && !review) {
      sendTask(task.trim());
      setTask('');
      setAttachedFiles([]);
    }
  };

  const handleSelectSession = async (id: number) => {
    try {
      setReview(await getSession(id));
      setDetailError(null);
    } catch {
      setDetailError('会话详情加载失败');
    }
  };

  const handleDeleteSession = async (id: number) => {
    await remove(id);
    if (review?.id === id) setReview(null);
  };

  const handleAttach = () => fileInputRef.current?.click();

  const addFiles = (files: File[]) => setAttachedFiles((prev) => [...prev, ...files]);

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(e.target.files ?? []));
    e.target.value = '';
  };

  const removeFile = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!busy && !review) setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (busy || review) return;
    addFiles(Array.from(e.dataTransfer.files ?? []));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const toggleTheme = () => setTheme((t) => (t === 'light' ? 'dark' : 'light'));

  return (
    <div className="app-shell">
      {hitlRequest && (
        <HITLModal
          request={hitlRequest}
          onApprove={(modifiedArgs) => respondHITL(true, modifiedArgs)}
          onReject={() => respondHITL(false)}
        />
      )}

      <div className={`app-body ${sidebarOpen ? '' : 'no-sidebar'}`}>
        {sidebarOpen && (
          <aside className="sidebar">
            <div className="sidebar-header">
              <div className="sidebar-logo">
                <span className="logo-icon">◆</span>
                <span className="logo-text">Agent Harness</span>
              </div>
              <button
                type="button"
                className="theme-toggle"
                onClick={toggleTheme}
                aria-label={theme === 'light' ? '切换到深色模式' : '切换到浅色模式'}
              >
                {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
              </button>
            </div>

            <button type="button" className="new-task-btn" onClick={() => setReview(null)}>
              <Plus size={16} />
              新建任务
            </button>

            <div className="sidebar-search">
              <Search size={14} />
              <input type="text" placeholder="搜索会话…" />
            </div>

            <nav className="sidebar-nav">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  className={`nav-item ${item.active ? 'active' : ''}`}
                >
                  <item.icon size={16} />
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>

            <div className="sidebar-sessions">
              <div className="sessions-header">
                <History size={12} />
                <span>最近会话</span>
              </div>
              {loading && <div className="sessions-loading">加载中…</div>}
              {error && <div className="sessions-error">{error}</div>}
              {!loading && !error && sessions.length === 0 && (
                <div className="sessions-empty">暂无历史会话</div>
              )}
              <ul className="session-list">
                {sessions.map((s) => {
                  const badge = statusBadge(s.status);
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        className={`session-item ${review?.id === s.id ? 'active' : ''}`}
                        onClick={() => handleSelectSession(s.id)}
                      >
                        <span className="session-task">{s.task}</span>
                        <span className="session-meta">
                          <span className={`badge ${badge.className}`}>{badge.label}</span>
                          <span className="session-time">{relativeTime(s.created_at)}</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="session-delete"
                        onClick={() => handleDeleteSession(s.id)}
                        aria-label={`删除会话：${s.task}`}
                      >
                        <Trash2 size={12} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </aside>
        )}

        <main className="main-area">
          {!sidebarOpen && (
            <button
              type="button"
              className="sidebar-expand"
              onClick={() => setSidebarOpen(true)}
              aria-label="展开侧边栏"
            >
              <Clock size={16} />
            </button>
          )}

          <div className="chat-container">
            {items.length === 0 && !review && (
              <div className="welcome-screen">
                <h1 className="welcome-title">Agent Harness</h1>
                <p className="welcome-subtitle">
                  反馈闭环 · 工具治理 · 检查点回滚 · 会话持久化
                </p>

                <div
                  className={`composer-hero ${composerFocused ? 'focused' : ''} ${dragOver ? 'drag-over' : ''}`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <form className="composer" onSubmit={handleSubmit}>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      hidden
                      onChange={handleFiles}
                    />
                    <button
                      type="button"
                      className="composer-icon"
                      onClick={handleAttach}
                      disabled={busy}
                      aria-label="上传文件"
                    >
                      <Paperclip size={18} />
                    </button>

                    <div className="prompt-wrap">
                      <textarea
                        value={task}
                        onChange={(e) => setTask(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onFocus={() => setComposerFocused(true)}
                        onBlur={() => setComposerFocused(false)}
                        placeholder="尽管问… 输入编码任务，Agent 将逐轮执行并自动修复"
                        disabled={busy}
                        aria-label="Coding task"
                        rows={composerFocused ? 3 : 1}
                      />
                    </div>

                    <button
                      type="button"
                      className="composer-icon"
                      disabled={busy}
                      aria-label="语音输入"
                    >
                      <Mic size={18} />
                    </button>

                    <div className="composer-actions">
                      <div className="model-select">
                        <button
                          type="button"
                          className="model-trigger"
                          onClick={() => setModelMenuOpen((v) => !v)}
                          disabled={busy}
                        >
                          {model} <ChevronDown size={14} />
                        </button>
                        {modelMenuOpen && (
                          <ul className="model-menu">
                            {MODELS.map((m) => (
                              <li key={m}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setModel(m);
                                    setModelMenuOpen(false);
                                  }}
                                >
                                  {m}
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <button
                        type="submit"
                        className="send-btn"
                        disabled={busy || !connected || (!task.trim() && attachedFiles.length === 0)}
                        aria-label="发送"
                      >
                        <Plus size={20} />
                      </button>
                    </div>
                  </form>
                </div>

                <div className="hint-cards">
                  {HINT_CARDS.map((card) => (
                    <div key={card.title} className="hint-card">
                      <span className="hint-icon">{card.icon}</span>
                      <span className="hint-title">{card.title}</span>
                      <span className="hint-desc">{card.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(items.length > 0 || review) && (
              <>
                <div className="chat-header">
                  <div className="chat-header-left">
                    {review && (
                      <button
                        type="button"
                        className="back-btn"
                        onClick={() => setReview(null)}
                      >
                        <X size={14} />
                        返回实时模式
                      </button>
                    )}
                    <span className="chat-title">
                      {review ? review.task : '当前任务'}
                    </span>
                  </div>
                  <div className="chat-header-right">
                    <span className={`status-indicator ${status}`}>
                      {status === 'running' ? `运行中 · 第 ${currentRound} 轮` : status}
                    </span>
                  </div>
                </div>

                <ChatTimeline items={items} end={end} connected={connected} review={Boolean(review)} />

                <div
                  className={`composer-bottom-bar ${dragOver ? 'drag-over' : ''}`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  {attachedFiles.length > 0 && (
                    <div className="attach-list">
                      {attachedFiles.map((f, i) => (
                        <span key={i} className="attach-item">
                          {f.name}
                          <button type="button" onClick={() => removeFile(i)} aria-label="移除文件">
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <form className="composer compact" onSubmit={handleSubmit}>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      hidden
                      onChange={handleFiles}
                    />
                    <button
                      type="button"
                      className="composer-icon"
                      onClick={handleAttach}
                      disabled={busy || Boolean(review)}
                      aria-label="上传文件"
                    >
                      <Paperclip size={16} />
                    </button>
                    <textarea
                      value={task}
                      onChange={(e) => setTask(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={review ? '回顾模式中…' : '输入编码任务…'}
                      disabled={busy || Boolean(review)}
                      aria-label="Coding task"
                      rows={1}
                    />
                    <button
                      type="submit"
                      className="send-btn compact"
                      disabled={busy || !connected || Boolean(review) || (!task.trim() && attachedFiles.length === 0)}
                      aria-label="发送"
                    >
                      <Plus size={18} />
                    </button>
                    {busy && (
                      <button type="button" className="cancel-btn" onClick={cancel}>
                        取消
                      </button>
                    )}
                  </form>
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
