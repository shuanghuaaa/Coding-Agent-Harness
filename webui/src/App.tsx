import { useCallback, useEffect, useRef, useState, Fragment, type FormEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useSessions } from './hooks/useSessions';
import { getSession } from './api/sessions';
import { getWorkspaceFile, getWorkspaceRoot, listWorkspaceFiles, setWorkspaceRoot, clearWorkspaceRoot } from './api/workspace';
import { rollbackCheckpoint } from './api/checkpoint';
import { HITLModal } from './components/HITLModal';
import { DiffPanel } from './components/DiffPanel';
import { FolderPicker } from './components/FolderPicker';
import { TaskRoundList, groupIntoTaskRounds } from './components/TaskRoundList';
import { FinalResultCard, extractFinalOutput } from './components/FinalResultCard';
import { loadProjects, upsertProject, removeProject, type SavedProject } from './lib/projects';
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
  Clock,
  Zap,
  RotateCcw,
  History,
  Trash2,
  Search,
  X,
  FolderOpen,
  PanelLeftClose,
  PanelLeft,
  FolderPlus,
  FolderX,
  FileDiff,
  type LucideIcon,
} from 'lucide-react';
import type { AgentRole, ChatItem, FileTreeNode, RoleStatus, SessionRecord } from './types';

const BUSY = new Set(['running']);
const MODELS = ['K2.5', 'K2.5 Agent', 'K1.5'];
const CONTEXT_SECTION_MIN = 14;

type Page = 'dashboard' | 'session' | 'project' | 'settings';
type ContextPanelKey = 'files' | 'metrics' | 'checkpoint';

const CONTEXT_DOCK_ITEMS: Array<{
  key: ContextPanelKey;
  label: string;
  hint: string;
  icon: LucideIcon;
}> = [
  { key: 'files', label: '项目文件', hint: '浏览与打开工作区文件', icon: Folder },
  { key: 'metrics', label: '运行指标', hint: '查看任务轮次、工具调用与变更统计', icon: Clock },
  { key: 'checkpoint', label: '检查点', hint: '查看 Diff 并回滚本轮文件变更', icon: FileDiff },
];

const CONTEXT_PANEL_ORDER: ContextPanelKey[] = ['files', 'metrics', 'checkpoint'];

const ORCHESTRATOR_ROLES: Array<{ key: AgentRole; name: string; desc: string; avatar: 'blue' | 'purple' | 'green' }> = [
  { key: 'coder', name: 'Coder Agent', desc: '代码编写与重构', avatar: 'blue' },
  { key: 'reviewer', name: 'Reviewer Agent', desc: '代码审查与优化', avatar: 'purple' },
  { key: 'tester', name: 'Tester Agent', desc: '测试生成与执行', avatar: 'green' },
];

function chatFromSession(s: SessionRecord): ChatItem[] {
  const messages = s.data.messages ?? [];
  const progressEvents = s.data.progressEvents;

  if (messages.length === 0) {
    const items: ChatItem[] = [{ id: 'user-0', kind: 'user', text: s.task }];
    progressEvents.forEach((p, i) => {
      items.push({
        id: `agent-${i}`,
        kind: 'agent',
        round: p.round,
        text: p.assistantContent,
        actions: p.actions,
        feedbackStatus: p.feedbackStatus,
        ...(p.agentRole ? { agentRole: p.agentRole } : {}),
      });
    });
    return items;
  }

  const items: ChatItem[] = [];
  let userIndex = 0;
  let agentRoundIndex = 0;

  for (const msg of messages) {
    if (msg.role === 'user' && msg.content) {
      items.push({ id: `user-${userIndex++}`, kind: 'user', text: msg.content });
    } else if (msg.role === 'assistant' && msg.content) {
      const pe = progressEvents[agentRoundIndex];
      items.push({
        id: `agent-${agentRoundIndex}`,
        kind: 'agent',
        round: pe?.round ?? agentRoundIndex + 1,
        text: msg.content,
        actions: pe?.actions,
        feedbackStatus: pe?.feedbackStatus,
        ...(pe?.agentRole ? { agentRole: pe.agentRole } : {}),
      });
      agentRoundIndex++;
    }
  }

  return items;
}

