import { useEffect, useRef } from 'react';
import type { ChatItem } from '../types';
import { RoundCard } from './RoundCard';
import { FeedbackTrail } from './FeedbackTrail';

export interface EndSummary {
  status: string;
  rounds: number;
  feedbackHistory: Array<{ round: number; status: string }>;
}

interface ChatTimelineProps {
  items: ChatItem[];
  end: EndSummary | null;
  connected: boolean;
  review: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  completed: '任务完成',
  error: '任务出错',
  cancelled: '任务已取消',
  max_rounds: '达到轮次上限',
};

export function ChatTimeline({ items, end, connected, review }: ChatTimelineProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items, end]);

  return (
    <div className="timeline" ref={scrollerRef}>
      {items.length === 0 && (
        <div className="hint panel">
          <div className="panel-label">系统就绪 // SYSTEM READY</div>
          <ul className="hint-list">
            <li>
              <span className="hint-key">01</span>在下方输入编码任务，Agent 将逐轮执行
            </li>
            <li>
              <span className="hint-key">02</span>右侧面板实时显示循环阶段、反馈闭环与工具活动
            </li>
            <li>
              <span className="hint-key">03</span>危险操作会触发人工审批（HITL）
            </li>
            <li>
              <span className="hint-key">04</span>完成的任务自动保存到左侧会话历史
            </li>
          </ul>
          {!connected && (
            <p className="hint-warn">
              未连接后端。若设置了 HARNESS_TOKEN，请用 ?token=… 打开页面。
            </p>
          )}
        </div>
      )}

      {items.map((item) =>
        item.kind === 'user' ? (
          <div key={item.id} className="task-card">
            <div className="task-tag">你的任务</div>
            <div className="task-text">{item.text}</div>
          </div>
        ) : (
          <RoundCard key={item.id} item={item} />
        ),
      )}

      {end && (
        <div className={`end-card panel ${end.status}`}>
          <div className="end-title">
            {STATUS_LABEL[end.status] ?? end.status} · 共 {end.rounds} 轮
          </div>
          <FeedbackTrail history={end.feedbackHistory} compact />
          {review && <div className="end-note">回顾模式 — 点击左侧"＋ 新任务"返回实时模式</div>}
        </div>
      )}
    </div>
  );
}
