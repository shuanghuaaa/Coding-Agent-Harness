import { useEffect, useMemo, useState } from 'react';
import { ShieldAlert, OctagonAlert } from 'lucide-react';
import type { HITLRequestPayload } from '../types';

interface HITLModalProps {
  request: HITLRequestPayload;
  onApprove: (modifiedArgs?: Record<string, unknown>) => void;
  onReject: () => void;
}

export function HITLModal({ request, onApprove, onReject }: HITLModalProps) {
  const isCritical = request.severity === 'critical';
  const original = useMemo(() => JSON.stringify(request.arguments, null, 2), [request]);
  const [argsText, setArgsText] = useState(original);

  const parsed = useMemo(() => {
    try {
      return { value: JSON.parse(argsText) as Record<string, unknown>, ok: true };
    } catch {
      return { value: undefined, ok: false };
    }
  }, [argsText]);

  const modified = parsed.ok && argsText.trim() !== original.trim();

  const approve = () => {
    if (!parsed.ok) return;
    onApprove(modified ? parsed.value : undefined);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT') return;
      if (e.key.toLowerCase() === 'a') approve();
      if (e.key.toLowerCase() === 'r') onReject();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="hitl-overlay" role="dialog" aria-modal="true" aria-labelledby="hitl-title">
      <div className={`hitl-dialog panel ${request.severity}`}>
        <div className="hitl-band" aria-hidden />
        <div className="hitl-head">
          {isCritical ? (
            <OctagonAlert size={16} aria-hidden />
          ) : (
            <ShieldAlert size={16} aria-hidden />
          )}
          <h2 id="hitl-title">[{request.severity}] 危险操作待审批</h2>
        </div>

        <div className="hitl-body">
          <div className="row">
            <strong>工具</strong>
            <span>{request.toolName}</span>
          </div>
          <div className="row">
            <strong>原因</strong>
            <span>{request.reason}</span>
          </div>
          <label className="row col">
            <strong>参数（可直接编辑，批准时以当前内容为准）</strong>
            <textarea
              className={`hitl-args ${parsed.ok ? '' : 'invalid'}`}
              value={argsText}
              onChange={(e) => setArgsText(e.target.value)}
              rows={6}
              spellCheck={false}
            />
          </label>
          {!parsed.ok && <div className="hitl-parse-error">JSON 格式错误，修正后才能批准</div>}
        </div>

        <div className="hitl-actions">
          <button type="button" className="btn btn-ghost" onClick={onReject}>
            拒绝 <kbd>R</kbd>
          </button>
          <button
            type="button"
            className={isCritical ? 'btn btn-danger' : 'btn btn-primary'}
            disabled={!parsed.ok}
            onClick={approve}
          >
            {modified ? '按修改批准' : '批准'} <kbd>A</kbd>
          </button>
        </div>
      </div>
    </div>
  );
}
