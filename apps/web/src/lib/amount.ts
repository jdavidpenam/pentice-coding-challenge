/** Amount validation exactly as specified in the Calm wallet handoff (rules are applied in this order). */

export const MAX_AMOUNT_MINOR = 100_000_000; // $1,000,000.00 — the API's per-operation limit

export type AmountCheck = { readonly ok: true; readonly minor: number } | { readonly ok: false; readonly error: string };

const PATTERN = /^(\d+(\.\d{1,2})?|\.\d{1,2})$/;

/** Removes anything that isn't a digit, "." or "," while typing. */
export function sanitizeAmountInput(raw: string): string {
  return raw.replace(/[^\d.,]/g, '');
}

/** Converts with string arithmetic only — no floats, no rounding, nothing silently repaired. */
export function validateAmount(raw: string): AmountCheck {
  const cleaned = raw.replace(/[\s,$]/g, '');
  if (cleaned === '') return { ok: false, error: 'Enter an amount.' };
  if (!PATTERN.test(cleaned)) return { ok: false, error: 'Use numbers with up to 2 decimals, like 12.34.' };
  const [rawWhole = '', fraction = ''] = cleaned.split('.');
  const whole = rawWhole.replace(/^0+/, '');
  // More than 7 whole digits is at least $10,000,000 — over the limit, and too big to convert safely.
  if (whole.length > 7) return { ok: false, error: 'The maximum is $1,000,000.00.' };
  const minor = Number(whole === '' ? '0' : whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (minor <= 0) return { ok: false, error: 'Enter an amount greater than $0.00.' };
  if (minor > MAX_AMOUNT_MINOR) return { ok: false, error: 'The maximum is $1,000,000.00.' };
  return { ok: true, minor };
}
