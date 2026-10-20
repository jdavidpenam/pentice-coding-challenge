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
  /** Spendable integer cents. Changed only by LedgerService; equals the sum of this account's available deltas. */
  readonly availableMinor: number;
  /** Cents held for unresolved payments (PROCESSING/UNKNOWN). Not spendable. Equals the sum of reserved deltas. */
  readonly reservedMinor: number;
  readonly createdAt: string;
}

export type LedgerEntryKind =
  | 'SEED'
  | 'TRANSFER_OUT'
  | 'TRANSFER_IN'
  | 'PAYMENT_RESERVE'
  | 'PAYMENT_RELEASE'
  | 'PAYMENT_CAPTURE';

export interface LedgerEntry {
  readonly id: string;
  readonly accountId: string;
  readonly kind: LedgerEntryKind;
  /** Signed change to available funds, in cents. */
  readonly availableDeltaMinor: number;
  /** Signed change to reserved funds, in cents. */
  readonly reservedDeltaMinor: number;
  readonly availableAfterMinor: number;
  readonly reservedAfterMinor: number;
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

/** A definitive answer from the payment provider. */
export type ProviderOutcome =
  | { readonly status: 'succeeded'; readonly providerChargeId: string }
  | { readonly status: 'declined'; readonly reason: string };

/** What a lookup by idempotency key can say. `not_found` means "no record yet" — never proof it can't be charged. */
export type ProviderLookup = ProviderOutcome | { readonly status: 'pending' } | { readonly status: 'not_found' };

/** One interaction with the provider, kept for inspection. */
export interface PaymentAttempt {
  readonly at: string;
  readonly operation: 'charge' | 'lookup';
  readonly result: 'succeeded' | 'declined' | 'pending' | 'not_found' | 'timeout' | 'error';
}

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
 * PROCESSING — funds reserved; exactly one provider call for this payment is in flight.
 * UNKNOWN    — funds reserved; the last provider call gave no definitive answer. Needs reconciliation.
 * SUCCEEDED  — provider confirmed; the reservation was captured (money left) exactly once. Terminal.
 * FAILED     — provider definitively declined; the reservation was released exactly once. Terminal.
 */
export type Payment =
  | (PaymentBase & { readonly status: 'PROCESSING' })
  | (PaymentBase & { readonly status: 'UNKNOWN' })
  | (PaymentBase & { readonly status: 'SUCCEEDED'; readonly providerChargeId: string })
  | (PaymentBase & { readonly status: 'FAILED'; readonly failureReason: string });

export type PaymentStatus = Payment['status'];

/** Client idempotency record, scoped by (userId, operation, key). */
export interface IdempotencyRecord {
  readonly paymentId: string;
  /** Normalized business payload the key is bound to. */
  readonly fingerprint: string;
}
