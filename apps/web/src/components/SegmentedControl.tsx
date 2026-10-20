import { useRef, type KeyboardEvent } from 'react';
import './SegmentedControl.css';

interface Props<T extends string> {
  readonly label: string;
  readonly options: readonly { readonly value: T; readonly label: string }[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  /** radio = radiogroup (form choice); tab = tablist (switches a panel). */
  readonly kind?: 'radio' | 'tab';
}

/** Arrow keys move between options (roving tabindex). */
export function SegmentedControl<T extends string>({ label, options, value, onChange, kind = 'radio' }: Props<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  function onKey(event: KeyboardEvent, index: number) {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + options.length) % options.length;
    const option = options[next];
    if (!option) return;
    onChange(option.value);
    refs.current[next]?.focus();
  }
  return (
    <div className="seg" role={kind === 'radio' ? 'radiogroup' : 'tablist'} aria-label={label}>
      {options.map((o, i) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            className={`seg__item${selected ? ' seg__item--on' : ''}`}
            role={kind === 'radio' ? 'radio' : 'tab'}
            aria-checked={kind === 'radio' ? selected : undefined}
            aria-selected={kind === 'tab' ? selected : undefined}
            tabIndex={selected ? 0 : -1}
            onClick={() => { onChange(o.value); }}
            onKeyDown={(e) => { onKey(e, i); }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
