import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useSessions } from './hooks/useSessions';
import { getSession } from './api/sessions';
import { TopBar } from './components/TopBar';
import { ChatTimeline, type EndSummary } from './components/ChatTimeline';
import { HITLModal } from './components/HITLModal';
import {
  Paperclip,
  Mic,
  ChevronDown,
  Folder,
  FileCode,
  FileText,
  File,
  Cpu,
  GitBranch,
  Server,
  Clock,
  Bot,
  CircleDot,
  Circle,
  Loader2,
} from 'lucide-react';
import type { ChatItem, SessionRecord } from './types';

const BUSY = new Set(['running']);
const MODELS = ['K2.5', 'K2.5 Agent', 'K1.5'];

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

const MOCK_SUB_AGENTS = [
  { name: 'Coder Agent', status: 'online' as const },
  { name: 'Reviewer Agent', status: 'thinking' as const },
  { name: 'Tester Agent', status: 'idle' as const },
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
      <button
        type="button"
        className={`file-tree-item ${node.modified ? 'modified' : ''}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => isFolder && setOpen(!open)}
      >
        <Icon size={14} aria-hidden />
        <span className="file-name">{node.name}</span>
        {node.modified && <span className="modified-dot" aria-label="已修改" />}
      </button>
      {isFolder && open && node.children?.map((child) => (
        <FileTreeNode key={child.path} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

function StatusDot({ status }: { status: 'online' | 'thinking' | 'idle' }) {
  if (status === 'online') return <CircleDot size={10} className="status-dot online" aria-hidden />;
  if (status === 'thinking') return <Loader2 size={10} className="status-dot thinking spin" aria-hidden />;
  return <Circle size={10} className="status-dot idle" aria-hidden />;
}

export default function App() {
  const [task, setTask] = useState('');
  const [review, setReview] = useState<SessionRecord | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [rightbarOpen, setRightbarOpen] = useState(true);
  const [model, setModel] = useState(MODELS[0]);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [composerExpanded, setComposerExpanded] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [activeTab, setActiveTab] = useState<'editor' | 'diff' | 'terminal'>('editor');
  const [elapsed, setElapsed] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [tokenUsage] = useState({ used: 90, total: 200 });

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsHost = import.meta.env.DEV ? 'localhost:3000' : window.location.host;
  const { connected, reconnecting, status, result, hitlRequest, chat, sendTask, cancel, respondHITL } =
    useWebSocket(`${protocol}//${wsHost}`);
  const { sessions, loading, error, refresh, remove } = useSessions();

  const busy = BUSY.has(status);

  useEffect(() => {
    if (result || status === 'error' || status === 'cancelled') {
      void refresh();
    }
  }, [result, status, refresh]);

  useEffect(() => {
    if (!busy) {
      setElapsed(0);
      return;
    }
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [busy]);

  const items = review ? chatFromSession(review) : chat;
  const agentItems = items.filter((it) => it.kind === 'agent');
  const currentRound = agentItems.length;
  const toolCallCount = agentItems.reduce((n, it) => n + (it.actions?.length ?? 0), 0);

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

  const handleAttach = () => {
    fileInputRef.current?.click();
  };

  const addFiles = (files: File[]) => {
    setAttachedFiles((prev) => [...prev, ...files]);
  };

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    addFiles(files);
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
    const files = Array.from(e.dataTransfer.files ?? []);
    addFiles(files);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const formatElapsed = (s: number) => {
    const h = Math.floor(s / 3600).toString().padStart(2, '0');
    const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${h}:${m}:${sec}`;
  };

  return (
    <div className="app-shell">
      {hitlRequest && (
        <HITLModal
          request={hitlRequest}
          onApprove={(modifiedArgs) => respondHITL(true, modifiedArgs)}
          onReject={() => respondHITL(false)}
        />
      )}

      <TopBar
        connected={connected}
        reconnecting={reconnecting}
        status={review ? 'review' : status}
        awaitingHITL={Boolean(hitlRequest)}
        currentRound={currentRound}
        toolCallCount={toolCallCount}
      />

      <div className={`app-body ${sidebarOpen ? '' : 'no-sidebar'} ${rightbarOpen ? '' : 'no-rightbar'}`}>
        {sidebarOpen && (
          <aside className="sidebar">
            <div className="sidebar-head">
              <span className="panel-label">项目</span>
              <button
                type="button"
                className="btn btn-primary btn-sm sidebar-new"
                onClick={() => setReview(null)}
              >
                新建任务
              </button>
            </div>

            <div className="sidebar-section">
              <div className="panel-label">文件树</div>
              <div className="file-tree">
                {MOCK_FILE_TREE.map((node) => (
                  <FileTreeNode key={node.path} node={node} depth={0} />
                ))}
              </div>
            </div>

            <div className="sidebar-section">
              <div className="panel-label">上下文与技能</div>
              <div className="context-card">
                <div className="context-title">规则文件</div>
                <div className="context-item">.cursor/rules</div>
                <div className="context-item">AGENTS.md</div>
              </div>
              <div className="token-bar">
                <div className="token-label">
                  <span>Token 用量</span>
                  <span>{Math.round((tokenUsage.used / tokenUsage.total) * 100)}% ({tokenUsage.used}k / {tokenUsage.total}k)</span>
                </div>
                <div className="token-track">
                  <div
                    className="token-fill"
                    style={{ width: `${(tokenUsage.used / tokenUsage.total) * 100}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="sidebar-section">
              <div className="panel-label">子 Agent</div>
              <div className="sub-agent-list">
                {MOCK_SUB_AGENTS.map((agent) => (
                  <div key={agent.name} className="sub-agent-item">
                    <StatusDot status={agent.status} />
                    <span>{agent.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        )}

        <main className="main-col">
          <div className="tabs">
            <button
              type="button"
              className={`tab ${activeTab === 'editor' ? 'active' : ''}`}
              onClick={() => setActiveTab('editor')}
            >
              编辑器
            </button>
            <button
              type="button"
              className={`tab ${activeTab === 'diff' ? 'active' : ''}`}
              onClick={() => setActiveTab('diff')}
            >
              Diff 审查
            </button>
            <button
              type="button"
              className={`tab ${activeTab === 'terminal' ? 'active' : ''}`}
              onClick={() => setActiveTab('terminal')}
            >
              终端
            </button>
          </div>

          <div className="main-content">
            {activeTab === 'editor' && (
              <div className="editor-placeholder">
                <FileCode size={32} aria-hidden />
                <p>选择左侧文件进行编辑</p>
              </div>
            )}
            {activeTab === 'diff' && (
              <div className="editor-placeholder">
                <FileCode size={32} aria-hidden />
                <p>Diff 审查功能待接入</p>
              </div>
            )}
            {activeTab === 'terminal' && (
              <div className="terminal-panel">
                <div className="terminal-line">$ npm test</div>
                <div className="terminal-line">✓ checkpoint.test.ts (3 tests)</div>
                <div className="terminal-line error">✗ aes-file.test.ts (1 failed)</div>
                <div className="terminal-line">Tests: 1 failed, 2 passed</div>
              </div>
            )}
          </div>

          <div
            className={`composer-container ${dragOver ? 'drag-over' : ''} ${composerExpanded ? 'expanded' : 'collapsed'}`}
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
                disabled={busy || Boolean(review)}
                aria-label="上传文件"
              >
                <Paperclip size={16} aria-hidden />
              </button>

              <div className="prompt-wrap">
                <textarea
                  value={task}
                  onChange={(e) => setTask(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onFocus={() => setComposerExpanded(true)}
                  onBlur={() => {
                    if (!task.trim()) setComposerExpanded(false);
                  }}
                  placeholder={review ? '回顾模式中 — 点击左侧"＋ 新任务"返回实时模式' : '输入编码任务…（Enter 发送，Shift+Enter 换行）'}
                  disabled={busy || Boolean(review)}
                  aria-label="Coding task"
                  rows={composerExpanded ? 3 : 1}
                />

                <div className="composer-bottom">
                  <div className="model-select">
                    <button
                      type="button"
                      className="model-trigger"
                      onClick={() => setModelMenuOpen((v) => !v)}
                      disabled={busy || Boolean(review)}
                    >
                      {model} <ChevronDown size={12} aria-hidden />
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
                </div>
              </div>

              <button
                type="button"
                className="composer-icon"
                disabled={busy || Boolean(review)}
                aria-label="语音输入"
              >
                <Mic size={16} aria-hidden />
              </button>

              <button
                type="submit"
                className="btn btn-primary composer-send"
                disabled={busy || !connected || Boolean(review) || (!task.trim() && attachedFiles.length === 0)}
              >
                发送
              </button>
              {busy && (
                <button type="button" className="btn btn-danger" onClick={cancel}>
                  取消
                </button>
              )}
            </form>
          </div>
        </main>

        {rightbarOpen && (
          <aside className="rightbar">
            <div className="agent-status">
              <div className="agent-status-icon">
                <Bot size={18} aria-hidden />
                {busy && <Loader2 size={14} className="spin" aria-hidden />}
              </div>
              <div className="agent-status-text">
                <div className="agent-status-title">Agent 状态</div>
                <div className="agent-status-desc">
                  {status === 'running' ? `正在执行第 ${currentRound} 轮…` : status === 'error' ? '任务出错' : '空闲'}
                </div>
              </div>
            </div>

            <div className="rightbar-content">
              <ChatTimeline items={items} end={end} connected={connected} review={Boolean(review)} />
            </div>
          </aside>
        )}
      </div>

      <footer className="statusbar">
        <div className="statusbar-left">
          <span className="statusbar-item">
            <Cpu size={12} aria-hidden />
            {model}
          </span>
          <span className="statusbar-item">
            <GitBranch size={12} aria-hidden />
            git:main
          </span>
        </div>
        <div className="statusbar-center">
          <span className="statusbar-item">
            <Server size={12} aria-hidden />
            Sandbox: Connected
            <span className="led on" style={{ width: 6, height: 6 }} />
          </span>
        </div>
        <div className="statusbar-right">
          <span className="statusbar-item">
            <Clock size={12} aria-hidden />
            Run: {formatElapsed(elapsed)}
          </span>
        </div>
      </footer>
    </div>
  );
}
