import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cleanNumericDraft, parseSafeNumber, normalizeInputText } from '../../utils/inputSafety';

export interface NumericInputProps {
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

/**
 * Production-grade Android & Desktop Numeric Input Component
 * Solves:
 * 1. Android Virtual Keyboard (Gboard, Samsung Keyboard) Backspace & Delete at end, middle, or selection.
 * 2. Cursor restoration in useLayoutEffect on every keystroke to prevent React from resetting cursor to end.
 * 3. Exact 1-to-1 Arabic (٠-٩) and Persian (۰-۹) numeral normalization with cursor alignment.
 * 4. EMPTY ≠ ZERO principle: Full deletion yields "" during editing without snapping back to "0".
 * 5. Selection deletion (e.g., selecting "345" in "12345" and hitting Backspace/Delete results in "12").
 */
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
  // Internal draft text representation of the input
  const [draft, setDraft] = useState<string>(() => (value === 0 ? '' : String(value)));

  const isEditingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastCommittedNumRef = useRef<number>(value);
  // Always track the intended cursor position
  const cursorPositionRef = useRef<number | null>(null);

  // Sync with external value changes ONLY when the user is NOT actively editing or focused
  useEffect(() => {
    const isCurrentlyFocused =
      typeof document !== 'undefined' && inputRef.current === document.activeElement;

    if (isEditingRef.current || isCurrentlyFocused) {
      return;
    }

    if (value !== lastCommittedNumRef.current) {
      lastCommittedNumRef.current = value;
      setDraft(value === 0 ? '' : String(value));
    }
  }, [value]);

  // Restore cursor position on EVERY render where a position was tracked
  // This is vital on Android Chrome/WebView because React controlled component reconciliation
  // resets selectionStart to the end of the input when input.value is assigned.
  useLayoutEffect(() => {
    if (cursorPositionRef.current !== null && inputRef.current) {
      if (typeof document !== 'undefined' && document.activeElement === inputRef.current) {
        const targetPos = Math.min(cursorPositionRef.current, inputRef.current.value.length);
        try {
          inputRef.current.setSelectionRange(targetPos, targetPos);
        } catch {
          // ignore if input type or state does not support selection
        }
      }
      cursorPositionRef.current = null;
    }
  });

  const handleFocus = (event: React.FocusEvent<HTMLInputElement>) => {
    isEditingRef.current = true;
    if (autoSelectOnFocus) {
      event.target.select();
    }
  };

  /**
   * Android beforeinput interception:
   * Handles virtual keyboard Backspace (deleteContentBackward) and Delete (deleteContentForward)
   * explicitly for maximum reliability across Samsung, Gboard, and Xiaomi keyboards.
   */
  const handleBeforeInput = (event: React.FormEvent<HTMLInputElement>) => {
    const nativeEvent = event.nativeEvent as InputEvent;
    if (!nativeEvent || !inputRef.current) return;

    const input = inputRef.current;
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? 0;
    const currentVal = input.value;

    if (nativeEvent.inputType === 'deleteContentBackward') {
      isEditingRef.current = true;
      if (start !== end) {
        // Range selection deletion
        const newText = currentVal.substring(0, start) + currentVal.substring(end);
        cursorPositionRef.current = start;
        applyNewValue(newText, start);
        event.preventDefault();
      } else if (start > 0) {
        // Single character backspace before cursor
        const newText = currentVal.substring(0, start - 1) + currentVal.substring(start);
        cursorPositionRef.current = start - 1;
        applyNewValue(newText, start - 1);
        event.preventDefault();
      }
    } else if (nativeEvent.inputType === 'deleteContentForward') {
      isEditingRef.current = true;
      if (start !== end) {
        // Range selection deletion
        const newText = currentVal.substring(0, start) + currentVal.substring(end);
        cursorPositionRef.current = start;
        applyNewValue(newText, start);
        event.preventDefault();
      } else if (start < currentVal.length) {
        // Single character delete after cursor
        const newText = currentVal.substring(0, start) + currentVal.substring(start + 1);
        cursorPositionRef.current = start;
        applyNewValue(newText, start);
        event.preventDefault();
      }
    }
  };

  const applyNewValue = (rawVal: string, targetCursor: number | null) => {
    // 1. Normalize Arabic and Persian numerals to ASCII digits (1-to-1 character length mapping)
    const normalized = normalizeInputText(rawVal);

    // 2. Clean while preserving incomplete drafts during typing ("", "-", "0.", ".")
    const cleaned = cleanNumericDraft(normalized, allowDecimals);
    const finalDraft = allowNegative ? cleaned : cleaned.replace(/-/g, '');

    // Track cursor
    if (targetCursor !== null) {
      cursorPositionRef.current = Math.min(targetCursor, finalDraft.length);
    }

    setDraft(finalDraft);

    // Parse numeric value for parent calculation without mutating the draft text
    const parsed = parseSafeNumber(finalDraft, 0);
    lastCommittedNumRef.current = parsed;
    onChange(parsed);
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    isEditingRef.current = true;
    const rawVal = event.target.value;
    const currentCursor = event.target.selectionStart;
    applyNewValue(rawVal, currentCursor);
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
    isEditingRef.current = true;
    if (event.key === 'Backspace' || event.key === 'Delete') {
      // Hardware / Desktop keyboard backspace / delete
      const input = inputRef.current;
      if (!input) return;
      const start = input.selectionStart ?? 0;
      const end = input.selectionEnd ?? 0;
      const currentVal = input.value;

      if (event.key === 'Backspace') {
        if (start !== end) {
          const newText = currentVal.substring(0, start) + currentVal.substring(end);
          cursorPositionRef.current = start;
          applyNewValue(newText, start);
          event.preventDefault();
        } else if (start > 0) {
          const newText = currentVal.substring(0, start - 1) + currentVal.substring(start);
          cursorPositionRef.current = start - 1;
          applyNewValue(newText, start - 1);
          event.preventDefault();
        }
      } else if (event.key === 'Delete') {
        if (start !== end) {
          const newText = currentVal.substring(0, start) + currentVal.substring(end);
          cursorPositionRef.current = start;
          applyNewValue(newText, start);
          event.preventDefault();
        } else if (start < currentVal.length) {
          const newText = currentVal.substring(0, start) + currentVal.substring(start + 1);
          cursorPositionRef.current = start;
          applyNewValue(newText, start);
          event.preventDefault();
        }
      }
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
        data-form-type="other"
        step={step}
        disabled={disabled}
        value={draft}
        onFocus={handleFocus}
        onBeforeInput={handleBeforeInput}
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
