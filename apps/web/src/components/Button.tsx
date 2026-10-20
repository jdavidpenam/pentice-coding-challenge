import type { ButtonHTMLAttributes } from 'react';
import './Button.css';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: 'primary' | 'secondary' | 'text' | 'ink';
  /** While true the button is disabled and shows `loadingLabel` (prevents double submit). */
  readonly loading?: boolean;
  readonly loadingLabel?: string;
  readonly block?: boolean;
}

export function Button({ variant = 'primary', loading = false, loadingLabel, block = false, disabled, children, className, type = 'button', ...rest }: Props) {
  const classes = ['btn', `btn--${variant}`, block ? 'btn--block' : '', className ?? ''].filter(Boolean).join(' ');
  return (
    <button {...rest} type={type} className={classes} disabled={disabled === true || loading} aria-busy={loading || undefined}>
      {loading && loadingLabel ? loadingLabel : children}
    </button>
  );
}
