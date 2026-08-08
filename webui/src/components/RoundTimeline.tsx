interface RoundTimelineProps {
  rounds: Array<{ round: number; feedbackStatus?: string }>;
  activeRound: number;
  onSelect: (round: number) => void;
}

export function RoundTimeline({ rounds, activeRound, onSelect }: RoundTimelineProps) {
  if (rounds.length === 0) {
    return <div className="deck-empty">待机 — 暂无轮次</div>;
  }

  return (
    <ol className="round-tl">
      {rounds.map((r) => (
        <li key={r.round}>
          <button
            type="button"
            className={`round-tl-node ${r.round === activeRound ? 'active' : ''} ${r.feedbackStatus ?? ''}`}
            onClick={() => onSelect(r.round)}
          >
            <span className="round-tl-dot" aria-hidden />
            <span>第 {r.round} 轮</span>
            {r.feedbackStatus && (
              <span className={`fb-tag sm ${r.feedbackStatus}`}>{r.feedbackStatus}</span>
            )}
          </button>
        </li>
      ))}
    </ol>
  );
}
