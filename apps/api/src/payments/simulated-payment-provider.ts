import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { Injectable } from '@nestjs/common';
import type { ProviderOutcome } from '../store/models.js';
import type { ChargeRequest, PaymentProvider } from './payment-provider.js';

export const SIMULATOR_MODES = ['approve', 'decline'] as const;
export type SimulatorMode = (typeof SIMULATOR_MODES)[number];

interface SimulatedCharge {
  readonly request: ChargeRequest;
  readonly outcome: ProviderOutcome;
}

/**
 * A stand-in for an external payment provider. It keeps its own books (`charges`), completely separate from
 * the app's accounts and ledger — the app learns outcomes only through `charge()`'s return value.
 * Deterministic: the outcome is set by `mode` (dev endpoint or tests), never by the payment request.
 */
@Injectable()
export class SimulatedPaymentProvider implements PaymentProvider {
  private mode: SimulatorMode = 'approve';
  private latencyMs = 0;
  private readonly charges = new Map<string, SimulatedCharge>();

  async charge(request: ChargeRequest): Promise<ProviderOutcome> {
    if (this.latencyMs > 0) await delay(this.latencyMs);
    // Like real providers, a repeated idempotency key returns the original outcome and does not charge again.
    const existing = this.charges.get(request.idempotencyKey);
    if (existing) return existing.outcome;

    const outcome: ProviderOutcome =
      this.mode === 'approve'
        ? { status: 'succeeded', providerChargeId: `sim_ch_${randomUUID()}` }
        : { status: 'declined', reason: 'Declined by the simulated provider.' };
    this.charges.set(request.idempotencyKey, { request, outcome });
    return outcome;
  }

  // --- simulation controls (dev endpoint and tests only) ---

  configure(options: { mode?: SimulatorMode; latencyMs?: number }): void {
    if (options.mode !== undefined) this.mode = options.mode;
    if (options.latencyMs !== undefined) this.latencyMs = options.latencyMs;
  }

  inspect(): { mode: SimulatorMode; latencyMs: number; successfulCharges: number; totalCalls: number } {
    const all = [...this.charges.values()];
    return {
      mode: this.mode,
      latencyMs: this.latencyMs,
      successfulCharges: all.filter((c) => c.outcome.status === 'succeeded').length,
      totalCalls: all.length,
    };
  }
}