function roleStatusLabel(status: RoleStatus): string {
  const map: Record<RoleStatus, string> = {
    idle: '空闲',
    running: '运行中',
    waiting: '等待',
    done: '完成',
    blocked: '阻塞',
    error: '错误',
  };
  return map[status];
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

function FileTreeNodeView({
  node,
  depth,
  modifiedPaths,
  selectedPath,
  onFileClick,
}: {
  node: FileTreeNode;
  depth: number;
  modifiedPaths: Set<string>;
  selectedPath?: string | null;
  onFileClick: (path: string) => void;
}) {
  const [open, setOpen] = useState(depth < 2);
  const isFolder = node.type === 'folder';
  const modified = modifiedPaths.has(node.path);
  const Icon = isFolder
    ? Folder
    : node.name.endsWith('.ts') || node.name.endsWith('.tsx')
      ? FileCode
      : node.name.endsWith('.md')
        ? FileText
        : File;

  return (
    <div>
      <div
        className={`file-tree-item ${modified ? 'modified' : ''} ${selectedPath === node.path ? 'selected' : ''}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => (isFolder ? setOpen(!open) : onFileClick(node.path))}
      >
        <Icon size={14} />
        <span>{node.name}</span>
        {modified && <span className="modified-dot" />}
      </div>
      {isFolder && open && node.children?.map((child) => (
        <FileTreeNodeView
          key={child.path}
          node={child}
          depth={depth + 1}
          modifiedPaths={modifiedPaths}
          selectedPath={selectedPath}
          onFileClick={onFileClick}
        />
      ))}
    </div>
  );
}

function RoleStatusDot({ status }: { status: RoleStatus }) {
  if (status === 'running') return <span className="status-dot" style={{ background: 'var(--warn)' }} />;
  if (status === 'done') return <span className="status-dot active" />;
  if (status === 'blocked' || status === 'error') return <span className="status-dot error" />;
  if (status === 'waiting') return <span className="status-dot" style={{ background: 'var(--accent)' }} />;
  return <span className="status-dot idle" />;
}

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    (localStorage.getItem('harness-theme') as 'light' | 'dark') || 'light',
  );
  const [page, setPage] = useState<Page>('dashboard');
  const [task, setTask] = useState('');
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [activeSessionTask, setActiveSessionTask] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<{ path: string; content: string } | null>(null);
  const [fileViewerError, setFileViewerError] = useState<string | null>(null);
  const [orchestrateTask, setOrchestrateTask] = useState('');
  const [maxRetries, setMaxRetries] = useState(2);
  const [model, setModel] = useState(MODELS[0]);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [sessionQuery, setSessionQuery] = useState('');
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([]);
  const [fileTreeError, setFileTreeError] = useState<string | null>(null);
  const [workspacePath, setWorkspacePath] = useState('');
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const [folderPickerMode, setFolderPickerMode] = useState<'workspace' | 'import'>('workspace');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [openContextPanels, setOpenContextPanels] = useState<Record<ContextPanelKey, boolean>>({
    files: true,
    metrics: false,
    checkpoint: false,
  });
  const [panelHeights, setPanelHeights] = useState<number[]>([100]);
  const contextPanelRef = useRef<HTMLDivElement>(null);
  const resizeDragRef = useRef<{
    divider: number;
    startY: number;
    start: number[];
  } | null>(null);
  const [projectsPanelOpen, setProjectsPanelOpen] = useState(false);
  const [projects, setProjects] = useState<SavedProject[]>(() => loadProjects());
  const [projectOpen, setProjectOpen] = useState(() => Boolean(localStorage.getItem('harness-workspace')));
  const [expandedRounds, setExpandedRounds] = useState<Record<string, boolean>>({});
  const [rollbackMsg, setRollbackMsg] = useState<string | null>(null);
  const [rollbackBusy, setRollbackBusy] = useState(false);
  const [rollbackDone, setRollbackDone] = useState(false);
  const [rollbackError, setRollbackError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [composerFocused, setComposerFocused] = useState(false);

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsHost = import.meta.env.DEV ? 'localhost:3000' : window.location.host;
  const {
    connected,
    status,
    result,
    hitlRequest,
    chat,
    checkpoint,
    sendTask,
    sendOrchestrate,
    seedChat,
    orchestratorStatus,
    cancel,
    respondHITL,
    clearCheckpoint,
    clearOrchestratorStatus,
    clearResult,
  } = useWebSocket(`${protocol}//${wsHost}`);
  const { sessions, loading, error, refresh, remove } = useSessions();

  const busy = BUSY.has(status);

  useEffect(() => {
    if (result || status === 'error' || status === 'cancelled') {
      void refresh();
    }
  }, [result, status, refresh]);

  useEffect(() => {
    if (result?.sessionId != null && activeSessionId == null) {
      setActiveSessionId(result.sessionId);
      const match = sessions.find((s) => s.id === result.sessionId);
      if (match) {
        setActiveSessionTask(match.task);
      } else {
        const firstUser = chat.find((it) => it.kind === 'user');
        if (firstUser?.text) setActiveSessionTask(firstUser.text);
      }
    }
  }, [result, activeSessionId, sessions, chat]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('harness-theme', theme);
  }, [theme]);

  useEffect(() => {
    const saved = localStorage.getItem('harness-workspace');
    if (saved) {
      void setWorkspaceRoot(saved)
        .then((abs) => {
          setWorkspacePath(abs);
          setProjectOpen(true);
          setProjects(upsertProject(abs));
        })
        .catch(() => {
          localStorage.removeItem('harness-workspace');
          setProjectOpen(false);
          void getWorkspaceRoot().then(setWorkspacePath).catch(() => undefined);
        });
      return;
    }
    void getWorkspaceRoot()
      .then(setWorkspacePath)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (page !== 'session' || !projectOpen) {
      if (!projectOpen) setFileTree([]);
      return;
    }
    void listWorkspaceFiles()
      .then((tree) => {
        setFileTree(tree);
        setFileTreeError(null);
      })
      .catch((err) => setFileTreeError(err instanceof Error ? err.message : String(err)));
  }, [page, checkpoint, workspacePath, projectOpen]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const drag = resizeDragRef.current;
      const panel = contextPanelRef.current;
      if (!drag || !panel) return;
      const height = panel.getBoundingClientRect().height;
      if (height <= 0) return;
      const deltaPct = ((e.clientY - drag.startY) / height) * 100;
      const next = [...drag.start];
      const i = drag.divider;
      let a = drag.start[i] + deltaPct;
      let b = drag.start[i + 1] - deltaPct;
      if (a < CONTEXT_SECTION_MIN) {
        b -= CONTEXT_SECTION_MIN - a;
        a = CONTEXT_SECTION_MIN;
      }
      if (b < CONTEXT_SECTION_MIN) {
        a -= CONTEXT_SECTION_MIN - b;
        b = CONTEXT_SECTION_MIN;
      }
      if (a < CONTEXT_SECTION_MIN || b < CONTEXT_SECTION_MIN) return;
      next[i] = a;
      next[i + 1] = b;
      setPanelHeights(next);
    };
    const onUp = () => {
      if (!resizeDragRef.current) return;
      resizeDragRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const openContextOrder = CONTEXT_PANEL_ORDER.filter((key) => openContextPanels[key]);

  useEffect(() => {
    const n = openContextOrder.length;
    if (n === 0) {
      setPanelHeights([]);
      return;
    }
    setPanelHeights(Array.from({ length: n }, () => 100 / n));
  }, [openContextOrder.join('|')]);

  const startSectionResize = useCallback((divider: number, e: ReactMouseEvent) => {
    e.preventDefault();
    resizeDragRef.current = {
      divider,
      startY: e.clientY,
      start: [...panelHeights],
    };
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }, [panelHeights]);

  const toggleContextPanel = (key: ContextPanelKey) => {
    setOpenContextPanels((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const closeContextPanel = (key: ContextPanelKey) => {
    setOpenContextPanels((prev) => ({ ...prev, [key]: false }));
  };

  const items = chat;
  const agentItems = items.filter((it) => it.kind === 'agent');
  const currentRound = agentItems.length;
  const toolCallCount = agentItems.reduce((n, it) => n + (it.actions?.length ?? 0), 0);
  const taskRounds = groupIntoTaskRounds(items, {
    running: busy,
    result,
    checkpointFiles: checkpoint?.files,
  });
  const displayRoundCount = taskRounds.length;
  const finalOutput = !busy ? extractFinalOutput(result, items) : '';

  useEffect(() => {
    if (!busy || taskRounds.length === 0) return;
    const lastId = taskRounds[taskRounds.length - 1].id;
    setExpandedRounds((prev) => ({ ...prev, [lastId]: true }));
  }, [busy, taskRounds.length, agentItems.length]);

  useEffect(() => {
    if (!result) return;
    // 任务结束：收缩所有轮次，只保留任务说明 + 说明摘要
    setExpandedRounds({});
  }, [result]);

  useEffect(() => {
    setRollbackDone(false);
    setRollbackError(null);
  }, [checkpoint?.id]);

  const toggleRound = (id: string) => {
    setExpandedRounds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleRollback = async () => {
    if (!checkpoint || rollbackBusy || rollbackDone) return;
    setRollbackBusy(true);
    setRollbackError(null);
    try {
      await rollbackCheckpoint(checkpoint.id);
      setRollbackDone(true);
      clearCheckpoint();
      setRollbackMsg('已回滚到本轮任务开始时的检查点');
      void listWorkspaceFiles().then(setFileTree).catch(() => undefined);
    } catch (err) {
      setRollbackError(err instanceof Error ? err.message : String(err));
    } finally {
      setRollbackBusy(false);
    }
  };
  const modifiedPaths = new Set(checkpoint?.files ?? []);

  const completedCount = sessions.filter((s) => s.status === 'completed').length;
  const errorCount = sessions.filter((s) => s.status === 'error' || s.status === 'max_rounds').length;
  const totalRounds = sessions.reduce((n, s) => n + s.rounds, 0);

  const filteredSessions = sessions.filter((s) =>
    !sessionQuery.trim() || s.task.toLowerCase().includes(sessionQuery.trim().toLowerCase()),
  );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if ((task.trim() || attachedFiles.length > 0) && !busy) {
      sendTask(task.trim(), activeSessionId != null ? { sessionId: activeSessionId } : undefined);
      setTask('');
      setAttachedFiles([]);
      setPage('session');
      setRollbackMsg(null);
    }
  };

  const handleSelectSession = async (id: number) => {
    try {
      const s = await getSession(id);
      seedChat(chatFromSession(s));
      setActiveSessionId(id);
      setActiveSessionTask(s.task);
      setDetailError(null);
      clearCheckpoint();
      clearResult();
      clearOrchestratorStatus();
      setExpandedRounds({});
      setPage('session');
    } catch {
      setDetailError('会话详情加载失败');
    }
  };

  const handleDeleteSession = async (id: number) => {
    await remove(id);
    if (activeSessionId === id) {
      setActiveSessionId(null);
      setActiveSessionTask(null);
      seedChat([]);
    }
  };

  const handleNewSession = () => {
    setActiveSessionId(null);
    setActiveSessionTask(null);
    seedChat([]);
    clearCheckpoint();
    clearResult();
    clearOrchestratorStatus();
    setRollbackMsg(null);
    setSelectedFile(null);
    setExpandedRounds({});
    setRollbackDone(false);
    setRollbackError(null);
    setPage('session');
  };

  /** 关闭仪表盘 / 多 Agent / 设置后回到最近对话 */
  const goToRecentConversation = () => {
    setProjectsPanelOpen(false);
    const recent = sessions[0];
    if (recent) {
      void handleSelectSession(recent.id);
      return;
    }
    handleNewSession();
  };

  const handleFileClick = async (path: string) => {
    try {
      const file = await getWorkspaceFile(path);
      setSelectedFile({ path: file.path, content: file.content });
      setFileViewerError(null);
    } catch {
      setFileViewerError('无法加载文件');
      setSelectedFile(null);
    }
  };

  const handleStartOrchestrate = () => {
    const t = orchestrateTask.trim();
    if (!t || busy || !connected) return;
    sendOrchestrate(t, { maxRetries });
    setOrchestrateTask('');
    setPage('session');
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
    if (!busy) setDragOver(true);
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
    if (busy) return;
    addFiles(Array.from(e.dataTransfer.files ?? []));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const openFolderPicker = (mode: 'workspace' | 'import' = 'workspace') => {
    setFolderPickerMode(mode);
    setFolderPickerOpen(true);
  };

  const handleProjectSelected = async (path: string) => {
    try {
      const abs = await setWorkspaceRoot(path);
      setWorkspacePath(abs);
      setSelectedFile(null);
      setProjectOpen(true);
      localStorage.setItem('harness-workspace', abs);
      setProjects(upsertProject(abs));
      setPage('session');
    } catch (err) {
      setFileTreeError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleCloseProject = async () => {
    try {
      await clearWorkspaceRoot();
      const root = await getWorkspaceRoot();
      setWorkspacePath(root);
      setSelectedFile(null);
      setFileTree([]);
      setProjectOpen(false);
      localStorage.removeItem('harness-workspace');
      clearCheckpoint();
    } catch (err) {
      setFileTreeError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleOpenSavedProject = async (proj: SavedProject) => {
    await handleProjectSelected(proj.path);
  };

  const handleRemoveSavedProject = (id: string) => {
    setProjects(removeProject(id));
  };

  const toggleTheme = () => setTheme((t) => (t === 'light' ? 'dark' : 'light'));

  const NAV_ITEMS: Array<{ icon: LucideIcon; label: string; page: Page; closable?: boolean }> = [
    { icon: LayoutDashboard, label: '仪表盘', page: 'dashboard', closable: true },
    { icon: MessageSquare, label: '会话', page: 'session' },
    { icon: Users, label: '多 Agent', page: 'project', closable: true },
    { icon: Settings, label: '设置', page: 'settings', closable: true },
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
      {folderPickerOpen && (
        <FolderPicker
          currentPath={workspacePath}
          title={folderPickerMode === 'import' ? '导入项目文件夹' : '打开项目文件夹'}
          confirmLabel={folderPickerMode === 'import' ? '导入此文件夹' : '打开此文件夹'}
          onClose={() => setFolderPickerOpen(false)}
          onSelected={(path) => {
            void handleProjectSelected(path);
          }}
        />
      )}

      <div className={`app-body ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
          <div className="sidebar-header">
            {!sidebarCollapsed && (
              <div className="sidebar-logo">
                <span className="logo-icon">◆</span>
                <span>Agent Harness</span>
              </div>
            )}
            <div className="sidebar-header-actions">
              <button
                type="button"
                className="theme-toggle"
                onClick={() => setSidebarCollapsed((v) => !v)}
                aria-label={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
                title={sidebarCollapsed ? '展开' : '缩进'}
              >
                {sidebarCollapsed ? <PanelLeft size={16} /> : <PanelLeftClose size={16} />}
              </button>
              {!sidebarCollapsed && (
                <button
                  type="button"
                  className="theme-toggle"
                  onClick={toggleTheme}
                  aria-label={theme === 'light' ? '切换到深色模式' : '切换到浅色模式'}
                >
                  {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
                </button>
              )}
            </div>
          </div>

          {!sidebarCollapsed && (
            <>
          <button type="button" className="new-task-btn" onClick={handleNewSession}>
            <Plus size={16} />
            新建任务
          </button>

          <nav className="sidebar-nav">
            {NAV_ITEMS.map((item) => (
              <div
                key={item.label}
                className={`nav-item-row ${page === item.page ? 'active' : ''}`}
              >
                <button
                  type="button"
                  className={`nav-item ${page === item.page ? 'active' : ''}`}
                  onClick={() => {
                    setProjectsPanelOpen(false);
                    setPage(item.page);
                  }}
                >
                  <item.icon size={18} />
                  <span>{item.label}</span>
                </button>
                {item.closable && page === item.page && (
                  <button
                    type="button"
                    className="nav-item-close"
                    onClick={(e) => {
                      e.stopPropagation();
                      goToRecentConversation();
                    }}
                    aria-label={`关闭${item.label}`}
                    title="关闭，回到最近对话"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            ))}
            <div className={`nav-item-row ${projectsPanelOpen ? 'active' : ''}`}>
              <button
                type="button"
                className={`nav-item ${projectsPanelOpen ? 'active' : ''}`}
                onClick={() => setProjectsPanelOpen(true)}
                aria-expanded={projectsPanelOpen}
              >
                <Folder size={18} />
                <span>我的项目</span>
              </button>
              {projectsPanelOpen && (
                <button
                  type="button"
                  className="nav-item-close"
                  onClick={(e) => {
                    e.stopPropagation();
                    setProjectsPanelOpen(false);
                  }}
                  aria-label="关闭我的项目"
                  title="关闭项目面板"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </nav>

          {projectsPanelOpen && (
            <div className="sidebar-projects-panel" role="region" aria-label="我的项目">
              <div className="sidebar-panel-header">
                <div className="sessions-header">
                  <Folder size={12} />
                  <span>我的项目</span>
                </div>
                <button
                  type="button"
                  className="nav-item-close"
                  onClick={() => setProjectsPanelOpen(false)}
                  aria-label="关闭我的项目"
                  title="关闭"
                >
                  <X size={12} />
                </button>
              </div>
              <div className="project-actions-row">
                <button type="button" className="header-btn" onClick={() => openFolderPicker('import')}>
                  <FolderPlus size={12} />
                  导入
                </button>
                <button type="button" className="header-btn" onClick={() => openFolderPicker('workspace')}>
                  <FolderOpen size={12} />
                  打开
                </button>
              </div>
              {projects.length === 0 && (
                <div className="sessions-empty">暂无项目，点击导入添加</div>
              )}
              <ul className="project-list">
                {projects.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className={`project-item ${projectOpen && workspacePath === p.path ? 'active' : ''}`}
                      onClick={() => void handleOpenSavedProject(p)}
                      title={p.path}
                    >
                      <span className="project-item-name">{p.name}</span>
                      <span className="project-item-path">{p.path}</span>
                    </button>
                    <button
                      type="button"
                      className="session-delete"
                      onClick={() => handleRemoveSavedProject(p.id)}
                      aria-label={`移除项目：${p.name}`}
                    >
                      <Trash2 size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="sidebar-sessions">
            <div className="sessions-header">
              <History size={12} />
              <span>最近会话</span>
            </div>
            <div className="sidebar-search">
              <Search size={14} />
              <input
                type="text"
                placeholder="搜索会话…"
                value={sessionQuery}
                onChange={(e) => setSessionQuery(e.target.value)}
              />
            </div>
            {loading && <div className="sessions-loading">加载中…</div>}
            {(error || detailError) && (
              <div className="sessions-error">
                {error ?? detailError}
                <button type="button" className="header-btn" onClick={() => void refresh()}>重试</button>
              </div>
            )}
            {!loading && !error && filteredSessions.length === 0 && (
              <div className="sessions-empty">暂无历史会话</div>
            )}
            <ul className="session-list">
              {filteredSessions.map((s) => {
                const badge = statusBadge(s.status);
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      className={`session-item ${activeSessionId === s.id ? 'active' : ''}`}
                      onClick={() => void handleSelectSession(s.id)}
                    >
                      <span className="session-task">{s.task}</span>
                      <span className="session-meta">
                        <span className={`badge ${badge.className}`}>{badge.label}</span>
                        <span>{s.rounds} 轮</span>
                        <span className="session-time">{relativeTime(s.created_at)}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="session-delete"
                      onClick={() => void handleDeleteSession(s.id)}
                      aria-label={`删除会话：${s.task}`}
                    >
                      <Trash2 size={12} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="sidebar-footer">
            <div className="user-avatar">U</div>
            <div className="user-info">
              <div className="user-name">开发者</div>
              <div className="user-plan">{connected ? '已连接' : '未连接'}</div>
            </div>
          </div>
            </>
          )}
          {sidebarCollapsed && (
            <nav className="sidebar-nav collapsed-nav">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  className={`nav-item icon-only ${page === item.page ? 'active' : ''}`}
                  onClick={() => {
                    setProjectsPanelOpen(false);
                    setPage(item.page);
                  }}
                  title={item.label}
                >
                  <item.icon size={18} />
                </button>
              ))}
              <button
                type="button"
                className={`nav-item icon-only ${projectsPanelOpen ? 'active' : ''}`}
                onClick={() => {
                  setSidebarCollapsed(false);
                  setProjectsPanelOpen(true);
                }}
                title="我的项目"
              >
                <Folder size={18} />
              </button>
            </nav>
          )}
        </aside>

        <main className="main-area">
          {page === 'dashboard' && (
            <div className="page-dashboard">
              <div className="dashboard-header">
                <div className="dashboard-header-main">
                  <h1 className="dashboard-title">仪表盘</h1>
                  <p className="dashboard-subtitle">基于真实会话数据的工作负载概览</p>
                </div>
                <button
                  type="button"
                  className="header-btn page-close-btn"
                  onClick={goToRecentConversation}
                  title="关闭，回到最近对话"
                  aria-label="关闭仪表盘"
                >
                  <X size={14} />
                  关闭
                </button>
              </div>

              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-label">会话总数</div>
                  <div className="stat-value">{sessions.length}</div>
                  <div className="stat-change up">来自 SQLite</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">完成任务</div>
                  <div className="stat-value">{completedCount}</div>
                  <div className="stat-change up">
                    {sessions.length ? `${Math.round((completedCount / sessions.length) * 100)}%` : '0%'} 完成率
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">失败 / 超限</div>
                  <div className="stat-value">{errorCount}</div>
                  <div className={`stat-change ${errorCount ? 'down' : 'up'}`}>
                    {errorCount ? '需关注' : '状态良好'}
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">累计轮次</div>
                  <div className="stat-value">{totalRounds}</div>
                  <div className="stat-change up">任务轮次 {displayRoundCount} · 工具 {toolCallCount}</div>
                </div>
              </div>

              <h2 className="section-title">最近会话</h2>
              <div className="projects-grid">
                {sessions.slice(0, 6).map((s) => {
                  const badge = statusBadge(s.status);
                  return (
                    <div key={s.id} className="project-card" onClick={() => void handleSelectSession(s.id)}>
                      <div className="project-icon blue"><Zap size={20} /></div>
                      <div className="project-name">{s.task}</div>
                      <div className="project-desc">{s.rounds} 轮 · {relativeTime(s.created_at)}</div>
                      <div className="project-meta">
                        <span className={`badge ${badge.className}`}>{badge.label}</span>
                      </div>
                    </div>
                  );
                })}
                {sessions.length === 0 && (
                  <div className="project-card" onClick={handleNewSession}>
                    <div className="project-icon purple"><Plus size={20} /></div>
                    <div className="project-name">还没有会话</div>
                    <div className="project-desc">点击新建任务，开始第一次 Agent 运行</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {page === 'session' && (
            <div className="page-session">
              <div className="session-header">
                <div className="session-header-left">
                  <h2 className="session-title">{activeSessionTask ?? '新会话'}</h2>
                  {activeSessionId != null && (
                    <span className="session-resume-badge">续跑 · #{activeSessionId}</span>
                  )}
                  <span className={`session-status ${status}`}>
                    {status === 'running'
                      ? `运行中 · 第 ${displayRoundCount || 1} 轮`
                      : status}
                  </span>
                </div>
                <div className="session-header-right">
                  <button type="button" className="header-btn" onClick={handleNewSession}>
                    <RotateCcw size={14} />
                    新会话
                  </button>
                </div>
              </div>

              <div className="session-content">
                <div className="chat-panel">
                  <div className="chat-messages">
                    <TaskRoundList
                      rounds={taskRounds}
                      expanded={expandedRounds}
                      onToggle={toggleRound}
                      checkpoint={checkpoint}
                      onRollback={() => void handleRollback()}
                      rollbackBusy={rollbackBusy}
                      rollbackDone={rollbackDone}
                      rollbackError={rollbackError}
                    />
                    {finalOutput && (
                      <FinalResultCard content={finalOutput} status={result?.status} />
                    )}
                    {rollbackMsg && (
                      <div className="message agent">
                        <div className="message-bubble">{rollbackMsg}</div>
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
                      className={`composer ${dragOver ? 'drag-over' : ''} ${composerFocused ? 'expanded' : ''}`}
                      onSubmit={handleSubmit}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onFocusCapture={() => setComposerFocused(true)}
                      onBlurCapture={(e) => {
                        const next = e.relatedTarget as Node | null;
                        if (!e.currentTarget.contains(next)) setComposerFocused(false);
                      }}
                    >
                      <input ref={fileInputRef} type="file" multiple hidden onChange={handleFiles} />
                      <button type="button" className="composer-icon" onClick={handleAttach} disabled={busy}>
                        <Paperclip size={18} />
                      </button>
                      <div className="prompt-wrap">
                        <textarea
                          value={task}
                          onChange={(e) => setTask(e.target.value)}
                          onKeyDown={handleKeyDown}
                          placeholder={activeSessionId != null ? '继续输入以接着干…' : '输入编码任务…'}
                          disabled={busy}
                          rows={1}
                        />
                      </div>
                      <button type="button" className="composer-icon" disabled={busy} title="语音输入（待接入）">
                        <Mic size={18} />
                      </button>
                      <div className="composer-actions">
                        <div className="model-select">
                          <button type="button" className="model-trigger" onClick={() => setModelMenuOpen((v) => !v)} disabled={busy}>
                            {model} <ChevronDown size={12} />
                          </button>
                          {modelMenuOpen && (
                            <ul className="model-menu">
                              {MODELS.map((m) => (
                                <li key={m}>
                                  <button type="button" onClick={() => { setModel(m); setModelMenuOpen(false); }}>{m}</button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        <button
                          type="submit"
                          className="send-btn"
                          disabled={busy || !connected || (!task.trim() && attachedFiles.length === 0)}
                        >
                          <Send size={16} />
                        </button>
                        {busy && (
                          <button type="button" className="header-btn" onClick={cancel}>取消</button>
                        )}
                      </div>
                    </form>
                  </div>
                </div>

                <div className={`context-panel ${openContextOrder.length === 0 ? 'rail-only' : ''}`}>
                  <aside className="context-icon-rail" aria-label="工作区面板">
                    {CONTEXT_DOCK_ITEMS.map((item) => {
                      const Icon = item.icon;
                      const active = openContextPanels[item.key];
                      return (
                        <button
                          key={item.key}
                          type="button"
                          className={`context-dock-btn ${active ? 'active' : ''}`}
                          onClick={() => toggleContextPanel(item.key)}
                          aria-pressed={active}
                          aria-label={item.label}
                        >
                          <Icon size={18} />
                          <span className="context-dock-tooltip" role="tooltip">
                            <strong>{item.label}</strong>
                            <span>{item.hint}</span>
                          </span>
                        </button>
                      );
                    })}
                  </aside>

                  {openContextOrder.length > 0 && (
                    <div className="context-panel-body" ref={contextPanelRef}>
                      {openContextOrder.map((key, index) => {
                        const meta = CONTEXT_DOCK_ITEMS.find((item) => item.key === key)!;
                        const TitleIcon = meta.icon;
                        return (
                          <Fragment key={key}>
                            {index > 0 && (
                              <div
                                className="context-resize-handle"
                                onMouseDown={(e) => startSectionResize(index - 1, e)}
                                role="separator"
                                aria-orientation="horizontal"
                                aria-label={`调整${CONTEXT_DOCK_ITEMS.find((i) => i.key === openContextOrder[index - 1])?.label}与${meta.label}高度`}
                              />
                            )}
                            <div
                              className={`context-section context-${key}`}
                              style={{ flexBasis: `${panelHeights[index] ?? 100 / openContextOrder.length}%` }}
                            >
                              <div className="context-section-title-row">
                                <h3 className="context-section-title">
                                  <TitleIcon size={14} />
                                  {meta.label}
                                </h3>
                                <button
                                  type="button"
                                  className="context-section-close"
                                  onClick={() => closeContextPanel(key)}
                                  aria-label={`关闭${meta.label}`}
                                  title="关闭"
                                >
                                  <X size={14} />
                                </button>
                              </div>

                              {key === 'files' && (
                                <>
                                  <div className="workspace-bar">
                                    <span className="workspace-path" title={workspacePath || '未选择'}>
                                      {projectOpen ? (workspacePath || '未选择工作区') : '当前未打开项目'}
                                    </span>
                                    <button
                                      type="button"
                                      className="header-btn"
                                      onClick={() => openFolderPicker('workspace')}
                                      title="打开文件夹"
                                    >
                                      <FolderOpen size={14} />
                                    </button>
                                    <button
                                      type="button"
                                      className="header-btn"
                                      onClick={() => void handleCloseProject()}
                                      disabled={!projectOpen}
                                      title="关闭当前项目"
                                    >
                                      <FolderX size={14} />
                                    </button>
                                  </div>
                                  <div className="file-tree-scroll">
                                    {!projectOpen ? (
                                      <div className="sessions-empty">请从左侧导入或打开项目</div>
                                    ) : selectedFile ? (
                                      <div className="file-viewer">
                                        <div className="file-viewer-head">
                                          <span className="file-viewer-path" title={selectedFile.path}>{selectedFile.path}</span>
                                          <button
                                            type="button"
                                            className="file-viewer-close"
                                            onClick={() => setSelectedFile(null)}
                                            aria-label="关闭文件查看器"
                                          >
                                            <X size={14} />
                                          </button>
                                        </div>
                                        <pre className="file-viewer-content">{selectedFile.content}</pre>
                                      </div>
                                    ) : (
                                      <>
                                        {fileTreeError && <div className="sessions-error">{fileTreeError}</div>}
                                        {fileViewerError && <div className="sessions-error">{fileViewerError}</div>}
                                        {!fileTreeError && fileTree.length === 0 && (
                                          <div className="sessions-empty">加载文件树中…</div>
                                        )}
                                        <div className="file-tree">
                                          {fileTree.map((node) => (
                                            <FileTreeNodeView
                                              key={node.path}
                                              node={node}
                                              depth={0}
                                              modifiedPaths={modifiedPaths}
                                              selectedPath={null}
                                              onFileClick={(path) => void handleFileClick(path)}
                                            />
                                          ))}
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </>
                              )}

                              {key === 'metrics' && (
                                <div className="context-section-body">
                                  <div className="token-bar">
                                    <div className="token-label">
                                      <span>任务轮次</span>
                                      <span>{displayRoundCount}</span>
                                    </div>
                                    <div className="token-label">
                                      <span>工具调用</span>
                                      <span>{toolCallCount}</span>
                                    </div>
                                    <div className="token-label">
                                      <span>变更文件</span>
                                      <span>{checkpoint?.files.length ?? 0}</span>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {key === 'checkpoint' && (
                                <div className="context-section-body">
                                  <DiffPanel
                                    checkpoint={checkpoint}
                                    onRolledBack={() => {
                                      setRollbackDone(true);
                                      clearCheckpoint();
                                      setRollbackMsg('已回滚到本轮任务开始时的检查点');
                                      void listWorkspaceFiles().then(setFileTree).catch(() => undefined);
                                    }}
                                  />
                                </div>
                              )}
                            </div>
                          </Fragment>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {page === 'project' && (
            <div className="page-project">
              <div className="project-header">
                <h1 className="project-title">Coding Agent Harness</h1>
                <div className="project-actions">
                  <button
                    type="button"
                    className="header-btn page-close-btn"
                    onClick={goToRecentConversation}
                    title="关闭，回到最近对话"
                    aria-label="关闭多 Agent"
                  >
                    <X size={14} />
                    关闭
                  </button>
                  <button type="button" className="header-btn" onClick={() => setPage('settings')}>
                    <Settings size={14} />
                    配置
                  </button>
                  <button type="button" className="header-btn" onClick={handleNewSession}>
                    <Plus size={14} />
                    新会话
                  </button>
                </div>
              </div>

              <div className="orchestrate-form">
                <textarea
                  value={orchestrateTask}
                  onChange={(e) => setOrchestrateTask(e.target.value)}
                  placeholder="输入编排任务…"
                  rows={2}
                  disabled={busy}
                />
                <div className="orchestrate-controls">
                  <label className="orchestrate-retries">
                    最大重试
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={maxRetries}
                      onChange={(e) => setMaxRetries(Math.max(0, Number(e.target.value) || 0))}
                      disabled={busy}
                    />
                  </label>
                  <button
                    type="button"
                    className="orchestrate-start"
                    onClick={handleStartOrchestrate}
                    disabled={busy || !connected || !orchestrateTask.trim()}
                  >
                    <Send size={14} />
                    启动编排
                  </button>
                </div>
                {orchestratorStatus && (
                  <div className="orchestrator-meta">
                    <span>阶段：{orchestratorStatus.phase}</span>
                    <span>重试 {orchestratorStatus.retryCount}/{orchestratorStatus.maxRetries}</span>
                    {orchestratorStatus.lastGate && (
                      <span className="orchestrator-gate">
                        门禁：{orchestratorStatus.lastGate.from} — {orchestratorStatus.lastGate.reason}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="agents-grid">
                {ORCHESTRATOR_ROLES.map((agent) => {
                  const roleStatus = orchestratorStatus?.roles[agent.key] ?? 'idle';
                  return (
                    <div key={agent.key} className={`agent-card role-${roleStatus}`}>
                      <div className="agent-header">
                        <div className={`agent-avatar ${agent.avatar}`}>{agent.name[0]}</div>
                        <div className="agent-info">
                          <div className="agent-name">{agent.name}</div>
                          <div className="agent-role">{agent.desc}</div>
                        </div>
                        <div className={`agent-status role-${roleStatus}`}>
                          <RoleStatusDot status={roleStatus} />
                          {roleStatusLabel(roleStatus)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <h2 className="section-title">真实会话活动</h2>
              <div className="activity-feed">
                {sessions.slice(0, 8).map((s) => {
                  const badge = statusBadge(s.status);
                  return (
                    <div key={s.id} className="activity-item">
                      <div className={`activity-icon ${badge.className === 'ok' ? 'green' : 'blue'}`}>◆</div>
                      <div className="activity-content">
                        <div className="activity-text">{s.task}</div>
                        <div className="activity-time">{badge.label} · {s.rounds} 轮 · {relativeTime(s.created_at)}</div>
                      </div>
                    </div>
                  );
                })}
                {sessions.length === 0 && (
                  <div className="sessions-empty">暂无活动记录</div>
                )}
              </div>
            </div>
          )}

          {page === 'settings' && (
            <div className="page-dashboard">
              <div className="dashboard-header">
                <div className="dashboard-header-main">
                  <h1 className="dashboard-title">设置</h1>
                  <p className="dashboard-subtitle">主题、连接状态与运行环境</p>
                </div>
                <button
                  type="button"
                  className="header-btn page-close-btn"
                  onClick={goToRecentConversation}
                  title="关闭，回到最近对话"
                  aria-label="关闭设置"
                >
                  <X size={14} />
                  关闭
                </button>
              </div>

              <div className="settings-grid">
                <div className="stat-card">
                  <div className="stat-label">外观主题</div>
                  <div className="settings-row">
                    <span>{theme === 'light' ? '浅色模式' : '深色模式'}</span>
                    <button type="button" className="header-btn" onClick={toggleTheme}>
                      {theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
                      切换
                    </button>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">后端连接</div>
                  <div className="settings-row">
                    <span>{connected ? 'WebSocket 已连接' : '未连接'}</span>
                    <span className={`badge ${connected ? 'ok' : 'bad'}`}>{connected ? '在线' : '离线'}</span>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">默认模型</div>
                  <div className="settings-row">
                    <span>{model}</span>
                    <div className="model-select">
                      <button type="button" className="model-trigger" onClick={() => setModelMenuOpen((v) => !v)}>
                        更换 <ChevronDown size={12} />
                      </button>
                      {modelMenuOpen && (
                        <ul className="model-menu">
                          {MODELS.map((m) => (
                            <li key={m}>
                              <button type="button" onClick={() => { setModel(m); setModelMenuOpen(false); }}>{m}</button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">会话存储</div>
                  <div className="settings-row">
                    <span>{sessions.length} 条记录</span>
                    <button type="button" className="header-btn" onClick={() => void refresh()}>刷新</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
