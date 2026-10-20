import type { Currency } from '../common/money.js';

export interface User {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
}

export interface Account {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly currency: Currency;
  /** Integer cents. Changed only by LedgerService; always equals the sum of this account's ledger entries. */
  readonly balanceMinor: number;
  readonly createdAt: string;
}

export type LedgerEntryKind = 'SEED' | 'TRANSFER_OUT' | 'TRANSFER_IN' | 'PAYMENT_HOLD' | 'PAYMENT_RELEASE';

export interface LedgerEntry {
  readonly id: string;
  readonly accountId: string;
  readonly kind: LedgerEntryKind;
  /** Signed integer cents: negative = money out of the account. */
  readonly amountMinor: number;
  readonly balanceAfterMinor: number;
  /** Transfer ID, payment ID, or 'seed'. */
  readonly referenceId: string;
  readonly createdAt: string;
}

export interface Transfer {
  readonly id: string;
  readonly fromAccountId: string;
  readonly toAccountId: string;
  readonly amountMinor: number;
  readonly currency: Currency;
  readonly initiatedByUserId: string;
  readonly createdAt: string;
}

export type ProviderOutcome =
  | { readonly status: 'succeeded'; readonly providerChargeId: string }
  | { readonly status: 'declined'; readonly reason: string };

/** One call to the payment provider and what came back. */
export type PaymentAttempt =
  | { readonly at: string; readonly outcome: ProviderOutcome }
  | { readonly at: string; readonly error: 'PROVIDER_ERROR' };

interface PaymentBase {
  readonly id: string;
  readonly userId: string;
  readonly accountId: string;
  readonly amountMinor: number;
  readonly currency: Currency;
  readonly reference: string;
  readonly attempts: readonly PaymentAttempt[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * PENDING   — funds held from the account, provider has not given a definitive answer.
 * SUCCEEDED — provider confirmed the charge; the hold is the final debit.
 * FAILED    — provider definitively declined; the hold was released back to the account.
 */
export type Payment =
  | (PaymentBase & { readonly status: 'PENDING' })
  | (PaymentBase & { readonly status: 'SUCCEEDED'; readonly providerChargeId: string })
  | (PaymentBase & { readonly status: 'FAILED'; readonly failureReason: string });

export type PaymentStatus = Payment['status'];
