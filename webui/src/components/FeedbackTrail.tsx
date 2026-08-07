interface FeedbackTrailProps {
  history: Array<{ round: number; status: string }>;
  compact?: boolean;
}

export function FeedbackTrail({ history, compact }: FeedbackTrailProps) {
  if (history.length === 0) {
    return (
      <div className="trail-empty">
        {compact ? '无反馈记录（未运行测试或一次通过）' : '待机 — 暂无反馈'}
      </div>
    );
  }

  return (
    <div className="trail">
      {history.map((fb, i) => (
        <span key={i} className="trail-step">
          {i > 0 && <span className="trail-arrow">→</span>}
          <span className={`trail-node ${fb.status === 'fail' ? 'fail' : 'pass'}`}>
            R{fb.round} {fb.status === 'fail' ? 'FAIL' : 'PASS'}
          </span>
        </span>
      ))}
    </div>
  );
}
