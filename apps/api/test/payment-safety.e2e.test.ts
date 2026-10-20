import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { ProviderTimeoutError, type ChargeRequest, type PaymentProvider } from '../src/payments/payment-provider.js';
import type { Payment, ProviderLookup, ProviderOutcome } from '../src/store/models.js';
import { createTestApp, expectSafeError, HEADER, type TestApp, type TestUser } from './helpers.js';

/**
 * Senior-bonus guarantees (PLAN.md A3). Races are forced deterministically: a controllable provider parks calls on
 * deferred promises, so the test decides exactly what happens while a payment is mid-flight.
 */

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

type ChargeScript = 'approve' | 'decline' | 'timeout_before_charge' | 'charge_then_timeout' | 'park';
type LookupScript = 'actual' | 'pending' | 'error' | 'park';

/** Provider with its own records and scripted behaviour. `park` holds the call until the test releases it. */
class ControlledProvider implements PaymentProvider {
  readonly records = new Map<string, ProviderOutcome>();
  readonly chargeRequests: ChargeRequest[] = [];
  readonly lookupKeys: string[] = [];
  chargeScript: ChargeScript = 'approve';
  lookupScript: LookupScript = 'actual';
  private parkedCharge: { arrived: Deferred<void>; release: Deferred<ProviderOutcome> } | undefined;
  private parkedLookup: { arrived: Deferred<void>; release: Deferred<ProviderLookup> } | undefined;

  /** Park the next charge; `arrived` resolves when the service is awaiting it. */
  parkNextCharge() {
    this.chargeScript = 'park';
    this.parkedCharge = { arrived: deferred(), release: deferred() };
    return this.parkedCharge;
  }

  parkNextLookup() {
    this.lookupScript = 'park';
    this.parkedLookup = { arrived: deferred(), release: deferred() };
    return this.parkedLookup;
  }

  charge(request: ChargeRequest): Promise<ProviderOutcome> {
    this.chargeRequests.push(request);
    const existing = this.records.get(request.idempotencyKey);
    if (existing) return Promise.resolve(existing);
    switch (this.chargeScript) {
      case 'approve':
        return Promise.resolve(this.record(request.idempotencyKey, { status: 'succeeded', providerChargeId: `ch_${randomUUID()}` }));
      case 'decline':
        return Promise.resolve(this.record(request.idempotencyKey, { status: 'declined', reason: 'Card declined.' }));
      case 'timeout_before_charge':
        return Promise.reject(new ProviderTimeoutError());
      case 'charge_then_timeout':
        this.record(request.idempotencyKey, { status: 'succeeded', providerChargeId: `ch_${randomUUID()}` });
        return Promise.reject(new ProviderTimeoutError());
      case 'park': {
        const parked = this.parkedCharge;
        if (!parked) throw new Error('nothing parked');
        this.chargeScript = 'approve';
        parked.arrived.resolve();
        return parked.release.promise.then((outcome) => this.record(request.idempotencyKey, outcome));
      }
    }
  }

  lookup(key: string): Promise<ProviderLookup> {
    this.lookupKeys.push(key);
    switch (this.lookupScript) {
      case 'actual':
        return Promise.resolve(this.records.get(key) ?? { status: 'not_found' });
      case 'pending':
        return Promise.resolve({ status: 'pending' });
      case 'error':
        return Promise.reject(new Error('lookup failed'));
      case 'park': {
        const parked = this.parkedLookup;
        if (!parked) throw new Error('nothing parked');
        this.lookupScript = 'actual';
        parked.arrived.resolve();
        return parked.release.promise;
      }
    }
  }

  successfulCharges(key: string): number {
    return this.records.get(key)?.status === 'succeeded' ? 1 : 0;
  }

  private record(key: string, outcome: ProviderOutcome): ProviderOutcome {
    this.records.set(key, outcome);
    return outcome;
  }
}

