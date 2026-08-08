import { Database, Brain, Wrench, RefreshCcw } from 'lucide-react';

interface LoopIndicatorProps {
  status: string;
  awaitingHITL: boolean;
  currentRound: number;
  lastRoundHadActions: boolean;
  lastFeedback?: string;
}

export function LoopIndicator({
  status,
  awaitingHITL,
  currentRound,
  lastRoundHadActions,
  lastFeedback,
}: LoopIndicatorProps) {
  const running = status === 'running';
  const contextActive = running && currentRound === 0;
  const llmActive = running && !awaitingHITL && !contextActive;
  const toolState = awaitingHITL ? 'awaiting' : lastRoundHadActions ? 'done' : '';
  const feedbackState = lastFeedback === 'fail' ? 'fail' : lastFeedback === 'pass' ? 'pass' : '';

  return (
    <div className="loop-flow">
      <div className={`loop-node ${contextActive ? 'active' : ''} ${currentRound > 0 ? 'done' : ''}`}>
        <Database size={14} aria-hidden />
        <span>上下文</span>
      </div>
      <span className="loop-link" aria-hidden />
      <div className={`loop-node ${llmActive ? 'active' : ''}`}>
        <Brain size={14} aria-hidden />
        <span>LLM</span>
      </div>
      <span className="loop-link" aria-hidden />
      <div className={`loop-node ${toolState}`}>
        <Wrench size={14} aria-hidden />
        <span>工具</span>
      </div>
      <span className="loop-link" aria-hidden />
      <div className={`loop-node ${feedbackState}`}>
        <RefreshCcw size={14} aria-hidden />
        <span>反馈</span>
      </div>
    </div>
  );
}
