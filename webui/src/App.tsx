import { useCallback, useEffect, useRef, useState, Fragment, type FormEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useSessions } from './hooks/useSessions';
import { getSession } from './api/sessions';
import { getWorkspaceFile, getWorkspaceRoot, listWorkspaceFiles, setWorkspaceRoot, clearWorkspaceRoot } from './api/workspace';
import { rollbackCheckpoint } from './api/checkpoint';
import { saveCredential, getCredentialStatus, deleteCredential } from './api/credentials';
import { HITLModal } from './components/HITLModal';
import { DiffPanel } from './components/DiffPanel';
import { FolderPicker } from './components/FolderPicker';
import { TaskRoundList, groupIntoTaskRounds } from './components/TaskRoundList';
import { loadProjects, upsertProject, removeProject, type SavedProject } from './lib/projects';
import {
  Home,
  MessageSquare,
  Folder,
  Settings,
  Sun,
  Moon,
  Plus,
  Paperclip,
  Mic,
  ChevronDown,
  Send,
  FileCode,
  FileText,
  File,
  Clock,
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
  Eye,
  EyeOff,
  type LucideIcon,
} from 'lucide-react';
import type { AgentRole, ChatItem, FileTreeNode, SessionRecord } from './types';

const BUSY = new Set(['running']);
const MODELS = ['K2.5', 'K2.5 Agent', 'K1.5'];
const CONTEXT_SECTION_MIN = 14;
const PROMPT_CHIPS = [
  '写一个带测试的函数',
  '修复这个 bug',
  '重构这段代码',
  '生成单元测试',
];

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
        ...(p.feedback ? { feedback: p.feedback } : {}),
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
        ...(pe?.feedback ? { feedback: pe.feedback } : {}),
        ...(pe?.agentRole ? { agentRole: pe.agentRole } : {}),
      });
      agentRoundIndex++;
    }
  }

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
    max_rounds: { label: '达到轮次上限', className: 'warn' },
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
  const [maxRetries] = useState(2);
  const [selectedRoles, setSelectedRoles] = useState<AgentRole[]>(['coder']);
  const [model, setModel] = useState(MODELS[0]);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
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
  const chatMessagesRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const resizeDragRef = useRef<{
    divider: number;
    startY: number;
    start: number[];
  } | null>(null);
  const colDragRef = useRef<
    | { kind: 'sidebar'; startX: number; startW: number }
    | { kind: 'context'; startX: number; startW: number }
    | null
  >(null);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const n = Number(localStorage.getItem('harness-sidebar-w'));
    return Number.isFinite(n) && n >= 200 && n <= 420 ? n : 240;
  });
  const [contextBodyWidth, setContextBodyWidth] = useState(() => {
    const n = Number(localStorage.getItem('harness-context-w'));
    return Number.isFinite(n) && n >= 200 && n <= 520 ? n : 300;
  });
  const sidebarWidthRef = useRef(sidebarWidth);
  const contextBodyWidthRef = useRef(contextBodyWidth);
  sidebarWidthRef.current = sidebarWidth;
  contextBodyWidthRef.current = contextBodyWidth;
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
  const [credentialStatus, setCredentialStatus] = useState<boolean | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [credentialMessage, setCredentialMessage] = useState<string | null>(null);
  const [credentialLoading, setCredentialLoading] = useState(false);

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
    if (page !== 'settings') return;
    void getCredentialStatus()
      .then(setCredentialStatus)
      .catch(() => setCredentialStatus(null));
  }, [page]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const sectionDrag = resizeDragRef.current;
      const panel = contextPanelRef.current;
      if (sectionDrag && panel) {
        const height = panel.getBoundingClientRect().height;
        if (height > 0) {
          const deltaPct = ((e.clientY - sectionDrag.startY) / height) * 100;
          const next = [...sectionDrag.start];
          const i = sectionDrag.divider;
          let a = sectionDrag.start[i] + deltaPct;
          let b = sectionDrag.start[i + 1] - deltaPct;
          if (a < CONTEXT_SECTION_MIN) {
            b -= CONTEXT_SECTION_MIN - a;
            a = CONTEXT_SECTION_MIN;
          }
          if (b < CONTEXT_SECTION_MIN) {
            a -= CONTEXT_SECTION_MIN - b;
            b = CONTEXT_SECTION_MIN;
          }
          if (a >= CONTEXT_SECTION_MIN && b >= CONTEXT_SECTION_MIN) {
            next[i] = a;
            next[i + 1] = b;
            setPanelHeights(next);
          }
        }
      }

      const colDrag = colDragRef.current;
      if (colDrag?.kind === 'sidebar') {
        const next = Math.min(420, Math.max(200, colDrag.startW + (e.clientX - colDrag.startX)));
        setSidebarWidth(next);
      } else if (colDrag?.kind === 'context') {
        // Dragging the left edge of the right panel: moving left increases width.
        const next = Math.min(520, Math.max(200, colDrag.startW + (colDrag.startX - e.clientX)));
        setContextBodyWidth(next);
      }
    };
    const onUp = () => {
      if (resizeDragRef.current) {
        resizeDragRef.current = null;
      }
      if (colDragRef.current) {
        const kind = colDragRef.current.kind;
        colDragRef.current = null;
        if (kind === 'sidebar') {
          localStorage.setItem('harness-sidebar-w', String(sidebarWidthRef.current));
        } else {
          localStorage.setItem('harness-context-w', String(contextBodyWidthRef.current));
        }
      }
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.body.classList.remove('is-col-resizing');
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const startSidebarResize = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    colDragRef.current = { kind: 'sidebar', startX: e.clientX, startW: sidebarWidth };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.body.classList.add('is-col-resizing');
  }, [sidebarWidth]);

  const startContextColResize = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    colDragRef.current = { kind: 'context', startX: e.clientX, startW: contextBodyWidth };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.body.classList.add('is-col-resizing');
  }, [contextBodyWidth]);

  const scrollChatToBottom = useCallback((force = false) => {
    const el = chatMessagesRef.current;
    if (!el) return;
    if (!force && !stickToBottomRef.current) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, []);

  const onChatScroll = useCallback(() => {
    const el = chatMessagesRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = dist < 80;
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

  useEffect(() => {
    if (!busy || taskRounds.length === 0) return;
    const lastId = taskRounds[taskRounds.length - 1].id;
    setExpandedRounds((prev) => ({ ...prev, [lastId]: true }));
  }, [busy, taskRounds.length, agentItems.length]);

  useEffect(() => {
    if (!result) return;
    setExpandedRounds({});
  }, [result]);

  useEffect(() => {
    scrollChatToBottom();
  }, [items.length, agentItems.length, rollbackMsg, busy, scrollChatToBottom]);

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

  const filteredSessions = sessions.filter((s) =>
    !sessionQuery.trim() || s.task.toLowerCase().includes(sessionQuery.trim().toLowerCase()),
  );

  const toggleSessionRole = (role: AgentRole) => {
    setSelectedRoles((prev) => {
      if (prev.includes(role)) {
        if (prev.length <= 1) return prev;
        return prev.filter((r) => r !== role);
      }
      const order: AgentRole[] = ['coder', 'reviewer', 'tester'];
      return order.filter((r) => r === role || prev.includes(r));
    });
  };

  const roleTriggerLabel =
    selectedRoles.length === 1
      ? (ORCHESTRATOR_ROLES.find((a) => a.key === selectedRoles[0])?.name.replace(' Agent', '') ?? '角色')
      : `${selectedRoles.length} 角色`;

  const roleSelectControl = (
    <div className="model-select role-select">
      <button
        type="button"
        className="model-trigger"
        onClick={() => {
          setRoleMenuOpen((v) => !v);
          setModelMenuOpen(false);
        }}
        disabled={busy}
        title={`角色：${selectedRoles.join(', ')}（可多选）`}
      >
        <span className="model-trigger-label">{roleTriggerLabel}</span>
        {' '}
        <ChevronDown size={12} />
      </button>
      {roleMenuOpen && (
        <ul className="model-menu role-menu">
          {ORCHESTRATOR_ROLES.map((agent) => {
            const on = selectedRoles.includes(agent.key);
            return (
              <li key={agent.key}>
                <button
                  type="button"
                  className={on ? 'active' : ''}
                  onClick={() => toggleSessionRole(agent.key)}
                >
                  <span className="role-menu-row">
                    <span className="role-menu-check" aria-hidden>{on ? '✓' : ''}</span>
                    <span>
                      <span className="role-menu-name">{agent.name.replace(' Agent', '')}</span>
                      <span className="role-menu-desc">{agent.desc}</span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  const dispatchSessionTask = (text: string, sessionOpts?: { sessionId?: number }) => {
    const roles = selectedRoles.length > 0 ? selectedRoles : (['coder'] as AgentRole[]);
    if (roles.length === 1) {
      sendTask(text, { ...sessionOpts, agentRole: roles[0] });
    } else {
      sendOrchestrate(text, { ...sessionOpts, roles, maxRetries });
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if ((task.trim() || attachedFiles.length > 0) && !busy) {
      stickToBottomRef.current = true;
      const text = task.trim();
      const fromHome = page === 'dashboard';

      if (fromHome) {
        setActiveSessionId(null);
        setActiveSessionTask(text || null);
        seedChat([]);
        clearCheckpoint();
        clearResult();
        clearOrchestratorStatus();
        setSelectedFile(null);
        setExpandedRounds({});
        setRollbackDone(false);
        setRollbackError(null);
        dispatchSessionTask(text);
      } else {
        dispatchSessionTask(
          text,
          activeSessionId != null ? { sessionId: activeSessionId } : undefined,
        );
      }

      setTask('');
      setAttachedFiles([]);
      setPage('session');
      setRollbackMsg(null);
      scrollChatToBottom(true);
    }
  };

  const openRoleSession = (role: AgentRole) => {
    setSelectedRoles([role]);
    setActiveSessionId(null);
    setActiveSessionTask(null);
    seedChat([]);
    clearCheckpoint();
    clearResult();
    clearOrchestratorStatus();
    setExpandedRounds({});
    setRollbackDone(false);
    setRollbackError(null);
    setPage('session');
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

  const openHome = () => {
    setProjectsPanelOpen(false);
    setPage('dashboard');
  };

  const openSessions = () => {
    setProjectsPanelOpen(false);
    goToRecentConversation();
  };

  const RAIL_ITEMS: Array<{ icon: LucideIcon; label: string; active: boolean; onClick: () => void }> = [
    { icon: Home, label: 'Home', active: page === 'dashboard', onClick: openHome },
    { icon: MessageSquare, label: '会话', active: page === 'session', onClick: openSessions },
    { icon: Folder, label: '项目', active: page === 'project' || projectsPanelOpen, onClick: () => { setProjectsPanelOpen(false); setPage('project'); } },
    { icon: Settings, label: '设置', active: page === 'settings', onClick: () => { setProjectsPanelOpen(false); setPage('settings'); } },
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

      <aside className="app-rail" aria-label="主导航">
        <button
          type="button"
          className="app-rail-logo"
          onClick={openHome}
          title="Coding Agent Harness"
          aria-label="回到首页"
        >
          ◆
        </button>
        <nav className="app-rail-nav">
          {RAIL_ITEMS.map((item) => (
            <button
              key={item.label}
              type="button"
              className={`app-rail-btn ${item.active ? 'active' : ''}`}
              onClick={item.onClick}
            >
              <item.icon size={20} strokeWidth={1.75} fill={item.active ? 'currentColor' : 'none'} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="app-rail-foot">
          <button
            type="button"
            className="app-rail-btn"
            onClick={toggleTheme}
            aria-label={theme === 'light' ? '切换到深色模式' : '切换到浅色模式'}
          >
            {theme === 'light' ? <Moon size={18} strokeWidth={1.75} /> : <Sun size={18} strokeWidth={1.75} />}
            <span>{theme === 'light' ? '深色' : '浅色'}</span>
          </button>
        </div>
      </aside>

      <div className="app-canvas">
        <button type="button" className="app-page-brand" onClick={openHome}>
          Coding Agent Harness
        </button>
        <div className="app-stage">
      <div
        className={`app-body ${page !== 'session' ? 'no-sidebar' : ''} ${page === 'session' && sidebarCollapsed ? 'sidebar-collapsed' : ''}`}
        style={
          page === 'session'
            ? {
                gridTemplateColumns: sidebarCollapsed
                  ? '56px minmax(0, 1fr)'
                  : `${sidebarWidth}px minmax(0, 1fr)`,
              }
            : undefined
        }
      >
        {page === 'session' && (
        <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
          {!sidebarCollapsed && (
            <div
              className="col-resize-handle sidebar-col-handle"
              onMouseDown={startSidebarResize}
              role="separator"
              aria-orientation="vertical"
              aria-label="调整左侧边栏宽度"
            />
          )}
          <div className="sidebar-header">
            {!sidebarCollapsed && (
              <div className="sidebar-logo">
                <span className="sidebar-logo-text">会话</span>
              </div>
            )}
            <div className="sidebar-header-actions">
              <button
                type="button"
                className="theme-toggle"
                onClick={() => setSidebarCollapsed((v) => !v)}
                aria-label={sidebarCollapsed ? '展开会话列表' : '收起会话列表'}
                title={sidebarCollapsed ? '展开' : '缩进'}
              >
                {sidebarCollapsed ? <PanelLeft size={16} /> : <PanelLeftClose size={16} />}
              </button>
            </div>
          </div>

          {!sidebarCollapsed && (
            <>
          <button type="button" className="new-task-btn" onClick={handleNewSession}>
            <Plus size={16} />
            新建任务
          </button>

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
            {loading && (
              <div className="sessions-loading">
                <div className="skeleton-row" style={{ width: '80%', marginBottom: '8px' }} />
                <div className="skeleton-row" style={{ width: '60%', marginBottom: '8px' }} />
                <div className="skeleton-row" style={{ width: '70%' }} />
              </div>
            )}
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
        </aside>
        )}

        <main className="main-area">
          {page === 'dashboard' && (
            <div className="page-home">
              <div className="home-ask">
                <h1 className="home-greet">想做什么？</h1>
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
                      placeholder="描述一项具体编码任务（目标、约束、验收标准）…"
                      disabled={busy}
                      rows={2}
                    />
                  </div>
                  <div className="composer-actions">
                    {roleSelectControl}
                    <div className="model-select">
                      <button
                        type="button"
                        className="model-trigger"
                        onClick={() => {
                          setModelMenuOpen((v) => !v);
                          setRoleMenuOpen(false);
                        }}
                        disabled={busy}
                        title={model}
                      >
                        <span className="model-trigger-label">{model}</span> <ChevronDown size={12} />
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
                <div className="home-chips">
                  {PROMPT_CHIPS.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      className="home-chip"
                      onClick={() => setTask(chip)}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {page === 'session' && (
            <div className="page-session">
              <div className="session-header">
                <div className="session-header-left">
                  <h2 className="session-title">{activeSessionTask ?? '新会话'}</h2>
                  <div className="session-role-summary">
                    {selectedRoles.map((r) => (
                      <span key={r} className="session-role-tag">{r}</span>
                    ))}
                  </div>
                  {status === 'running' && (
                    <span className="session-status running">
                      运行中
                      {orchestratorStatus ? ` · ${orchestratorStatus.phase}` : ''}
                    </span>
                  )}
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
                  <div className="chat-messages" ref={chatMessagesRef} onScroll={onChatScroll}>
                    <TaskRoundList
                      rounds={taskRounds}
                      expanded={expandedRounds}
                      onToggle={toggleRound}
                      checkpoint={checkpoint}
                      onRollback={() => void handleRollback()}
                      rollbackBusy={rollbackBusy}
                      rollbackDone={rollbackDone}
                      rollbackError={rollbackError}
                      feedbackHistory={result?.feedbackHistory}
                    />
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
                          placeholder={
                            activeSessionId != null
                              ? '补充要求、指出问题，或给出下一步验收标准…'
                              : '描述一项具体编码任务（目标、约束、验收标准）…'
                          }
                          disabled={busy}
                          rows={1}
                        />
                      </div>
                      <button type="button" className="composer-icon composer-mic" disabled={busy} title="语音输入（待接入）">
                        <Mic size={18} />
                      </button>
                      <div className="composer-actions">
                        {roleSelectControl}
                        <div className="model-select">
                          <button
                            type="button"
                            className="model-trigger"
                            onClick={() => {
                              setModelMenuOpen((v) => !v);
                              setRoleMenuOpen(false);
                            }}
                            disabled={busy}
                            title={model}
                          >
                            <span className="model-trigger-label">{model}</span> <ChevronDown size={12} />
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

                <div
                  className={`context-panel ${openContextOrder.length === 0 ? 'rail-only' : ''}`}
                  style={
                    openContextOrder.length > 0
                      ? { width: 48 + contextBodyWidth, maxWidth: 'none' }
                      : undefined
                  }
                >
                  {openContextOrder.length > 0 && (
                    <div
                      className="col-resize-handle context-col-handle"
                      onMouseDown={startContextColResize}
                      role="separator"
                      aria-orientation="vertical"
                      aria-label="调整右侧面板宽度"
                    />
                  )}
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
                    <div
                      className="context-panel-body"
                      ref={contextPanelRef}
                      style={{ width: contextBodyWidth, flex: `0 0 ${contextBodyWidth}px` }}
                    >
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
                                          <div className="sessions-empty">
                                            <div className="skeleton-row" style={{ width: '90%', marginBottom: '8px' }} />
                                            <div className="skeleton-row" style={{ width: '70%', marginBottom: '8px' }} />
                                            <div className="skeleton-row" style={{ width: '50%' }} />
                                          </div>
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
                <h1 className="project-title">项目与工作区</h1>
                <div className="project-actions">
                  <button type="button" className="header-btn" onClick={() => openFolderPicker('import')}>
                    <FolderPlus size={14} />
                    导入
                  </button>
                  <button type="button" className="header-btn" onClick={() => openFolderPicker('workspace')}>
                    <FolderOpen size={14} />
                    打开
                  </button>
                </div>
              </div>

              <div className="form-split workspace-card">
                <div>
                  <div className="stat-label">当前工作区</div>
                  <p className="project-desc">{projectOpen ? (workspacePath || '未选择') : '尚未打开项目'}</p>
                  <div className="project-actions-row" style={{ marginTop: 12 }}>
                    <button type="button" className="header-btn" onClick={() => openFolderPicker('workspace')}>
                      <FolderOpen size={12} />
                      绑定文件夹
                    </button>
                    <button type="button" className="header-btn" onClick={() => void handleCloseProject()} disabled={!projectOpen}>
                      <FolderX size={12} />
                      解除
                    </button>
                  </div>
                  <div className="sessions-header" style={{ marginTop: 20 }}>
                    <Folder size={12} />
                    <span>最近项目</span>
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
                <p className="form-split-help">
                  工具只在工作区内执行。绑定本地文件夹后，Agent 的读写、搜索和测试都会限制在该目录。
                </p>
              </div>

              <div className="agents-grid">
                {ORCHESTRATOR_ROLES.map((agent) => (
                  <button
                    key={agent.key}
                    type="button"
                    className="agent-card agent-card-button"
                    onClick={() => openRoleSession(agent.key)}
                  >
                    <div className="agent-header">
                      <div className={`agent-avatar ${agent.avatar}`}>{agent.name[0]}</div>
                      <div className="agent-info">
                        <div className="agent-name">{agent.name}</div>
                        <div className="agent-role">{agent.desc}</div>
                      </div>
                      <div className="agent-status">
                        进入会话
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <h2 className="section-title">真实会话活动</h2>
              <div className="activity-feed">
                {sessions.slice(0, 8).map((s) => {
                  const badge = statusBadge(s.status);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className="activity-item"
                      onClick={() => void handleSelectSession(s.id)}
                    >
                      <div className={`activity-icon ${badge.className === 'ok' ? 'green' : 'blue'}`}>◆</div>
                      <div className="activity-content">
                        <div className="activity-text">{s.task}</div>
                        <div className="activity-time">{badge.label} · {relativeTime(s.created_at)}</div>
                      </div>
                    </button>
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
                  <p className="dashboard-subtitle">主题、连接状态、模型与凭据</p>
                </div>
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
                <div className="stat-card credential-gate" style={{ gridColumn: '1 / -1' }}>
                  <div>
                  <div className="stat-label">API 密钥</div>
                  <div className="settings-row">
                    <span>
                      <span className={`status-dot ${credentialStatus ? 'active' : 'idle'}`} />
                      {credentialStatus ? '已配置' : '未配置'}
                    </span>
                    <span className="badge" style={{ fontSize: '11px' }}>{credentialStatus ? '可用' : '待设置'}</span>
                  </div>
                  <div className="settings-row" style={{ marginTop: '8px' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <input
                        type={showKey ? 'text' : 'password'}
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="输入 API 密钥…"
                        autoComplete="off"
                        style={{
                          width: '100%',
                          padding: '6px 32px 6px 8px',
                          border: '1px solid var(--border)',
                          borderRadius: '6px',
                          background: 'var(--bg-secondary)',
                          color: 'var(--text)',
                          fontSize: '13px',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey((v) => !v)}
                        style={{
                          position: 'absolute',
                          right: '4px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--text-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          padding: '4px',
                        }}
                        aria-label={showKey ? '隐藏密钥' : '显示密钥'}
                      >
                        {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                  <div className="settings-row" style={{ marginTop: '8px', gap: '8px' }}>
                    <button
                      type="button"
                      className="header-btn"
                      disabled={credentialLoading || !apiKey.trim()}
                      onClick={async () => {
                        setCredentialLoading(true);
                        setCredentialMessage(null);
                        try {
                          await saveCredential('llm', 'openai', apiKey.trim());
                          setCredentialMessage('密钥已保存');
                          setApiKey('');
                          const status = await getCredentialStatus();
                          setCredentialStatus(status);
                        } catch (err) {
                          setCredentialMessage(err instanceof Error ? err.message : '保存失败');
                        } finally {
                          setCredentialLoading(false);
                          setTimeout(() => setCredentialMessage(null), 3000);
                        }
                      }}
                    >
                      {credentialLoading ? '保存中…' : '保存'}
                    </button>
                    <button
                      type="button"
                      className="header-btn"
                      disabled={credentialLoading || !credentialStatus}
                      onClick={async () => {
                        setCredentialLoading(true);
                        setCredentialMessage(null);
                        try {
                          await deleteCredential('llm', 'openai');
                          setCredentialMessage('密钥已清除');
                          setApiKey('');
                          setCredentialStatus(false);
                        } catch (err) {
                          setCredentialMessage(err instanceof Error ? err.message : '清除失败');
                        } finally {
                          setCredentialLoading(false);
                          setTimeout(() => setCredentialMessage(null), 3000);
                        }
                      }}
                    >
                      {credentialLoading ? '清除中…' : '清除'}
                    </button>
                  </div>
                  {credentialMessage && (
                    <div
                      style={{
                        marginTop: '8px',
                        fontSize: '12px',
                        color: credentialMessage.includes('失败') ? 'var(--danger)' : 'var(--success)',
                      }}
                    >
                      {credentialMessage}
                    </div>
                  )}
                  <div className="settings-row" style={{ marginTop: '8px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      存储方式: {navigator.platform?.includes('Win') ? 'Windows Credential Manager' : 'AES 加密文件'}
                    </span>
                  </div>
                  </div>
                  <aside className="credential-gate-aside">
                    <strong>凭据安全存储</strong>
                    API Key 加密保存，关闭浏览器后无需重复输入。密钥不会写入仓库或出现在对话记录里。
                  </aside>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
        </div>
      </div>
    </div>
  );
}