describe('payment safety and concurrency (senior bonus)', () => {
  let t: TestApp;
  let provider: ControlledProvider;
  let alice: TestUser;
  let bob: TestUser;

  async function setup(options: { providerTimeoutMs?: number } = {}) {
    provider = new ControlledProvider();
    t = await createTestApp({ provider, ...options });
    alice = await t.createUser('Alice', 10_000);
    bob = await t.createUser('Bob', 10_000);
  }
  afterEach(async () => {
    t.expectLedgerConsistent();
    await t.app.close();
  });

  const body = (amountMinor = 4_000, reference = 'Room 7') => ({ accountId: alice.mainAccountId, amountMinor, reference });
  const entries = (paymentId: string, kind?: string) =>
    t.store.ledger.filter((e) => e.referenceId === paymentId && (kind === undefined || e.kind === kind));
  const reconcile = (actor: TestUser, id: string) => t.http().post(`/api/payments/${id}/reconcile`).set(HEADER, actor.id);
  const transfer = (actor: TestUser, from: string, to: string, amountMinor: number) =>
    t.http().post('/api/transfers').set(HEADER, actor.id).send({ fromAccountId: from, toAccountId: to, amountMinor });

  /** Creates an UNKNOWN payment whose charge really happened at the provider (response lost). */
  async function unknownButCharged(amountMinor = 4_000): Promise<Payment> {
    provider.chargeScript = 'charge_then_timeout';
    const payment = (await t.pay(alice, body(amountMinor)).expect(201)).body as Payment;
    expect(payment.status).toBe('UNKNOWN');
    provider.chargeScript = 'approve';
    return payment;
  }

  describe('concurrency', () => {
    it('1+2: concurrent transfers from one account cannot overspend and conserve total funds', async () => {
      await setup();
      const total = t.totalFunds();
      // Transfers contain no await between check and write, so the only possible interleaving is between whole
      // requests; 25 overlapping requests for 1,000 each against 10,000 must yield exactly 10 successes.
      const results = await Promise.all(Array.from({ length: 25 }, () => transfer(alice, alice.mainAccountId, bob.mainAccountId, 1_000)));
      expect(results.filter((r) => r.status === 201)).toHaveLength(10);
      expect(results.filter((r) => r.status === 422).every((r) => (r.body as { error: { code: string } }).error.code === 'INSUFFICIENT_FUNDS')).toBe(true);
      expect(results.filter((r) => r.status === 422)).toHaveLength(15);
      expect(t.balance(alice.mainAccountId)).toBe(0);
      expect(t.balance(bob.mainAccountId)).toBe(20_000);
      expect(t.totalFunds()).toBe(total);
    });

    it('2: crossing concurrent transfers between three accounts conserve total funds', async () => {
      await setup();
      const savings = await t.openAccount(alice, 'Savings', 5_000);
      const total = t.totalFunds();
      const moves = Array.from({ length: 30 }, (_, i) => {
        const [from, to, actor] =
          i % 3 === 0 ? [alice.mainAccountId, bob.mainAccountId, alice] : i % 3 === 1 ? [bob.mainAccountId, savings, bob] : [savings, alice.mainAccountId, alice];
        return transfer(actor, from, to, 700 + i);
      });
      await Promise.all(moves);
      expect(t.totalFunds()).toBe(total);
    });

    it('3: a transfer cannot spend funds reserved by an in-flight payment', async () => {
      await setup();
      const parked = provider.parkNextCharge();
      const paying = t.pay(alice, body(7_000)).then((r) => r);
      await parked.arrived.promise; // the payment has reserved 7,000 and is now awaiting the provider

      expect(t.balance(alice.mainAccountId)).toBe(3_000);
      expect(t.reserved(alice.mainAccountId)).toBe(7_000);
      expectSafeError(await transfer(alice, alice.mainAccountId, bob.mainAccountId, 3_001), 422, 'INSUFFICIENT_FUNDS');
      expectSafeError(await t.pay(alice, body(3_001, 'Other room')), 422, 'INSUFFICIENT_FUNDS');
      await transfer(alice, alice.mainAccountId, bob.mainAccountId, 3_000).expect(201);

      parked.release.resolve({ status: 'succeeded', providerChargeId: 'ch_parked' });
      expect(((await paying).body as Payment).status).toBe('SUCCEEDED');
      expect(t.balance(alice.mainAccountId)).toBe(0);
      expect(t.reserved(alice.mainAccountId)).toBe(0);
      expect(provider.chargeRequests).toHaveLength(1); // the rejected payment never reached the provider
    });
  });

  describe('idempotency', () => {
    it('4: a duplicate arriving while the first is in flight gets the same payment — one charge, one debit', async () => {
      await setup();
      const key = randomUUID();
      const parked = provider.parkNextCharge();
      const first = t.pay(alice, body(), key).then((r) => r);
      await parked.arrived.promise;

      const duplicate = await t.pay(alice, body(), key).expect(201);
      const inFlight = duplicate.body as Payment;
      expect(inFlight.status).toBe('PROCESSING');

      parked.release.resolve({ status: 'succeeded', providerChargeId: 'ch_1' });
      const settled = (await first).body as Payment;
      expect(settled.id).toBe(inFlight.id);
      expect(settled.status).toBe('SUCCEEDED');
      expect(provider.chargeRequests).toHaveLength(1);
      expect(entries(settled.id, 'PAYMENT_RESERVE')).toHaveLength(1);
      expect(entries(settled.id, 'PAYMENT_CAPTURE')).toHaveLength(1);
      expect(t.balance(alice.mainAccountId)).toBe(6_000);
      expect(t.store.payments.size).toBe(1);
    });

    it('4: five simultaneous identical requests create one payment and one charge', async () => {
      await setup();
      const key = randomUUID();
      const results = await Promise.all(Array.from({ length: 5 }, () => t.pay(alice, body(), key)));
      const ids = new Set(results.map((r) => (r.body as Payment).id));
      expect(ids.size).toBe(1);
      expect(provider.chargeRequests).toHaveLength(1);
      expect(t.balance(alice.mainAccountId)).toBe(6_000);
    });

    it('a replay after success returns the stored result without touching the provider or ledger', async () => {
      await setup();
      const key = randomUUID();
      const original = (await t.pay(alice, body(), key).expect(201)).body as Payment;
      const before = t.snapshot();
      const replay = (await t.pay(alice, body(), key).expect(201)).body as Payment;
      expect(replay).toEqual(original);
      expect(t.snapshot()).toEqual(before);
      expect(provider.chargeRequests).toHaveLength(1);
    });

    it('5: reusing a key with a different payload is a 409 and changes nothing', async () => {
      await setup();
      const key = randomUUID();
      await t.pay(alice, body(4_000), key).expect(201);
      const before = t.snapshot();
      for (const changed of [body(4_001), body(4_000, 'Room 8'), { ...body(), accountId: await t.openAccount(alice, 'Other') }]) {
        expectSafeError(await t.pay(alice, changed, key), 409, 'IDEMPOTENCY_KEY_REUSED');
      }
      expect(t.store.payments.size).toBe(1);
      expect(provider.chargeRequests).toHaveLength(1);
      expect(t.snapshot().payments).toEqual(before.payments);
    });

    it('a key is not consumed by a rejected request (insufficient funds), so it can be used once funds exist', async () => {
      await setup();
      const key = randomUUID();
      expectSafeError(await t.pay(alice, body(15_000), key), 422, 'INSUFFICIENT_FUNDS');
      t.ledger.seed(alice.mainAccountId, 5_000);
      const payment = (await t.pay(alice, body(15_000), key).expect(201)).body as Payment;
      expect(payment.status).toBe('SUCCEEDED');
      expect(t.store.payments.size).toBe(1);
    });

    it('6: keys are scoped per acting user — another user’s identical key neither reveals nor reuses the payment', async () => {
      await setup();
      const key = randomUUID();
      const alicePayment = (await t.pay(alice, body(), key).expect(201)).body as Payment;

      // Bob, same key, his own account: an independent payment.
      const bobPayment = (await t.pay(bob, { accountId: bob.mainAccountId, amountMinor: 4_000, reference: 'Room 7' }, key).expect(201)).body as Payment;
      expect(bobPayment.id).not.toBe(alicePayment.id);
      expect(bobPayment.accountId).toBe(bob.mainAccountId);

      // Bob, same key, Alice's exact payload: a plain 404 for her account — not her payment, not a conflict.
      const before = t.snapshot();
      const probe = await t.pay(bob, body(), randomUUID());
      expectSafeError(probe, 404, 'NOT_FOUND');
      const sameKeyProbe = await t.pay(bob, body(), key);
      expect(sameKeyProbe.status).toBe(409); // conflicts with BOB's own earlier use of the key, not Alice's
      expect(JSON.stringify(sameKeyProbe.body)).not.toContain(alicePayment.id);
      expect(t.snapshot()).toEqual(before);
    });
  });

  describe('ambiguous provider outcomes', () => {
    it('7+12: charge then lost response stays UNKNOWN with funds reserved until reconciliation', async () => {
      await setup();
      const payment = await unknownButCharged();
      expect(provider.successfulCharges(payment.id)).toBe(1); // the provider really took the money
      expect(t.balance(alice.mainAccountId)).toBe(6_000);
      expect(t.reserved(alice.mainAccountId)).toBe(4_000);
      expect(entries(payment.id, 'PAYMENT_RELEASE')).toHaveLength(0); // never refunded on a timeout

      const read = await t.http().get(`/api/payments/${payment.id}`).set(HEADER, alice.id).expect(200);
      expect((read.body as Payment).status).toBe('UNKNOWN'); // reading does not resolve or guess
    });

    it('8: retrying an uncertain payment with the same key resolves it without a second charge', async () => {
      await setup();
      const key = randomUUID();
      provider.chargeScript = 'charge_then_timeout';
      const first = (await t.pay(alice, body(), key).expect(201)).body as Payment;
      expect(first.status).toBe('UNKNOWN');

      const retry = (await t.pay(alice, body(), key).expect(201)).body as Payment;
      expect(retry.id).toBe(first.id);
      expect(retry.status).toBe('SUCCEEDED');
      expect(provider.chargeRequests).toHaveLength(1); // found by lookup, not re-charged
      expect(provider.lookupKeys).toEqual([first.id]);
      expect(t.balance(alice.mainAccountId)).toBe(6_000);
      expect(t.reserved(alice.mainAccountId)).toBe(0);
    });

    it('9: reconciliation settles a confirmed success exactly once', async () => {
      await setup();
      const payment = await unknownButCharged();
      const settled = (await reconcile(alice, payment.id).expect(200)).body as Payment;
      expect(settled.status).toBe('SUCCEEDED');
      const after = t.snapshot();
      expect((await reconcile(alice, payment.id).expect(200)).body).toEqual(settled);
      expect(t.snapshot()).toEqual(after);
      expect(entries(payment.id, 'PAYMENT_CAPTURE')).toHaveLength(1);
      expect(provider.lookupKeys).toHaveLength(1);
    });

    it('10: a definitive failure found by reconciliation releases funds exactly once', async () => {
      await setup();
      provider.chargeScript = 'timeout_before_charge';
      const payment = (await t.pay(alice, body()).expect(201)).body as Payment;
      provider.records.set(payment.id, { status: 'declined', reason: 'Card declined.' }); // provider's final answer

      const settled = (await reconcile(alice, payment.id).expect(200)).body as Payment;
      expect(settled.status).toBe('FAILED');
      await reconcile(alice, payment.id).expect(200);
      await reconcile(alice, payment.id).expect(200);
      expect(entries(payment.id, 'PAYMENT_RELEASE')).toHaveLength(1);
      expect(t.balance(alice.mainAccountId)).toBe(10_000);
      expect(t.reserved(alice.mainAccountId)).toBe(0);
    });

    it('11: concurrent reconciliations make one provider lookup and one capture', async () => {
      await setup();
      const payment = await unknownButCharged();
      const parked = provider.parkNextLookup();
      const first = reconcile(alice, payment.id).then((r) => r);
      await parked.arrived.promise; // first reconcile owns the payment (PROCESSING) and awaits the provider

      const others = await Promise.all([reconcile(alice, payment.id), reconcile(alice, payment.id), t.pay(alice, body(), randomUUID())]);
      expect((others[0].body as Payment).status).toBe('PROCESSING');
      expect((others[1].body as Payment).status).toBe('PROCESSING');
      expect(provider.lookupKeys).toHaveLength(1);

      parked.release.resolve({ status: 'succeeded', providerChargeId: 'ch_x' });
      expect(((await first).body as Payment).status).toBe('SUCCEEDED');
      expect(entries(payment.id, 'PAYMENT_CAPTURE')).toHaveLength(1);
      expect(entries(payment.id, 'PAYMENT_RELEASE')).toHaveLength(0);
    });

    it('11: many simultaneous reconciliations are harmless', async () => {
      await setup();
      const payment = await unknownButCharged();
      const results = await Promise.all(Array.from({ length: 8 }, () => reconcile(alice, payment.id)));
      expect(results.every((r) => r.status === 200)).toBe(true);
      expect(t.store.payments.get(payment.id)?.status).toBe('SUCCEEDED');
      expect(entries(payment.id, 'PAYMENT_CAPTURE')).toHaveLength(1);
      expect(provider.lookupKeys).toHaveLength(1);
    });

    it('12: pending or failing lookups keep the payment UNKNOWN and the funds reserved', async () => {
      await setup();
      const payment = await unknownButCharged();
      for (const script of ['pending', 'error'] as const) {
        provider.lookupScript = script;
        expect(((await reconcile(alice, payment.id).expect(200)).body as Payment).status).toBe('UNKNOWN');
        expect(t.reserved(alice.mainAccountId)).toBe(4_000);
        expect(t.balance(alice.mainAccountId)).toBe(6_000);
      }
      expect(entries(payment.id, 'PAYMENT_RELEASE')).toHaveLength(0);
      expect(entries(payment.id, 'PAYMENT_CAPTURE')).toHaveLength(0);
    });

    it('12: a provider that never answers times out to UNKNOWN; its late answer is ignored until reconciliation', async () => {
      await setup({ providerTimeoutMs: 30 });
      const parked = provider.parkNextCharge();
      const payment = (await t.pay(alice, body()).expect(201)).body as Payment;
      await parked.arrived.promise;
      expect(payment.status).toBe('UNKNOWN');
      expect(payment.attempts).toEqual([expect.objectContaining({ operation: 'charge', result: 'timeout' })]);

      parked.release.resolve({ status: 'succeeded', providerChargeId: 'ch_late' }); // the late answer arrives
      await new Promise((r) => setTimeout(r, 10));
      expect(t.store.payments.get(payment.id)?.status).toBe('UNKNOWN'); // not applied behind our back
      expect(t.reserved(alice.mainAccountId)).toBe(4_000);

      expect(((await reconcile(alice, payment.id).expect(200)).body as Payment).status).toBe('SUCCEEDED');
      expect(provider.chargeRequests).toHaveLength(1);
    });

    it('13: timeout before charge: not_found is not treated as failure; reconcile re-charges with the original key', async () => {
      await setup();
      provider.chargeScript = 'timeout_before_charge';
      const payment = (await t.pay(alice, body()).expect(201)).body as Payment;
      expect(payment.status).toBe('UNKNOWN');

      // Provider still unavailable: lookup says not_found, re-charge times out again → still UNKNOWN, funds held.
      expect(((await reconcile(alice, payment.id).expect(200)).body as Payment).status).toBe('UNKNOWN');
      expect(t.reserved(alice.mainAccountId)).toBe(4_000);

      provider.chargeScript = 'approve';
      const settled = (await reconcile(alice, payment.id).expect(200)).body as Payment;
      expect(settled.status).toBe('SUCCEEDED');
      expect(provider.chargeRequests.map((r) => r.idempotencyKey)).toEqual([payment.id, payment.id, payment.id]);
      expect(provider.successfulCharges(payment.id)).toBe(1);
      expect(t.balance(alice.mainAccountId)).toBe(6_000);
      expect(settled.attempts.map((a) => `${a.operation}:${a.result}`)).toEqual([
        'charge:timeout',
        'lookup:not_found',
        'charge:timeout',
        'lookup:not_found',
        'charge:succeeded',
      ]);
    });

    it('13: a client retry with the original key also safely resolves a timeout-before-charge', async () => {
      await setup();
      const key = randomUUID();
      provider.chargeScript = 'timeout_before_charge';
      const payment = (await t.pay(alice, body(), key).expect(201)).body as Payment;
      provider.chargeScript = 'approve';
      const retried = (await t.pay(alice, body(), key).expect(201)).body as Payment;
      expect(retried).toMatchObject({ id: payment.id, status: 'SUCCEEDED' });
      expect(new Set(provider.chargeRequests.map((r) => r.idempotencyKey))).toEqual(new Set([payment.id]));
    });
  });

  describe('authorization', () => {
    it('14: another user cannot read, retry, or reconcile a payment, and nothing changes', async () => {
      await setup();
      const key = randomUUID();
      provider.chargeScript = 'charge_then_timeout';
      const payment = (await t.pay(alice, body(), key).expect(201)).body as Payment;
      provider.chargeScript = 'approve';
      const before = t.snapshot();
      const lookupsBefore = provider.lookupKeys.length;

      expectSafeError(await t.http().get(`/api/payments/${payment.id}`).set(HEADER, bob.id), 404, 'NOT_FOUND');
      expectSafeError(await reconcile(bob, payment.id), 404, 'NOT_FOUND');
      expectSafeError(await reconcile(bob, randomUUID()), 404, 'NOT_FOUND');
      expectSafeError(await t.pay(bob, body(), key), 404, 'NOT_FOUND'); // Alice's account, Bob's key scope

      expect(t.snapshot()).toEqual(before);
      expect(provider.lookupKeys).toHaveLength(lookupsBefore);
      expect(t.store.payments.get(payment.id)?.status).toBe('UNKNOWN');
    });

    it('reconcile takes nothing from the request: the body is ignored and amount/account come from the stored payment', async () => {
      await setup();
      const payment = await unknownButCharged();
      const res = await reconcile(alice, payment.id).send({ status: 'FAILED', amountMinor: 1, accountId: bob.mainAccountId }).expect(200);
      expect((res.body as Payment).status).toBe('SUCCEEDED');
      expect(t.balance(bob.mainAccountId)).toBe(10_000);
      expect(entries(payment.id, 'PAYMENT_CAPTURE').map((e) => e.reservedDeltaMinor)).toEqual([-4_000]);
    });
  });
});

