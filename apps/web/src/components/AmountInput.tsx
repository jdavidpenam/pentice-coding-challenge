import type { InputHTMLAttributes } from 'react';
import { sanitizeAmountInput } from '../lib/amount';
import './AmountInput.css';

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  readonly value: string;
  readonly onValueChange: (value: string) => void;
}

/** Text input (not type=number): the exact typed string is validated by validateAmount, never by the browser. */
export function AmountInput({ value, onValueChange, ...rest }: Props) {
  return (
    <div className="amount">
      <span className="amount__currency" aria-hidden="true">$</span>
      <input
        {...rest}
        className="amount__input"
        inputMode="decimal"
        autoComplete="off"
        placeholder="0.00"
        value={value}
        onChange={(e) => { onValueChange(sanitizeAmountInput(e.target.value)); }}
      />
    </div>
  );
}
