import { describe, expect, it } from 'vitest';
import { delta, money, splitMoney } from './format';

describe('money formatting (integer cents in, text out)', () => {
  it('formats with two decimals, grouping, and a real minus sign', () => {
    expect(money(124_050)).toBe('$1,240.50');
    expect(money(5)).toBe('$0.05');
    expect(money(-1_234)).toBe('−$12.34');
  });
  it('shows explicit signs on deltas and a dash for zero', () => {
    expect(delta(1_800)).toBe('+$18.00');
    expect(delta(-1_800)).toBe('−$18.00');
    expect(delta(0)).toBe('—');
  });
  it('splits cents out for the big balance', () => {
    expect(splitMoney(124_050)).toEqual({ whole: '$1,240', cents: '.50' });
  });
});
