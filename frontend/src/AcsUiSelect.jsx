import React, { useMemo, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { useAcsTr } from './i18n';

export default function AcsUiSelect({ value, onChange, options, label, className = '', minWidth }) {
  const t = useAcsTr();
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const rootRef = useRef(null);

  const normalized = useMemo(() => options.map(option => (
    Array.isArray(option)
      ? { value: option[0], label: option[1], count: option[2] }
      : option
  )), [options]);

  const selected = normalized.find(option => String(option.value) === String(value)) || normalized[0];
  const textFor = option => {
    const text = t(option?.label || '');
    return option?.count === undefined ? text : `${text} (${option.count})`;
  };

  const toggle = () => {
    setOpen(current => {
      const next = !current;
      if (next && rootRef.current) {
        const rect = rootRef.current.getBoundingClientRect();
        setDropUp(window.innerHeight - rect.bottom < 340 && rect.top > 340);
      }
      return next;
    });
  };

  return (
    <div
      ref={rootRef}
      className={`acs-ui-select ${dropUp ? 'drop-up' : ''} ${className}`.trim()}
      style={minWidth ? { minWidth } : undefined}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        className={open ? 'open' : ''}
        aria-label={label ? t(label) : undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={toggle}
      >
        <span>{textFor(selected)}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="acs-ui-select-menu" role="listbox">
          {normalized.map(option => {
            const active = String(option.value) === String(value);
            return (
              <button
                type="button"
                role="option"
                aria-selected={active}
                className={active ? 'active' : ''}
                key={String(option.value)}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span>{textFor(option)}</span>
                {active && <Check size={15} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
