import { useId } from 'react';

interface Props {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly error: string | undefined;
}

/** Text input (not type=number) so the exact typed string is parsed by parseAmount, never by the browser. */
export function AmountField({ value, onChange, error }: Props) {
  const errorId = useId();
  return (
    <label>
      Amount (USD)
      <input
        inputMode="decimal"
        autoComplete="off"
        placeholder="0.00"
        value={value}
        onChange={(e) => { onChange(e.target.value); }}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        required
      />
      {error && (
        <span id={errorId} className="field-error">
          {error}
        </span>
      )}
    </label>
  );
}
