import type { Currency } from '../common/money.js';
import type { ProviderLookup, ProviderOutcome } from '../store/models.js';

/** DI token: PaymentsService depends on this interface, never on a concrete provider. */
export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export interface ChargeRequest {
  /** Server-generated payment ID, reused unchanged for every retry and lookup of this payment. */
  readonly idempotencyKey: string;
  readonly amountMinor: number;
  readonly currency: Currency;
  readonly reference: string;
}

/**
 * The seam for a real provider. What we REQUIRE of one (not every provider offers all of it — check before choosing):
 * - `charge` honours `idempotencyKey`: repeating it never charges twice, and returns the original outcome;
 * - `lookup` finds an operation by that same key, even if we never received the charge response;
 * - a decline is definitive (nothing was or will be charged for that key).
 *
 * Adapter rules:
 * - `charge`: resolve `succeeded` only when confirmed, `declined` only when definitive; THROW for anything else
 *   (timeout, network error, 5xx) — the outcome is then unknown, and must never be treated as a failure.
 * - `lookup`: `pending` when the provider has the operation but no final result; `not_found` when it has no record
 *   *yet* — that is not proof the charge cannot still happen. Throw if the lookup itself fails.
 */
export interface PaymentProvider {
  charge(request: ChargeRequest): Promise<ProviderOutcome>;
  lookup(idempotencyKey: string): Promise<ProviderLookup>;
}

/** Thrown by adapters (or the service's own timer) when no answer arrived in time. */
export class ProviderTimeoutError extends Error {
  constructor() {
    super('Payment provider timed out');
    this.name = 'ProviderTimeoutError';
  }
}
