import { useEffect, useState, type FormEvent } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useSessions } from './hooks/useSessions';
import { getSession } from './api/sessions';
import { TopBar } from './components/TopBar';
import { SessionSidebar } from './components/SessionSidebar';
import { ChatTimeline, type EndSummary } from './components/ChatTimeline';
import { ControlDeck } from './components/ControlDeck';
import { HITLModal } from './components/HITLModal';
import type { ChatItem, SessionRecord } from './types';

const BUSY = new Set(['running']);

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
  const [deckOpen, setDeckOpen] = useState(true);

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsHost = import.meta.env.DEV ? 'localhost:3000' : window.location.host;
  const { connected, reconnecting, status, result, hitlRequest, chat, sendTask, cancel, respondHITL } =
    useWebSocket(`${protocol}//${wsHost}`);
  const { sessions, loading, error, refresh, remove } = useSessions();

  const busy = BUSY.has(status);

  useEffect(() => {
    if (result) void refresh();
  }, [result, refresh]);

  const items = review ? chatFromSession(review) : chat;
  const agentItems = items.filter((it) => it.kind === 'agent');
  const feedbackHistory = agentItems
    .filter((it) => it.feedbackStatus)
    .map((it) => ({ round: it.round!, status: it.feedbackStatus! }));
  const currentRound = agentItems.length;
  const toolCallCount = agentItems.reduce((n, it) => n + (it.actions?.length ?? 0), 0);

  const end: EndSummary | null = review
    ? { status: review.status, rounds: review.rounds, feedbackHistory: review.data.feedbackHistory }
    : result
      ? { status: result.status, rounds: result.rounds, feedbackHistory: result.feedbackHistory }
      : null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (task.trim() && !busy && !review) {
      sendTask(task.trim());
      setTask('');
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

  const jumpToRound = (round: number) => {
    document.getElementById(`round-${round}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
        sidebarOpen={sidebarOpen}
        deckOpen={deckOpen}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        onToggleDeck={() => setDeckOpen((v) => !v)}
      />

      <div className={`app-body ${sidebarOpen ? '' : 'no-sidebar'} ${deckOpen ? '' : 'no-deck'}`}>
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
          />
        )}

        <main className="main-col">
          <ChatTimeline items={items} end={end} connected={connected} review={Boolean(review)} />
          <form className="composer" onSubmit={handleSubmit}>
            <div className="prompt-wrap">
              <span className="prompt-prefix" aria-hidden>
                &gt;
              </span>
              <input
                type="text"
                value={task}
                onChange={(e) => setTask(e.target.value)}
                placeholder={review ? '回顾模式中 — 点击左侧"＋ 新任务"返回实时模式' : '输入编码任务…'}
                disabled={busy || Boolean(review)}
                aria-label="Coding task"
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={busy || !connected || Boolean(review)}
            >
              发送
            </button>
            {busy && (
              <button type="button" className="btn btn-danger" onClick={cancel}>
                取消
              </button>
            )}
          </form>
        </main>

        {deckOpen && (
          <ControlDeck
            status={review ? 'review' : status}
            awaitingHITL={Boolean(hitlRequest)}
            agentItems={agentItems}
            feedbackHistory={feedbackHistory}
            currentRound={currentRound}
            onJumpToRound={jumpToRound}
          />
        )}
      </div>
    </div>
  );
}
