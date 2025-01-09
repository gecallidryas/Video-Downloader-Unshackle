import type { QualityOption } from '@/src/types/media';

interface VariantPickerProps {
  options: QualityOption[];
  selectedValue: string;
  onChange: (value: string) => void;
}

export function VariantPicker({
  options,
  selectedValue,
  onChange,
}: VariantPickerProps) {
  if (options.length === 0) {
    return null;
  }

  return (
    <select
      className="media-card__quality"
      value={selectedValue}
      disabled={options.length <= 1}
      onChange={(event) => onChange(event.target.value)}
      aria-label="Quality"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
