/** All money is integer US cents. These helpers convert to/from what people type and read. */

export const MAX_OPERATION_MINOR = 100_000_000; // must match the API ($1,000,000.00)

export type ParsedAmount = { readonly ok: true; readonly minor: number } | { readonly ok: false; readonly error: string };

const AMOUNT_PATTERN = /^(\d{1,7})(?:\.(\d{1,2}))?$/;

/**
 * Parses "12", "12.3", "12.34" into cents using string arithmetic only (no floats, no rounding).
 * Anything else — "1.234", "-5", "1e3", "1,000", " " — is an error, not silently repaired.
 */
export function parseAmount(input: string): ParsedAmount {
  const text = input.trim();
  if (text === '') return { ok: false, error: 'Enter an amount.' };
  const match = AMOUNT_PATTERN.exec(text);
  if (!match) return { ok: false, error: 'Use a plain amount like 12.34 (at most 2 decimals).' };
  const [, whole = '', fraction = ''] = match;
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (minor <= 0) return { ok: false, error: 'Amount must be greater than 0.' };
  if (minor > MAX_OPERATION_MINOR) return { ok: false, error: 'Amount is above the $1,000,000.00 limit.' };
  return { ok: true, minor };
}

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/** Display only. */
export function formatMinor(minor: number): string {
  return usd.format(minor / 100);
}
