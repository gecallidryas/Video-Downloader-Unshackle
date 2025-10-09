import { useEffect, useRef, useState } from 'react';
import './FilterInput.css';

export interface FilterInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
  'aria-label'?: string;
}

export function FilterInput({
  value,
  onChange,
  placeholder,
  debounceMs = 200,
  'aria-label': ariaLabel,
}: FilterInputProps) {
  const [internal, setInternal] = useState(value);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    setInternal(value);
  }, [value]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  function emit(next: string) {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (debounceMs <= 0) {
      onChange(next);
      return;
    }

    debounceRef.current = setTimeout(() => {
      onChange(next);
    }, debounceMs);
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const next = event.target.value;
    setInternal(next);
    emit(next);
  }

  function handleClear() {
    setInternal('');
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    onChange('');
  }

  return (
    <div className="filter-input">
      <svg
        className="filter-input__icon"
        viewBox="0 0 16 16"
        width="14"
        height="14"
        aria-hidden="true"
      >
        <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <line x1="10.5" y1="10.5" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <input
        type="search"
        className="filter-input__field"
        value={internal}
        onChange={handleChange}
        placeholder={placeholder}
        aria-label={ariaLabel ?? 'Filter'}
      />
      {internal ? (
        <button
          type="button"
          className="filter-input__clear"
          onClick={handleClear}
          aria-label="Clear filter"
        >
          ×
        </button>
      ) : null}
    </div>
  );
}
