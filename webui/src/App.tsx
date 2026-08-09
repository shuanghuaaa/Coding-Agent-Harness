import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useSessions } from './hooks/useSessions';
import { getSession } from './api/sessions';
import { ChatTimeline, type EndSummary } from './components/ChatTimeline';
import { HITLModal } from './components/HITLModal';
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  Settings,
  Sun,
  Moon,
  Plus,
  Paperclip,
  Mic,
  ChevronDown,
  Send,
  Folder,
  FileCode,
  FileText,
  File,
  GitBranch,
  Clock,
  Zap,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  type LucideIcon,
} from 'lucide-react';
import type { ChatItem, SessionRecord } from './types';

const BUSY = new Set(['running']);
const MODELS = ['K2.5', 'K2.5 Agent', 'K1.5'];

type Page = 'dashboard' | 'session' | 'project';

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  modified?: boolean;
  children?: FileNode[];
}

const MOCK_FILE_TREE: FileNode[] = [
  {
    name: 'src',
    path: 'src',
    type: 'folder',
    children: [
      { name: 'server', path: 'src/server', type: 'folder', children: [
        { name: 'http-server.ts', path: 'src/server/http-server.ts', type: 'file', modified: true },
        { name: 'index.ts', path: 'src/index.ts', type: 'file' },
      ]},
      { name: 'workspace', path: 'src/workspace', type: 'folder', children: [
        { name: 'checkpoint.ts', path: 'src/workspace/checkpoint.ts', type: 'file', modified: true },
      ]},
      { name: 'credentials', path: 'src/credentials', type: 'folder', children: [
        { name: 'aes-file.ts', path: 'src/credentials/aes-file.ts', type: 'file' },
      ]},
    ],
  },
  { name: 'webui', path: 'webui', type: 'folder', children: [
    { name: 'src', path: 'webui/src', type: 'folder', children: [
      { name: 'App.tsx', path: 'webui/src/App.tsx', type: 'file', modified: true },
      { name: 'styles.css', path: 'webui/src/styles.css', type: 'file', modified: true },
    ]},
  ]},
  { name: 'tests', path: 'tests', type: 'folder', children: [
    { name: 'checkpoint.test.ts', path: 'tests/workspace/checkpoint.test.ts', type: 'file' },
  ]},
  { name: 'README.md', path: 'README.md', type: 'file' },
  { name: 'package.json', path: 'package.json', type: 'file' },
];

const MOCK_AGENTS = [
  { name: 'Coder Agent', role: '代码编写与重构', status: 'online' as const, tasks: 12, success: 94 },
  { name: 'Reviewer Agent', role: '代码审查与优化', status: 'thinking' as const, tasks: 8, success: 88 },
  { name: 'Tester Agent', role: '测试生成与执行', status: 'idle' as const, tasks: 15, success: 91 },
];

