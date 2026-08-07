import type { HITLRequestPayload } from '../types';

interface HITLModalProps {
  request: HITLRequestPayload;
  onApprove: (modifiedArgs?: Record<string, unknown>) => void;
  onReject: () => void;
}

export function HITLModal({ request, onApprove, onReject }: HITLModalProps) {
  const isCritical = request.severity === 'critical';

  return (
    <div className="hitl-overlay" role="dialog" aria-modal="true" aria-labelledby="hitl-title">
      <div className="hitl-dialog">
        <div className="hitl-head">
          <span className={isCritical ? 'led off' : 'led warn'} aria-hidden />
          <h2 id="hitl-title" style={{ color: isCritical ? 'var(--danger)' : 'var(--warn)' }}>
            [{request.severity}] action requires approval
          </h2>
        </div>

        <div className="hitl-block">
          <div className="row">
            <strong>tool:</strong> {request.toolName}
          </div>
          <div className="row">
            <strong>reason:</strong> {request.reason}
          </div>
          <div className="row">
            <strong>arguments:</strong>
            <pre>{JSON.stringify(request.arguments, null, 2)}</pre>
          </div>
        </div>

        <div className="hitl-actions">
          <button type="button" className="btn" onClick={onReject}>
            Reject
          </button>
          <button
            type="button"
            className={isCritical ? 'btn btn-danger' : 'btn btn-primary'}
            onClick={() => onApprove()}
          >
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}
