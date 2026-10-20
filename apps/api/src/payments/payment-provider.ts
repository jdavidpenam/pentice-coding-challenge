import type { Currency } from '../common/money.js';
import type { ProviderOutcome } from '../store/models.js';

/** DI token: PaymentsService depends on this interface, never on a concrete provider. */
export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export interface ChargeRequest {
  /** Server-generated payment ID. A real provider must use it as its idempotency key. */
  readonly idempotencyKey: string;
  readonly amountMinor: number;
  readonly currency: Currency;
  readonly reference: string;
}

/**
 * The seam for a real provider. An adapter maps the provider's SDK/API onto this:
 * - resolve `succeeded` only when the provider confirmed the charge;
 * - resolve `declined` only when the provider definitively refused it (nothing was charged);
 * - throw for anything else (network error, timeout, 5xx) — the outcome is then unknown.
 */
export interface PaymentProvider {
  charge(request: ChargeRequest): Promise<ProviderOutcome>;
}
