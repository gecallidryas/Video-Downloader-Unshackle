import './StorageFooter.css';

export type StorageLevel = 'ok' | 'moderate' | 'high' | 'critical';

export interface StorageFooterProps {
  usageBytes: number;
  quotaBytes: number;
  level: StorageLevel;
}

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '0 B';
  }

  let scaled = value;
  let unitIndex = 0;

  while (scaled >= 1024 && unitIndex < UNITS.length - 1) {
    scaled /= 1024;
    unitIndex += 1;
  }

  const formatted = scaled >= 10 ? scaled.toFixed(0) : scaled.toFixed(1);

  return `${formatted} ${UNITS[unitIndex]}`;
}

function computePercent(usage: number, quota: number): number {
  if (!Number.isFinite(quota) || quota <= 0) {
    return 0;
  }

  return Math.min(100, Math.max(0, (usage / quota) * 100));
}

export function StorageFooter({
  usageBytes,
  quotaBytes,
  level,
}: StorageFooterProps) {
  const pct = computePercent(usageBytes, quotaBytes);

  return (
    <div
      className={`storage-footer storage-footer--${level}`}
      role="status"
      aria-label="Storage usage"
    >
      <div
        className="storage-footer__bar"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="storage-footer__fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="storage-footer__text">
        {formatBytes(usageBytes)} / {formatBytes(quotaBytes)} ({Math.round(pct)}%)
      </div>
    </div>
  );
}
