import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Zap, CheckCircle2, RotateCcw, Sparkles, Copy, Check } from 'lucide-react';
import type { AgentResult, ChatItem, CheckpointDiffPayload, FeedbackHistoryEntry } from '../types';
import { roleBadgeClass } from './roleBadge';
import { MarkdownContent } from './MarkdownContent';
import { ToolResultView } from './ToolResultView';
import { FeedbackTrail } from './FeedbackTrail';
import { TestFileSnippet } from './TestFileSnippet';

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}

function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(t);
  }, [copied]);

  return (
    <button
      type="button"
      className={className ?? 'header-btn task-copy-btn'}
      title="复制"
      onClick={(e) => {
        e.stopPropagation();
        void copyText(text).then((ok) => {
          if (ok) setCopied(true);
        });
      }}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {copied ? '已复制' : '复制'}
    </button>
  );
}

export interface TaskRound {
  id: string;
  /** 本轮主要任务说明（用户输入） */
  taskText: string;
  /** 本轮必填说明（摘要） */
  description: string;
  /** 结果标题：任务成功 / 任务失败 等 */
  outcome: string;
  /** 完成项列表（文件、工具、摘要等） */
  accomplishments: string[];
  /** 收缩卡片上展示的最终答复（markdown） */
  finalContent: string;
  details: ChatItem[];
  toolCount: number;
  roles: string[];
  status: 'running' | 'completed' | 'error' | 'pending';
}

function isIntermediateThought(text: string): boolean {
  const t = text.trim();
  if (t.length < 40) return true;
  return /^(Let me|I'll|I will|I'm going to|I need to|Checking|Looking|Reading|Searching|我来|让我|接下来|先|正在)/i.test(t);
}

function pickWorkSummary(details: ChatItem[]): string {
  const texts = details.map((d) => d.text?.trim() ?? '').filter(Boolean);
  if (texts.length === 0) return '';
  let best = texts[texts.length - 1];
  for (let i = texts.length - 1; i >= 0; i--) {
    if (!isIntermediateThought(texts[i])) {
      best = texts[i];
      break;
    }
  }
  return best;
}

function collectToolNames(details: ChatItem[]): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const d of details) {
    for (const a of d.actions ?? []) {
      if (!a.tool || seen.has(a.tool)) continue;
      seen.add(a.tool);
      names.push(a.tool);
    }
  }
  return names;
}

