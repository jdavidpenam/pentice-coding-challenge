import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { AccountsService } from '../accounts/accounts.service.js';
import { nowIso } from '../common/clock.js';
import { notFound } from '../common/errors.js';
import { CURRENCY } from '../common/money.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { InMemoryStore } from '../store/in-memory-store.js';
import type { Payment, ProviderOutcome, User } from '../store/models.js';
import { PAYMENT_PROVIDER, type PaymentProvider } from './payment-provider.js';

/**
 * Payment semantics:
 * 1. Funds are held (debited) in one synchronous step *before* the provider is called, so two concurrent
 *    payments cannot both spend the same balance across the provider `await`.
 * 2. Provider confirms → SUCCEEDED; the hold is the final debit.
 * 3. Provider definitively declines → FAILED; the hold is released.
 * 4. Provider throws (outcome unknown) → stays PENDING with funds held. Releasing could double-spend money the
 *    provider may already have taken. Resolving such payments is the bonus milestone's job; core does not.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger('Payments');

  constructor(
    private readonly store: InMemoryStore,
    private readonly ledger: LedgerService,
    private readonly accounts: AccountsService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  async create(actingUser: User, command: { accountId: string; amountMinor: number; reference: string }): Promise<Payment> {
    const account = this.accounts.getOwned(actingUser, command.accountId);
    const createdAt = nowIso();
    const payment: Payment = {
      id: randomUUID(),
      userId: actingUser.id,
      accountId: account.id,
      amountMinor: command.amountMinor,
      currency: CURRENCY,
      reference: command.reference,
      status: 'PENDING',
      attempts: [],
      createdAt,
      updatedAt: createdAt,
    };
    // Synchronous: hold + record, or (on insufficient funds) throw before anything is written.
    this.ledger.holdForPayment({ paymentId: payment.id, accountId: account.id, amountMinor: payment.amountMinor });
    this.store.payments.set(payment.id, payment);
    this.log('payment.held', payment);

    let outcome: ProviderOutcome;
    try {
      outcome = await this.provider.charge({
        idempotencyKey: payment.id,
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        reference: payment.reference,
      });
    } catch {
      return this.recordProviderError(payment.id);
    }
    return this.settle(payment.id, outcome);
  }

  listFor(actingUser: User): Payment[] {
    return [...this.store.payments.values()].filter((p) => p.userId === actingUser.id).reverse();
  }

  getOwned(actingUser: User, paymentId: string): Payment {
    const payment = this.store.payments.get(paymentId);
    if (!payment || payment.userId !== actingUser.id) throw notFound('Payment');
    return payment;
  }

  /**
   * Applies a definitive provider outcome. Synchronous compare-and-set: only a PENDING payment moves, so if two
   * callers ever settle the same payment, exactly one wins and the hold is released at most once.
   */
  private settle(paymentId: string, outcome: ProviderOutcome): Payment {
    const current = this.requirePayment(paymentId);
    if (current.status !== 'PENDING') return current;
    const { status: _previous, ...base } = current;
    const at = nowIso();
    const attempts = [...base.attempts, { at, outcome }];
    let next: Payment;
    switch (outcome.status) {
      case 'succeeded':
        next = { ...base, attempts, updatedAt: at, status: 'SUCCEEDED', providerChargeId: outcome.providerChargeId };
        break;
      case 'declined':
        this.ledger.releasePaymentHold({ paymentId, accountId: base.accountId, amountMinor: base.amountMinor });
        next = { ...base, attempts, updatedAt: at, status: 'FAILED', failureReason: outcome.reason };
        break;
      default: {
        const unhandled: never = outcome;
        throw new Error(`Unhandled provider outcome: ${JSON.stringify(unhandled)}`);
      }
    }
    this.store.payments.set(paymentId, next);
    this.log(next.status === 'SUCCEEDED' ? 'payment.succeeded' : 'payment.failed', next);
    return next;
  }

  private recordProviderError(paymentId: string): Payment {
    const current = this.requirePayment(paymentId);
    const at = nowIso();
    const next: Payment = { ...current, attempts: [...current.attempts, { at, error: 'PROVIDER_ERROR' }], updatedAt: at };
    this.store.payments.set(paymentId, next);
    this.log('payment.provider_error', next);
    return next;
  }

  private requirePayment(paymentId: string): Payment {
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
