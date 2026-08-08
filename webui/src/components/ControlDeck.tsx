import type { ChatItem } from '../types';
import { LoopIndicator } from './LoopIndicator';
import { RoundTimeline } from './RoundTimeline';
import { FeedbackTrail } from './FeedbackTrail';
import { ToolStats } from './ToolStats';

interface ControlDeckProps {
  status: string;
  awaitingHITL: boolean;
  agentItems: ChatItem[];
  feedbackHistory: Array<{ round: number; status: string }>;
  currentRound: number;
  onJumpToRound: (round: number) => void;
}

export function ControlDeck({
  status,
  awaitingHITL,
  agentItems,
  feedbackHistory,
  currentRound,
  onJumpToRound,
}: ControlDeckProps) {
  const rounds = agentItems.map((it) => ({ round: it.round!, feedbackStatus: it.feedbackStatus }));

  const toolCounts = new Map<string, number>();
  agentItems.forEach((it) =>
    it.actions?.forEach((a) => toolCounts.set(a.tool, (toolCounts.get(a.tool) ?? 0) + 1)),
  );
  const counts = [...toolCounts.entries()]
    .map(([tool, count]) => ({ tool, count }))
    .sort((a, b) => b.count - a.count);

  const last = agentItems[agentItems.length - 1];

  return (
    <aside className="deck">
      <section className="deck-panel panel">
        <div className="panel-label">AGENT 循环</div>
        <LoopIndicator
          status={status}
          awaitingHITL={awaitingHITL}
          currentRound={currentRound}
          lastRoundHadActions={Boolean(last?.actions?.length)}
          lastFeedback={last?.feedbackStatus}
        />
      </section>

      <section className="deck-panel panel">
        <div className="panel-label">轮次时间线</div>
        <RoundTimeline rounds={rounds} activeRound={currentRound} onSelect={onJumpToRound} />
      </section>

      <section className="deck-panel panel">
        <div className="panel-label">反馈闭环</div>
        <FeedbackTrail history={feedbackHistory} />
      </section>

      <section className="deck-panel panel">
        <div className="panel-label">工具活动</div>
        <ToolStats counts={counts} />
      </section>
    </aside>
  );
}
