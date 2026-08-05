import type { HITLRequestPayload } from '../types';

interface HITLModalProps {
  request: HITLRequestPayload;
  onApprove: (modifiedArgs?: Record<string, unknown>) => void;
  onReject: () => void;
}

export function HITLModal({ request, onApprove, onReject }: HITLModalProps) {
  const severityColor = request.severity === 'critical' ? '#e74c3c' : '#f39c12';

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div style={{
        background: 'white',
        borderRadius: '12px',
        padding: '24px',
        maxWidth: '480px',
        width: '90%',
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <div style={{
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            background: severityColor,
          }} />
          <h2 style={{ margin: 0, fontSize: '18px' }}>
            [{request.severity.toUpperCase()}] Action Requires Approval
          </h2>
        </div>

        <div style={{
          background: '#f8f9fa',
          borderRadius: '8px',
          padding: '12px',
          marginBottom: '16px',
        }}>
          <div style={{ marginBottom: '8px' }}>
            <strong>Tool:</strong> {request.toolName}
          </div>
          <div style={{ marginBottom: '8px' }}>
            <strong>Reason:</strong> {request.reason}
          </div>
          <div>
            <strong>Arguments:</strong>
            <pre style={{
              margin: '4px 0 0',
              padding: '8px',
              background: '#e9ecef',
              borderRadius: '4px',
              fontSize: '12px',
              maxHeight: '120px',
              overflow: 'auto',
            }}>
              {JSON.stringify(request.arguments, null, 2)}
            </pre>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            onClick={onReject}
            style={{
              padding: '10px 24px',
              borderRadius: '8px',
              border: '1px solid #ccc',
              background: 'white',
              color: '#333',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Reject
          </button>
          <button
            onClick={() => onApprove()}
            style={{
              padding: '10px 24px',
              borderRadius: '8px',
              border: 'none',
              background: severityColor,
              color: 'white',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 600,
            }}
          >
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}