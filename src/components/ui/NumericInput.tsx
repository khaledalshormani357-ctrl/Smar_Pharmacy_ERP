import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cleanNumericDraft, parseSafeNumber, normalizeInputText } from '../../utils/inputSafety';

interface NumericInputProps {
  id?: string;
  value: number;
  onChange: (val: number) => void;
  onBlur?: (val: number) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: string;
  suffix?: string;
  allowDecimals?: boolean;
  allowNegative?: boolean;
  autoSelectOnFocus?: boolean;
}

export const NumericInput: React.FC<NumericInputProps> = ({
  id,
  value,
  onChange,
  onBlur,
  placeholder = '0.00',
  className = '',
  disabled = false,
  min,
  max,
  step = 'any',
  suffix,
  allowDecimals = true,
  allowNegative = false,
  autoSelectOnFocus = false,
}) => {
  // Draft text representation of the number
  const [draft, setDraft] = useState<string>(() => (value === 0 ? '' : String(value)));

  const isEditingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastCommittedNumRef = useRef<number>(value);
  const cursorPositionRef = useRef<number | null>(null);

  // Sync with external value changes ONLY when the user is NOT actively editing/focused
  useEffect(() => {
    const isCurrentlyFocused =
      typeof document !== 'undefined' && inputRef.current === document.activeElement;

    if (isEditingRef.current || isCurrentlyFocused) {
      // User is actively editing or element is focused; NEVER overwrite the user's active draft!
      return;
    }

    if (value !== lastCommittedNumRef.current) {
      lastCommittedNumRef.current = value;
      setDraft(value === 0 ? '' : String(value));
    }
  }, [value]);

  // Restore cursor position after React re-renders when editing in the middle of text
  useLayoutEffect(() => {
    if (cursorPositionRef.current !== null && inputRef.current) {
      const pos = Math.min(cursorPositionRef.current, inputRef.current.value.length);
      inputRef.current.setSelectionRange(pos, pos);
      cursorPositionRef.current = null;
    }
  });

  const handleFocus = (event: React.FocusEvent<HTMLInputElement>) => {
    isEditingRef.current = true;
    if (autoSelectOnFocus) {
      event.target.select();
    }
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    isEditingRef.current = true;
    const rawVal = event.target.value;
    const currentCursor = event.target.selectionStart;

    // 1. Normalize Arabic and Persian numerals to ASCII digits (1-to-1 length mapping)
    const normalized = normalizeInputText(rawVal);

    // 2. Clean while preserving incomplete drafts during typing ("", "-", "0.", ".")
    const cleaned = cleanNumericDraft(normalized, allowDecimals);
    const finalDraft = allowNegative ? cleaned : cleaned.replace(/-/g, '');

    // Track cursor position to prevent jumping to the end
    cursorPositionRef.current = currentCursor;

    // Update draft state (user can freely delete to empty string "")
    setDraft(finalDraft);

    // Parse numeric value for parent calculation without mutating the draft text
    const parsed = parseSafeNumber(finalDraft, 0);
    lastCommittedNumRef.current = parsed;
    onChange(parsed);
  };

  const handleBlur = () => {
    isEditingRef.current = false;
    cursorPositionRef.current = null;

    // On blur: format and finalize the value cleanly
    const cleaned = cleanNumericDraft(draft, allowDecimals);
    let num = parseSafeNumber(cleaned, 0);

    if (min !== undefined) num = Math.max(min, num);
    if (max !== undefined) num = Math.min(max, num);

    lastCommittedNumRef.current = num;
    setDraft(num === 0 ? '' : String(num));
    onChange(num);
    if (onBlur) {
      onBlur(num);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    // Ensure standard Backspace & Delete behavior without interference
    if (event.key === 'Backspace' || event.key === 'Delete') {
      isEditingRef.current = true;
    }
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
        autoCapitalize="off"
        spellCheck="false"
        step={step}
        disabled={disabled}
        value={draft}
        onFocus={handleFocus}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
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
