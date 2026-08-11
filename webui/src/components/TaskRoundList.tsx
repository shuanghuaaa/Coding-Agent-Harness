import { useState } from 'react';
import { ChevronDown, ChevronRight, Zap, CheckCircle2, RotateCcw } from 'lucide-react';
import type { AgentResult, ChatItem, CheckpointDiffPayload } from '../types';
import { roleBadgeClass } from './roleBadge';

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
  details: ChatItem[];
  toolCount: number;
  roles: string[];
  status: 'running' | 'completed' | 'error' | 'pending';
}

function firstSentence(text: string, max = 96): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  const cut = cleaned.split(/[。！？\n]/)[0] || cleaned;
  return cut.length > max ? `${cut.slice(0, max)}…` : cut;
}

function isIntermediateThought(text: string): boolean {
  const t = text.trim();
  if (t.length < 40) return true;
  return /^(Let me|I'll|I will|I'm going to|I need to|Checking|Looking|Reading|Searching|我来|让我|接下来|先|正在)/i.test(t);
}

function pickWorkSummary(details: ChatItem[]): string {
  const texts = details.map((d) => d.text?.trim() ?? '').filter(Boolean);
  if (texts.length === 0) return '';
  for (let i = texts.length - 1; i >= 0; i--) {
    if (!isIntermediateThought(texts[i])) return firstSentence(texts[i], 120);
  }
  return firstSentence(texts[texts.length - 1], 120);
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
  if (result.status === 'error' || result.status === 'max_rounds') {
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

  if (!opts.running) {
    const snippet = pickWorkSummary(details);
    if (snippet) items.push(`工作摘要：${snippet}`);
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
): { outcome: string; accomplishments: string[]; description: string; status: TaskRound['status'] } {
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
    };
  }

  if (details.length === 0) {
    return {
      outcome: '等待开始',
      accomplishments: [],
      description: '等待 Agent 开始处理',
      status: 'pending',
    };
  }

  let outcome = '任务成功';
  let status: TaskRound['status'] = 'completed';
  if (isLatest && result) {
    ({ outcome, status } = outcomeFromResult(result));
  }

  const accomplishments = buildAccomplishments(details, { checkpointFiles });
  const description = accomplishments.length > 0
    ? `${outcome}。${accomplishments.join('；')}`
    : `${outcome}。本轮暂无更细完成项`;

  return { outcome, accomplishments, description, status };
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
  let current: Omit<TaskRound, 'description' | 'status' | 'outcome' | 'accomplishments'> | null = null;

  for (const item of items) {
    if (item.kind === 'user') {
      if (current) {
        rounds.push({
          ...current,
          description: '',
          outcome: '',
          accomplishments: [],
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
}: TaskRoundListProps) {
  const [toolsOpen, setToolsOpen] = useState<Record<string, boolean>>({});

  const toggleTools = (stepId: string) => {
    setToolsOpen((prev) => ({ ...prev, [stepId]: !prev[stepId] }));
  };

  if (rounds.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '40px' }}>
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

        return (
          <div key={round.id} className={`task-round status-${round.status} ${open ? 'expanded' : 'collapsed'}`}>
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
                  <span className="task-round-index">第 {index + 1} 轮</span>
                  <span className={`task-round-status-pill ${round.status}`}>
                    {round.status === 'running' ? '进行中'
                      : round.status === 'error' ? '失败'
                        : round.status === 'completed' ? (round.outcome.includes('取消') ? '已取消' : '成功')
                          : '待处理'}
                  </span>
                </div>
                <div className="task-round-task">{round.taskText}</div>
                <div className={`task-round-desc status-${round.status}`}>
                  <span className="task-round-desc-label">结果</span>
                  <div className="task-round-desc-body">
                    <div className="task-round-outcome">{round.outcome}</div>
                    {round.accomplishments.length > 0 ? (
                      <ul className="task-round-accomplishments">
                        {round.accomplishments.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <div className="task-round-desc-text">{round.description}</div>
                    )}
                  </div>
                </div>
              </div>
            </button>

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
                  {rollbackDone ? '已回滚本轮变更' : '回滚本轮文件变更'}
                </button>
                {checkpoint && checkpoint.files.length > 0 && (
                  <span className="task-round-rollback-meta">
                    {checkpoint.files.length} 个文件
                  </span>
                )}
                {rollbackError && <span className="diff-error">{rollbackError}</span>}
              </div>
            )}

            {open && (
              <div className="task-round-body">
                {round.details.length === 0 && (
                  <div className="task-round-empty">暂无内部步骤详情</div>
                )}
                {round.details.map((item, stepIdx) => {
                  const tools = dedupeActions(item.actions ?? []);
                  const hasText = Boolean(item.text?.trim());
                  if (!hasText && tools.length === 0) return null;
                  const toolsExpanded = Boolean(toolsOpen[item.id]);
                  return (
                    <div key={item.id} className="task-step-block">
                      <div className="task-step-head">
                        <span className="task-step-index">步骤 {stepIdx + 1}</span>
                        {item.agentRole ? (
                          <span className={`role-badge ${roleBadgeClass(item.agentRole)}`}>{item.agentRole}</span>
                        ) : (
                          <span className="task-step-agent">Agent</span>
                        )}
                      </div>
                      {hasText && (
                        <div className="task-step-text">{item.text!.trim()}</div>
                      )}
                      {tools.length > 0 && (
                        <div className={`tool-call-card task-step-tools ${toolsExpanded ? 'expanded' : 'collapsed'}`}>
                          <button
                            type="button"
                            className="tool-call-header tool-call-toggle"
                            onClick={() => toggleTools(item.id)}
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
                              <div className="tool-call-body">
                                {tools.map((a, i) => (
                                  <div key={`${a.tool}-${i}`}>
                                    <strong>{a.tool}</strong>
                                    {'\n'}
                                    {a.result}
                                  </div>
                                ))}
                              </div>
                              <div className={`tool-call-result ${item.feedbackStatus === 'fail' ? 'error' : 'success'}`}>
                                <CheckCircle2 size={12} />
                                {item.feedbackStatus === 'fail' ? '反馈失败' : '执行完成'}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
