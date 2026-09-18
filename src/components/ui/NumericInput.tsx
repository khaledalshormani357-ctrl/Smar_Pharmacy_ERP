import React, { useState, useEffect, useRef } from 'react';

interface NumericInputProps {
  id?: string;
  value: number; // in decimal units (e.g. 10.5 or 0)
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

/**
 * Android-first NumericInput component:
 * - Solves the React controlled-state synchronization issue when backspacing digits (e.g. 12345 -> Backspace)
 * - Accepts Arabic-Indic (٠-٩) and Persian (۰-۹) digits and normalizes to standard ASCII digits
 * - Preserves empty state or intermediate decimal points while typing without jumping or resetting to 0
 * - Only re-syncs from external `value` prop if the change did NOT originate from user's current keystroke
 */
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
  allowDecimals = true
}) => {
  const [text, setText] = useState<string>(value === 0 ? '' : value.toString());
  const isTypingRef = useRef(false);

  useEffect(() => {
    // If the change came from user typing, do not overwrite the local text buffer
    if (isTypingRef.current) {
      isTypingRef.current = false;
      return;
    }

    const parsed = parseFloat(text);
    // If the external value matches parsed value, keep existing text formatting (e.g. "12." or trailing zeros)
    if (!isNaN(parsed) && parsed === value) {
      return;
    }

    if (value === 0 && (text === '' || text === '0')) {
      return;
    }

    setText(value === 0 ? '' : value.toString());
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    isTypingRef.current = true;

    // Normalize Arabic-Indic digits (٠-٩) and Persian digits (۰-۹) and Arabic comma to dot
    let raw = e.target.value
      .replace(/[٠۰]/g, '0')
      .replace(/[١۱]/g, '1')
      .replace(/[٢۲]/g, '2')
      .replace(/[٣۳]/g, '3')
      .replace(/[٤۴]/g, '4')
      .replace(/[٥۵]/g, '5')
      .replace(/[٦۶]/g, '6')
      .replace(/[٧۷]/g, '7')
      .replace(/[٨۸]/g, '8')
      .replace(/[٩۹]/g, '9')
      .replace(/[،,]/g, '.');

    const pattern = allowDecimals ? /^-?\d*\.?\d*$/ : /^-?\d*$/;

    // Allow empty string, intermediate minus, numbers, and single decimal point
    if (raw === '' || pattern.test(raw)) {
      setText(raw);
      if (raw === '' || raw === '-' || raw === '.') {
        onChange(0);
      } else {
        const num = parseFloat(raw);
        if (!isNaN(num)) {
          onChange(num);
        }
      }
    }
  };

  const handleBlur = () => {
    isTypingRef.current = false;
    if (text === '' || isNaN(parseFloat(text))) {
      setText('');
      onChange(0);
    } else {
      const num = parseFloat(text);
      let bounded = num;
      if (min !== undefined && bounded < min) bounded = min;
      if (max !== undefined && bounded > max) bounded = max;
      setText(bounded === 0 ? '' : bounded.toString());
      onChange(bounded);
    }
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
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        dir="ltr"
        className={`w-full px-3 py-2.5 text-left font-mono text-slate-800 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all placeholder:text-slate-300 disabled:bg-slate-50 disabled:text-slate-400 ${
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
