import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { AccountsService } from '../accounts/accounts.service.js';
import { nowIso } from '../common/clock.js';
import { DomainError, notFound } from '../common/errors.js';
import { CURRENCY } from '../common/money.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { InMemoryStore } from '../store/in-memory-store.js';
import type { Payment, PaymentAttempt, ProviderOutcome, User } from '../store/models.js';
import { PAYMENT_PROVIDER, ProviderTimeoutError, type PaymentProvider } from './payment-provider.js';

export const PAYMENTS_CONFIG = Symbol('PAYMENTS_CONFIG');
export interface PaymentsConfig {
  /** How long to wait for any single provider call before treating its outcome as unknown. */
  readonly providerTimeoutMs: number;
}

/**
 * Payment flow and state machine (PLAN.md A3.3):
 *
 *   create ─reserve→ PROCESSING ─succeeded→ SUCCEEDED (capture once)
 *                         │     ─declined→  FAILED    (release once)
 *                         └─timeout/error/pending→ UNKNOWN (reservation kept)
 *   UNKNOWN ─reconcile / same-key retry→ PROCESSING → lookup (→ re-charge with the SAME key if not_found) → …
 *
 * Every state change below is a synchronous compare-and-set done together with its ledger entry, with no `await`
 * inside. Provider calls happen only while the payment is PROCESSING, and only the caller that moved it into
 * PROCESSING may make one — so concurrent reconciles/retries can never double-capture, double-release, or race.
 * Guarantees are for this single process with in-memory state (no crash recovery or durable idempotency).
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger('Payments');

  constructor(
    private readonly store: InMemoryStore,
    private readonly ledger: LedgerService,
    private readonly accounts: AccountsService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    @Inject(PAYMENTS_CONFIG) private readonly config: PaymentsConfig,
  ) {}

  /**
   * Same (user, key) + same payload → the existing payment (reconciled first if UNKNOWN); never a second reserve or
   * charge. Same key + different payload → 409. Rejected requests record no key.
   */
  async create(
    actingUser: User,
    idempotencyKey: string,
    command: { accountId: string; amountMinor: number; reference: string },
  ): Promise<Payment> {
    const scope = `${actingUser.id}:payment:${idempotencyKey}`;
    const fingerprint = JSON.stringify([command.accountId, command.amountMinor, command.reference]);

    const existing = this.store.idempotency.get(scope);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new DomainError('IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was already used for a different payment.');
      }
      this.logger.log(JSON.stringify({ event: 'payment.idempotent_replay', paymentId: existing.paymentId }));
      const payment = this.require(existing.paymentId);
      return payment.status === 'UNKNOWN' ? this.reconcileUnknown(payment.id) : payment;
    }

    // From here to the provider call everything is synchronous: ownership, reservation, payment record, and key
    // are written together, so a simultaneous duplicate request will find the key above.
    const account = this.accounts.getOwned(actingUser, command.accountId);
    const createdAt = nowIso();
    const payment: Payment = {
      id: randomUUID(),
      userId: actingUser.id,
      accountId: account.id,
      amountMinor: command.amountMinor,
      currency: CURRENCY,
      reference: command.reference,
      status: 'PROCESSING',
      attempts: [],
      createdAt,
      updatedAt: createdAt,
    };
    this.ledger.reserveForPayment({ paymentId: payment.id, accountId: account.id, amountMinor: payment.amountMinor });
    this.store.payments.set(payment.id, payment);
    this.store.idempotency.set(scope, { paymentId: payment.id, fingerprint });
    this.log('payment.reserved', payment);

    return this.chargeAndSettle(payment.id);
  }

  /** Resolve an UNKNOWN payment by asking the provider. Terminal and in-flight payments are returned unchanged. */
  async reconcile(actingUser: User, paymentId: string): Promise<Payment> {
    const payment = this.getOwned(actingUser, paymentId);
    return payment.status === 'UNKNOWN' ? this.reconcileUnknown(payment.id) : payment;
  }

  listFor(actingUser: User): Payment[] {
    return [...this.store.payments.values()].filter((p) => p.userId === actingUser.id).reverse();
  }

  getOwned(actingUser: User, paymentId: string): Payment {
    const payment = this.store.payments.get(paymentId);
    if (!payment || payment.userId !== actingUser.id) throw notFound('Payment');
    return payment;
  }

  // --- provider interaction (only while this caller holds the payment in PROCESSING) ---

  private async chargeAndSettle(paymentId: string): Promise<Payment> {
    const payment = this.require(paymentId);
    let outcome: ProviderOutcome;
    try {
      // Amount, currency, reference, and key always come from the stored payment, never from the request.
      outcome = await this.withTimeout(
        this.provider.charge({
          idempotencyKey: payment.id,
          amountMinor: payment.amountMinor,
          currency: payment.currency,
          reference: payment.reference,
        }),
      );
    } catch (error) {
      return this.markUnknown(paymentId, { operation: 'charge', result: timeoutOrError(error) });
    }
    return this.applyOutcome(paymentId, 'charge', outcome);
  }

  private async reconcileUnknown(paymentId: string): Promise<Payment> {
    if (!this.claim(paymentId)) return this.require(paymentId); // someone else holds it, or it's already final

    let lookup;
    try {
      lookup = await this.withTimeout(this.provider.lookup(paymentId));
    } catch (error) {
      return this.markUnknown(paymentId, { operation: 'lookup', result: timeoutOrError(error) });
    }
    switch (lookup.status) {
      case 'succeeded':
      case 'declined':
        return this.applyOutcome(paymentId, 'lookup', lookup);
      case 'pending':
        return this.markUnknown(paymentId, { operation: 'lookup', result: 'pending' });
      case 'not_found':
        // No record yet is not proof it will never be charged: re-send with the SAME key so the provider dedupes.
        this.appendAttempt(paymentId, { operation: 'lookup', result: 'not_found' });
        return this.chargeAndSettle(paymentId);
      default: {
        // A malformed provider answer is not a definitive one: keep the funds reserved and stay reconcilable.
        const unhandled: never = lookup;
        this.logger.error(JSON.stringify({ event: 'payment.malformed_provider_result', paymentId, operation: 'lookup', status: String((unhandled as { status?: unknown }).status) }));
        return this.markUnknown(paymentId, { operation: 'lookup', result: 'error' });
      }
    }
  }

  // --- synchronous compare-and-set transitions ---

  /** UNKNOWN → PROCESSING. Returns true only for the single caller that made the move. */
  private claim(paymentId: string): boolean {
    const current = this.require(paymentId);
    if (current.status !== 'UNKNOWN') return false;
    const { status: _status, ...base } = current;
    this.store.payments.set(paymentId, { ...base, status: 'PROCESSING', updatedAt: nowIso() });
    return true;
  }

  /** PROCESSING → UNKNOWN, keeping the reservation. */
  private markUnknown(paymentId: string, attempt: Omit<PaymentAttempt, 'at'>): Payment {
    const current = this.require(paymentId);
    if (current.status !== 'PROCESSING') return current;
    const at = nowIso();
    const { status: _status, ...base } = current;
    const next: Payment = { ...base, attempts: [...base.attempts, { ...attempt, at }], updatedAt: at, status: 'UNKNOWN' };
    this.store.payments.set(paymentId, next);
    this.log('payment.unknown', next);
    return next;
  }

  /** PROCESSING → SUCCEEDED (capture) or FAILED (release). The ledger write and the status change happen together. */
  private applyOutcome(paymentId: string, operation: PaymentAttempt['operation'], outcome: ProviderOutcome): Payment {
    const current = this.require(paymentId);
    if (current.status !== 'PROCESSING') return current;
    const at = nowIso();
    const { status: _status, ...base } = current;
    const attempts = [...base.attempts, { at, operation, result: outcome.status }];
    const money = { paymentId, accountId: base.accountId, amountMinor: base.amountMinor };
    let next: Payment;
    switch (outcome.status) {
      case 'succeeded':
        this.ledger.captureReservation(money);
        next = { ...base, attempts, updatedAt: at, status: 'SUCCEEDED', providerChargeId: outcome.providerChargeId };
        break;
      case 'declined':
        this.ledger.releaseReservation(money);
        next = { ...base, attempts, updatedAt: at, status: 'FAILED', failureReason: outcome.reason };
        break;
      default: {
        // A malformed provider answer is not a definitive one: keep the funds reserved and stay reconcilable.
        const unhandled: never = outcome;
        this.logger.error(JSON.stringify({ event: 'payment.malformed_provider_result', paymentId, operation, status: String((unhandled as { status?: unknown }).status) }));
        return this.markUnknown(paymentId, { operation, result: 'error' });
      }
    }
    this.store.payments.set(paymentId, next);
    this.log(next.status === 'SUCCEEDED' ? 'payment.succeeded' : 'payment.failed', next);
    return next;
  }

  private appendAttempt(paymentId: string, attempt: Omit<PaymentAttempt, 'at'>): void {
    const current = this.require(paymentId);
    if (current.status !== 'PROCESSING') return;
    this.store.payments.set(paymentId, { ...current, attempts: [...current.attempts, { ...attempt, at: nowIso() }] });
  }

  /**
   * Races the provider call against our own timer. A late answer after the timeout is ignored on purpose: the payment
   * is then UNKNOWN and gets its definitive state from a lookup, which is the only path that may settle it.
   */
  private withTimeout<T>(work: Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { reject(new ProviderTimeoutError()); }, this.config.providerTimeoutMs);
    });
    work.catch(() => undefined); // a late rejection must not become an unhandled rejection
    return Promise.race([work, timeout]).finally(() => { clearTimeout(timer); });
  }

  private require(paymentId: string): Payment {
    const payment = this.store.payments.get(paymentId);
    if (!payment) throw new Error(`Payment ${paymentId} disappeared`);
    return payment;
  }

  private log(event: string, payment: Payment): void {
    this.logger.log(
      JSON.stringify({ event, paymentId: payment.id, accountId: payment.accountId, amountMinor: payment.amountMinor, status: payment.status }),
    );
  }
}

function timeoutOrError(error: unknown): 'timeout' | 'error' {
  return error instanceof ProviderTimeoutError ? 'timeout' : 'error';
}
