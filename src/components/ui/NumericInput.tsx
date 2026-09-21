import React, { useEffect, useRef, useState } from 'react';
import { cleanNumericDraft, parseSafeNumber } from '../../utils/inputSafety';

interface NumericInputProps {
  id?: string;
  value: number;
  onChange: (val: number) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: string;
  suffix?: string;
  allowDecimals?: boolean;
  allowNegative?: boolean;
}

export const NumericInput: React.FC<NumericInputProps> = ({
  id,
  value,
  onChange,
  placeholder = '0.00',
  className = '',
  disabled = false,
  min,
  max,
  step = 'any',
  suffix,
  allowDecimals = true,
  allowNegative = false,
}) => {
  const [text, setText] = useState(() => (value === 0 ? '' : String(value)));
  const focusedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync with external value changes ONLY when NOT focused
  useEffect(() => {
    if (focusedRef.current) return;
    const currentParsed = parseSafeNumber(text, 0);
    if (currentParsed === value && text !== '') return;
    setText(value === 0 ? '' : String(value));
  }, [value]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    focusedRef.current = true;
    const rawVal = event.target.value;

    // Clean and normalize the draft string (handles Arabic/Persian digits, multiple dots, etc.)
    const cleaned = cleanNumericDraft(rawVal, allowDecimals);

    // If negative is not allowed, strip minus sign
    const finalDraft = allowNegative ? cleaned : cleaned.replace(/-/g, '');

    setText(finalDraft);

    // Parse safe value
    const parsed = parseSafeNumber(finalDraft, 0);
    onChange(parsed);
  };

  const handleFocus = () => {
    focusedRef.current = true;
  };

  const handleBlur = () => {
    focusedRef.current = false;
    const cleaned = cleanNumericDraft(text, allowDecimals);
    let num = parseSafeNumber(cleaned, 0);

    if (min !== undefined) num = Math.max(min, num);
    if (max !== undefined) num = Math.min(max, num);

    setText(num === 0 ? '' : String(num));
    onChange(num);
  };

  return (
    <div className="relative flex items-center w-full">
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode={allowDecimals ? 'decimal' : 'numeric'}
        autoComplete="off"
        autoCorrect="off"
        spellCheck="false"
        step={step}
        disabled={disabled}
        value={text}
        onFocus={handleFocus}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        dir="ltr"
        className={`w-full px-3 py-2 text-left font-mono text-slate-800 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all placeholder:text-slate-300 disabled:bg-slate-50 disabled:text-slate-400 ${
          suffix ? 'pr-12' : ''
        } ${className}`}
      />
      {suffix && (
        <span className="absolute right-3 text-xs font-semibold text-slate-400 pointer-events-none select-none">
          {suffix}
        </span>
      )}
    </div>
  );
};

