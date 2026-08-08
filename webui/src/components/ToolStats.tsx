interface ToolStatsProps {
  counts: Array<{ tool: string; count: number }>;
}

export function ToolStats({ counts }: ToolStatsProps) {
  if (counts.length === 0) {
    return <div className="deck-empty">待机 — 暂无工具调用</div>;
  }

  const max = Math.max(...counts.map((c) => c.count));

  return (
    <div className="tool-stats">
      {counts.map((c) => (
        <div key={c.tool} className="tool-stat-row">
          <span className="tool-stat-name">{c.tool}</span>
          <span className="tool-stat-bar">
            <span className="tool-stat-fill" style={{ width: `${(c.count / max) * 100}%` }} />
          </span>
          <span className="tool-stat-count">{c.count}</span>
        </div>
      ))}
    </div>
  );
}
