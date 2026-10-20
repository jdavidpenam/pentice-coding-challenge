import { describe, expect, it } from 'vitest';
import { formatMinor, parseAmount } from './money';

describe('parseAmount', () => {
  it.each([
    ['1', 100],
    ['0.01', 1],
    ['12.3', 1230],
    ['12.34', 1234],
    [' 7.05 ', 705],
    ['0.29', 29], // 0.29 * 100 is 28.999999999999996 in floating point
    ['1.15', 115],
    ['1000000', 100_000_000],
  ])('parses %j as %d cents', (input, minor) => {
    expect(parseAmount(input)).toEqual({ ok: true, minor });
  });

  it.each(['', '  ', '0', '0.00', '-5', '+5', '1.234', '1e3', '1,000', '.5', '5.', 'abc', '1000000.01', '12345678', 'NaN', 'Infinity'])(
    'rejects %j instead of repairing it',
    (input) => {
      expect(parseAmount(input).ok).toBe(false);
    },
  );
});

describe('formatMinor', () => {
  it('formats cents as USD', () => {
    expect(formatMinor(123456)).toBe('$1,234.56');
    expect(formatMinor(5)).toBe('$0.05');
  });
});