function extractFilesFromActions(details: ChatItem[]): string[] {
  const files: string[] = [];
  const seen = new Set<string>();
  const patterns = [
    /File written:\s*(.+)/i,
    /File deleted:\s*(.+)/i,
    /(?:Wrote|Updated|Created)\s+(?:file\s+)?[`'"]?([^\s`'"]+)/i,
  ];
  for (const d of details) {
    for (const a of d.actions ?? []) {
      for (const re of patterns) {
        const m = a.result.match(re);
        if (!m?.[1]) continue;
        const p = m[1].trim();
        if (!p || seen.has(p)) continue;
        seen.add(p);
        files.push(p);
        break;
      }
    }
  }
  return files;
}

function outcomeFromResult(result: AgentResult): { outcome: string; status: TaskRound['status'] } {
  if (result.status === 'completed') return { outcome: '任务成功', status: 'completed' };
  if (result.status === 'cancelled') return { outcome: '任务已取消', status: 'completed' };
  if (result.status === 'max_rounds') {
    return { outcome: '达到轮次上限（已停止）', status: 'completed' };
  }
  if (result.status === 'error') {
    return { outcome: '任务失败', status: 'error' };
  }
  return { outcome: `任务结束（${result.status}）`, status: 'completed' };
}

function buildAccomplishments(
  details: ChatItem[],
  opts: { checkpointFiles?: string[]; running?: boolean },
): string[] {
  const items: string[] = [];
  const files = opts.checkpointFiles?.length
    ? opts.checkpointFiles
    : extractFilesFromActions(details);

  if (files.length > 0) {
    const shown = files.slice(0, 4).join('、');
    items.push(
      files.length > 4
        ? `变更文件：${shown} 等共 ${files.length} 个`
        : `变更文件：${shown}`,
    );
  }

  const tools = collectToolNames(details);
  if (tools.length > 0) {
    items.push(`调用工具：${tools.join('、')}`);
  }

  if (details.length > 0) {
    items.push(`处理步骤：${details.length} 步`);
  }

  const failCount = details.filter((d) => d.feedbackStatus === 'fail').length;
  if (failCount > 0) {
    items.push(`测试反馈失败 ${failCount} 次`);
  }

  return items;
}

function buildRoundMeta(
  details: ChatItem[],
  opts: {
    running: boolean;
    isLatest: boolean;
    result?: AgentResult | null;
    checkpointFiles?: string[];
  },
): {
  outcome: string;
  accomplishments: string[];
  description: string;
  status: TaskRound['status'];
  finalContent: string;
} {
  const { running, isLatest, result } = opts;
  const checkpointFiles = isLatest
    ? (result?.checkpoint?.files ?? opts.checkpointFiles)
    : undefined;

  if (isLatest && running) {
    const roles = [...new Set(details.map((d) => d.agentRole).filter(Boolean))] as string[];
    const tools = details.reduce((n, d) => n + (d.actions?.length ?? 0), 0);
    const roleHint = roles.length ? `${roles[roles.length - 1]} · ` : '';
    const accomplishments = buildAccomplishments(details, { checkpointFiles, running: true });
    const progress =
      `${roleHint}执行中`
      + (tools ? ` · 已调用工具 ${tools} 次` : '')
      + (details.length ? ` · ${details.length} 步` : '');
    return {
      outcome: '任务进行中',
      accomplishments,
      description: progress,
      status: 'running',
      finalContent: '',
    };
  }

  if (details.length === 0) {
    return {
      outcome: '等待开始',
      accomplishments: [],
      description: '等待 Agent 开始处理',
      status: 'pending',
      finalContent: '',
    };
  }

  let outcome = '任务成功';
  let status: TaskRound['status'] = 'completed';
  if (isLatest && result) {
    ({ outcome, status } = outcomeFromResult(result));
  }

  const accomplishments = buildAccomplishments(details, { checkpointFiles });
  const finalContent = pickWorkSummary(details);
  const description = accomplishments.length > 0
    ? `${outcome}。${accomplishments.join('；')}`
    : `${outcome}。暂无更细完成项`;

  return { outcome, accomplishments, description, status, finalContent };
}

function dedupeActions(
  actions: Array<{ tool: string; result: string }>,
): Array<{ tool: string; result: string }> {
  const seen = new Set<string>();
  const out: Array<{ tool: string; result: string }> = [];
  for (const a of actions) {
    const key = `${a.tool}::${a.result}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}

/** 将 user + 其后连续 agent 归为同一展示轮次（一次用户需求 = 一轮） */
export function groupIntoTaskRounds(
  items: ChatItem[],
  opts: { running: boolean; result?: AgentResult | null; checkpointFiles?: string[] },
): TaskRound[] {
  const rounds: TaskRound[] = [];
  let current: Omit<TaskRound, 'description' | 'status' | 'outcome' | 'accomplishments' | 'finalContent'> | null = null;

  for (const item of items) {
    if (item.kind === 'user') {
      if (current) {
        rounds.push({
          ...current,
          description: '',
          outcome: '',
          accomplishments: [],
          finalContent: '',
          status: 'pending',
        });
      }
      current = {
        id: item.id,
        taskText: item.text?.trim() || '（无任务说明）',
        details: [],
        toolCount: 0,
        roles: [],
      };
    } else if (current) {
      current.details.push(item);
      current.toolCount += item.actions?.length ?? 0;
      if (item.agentRole && !current.roles.includes(item.agentRole)) {
        current.roles.push(item.agentRole);
      }
    }
  }
  if (current) {
    rounds.push({
      ...current,
      description: '',
      outcome: '',
      accomplishments: [],
      finalContent: '',
      status: 'pending',
    });
  }

  return rounds.map((r, i) => {
    const isLatest = i === rounds.length - 1;
    const meta = buildRoundMeta(r.details, {
      running: opts.running,
      isLatest,
      result: isLatest ? opts.result : null,
      checkpointFiles: opts.checkpointFiles,
    });

    return { ...r, ...meta };
  });
}

interface TaskRoundListProps {
  rounds: TaskRound[];
  expanded: Record<string, boolean>;
  onToggle: (id: string) => void;
  checkpoint?: CheckpointDiffPayload | null;
  onRollback?: () => void;
  rollbackBusy?: boolean;
  rollbackDone?: boolean;
  rollbackError?: string | null;
  feedbackHistory?: FeedbackHistoryEntry[];
}

function historyForRound(
  round: TaskRound,
  globalHistory?: FeedbackHistoryEntry[],
): FeedbackHistoryEntry[] {
  const fromDetails = round.details
    .map((d) => d.feedback)
    .filter((f): f is FeedbackHistoryEntry => Boolean(f));
  if (fromDetails.length > 0) return fromDetails;
  if (globalHistory?.length) return globalHistory;
  return round.details
    .filter((d) => d.feedbackStatus)
    .map((d) => ({
      round: d.round ?? 0,
      status: d.feedbackStatus!,
    }));
}

export function TaskRoundList({
  rounds,
  expanded,
  onToggle,
  checkpoint,
  onRollback,
  rollbackBusy,
  rollbackDone,
  rollbackError,
  feedbackHistory,
}: TaskRoundListProps) {
  const [toolsOpen, setToolsOpen] = useState<Record<string, boolean>>({});

  if (rounds.length === 0) {
    return (
      <div className="chat-empty">
        <p>输入任务开始与 Agent 对话</p>
      </div>
    );
  }

  return (
    <div className="task-round-list">
      {rounds.map((round, index) => {
        const open = Boolean(expanded[round.id]);
        const canRollback =
          Boolean(checkpoint)
          && index === rounds.length - 1
          && round.status !== 'running'
          && Boolean(onRollback);
        const trailHistory = historyForRound(
          round,
          index === rounds.length - 1 ? feedbackHistory : undefined,
        );
        const failSnippets = trailHistory
          .flatMap((h) => h.failures ?? [])
          .filter((f) => f.file && f.file !== '(unknown)');

        return (
          <div key={round.id} className="task-round-group">
            <div className="message user">
              <div className="message-bubble">
                <MarkdownContent source={round.taskText} promotePlainCode={false} />
              </div>
              <div className="message-meta">你</div>
            </div>

            <div className={`task-round status-${round.status} ${open ? 'expanded' : 'collapsed'}`}>
              <button
                type="button"
                className="task-round-header"
                onClick={() => onToggle(round.id)}
                aria-expanded={open}
              >
                <span className="task-round-chevron">
                  {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </span>
                <div className="task-round-main">
                  <div className="task-round-title-row">
                    <span className="task-round-index">Agent</span>
                    <span className={`task-round-status-pill ${round.status}`}>
                      {round.status === 'running' ? '进行中'
                        : round.status === 'error' ? '失败'
                          : round.status === 'completed' ? (round.outcome.includes('取消') ? '已取消' : '成功')
                            : '待处理'}
                    </span>
                  </div>
                </div>
              </button>

              <div
                className={`task-round-desc status-${round.status}`}
                onClick={() => onToggle(round.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onToggle(round.id);
                  }
                }}
                role="button"
                tabIndex={0}
                aria-expanded={open}
              >
                <span className="task-round-desc-label">结果</span>
                <div className="task-round-desc-body">
                  <div className="task-round-outcome">{round.outcome}</div>
                  {round.accomplishments.length > 0 ? (
                    <ul className="task-round-accomplishments">
                      {round.accomplishments.map((item, i) => (
                        <li key={`${round.id}-acc-${i}`}>
                          <MarkdownContent source={item} promotePlainCode={false} />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="task-round-desc-text">
                      <MarkdownContent source={round.description} promotePlainCode={false} />
                    </div>
                  )}
                </div>
              </div>

              {trailHistory.length > 0 && (
                <div className="task-round-feedback-panel">
                  <FeedbackTrail history={trailHistory} />
                  {failSnippets.map((f, i) => (
                    <TestFileSnippet
                      key={`${f.file}:${f.line}:${i}`}
                      file={f.file}
                      line={f.line}
                    />
                  ))}
                </div>
              )}

              {!open && (
                <button
                  type="button"
                  className="task-round-expand-hint"
                  onClick={() => onToggle(round.id)}
                >
                  <Sparkles size={14} aria-hidden />
                  <span>展开可查看思考过程与工具调用</span>
                  <ChevronDown size={14} aria-hidden />
                </button>
              )}

              {open ? (
                <div className="task-round-body">
                  <div className="task-round-body-label">思考过程</div>
                  {round.details.length === 0 && (
                    <div className="task-round-empty">暂无内部步骤详情</div>
                  )}
                  {round.details.map((item, stepIdx) => {
                    const tools = dedupeActions(item.actions ?? []);
                    const hasText = Boolean(item.text?.trim());
                    if (!hasText && tools.length === 0) return null;
                    const hasCodeTool = tools.some((t) => t.tool === 'write_file' || t.tool === 'read_file');
                    const toolsExpanded = toolsOpen[item.id] ?? hasCodeTool;
                    return (
                      <div key={item.id} className="task-step-block">
                        <div className="task-step-head">
                          <span className="task-step-index">步骤 {stepIdx + 1}</span>
                          {item.agentRole ? (
                            <span className={`role-badge ${roleBadgeClass(item.agentRole)}`}>{item.agentRole}</span>
                          ) : (
                            <span className="task-step-agent">Agent</span>
                          )}
                          {hasText && (
                            <CopyButton text={item.text!.trim()} className="header-btn task-copy-btn task-step-copy" />
                          )}
                        </div>
                        {hasText && (
                          <MarkdownContent source={item.text!.trim()} className="task-step-text" />
                        )}
                        {tools.length > 0 && (
                          <div className={`tool-call-card task-step-tools ${toolsExpanded ? 'expanded' : 'collapsed'}`}>
                            <button
                              type="button"
                              className="tool-call-header tool-call-toggle"
                              onClick={() =>
                                setToolsOpen((prev) => ({
                                  ...prev,
                                  [item.id]: !(prev[item.id] ?? hasCodeTool),
                                }))
                              }
                              aria-expanded={toolsExpanded}
                            >
                              <span className="tool-call-toggle-left">
                                {toolsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                <Zap size={14} className="tool-call-icon" />
                                <span>工具调用 · {tools.length}</span>
                              </span>
                              <span className="tool-call-toggle-hint">
                                {toolsExpanded ? '收起' : '展开'}
                              </span>
                            </button>
                            {toolsExpanded && (
                              <>
                                <div className="tool-call-body chat-tool-body">
                                  {tools.map((a, i) => (
                                    <div key={`${a.tool}-${i}`} className="tool-call-result-block">
                                      <div className="tool-call-name">{a.tool}</div>
                                      <ToolResultView tool={a.tool} result={a.result} />
                                    </div>
                                  ))}
                                </div>
                                <div className={`tool-call-result ${
                                  item.feedbackStatus === 'fail'
                                    ? 'error'
                                    : item.feedbackStatus === 'pass'
                                      ? 'success'
                                      : 'success'
                                }`}>
                                  <CheckCircle2 size={12} />
                                  {item.feedbackStatus === 'fail'
                                    ? '测试未通过'
                                    : item.feedbackStatus === 'pass'
                                      ? '测试通过'
                                      : '执行完成'}
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    className="task-round-collapse-hint"
                    onClick={() => onToggle(round.id)}
                  >
                    <ChevronRight size={14} aria-hidden />
                    <span>收起思考过程</span>
                  </button>
                </div>
              ) : null}

              {round.finalContent.trim() && (
                <div
                  className="task-round-final"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <div className="task-round-final-label-row">
                    <div className="task-round-final-label">最终结果</div>
                    <CopyButton text={round.finalContent} />
                  </div>
                  <div className="task-round-final-body">
                    <MarkdownContent source={round.finalContent} />
                  </div>
                </div>
              )}

              {canRollback && (
                <div className="task-round-actions">
                  <button
                    type="button"
                    className="checkpoint-btn"
                    disabled={rollbackBusy || rollbackDone}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRollback?.();
                    }}
                  >
                    <RotateCcw size={12} aria-hidden />
                    {rollbackDone ? '已回滚本次变更' : '回滚本次文件变更'}
                  </button>
                  {checkpoint && checkpoint.files.length > 0 && (
                    <span className="task-round-rollback-meta">
                      {checkpoint.files.length} 个文件
                    </span>
                  )}
                  {rollbackError && <span className="diff-error">{rollbackError}</span>}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
