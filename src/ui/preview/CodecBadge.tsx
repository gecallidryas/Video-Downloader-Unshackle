import { formatCodecLabel, type CodecInfo } from '@/src/core/preview/codec-sniff';

export interface CodecBadgeProps {
  info: CodecInfo | null;
  unsupported?: boolean;
}

export function CodecBadge({ info, unsupported = false }: CodecBadgeProps) {
  if (!info) {
    return null;
  }

  const label = formatCodecLabel(info);
  const className = unsupported ? 'codec-badge codec-badge--warning' : 'codec-badge';
  const title = unsupported
    ? `Codec ${label} may not play natively in this browser`
    : `Detected codec: ${label}`;

  return (
    <span className={className} title={title} aria-label={`Codec ${label}`}>
      <span>{label}</span>
    </span>
  );
}
