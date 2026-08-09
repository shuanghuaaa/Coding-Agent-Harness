import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useSessions } from './hooks/useSessions';
import { getSession } from './api/sessions';
import { TopBar } from './components/TopBar';
import { SessionSidebar } from './components/SessionSidebar';
import { ChatTimeline, type EndSummary } from './components/ChatTimeline';
import { HITLModal } from './components/HITLModal';
import { Paperclip, Mic, ChevronDown } from 'lucide-react';
import type { ChatItem, SessionRecord } from './types';

const BUSY = new Set(['running']);
const MODELS = ['K2.5', 'K2.5 Agent', 'K1.5'];

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

export default function App() {
  const [task, setTask] = useState('');
  const [review, setReview] = useState<SessionRecord | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [model, setModel] = useState(MODELS[0]);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [composerExpanded, setComposerExpanded] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);

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

      <div className={`app-body ${sidebarOpen ? '' : 'no-sidebar'}`}>
        {sidebarOpen && (
          <SessionSidebar
            sessions={sessions}
            loading={loading}
            error={error ?? detailError}
            activeId={review?.id ?? null}
            onRetry={() => {
              setDetailError(null);
              void refresh();
            }}
            onSelect={handleSelectSession}
            onNew={() => setReview(null)}
            onDelete={handleDeleteSession}
            onCollapse={() => setSidebarOpen(false)}
          />
        )}

        <main className="main-col">
          <ChatTimeline items={items} end={end} connected={connected} review={Boolean(review)} />

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
      </div>
    </div>
  );
}
