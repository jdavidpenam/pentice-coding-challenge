import { z } from 'zod';

/** The only currency the app supports. Every amount is an integer number of minor units (US cents). */
export const CURRENCY = 'USD';
export type Currency = typeof CURRENCY;

/** Largest amount one transfer or payment may move: $1,000,000.00. */
export const MAX_OPERATION_MINOR = 100_000_000;

/** Largest balance a credit may produce: $10,000,000,000.00 — far below Number.MAX_SAFE_INTEGER. */
export const MAX_BALANCE_MINOR = 1_000_000_000_000;

/**
 * Amount accepted from clients: a JSON integer of cents in 1..MAX_OPERATION_MINOR.
 * Strings, decimals, zero, negatives and unsafe integers are rejected — nothing is coerced or rounded.
 */
export const amountMinorSchema = z.int().min(1).max(MAX_OPERATION_MINOR);

/** Defensive check for internal callers of the ledger (HTTP input is already validated by the schema above). */
export function isValidOperationAmount(amountMinor: number): boolean {
  return Number.isSafeInteger(amountMinor) && amountMinor > 0 && amountMinor <= MAX_OPERATION_MINOR;
}
