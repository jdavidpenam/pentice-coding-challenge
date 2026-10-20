import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { ProviderLookup, ProviderOutcome } from '../store/models.js';
import { ProviderTimeoutError, type ChargeRequest, type PaymentProvider } from './payment-provider.js';

/**
 * Deterministic scenarios for NEW charge keys (a repeated key always returns its stored outcome):
 * - approve               charge succeeds
 * - decline               definitive rejection, nothing charged
 * - timeout_before_charge the request "times out" before the provider records anything
 * - charge_then_timeout   the provider charges, then the response is lost (we see a timeout)
 */
export const SIMULATOR_MODES = ['approve', 'decline', 'timeout_before_charge', 'charge_then_timeout'] as const;
export type SimulatorMode = (typeof SIMULATOR_MODES)[number];

interface SimulatedOperation {
  readonly request: ChargeRequest;
  readonly outcome: ProviderOutcome;
}

/**
 * A stand-in for an external payment provider. It keeps its own operation records, completely separate from the app's
 * payments, accounts, and ledger — the app learns outcomes only through `charge()` and `lookup()`.
 * Behaviour is chosen by `mode` (dev endpoint or tests), never by the payment request, and never randomly.
 */
@Injectable()
export class SimulatedPaymentProvider implements PaymentProvider {
  private mode: SimulatorMode = 'approve';
  private readonly operations = new Map<string, SimulatedOperation>();
  private chargeCalls = 0;

  charge(request: ChargeRequest): Promise<ProviderOutcome> {
    this.chargeCalls += 1;
    const existing = this.operations.get(request.idempotencyKey);
    if (existing) return Promise.resolve(existing.outcome);

    switch (this.mode) {
      case 'approve':
        return Promise.resolve(this.record(request, { status: 'succeeded', providerChargeId: `sim_ch_${randomUUID()}` }));
      case 'decline':
        return Promise.resolve(this.record(request, { status: 'declined', reason: 'Declined by the simulated provider.' }));
      case 'timeout_before_charge':
        return Promise.reject(new ProviderTimeoutError());
      case 'charge_then_timeout':
        this.record(request, { status: 'succeeded', providerChargeId: `sim_ch_${randomUUID()}` });
        return Promise.reject(new ProviderTimeoutError());
      default: {
        const unhandled: never = this.mode;
        return Promise.reject(new Error(`Unknown simulator mode ${String(unhandled)}`));
      }
    }
  }

  lookup(idempotencyKey: string): Promise<ProviderLookup> {
    return Promise.resolve(this.operations.get(idempotencyKey)?.outcome ?? { status: 'not_found' });
  }

  private record(request: ChargeRequest, outcome: ProviderOutcome): ProviderOutcome {
    this.operations.set(request.idempotencyKey, { request, outcome });
    return outcome;
  }

  // --- simulation controls (dev endpoint and tests only) ---

  configure(options: { mode: SimulatorMode }): void {
    this.mode = options.mode;
  }

  inspect(): { mode: SimulatorMode; chargeCalls: number; successfulCharges: number; operations: number } {
    const all = [...this.operations.values()];
    return {
      mode: this.mode,
      chargeCalls: this.chargeCalls,
      successfulCharges: all.filter((op) => op.outcome.status === 'succeeded').length,
      operations: all.length,
    };
  }

  /** Test helper: how many times this key was actually charged (0 or 1 — the simulator dedupes). */
  chargedTimes(idempotencyKey: string): number {
    return this.operations.get(idempotencyKey)?.outcome.status === 'succeeded' ? 1 : 0;
  }
}
