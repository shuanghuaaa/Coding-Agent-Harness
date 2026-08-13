import type { FeedbackHistoryEntry } from '../types';

const TYPE_LABEL: Record<string, string> = {
  assertion: '断言失败',
  compile: '编译错误',
  timeout: '超时',
  runtime: '运行时错误',
};

function typeLabel(types?: string[]): string {
  if (!types?.length) return '失败';
  return types.map((t) => TYPE_LABEL[t] ?? t).join('·');
}

export function FeedbackTrail({
  history,
  compact: _compact,
}: {
  history: FeedbackHistoryEntry[];
  compact?: boolean;
}) {
  void _compact;
  if (history.length === 0) {
    return (
      <div className="trail-empty">暂无测试反馈（尚未跑测或一次通过未记录）</div>
    );
  }

  const repeat = [...history].reverse().find((h) => h.repeatedFailure)?.repeatedFailure;

  return (
    <div className="feedback-trail">
      <div className="feedback-trail-label">反馈轨迹</div>
      <div className="trail">
        {history.map((fb, i) => (
          <span key={`${fb.round}-${i}`} className="trail-step">
            {i > 0 && <span className="trail-arrow">→</span>}
            <span className={`trail-node ${fb.status === 'fail' ? 'fail' : 'pass'}`}>
              {fb.status === 'fail' ? (
                <>第 {fb.round} 轮 ✕ {typeLabel(fb.failureTypes)}</>
              ) : (
                <>第 {fb.round} 轮 ✓ 通过</>
              )}
            </span>
          </span>
        ))}
      </div>
      {repeat && (
        <div className="feedback-repeat-banner" role="status">
          「{repeat.testName}」已连续失败 {repeat.streak} 次，建议换思路
        </div>
      )}
    </div>
  );
}
