import type { DetectedMedia } from '@/src/types/media';

interface ProtectedWarningProps {
  items: DetectedMedia[];
}

export function ProtectedWarning({ items }: ProtectedWarningProps) {
  const hasProtectedItems = items.some(
    (item) => item.primaryAction?.kind === 'blocked',
  );

  if (!hasProtectedItems) {
    return null;
  }

  return (
    <div className="runtime-warning" role="status">
      <p>This media appears protected or permission-restricted.</p>
      <p>Proceed only if you have explicit permission from the content owner or service.</p>
    </div>
  );
}
