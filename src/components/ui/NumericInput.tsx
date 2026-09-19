import React, { useEffect, useRef, useState } from 'react';
import { isValidNumericDraft, normalizeNumericText } from '../../utils/phase82';

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
}

export const NumericInput: React.FC<NumericInputProps> = ({
  id, value, onChange, placeholder = '0.00', className = '', disabled = false,
  min, max, step = 'any', suffix, allowDecimals = true,
}) => {
  const [text, setText] = useState<string>(() => (value === 0 ? '' : String(value)));
  const focusedRef = useRef(false);

  useEffect(() => {
    if (focusedRef.current) return;
    const nextText = value === 0 ? '' : String(value);
    setText((prev) => (prev === nextText ? prev : nextText));
  }, [value]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const raw = normalizeNumericText(event.target.value || '');
    if (!isValidNumericDraft(raw, allowDecimals)) return;

    setText(raw);
    if (raw === '' || raw === '-' || raw === '.') {
      onChange(0);
      return;
    }

    const parsed = Number(raw);
    if (Number.isFinite(parsed)) onChange(parsed);
  };

  const handleBlur = () => {
    focusedRef.current = false;
    if (text === '' || text === '-' || text === '.' || !Number.isFinite(Number(text))) {
      setText('');
      onChange(0);
      return;
    }

    let bounded = Number(text);
    if (min !== undefined) bounded = Math.max(min, bounded);
    if (max !== undefined) bounded = Math.min(max, bounded);

    const finalText = bounded === 0 ? '' : String(bounded);
    setText(finalText);
    onChange(bounded);
  };

  return (
    <div className="relative flex items-center w-full">
      <input
        id={id}
        type="text"
        inputMode={allowDecimals ? 'decimal' : 'numeric'}
        step={step}
        disabled={disabled}
        value={text}
        onFocus={() => { focusedRef.current = true; }}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        dir="ltr"
        className={`w-full px-3 py-2.5 text-left font-mono text-slate-800 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent ${className}`}
      />
      {suffix && <span className="absolute right-3 text-xs font-semibold text-slate-400 pointer-events-none select-none">{suffix}</span>}
    </div>
  );
};
