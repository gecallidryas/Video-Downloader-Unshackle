import { useState } from 'react';

export const COMMON_LANGUAGES: ReadonlyArray<{ code: string; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'zh', label: 'Chinese' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'ru', label: 'Russian' },
  { code: 'ar', label: 'Arabic' },
  { code: 'hi', label: 'Hindi' },
  { code: 'it', label: 'Italian' },
];

const COMMON_CODES = new Set(COMMON_LANGUAGES.map((entry) => entry.code));

const OTHER_VALUE = '__other__';

interface LanguagePickerProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  ariaLabel?: string;
}

export function LanguagePicker({ value, onChange, id, ariaLabel }: LanguagePickerProps) {
  const isCustom = value !== '' && !COMMON_CODES.has(value);
  const [showOther, setShowOther] = useState(isCustom);
  const selectValue = showOther ? OTHER_VALUE : value;

  return (
    <div className="language-picker" style={{ display: 'flex', gap: 6 }}>
      <select
        id={id}
        aria-label={ariaLabel ?? 'Preferred language'}
        value={selectValue}
        onChange={(event) => {
          const next = event.target.value;
          if (next === OTHER_VALUE) {
            setShowOther(true);
          } else {
            setShowOther(false);
            onChange(next);
          }
        }}
      >
        <option value="">No preference</option>
        {COMMON_LANGUAGES.map((entry) => (
          <option key={entry.code} value={entry.code}>
            {entry.label} ({entry.code})
          </option>
        ))}
        <option value={OTHER_VALUE}>Other…</option>
      </select>
      {showOther ? (
        <input
          aria-label="Custom language code"
          value={isCustom ? value : ''}
          placeholder="ISO 639 code"
          onChange={(event) => onChange(event.target.value.trim())}
        />
      ) : null}
    </div>
  );
}
