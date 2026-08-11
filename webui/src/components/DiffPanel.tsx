import { useState, useEffect } from 'react';
import { RotateCcw, FileDiff } from 'lucide-react';
import { rollbackCheckpoint } from '../api/checkpoint';
import type { CheckpointDiffPayload } from '../types';

interface DiffPanelProps {
  checkpoint: CheckpointDiffPayload | null;
  onRolledBack?: () => void;
}

export function DiffPanel({ checkpoint, onRolledBack }: DiffPanelProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setDone(false);
    setError(null);
  }, [checkpoint?.id]);

  if (!checkpoint) {
    return (
      <div className="diff-empty">
        <FileDiff size={20} aria-hidden />
        <span>暂无变更。任务完成后将显示 Diff。</span>
      </div>
    );
  }

  const handleRollback = async () => {
    setBusy(true);
    setError(null);
    try {
      await rollbackCheckpoint(checkpoint.id);
      setDone(true);
      onRolledBack?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="diff-panel">
      <div className="diff-panel-head">
        <span className="diff-panel-title">
          变更文件 · {checkpoint.files.length}
        </span>
        <button
          type="button"
          className="checkpoint-btn"
          disabled={busy || done}
          onClick={() => void handleRollback()}
        >
          <RotateCcw size={12} aria-hidden />
          {done ? '已回滚' : '回滚到检查点'}
        </button>
      </div>
      {error && <div className="diff-error">{error}</div>}
      <ul className="diff-file-list">
        {checkpoint.files.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      {checkpoint.patch && (
        <pre className="diff-patch">{checkpoint.patch}</pre>
      )}
    </div>
  );
}
