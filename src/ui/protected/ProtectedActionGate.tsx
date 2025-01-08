import { useState } from 'react';
import type { ProviderPolicyResult } from '@/src/core/policy/evaluate-provider-policy';

interface ProtectedActionGateProps {
  policy: ProviderPolicyResult;
  onProceed: (policy: Extract<ProviderPolicyResult, { kind: 'authorized-workflow' }>) => void;
}

export function ProtectedActionGate({
  policy,
  onProceed,
}: ProtectedActionGateProps) {
  const [acknowledged, setAcknowledged] = useState(false);

  if (policy.kind === 'blocked') {
    return (
      <div className="protected-action-gate" role="status">
        <span>{policy.reason}</span>
      </div>
    );
  }

  return (
    <div className="protected-action-gate">
      <div className="protected-action-gate__provider">
        {policy.providerName}
      </div>
      <label className="protected-action-gate__acknowledgement">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(event) => setAcknowledged(event.target.checked)}
        />
        <span>{policy.acknowledgement}</span>
      </label>
      {acknowledged ? (
        <button
          type="button"
          className="media-card__download-btn"
          onClick={() => onProceed(policy)}
        >
          {policy.actionLabel}
        </button>
      ) : null}
    </div>
  );
}
