/**
 * TimeframeSelect: compact dropdown pill with a floating option window for picking one of the
 * Dashboard timeframes (Today, Last week, Last 30 days, All time). Used in the popup header where
 * a full row of chips won't fit.
 *
 * Context: popup
 * Docs: docs/modules.md#ui
 */

import { ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import { TIMEFRAMES, type TimeframeId } from '../timeframe.helpers';

interface TimeframeSelectProps {
  value: TimeframeId;
  onChange: (timeframe: TimeframeId) => void;
}

export function TimeframeSelect({ value, onChange }: TimeframeSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();

  const activeLabel = TIMEFRAMES.find((tf) => tf.id === value)?.label ?? 'Today';

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  function focusOption(index: number) {
    const count = TIMEFRAMES.length;
    const next = ((index % count) + count) % count;
    optionRefs.current[next]?.focus();
  }

  function openAndFocus(index: number) {
    setOpen(true);
    requestAnimationFrame(() => focusOption(index));
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const activeIndex = TIMEFRAMES.findIndex((tf) => tf.id === value);
      openAndFocus(activeIndex >= 0 ? activeIndex : 0);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
    }
  }

  function handleOptionKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusOption(index + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusOption(index - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusOption(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusOption(TIMEFRAMES.length - 1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (!rootRef.current?.contains(event.relatedTarget as Node | null)) {
      setOpen(false);
    }
  }

  function select(id: TimeframeId) {
    onChange(id);
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div className="timeframe-select" ref={rootRef} onBlur={handleBlur}>
      <button
        ref={triggerRef}
        type="button"
        className="timeframe-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Timeframe: ${activeLabel}`}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        onKeyDown={handleTriggerKeyDown}
      >
        <span>{activeLabel}</span>
        <ChevronDown
          className={
            open
              ? 'timeframe-select-chevron timeframe-select-chevron--open'
              : 'timeframe-select-chevron'
          }
          aria-hidden="true"
        />
      </button>
      {open && (
        <div id={menuId} className="timeframe-select-menu" role="listbox" aria-label="Timeframe">
          {TIMEFRAMES.map(({ id, label }, index) => (
            <button
              key={id}
              ref={(el) => {
                optionRefs.current[index] = el;
              }}
              type="button"
              role="option"
              aria-selected={id === value}
              className="timeframe-select-option"
              onClick={() => select(id)}
              onKeyDown={(event) => handleOptionKeyDown(event, index)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
