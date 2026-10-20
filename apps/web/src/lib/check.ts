import type { Payment } from '../api';
import type { Tone } from '../components/StatusBadge';
import { clock, money } from './format';

/** Result of a "Check status" call. Kept in app state keyed by payment id, so it survives row re-renders. */
export interface CheckResult {
  readonly at: string;
  readonly text: string;
  readonly tone: Tone;
}

export function describeCheck(payment: Payment, at: Date = new Date()): CheckResult {
  const iso = at.toISOString();
  switch (payment.status) {
    case 'SUCCEEDED':
      return { at: iso, tone: 'success', text: `the provider confirmed the charge. ${money(payment.amountMinor)} left Reserved as a payment.` };
    case 'FAILED':
      return { at: iso, tone: 'danger', text: `the provider declined. ${money(payment.amountMinor)} is back in Available.` };
    case 'UNKNOWN':
    case 'PROCESSING':
      return { at: iso, tone: 'warning', text: 'still waiting on the provider. Nothing changed; try again later.' };
  }
}

export function checkedLabel(result: CheckResult): string {
  return `Checked ${clock(result.at)}`;
}
