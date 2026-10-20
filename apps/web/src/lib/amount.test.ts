import { describe, expect, it } from 'vitest';
import { sanitizeAmountInput, validateAmount } from './amount';

describe('validateAmount (handoff rules, in order)', () => {
  it.each([
    ['12.34', 1234],
    ['0.29', 29],
    ['.5', 50],
    ['1,234.50', 123_450],
    [' $7 ', 700],
    ['1000000', 100_000_000],
    ['0001.10', 110],
  ])('accepts %j as %d cents', (raw, minor) => {
    expect(validateAmount(raw)).toEqual({ ok: true, minor });
  });

  it.each([
    ['', 'Enter an amount.'],
    ['   ', 'Enter an amount.'],
    ['1.234', 'Use numbers with up to 2 decimals, like 12.34.'],
    ['1e3', 'Use numbers with up to 2 decimals, like 12.34.'],
    ['-5', 'Use numbers with up to 2 decimals, like 12.34.'],
    ['5.', 'Use numbers with up to 2 decimals, like 12.34.'],
    ['1.2.3', 'Use numbers with up to 2 decimals, like 12.34.'],
    ['0', 'Enter an amount greater than $0.00.'],
    ['0.00', 'Enter an amount greater than $0.00.'],
    ['1000000.01', 'The maximum is $1,000,000.00.'],
    ['99999999999999999999', 'The maximum is $1,000,000.00.'],
  ])('rejects %j with the exact copy', (raw, error) => {
    expect(validateAmount(raw)).toEqual({ ok: false, error });
  });

  it('strips characters other than digits, dots and commas while typing', () => {
    expect(sanitizeAmountInput('$1a,2-3.4b5')).toBe('1,23.45');
  });
});