const MOCK_ACTIVITIES = [
  { icon: '◆', text: 'Coder Agent 完成了 http-server.ts 的重构', time: '2 分钟前', type: 'blue' },
  { icon: '✓', text: '所有测试通过，准备部署', time: '5 分钟前', type: 'green' },
  { icon: '⚡', text: 'Reviewer Agent 提出了 3 处优化建议', time: '12 分钟前', type: 'purple' },
  { icon: '↻', text: '回滚到检查点 a1b2c3d', time: '1 小时前', type: 'blue' },
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

function FileTreeNode({ node, depth }: { node: FileNode; depth: number }) {
  const [open, setOpen] = useState(depth < 2);
  const isFolder = node.type === 'folder';
  const Icon = isFolder ? Folder : node.name.endsWith('.ts') || node.name.endsWith('.tsx') ? FileCode : node.name.endsWith('.md') ? FileText : File;

  return (
    <div>
      <div
        className={`file-tree-item ${node.modified ? 'modified' : ''}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => isFolder && setOpen(!open)}
      >
        <Icon size={14} />
        <span>{node.name}</span>
        {node.modified && <span className="modified-dot" />}
      </div>
      {isFolder && open && node.children?.map((child) => (
        <FileTreeNode key={child.path} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

function StatusDot({ status }: { status: 'online' | 'thinking' | 'idle' }) {
  if (status === 'online') return <span className="status-dot active" />;
  if (status === 'thinking') return <span className="status-dot" style={{ background: 'var(--warn)' }} />;
  return <span className="status-dot idle" />;
}

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [page, setPage] = useState<Page>('dashboard');
  const [task, setTask] = useState('');
  const [review, setReview] = useState<SessionRecord | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [model, setModel] = useState(MODELS[0]);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
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
      setPage('session');
    }
  };

  const handleSelectSession = async (id: number) => {
    try {
      setReview(await getSession(id));
      setDetailError(null);
      setPage('session');
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

  const NAV_ITEMS: Array<{ icon: LucideIcon; label: string; page: Page }> = [
    { icon: LayoutDashboard, label: '仪表盘', page: 'dashboard' },
    { icon: MessageSquare, label: '会话', page: 'session' },
    { icon: Users, label: '多 Agent', page: 'project' },
    { icon: Settings, label: '设置', page: 'dashboard' },
  ];

  return (
    <div className="app-shell">
      {hitlRequest && (
        <HITLModal
          request={hitlRequest}
          onApprove={(modifiedArgs) => respondHITL(true, modifiedArgs)}
          onReject={() => respondHITL(false)}
        />
      )}

      <div className="app-body">
        <aside className="sidebar">
          <div className="sidebar-header">
            <div className="sidebar-logo">
              <span className="logo-icon">◆</span>
              <span>Agent Harness</span>
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

          <nav className="sidebar-nav">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.label}
                type="button"
                className={`nav-item ${page === item.page ? 'active' : ''}`}
                onClick={() => setPage(item.page)}
              >
                <item.icon size={18} />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="sidebar-footer">
            <div className="user-avatar">U</div>
            <div className="user-info">
              <div className="user-name">开发者</div>
              <div className="user-plan">Pro 计划</div>
            </div>
          </div>
        </aside>

        <main className="main-area">
          {page === 'dashboard' && (
            <div className="page-dashboard">
              <div className="dashboard-header">
                <h1 className="dashboard-title">仪表盘</h1>
                <p className="dashboard-subtitle">监控你的 Agent 工作负载和项目状态</p>
              </div>

              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-label">活跃会话</div>
                  <div className="stat-value">{sessions.length}</div>
                  <div className="stat-change up">+12% 本周</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">完成任务</div>
                  <div className="stat-value">{sessions.filter(s => s.status === 'completed').length}</div>
                  <div className="stat-change up">+8% 本周</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">工具调用</div>
                  <div className="stat-value">156</div>
                  <div className="stat-change up">+23% 本周</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Token 用量</div>
                  <div className="stat-value">90k</div>
                  <div className="stat-change down">-5% 本周</div>
                </div>
              </div>

              <h2 className="section-title">最近项目</h2>
              <div className="projects-grid">
                <div className="project-card" onClick={() => setPage('project')}>
                  <div className="project-icon blue"><Zap size={20} /></div>
                  <div className="project-name">Coding Agent Harness</div>
                  <div className="project-desc">AI 编码智能体系统，支持反馈闭环和工具治理</div>
                  <div className="project-meta">
                    <span className="project-status"><span className="status-dot active" /> 活跃</span>
                    <span>更新于 2 小时前</span>
                  </div>
                </div>
                <div className="project-card" onClick={() => setPage('project')}>
                  <div className="project-icon purple"><GitBranch size={20} /></div>
                  <div className="project-name">WebUI 重构</div>
                  <div className="project-desc">前端界面重新设计，支持多主题和响应式布局</div>
                  <div className="project-meta">
                    <span className="project-status"><span className="status-dot idle" /> 空闲</span>
                    <span>更新于 1 天前</span>
                  </div>
                </div>
                <div className="project-card" onClick={() => setPage('project')}>
                  <div className="project-icon cyan"><CheckCircle2 size={20} /></div>
                  <div className="project-name">测试覆盖率提升</div>
                  <div className="project-desc">为核心模块添加单元测试和集成测试</div>
                  <div className="project-meta">
                    <span className="project-status"><span className="status-dot active" /> 活跃</span>
                    <span>更新于 3 天前</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {page === 'session' && (
            <div className="page-session">
              <div className="session-header">
                <div className="session-header-left">
                  <h2 className="session-title">{review ? review.task : '新会话'}</h2>
                  <span className={`session-status ${status}`}>
                    {status === 'running' ? `运行中 · 第 ${currentRound} 轮` : status}
                  </span>
                </div>
                <div className="session-header-right">
                  <button type="button" className="header-btn" onClick={() => setPage('dashboard')}>
                    返回
                  </button>
                  <button type="button" className="header-btn" onClick={() => setReview(null)}>
                    <RotateCcw size={14} />
                    新会话
                  </button>
                </div>
              </div>

              <div className="session-content">
                <div className="chat-panel">
                  <div className="chat-messages">
                    {items.length === 0 && !review && (
                      <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '40px' }}>
                        <p>输入任务开始与 Agent 对话</p>
                      </div>
                    )}
                    {items.map((item) =>
                      item.kind === 'user' ? (
                        <div key={item.id} className="message user">
                          <div className="message-bubble">{item.text}</div>
                          <div className="message-meta">你 · 刚刚</div>
                        </div>
                      ) : (
                        <div key={item.id} className="message agent">
                          <div className="message-bubble">{item.text}</div>
                          {item.actions && item.actions.length > 0 && (
                            <div className="tool-call-card">
                              <div className="tool-call-header">
                                <Zap size={14} className="tool-call-icon" />
                                <span>工具调用</span>
                              </div>
                              <div className="tool-call-body">
                                {item.actions.map((a, i) => (
                                  <div key={i}>{a.tool}: {a.result}</div>
                                ))}
                              </div>
                              <div className="tool-call-result success">
                                <CheckCircle2 size={12} />
                                执行成功
                              </div>
                            </div>
                          )}
                          <div className="message-meta">Agent · 第 {item.round} 轮</div>
                        </div>
                      ),
                    )}
                    {end && (
                      <div className="message agent">
                        <div className="message-bubble">
                          <strong>{end.status === 'completed' ? '任务完成' : end.status}</strong>
                          <br />
                          共 {end.rounds} 轮
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="chat-input-area">
                    {attachedFiles.length > 0 && (
                      <div className="attach-list">
                        {attachedFiles.map((f, i) => (
                          <span key={i} className="attach-item">
                            {f.name}
                            <button type="button" onClick={() => removeFile(i)}>×</button>
                          </span>
                        ))}
                      </div>
                    )}
                    <form
                      className={`composer ${dragOver ? 'drag-over' : ''}`}
                      onSubmit={handleSubmit}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                    >
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
                      >
                        <Paperclip size={18} />
                      </button>
                      <div className="prompt-wrap">
                        <textarea
                          value={task}
                          onChange={(e) => setTask(e.target.value)}
                          onKeyDown={handleKeyDown}
                          placeholder={review ? '回顾模式中…' : '输入编码任务…'}
                          disabled={busy || Boolean(review)}
                          rows={1}
                        />
                      </div>
                      <button
                        type="button"
                        className="composer-icon"
                        disabled={busy || Boolean(review)}
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
                            {model} <ChevronDown size={12} />
                          </button>
                          {modelMenuOpen && (
                            <ul className="model-menu">
                              {MODELS.map((m) => (
                                <li key={m}>
                                  <button type="button" onClick={() => { setModel(m); setModelMenuOpen(false); }}>
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
                          disabled={busy || !connected || Boolean(review) || (!task.trim() && attachedFiles.length === 0)}
                        >
                          <Send size={16} />
                        </button>
                        {busy && (
                          <button type="button" className="header-btn" onClick={cancel}>
                            取消
                          </button>
                        )}
                      </div>
                    </form>
                  </div>
                </div>

                <div className="context-panel">
                  <div className="context-section">
                    <h3 className="context-section-title">
                      <Folder size={14} />
                      项目文件
                    </h3>
                    <div className="file-tree">
                      {MOCK_FILE_TREE.map((node) => (
                        <FileTreeNode key={node.path} node={node} depth={0} />
                      ))}
                    </div>
                  </div>

                  <div className="context-section">
                    <h3 className="context-section-title">
                      <Clock size={14} />
                      Token 用量
                    </h3>
                    <div className="token-bar">
                      <div className="token-label">
                        <span>已使用</span>
                        <span>90k / 200k</span>
                      </div>
                      <div className="token-track">
                        <div className="token-fill" style={{ width: '45%' }} />
                      </div>
                    </div>
                  </div>

                  <div className="context-section">
                    <h3 className="context-section-title">
                      <RotateCcw size={14} />
                      检查点
                    </h3>
                    <div className="checkpoint-card">
                      <div className="checkpoint-hash">a1b2c3d4e5f6</div>
                      <button type="button" className="checkpoint-btn">
                        回滚到此检查点
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {page === 'project' && (
            <div className="page-project">
              <div className="project-header">
                <h1 className="project-title">Coding Agent Harness</h1>
                <div className="project-actions">
                  <button type="button" className="header-btn">
                    <Settings size={14} />
                    配置
                  </button>
                  <button type="button" className="header-btn" onClick={() => setPage('session')}>
                    <Plus size={14} />
                    新会话
                  </button>
                </div>
              </div>

              <div className="agents-grid">
                {MOCK_AGENTS.map((agent) => (
                  <div key={agent.name} className="agent-card">
                    <div className="agent-header">
                      <div className={`agent-avatar ${agent.name.includes('Coder') ? 'blue' : agent.name.includes('Reviewer') ? 'purple' : 'green'}`}>
                        {agent.name[0]}
                      </div>
                      <div className="agent-info">
                        <div className="agent-name">{agent.name}</div>
                        <div className="agent-role">{agent.role}</div>
                      </div>
                      <div className={`agent-status ${agent.status}`}>
                        <StatusDot status={agent.status} />
                        {agent.status === 'online' ? '在线' : agent.status === 'thinking' ? '思考中' : '空闲'}
                      </div>
                    </div>
                    <div className="agent-metrics">
                      <div className="metric-item">
                        <div className="metric-value">{agent.tasks}</div>
                        <div className="metric-label">完成任务</div>
                      </div>
                      <div className="metric-item">
                        <div className="metric-value">{agent.success}%</div>
                        <div className="metric-label">成功率</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <h2 className="section-title">最近活动</h2>
              <div className="activity-feed">
                {MOCK_ACTIVITIES.map((activity, i) => (
                  <div key={i} className="activity-item">
                    <div className={`activity-icon ${activity.type}`}>{activity.icon}</div>
                    <div className="activity-content">
                      <div className="activity-text">{activity.text}</div>
                      <div className="activity-time">{activity.time}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