describe('simulated provider scenarios (dev controls)', () => {
  let t: TestApp;
  afterEach(async () => {
    t.expectLedgerConsistent();
    await t.app.close();
  });

  it('runs the four deterministic scenarios end to end, with provider records separate from app state', async () => {
    t = await createTestApp();
    const alice = await t.createUser('Alice', 10_000);
    const setMode = (mode: string) => t.http().post('/api/dev/provider/mode').send({ mode }).expect(201);
    const payOnce = async () => (await t.pay(alice, { accountId: alice.mainAccountId, amountMinor: 1_000, reference: 'Room 1' }).expect(201)).body as Payment;

    await setMode('approve');
    expect((await payOnce()).status).toBe('SUCCEEDED');
    await setMode('decline');
    expect((await payOnce()).status).toBe('FAILED');
    await setMode('timeout_before_charge');
    const neverCharged = await payOnce();
    expect(neverCharged.status).toBe('UNKNOWN');
    await setMode('charge_then_timeout');
    const charged = await payOnce();
    expect(charged.status).toBe('UNKNOWN');

    expect(t.simulator.chargedTimes(charged.id)).toBe(1);
    expect(t.simulator.chargedTimes(neverCharged.id)).toBe(0);
    expect(t.balance(alice.mainAccountId)).toBe(7_000); // 1,000 captured + 2,000 reserved
    expect(t.reserved(alice.mainAccountId)).toBe(2_000);

    await setMode('approve');
    const http = (id: string) => t.http().post(`/api/payments/${id}/reconcile`).set(HEADER, alice.id).expect(200);
    expect(((await http(charged.id)).body as Payment).status).toBe('SUCCEEDED');
    expect(((await http(neverCharged.id)).body as Payment).status).toBe('SUCCEEDED');
    expect(t.simulator.inspect().successfulCharges).toBe(3);
    expect(t.balance(alice.mainAccountId)).toBe(7_000);
    expect(t.reserved(alice.mainAccountId)).toBe(0);
  });
});
