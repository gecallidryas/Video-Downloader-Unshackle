interface DuplicateBadgeProps {
  count: number;
  onClick: () => void;
}

export function DuplicateBadge({ count, onClick }: DuplicateBadgeProps) {
  const label = count === 1 ? '1 duplicate' : `${count} duplicates`;
  return (
    <button
      type="button"
      className="media-card__duplicate-badge"
      onClick={onClick}
      aria-label={label}
    >
      {label}
    </button>
  );
}
