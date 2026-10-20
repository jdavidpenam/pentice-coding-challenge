import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import type { ChargeRequest, PaymentProvider } from '../src/payments/payment-provider.js';
import type { Payment, ProviderOutcome } from '../src/store/models.js';
import { createTestApp, expectSafeError, HEADER, type TestApp } from './helpers.js';

const notFoundLookup: PaymentProvider['lookup'] = () => Promise.resolve({ status: 'not_found' });

describe('payments through the simulated provider (core behaviour)', () => {
  let t: TestApp;
  afterEach(async () => {
    t.expectLedgerConsistent();
    await t.app.close();
  });

  const ledgerFor = (paymentId: string) =>
    t.store.ledger.filter((e) => e.referenceId === paymentId).map((e) => [e.kind, e.availableDeltaMinor, e.reservedDeltaMinor]);

  it('AC9: succeeds with enough balance, charges once, and debits exactly the amount (reserve, then capture)', async () => {
    t = await createTestApp();
    const alice = await t.createUser('Alice', 10_000);
    const res = await t.pay(alice, { accountId: alice.mainAccountId, amountMinor: 4_200, reference: 'Room 101 #BK-7' }).expect(201);
    const payment = res.body as Payment;

    expect(payment).toMatchObject({ status: 'SUCCEEDED', amountMinor: 4_200, currency: 'USD', accountId: alice.mainAccountId });
    expect(payment.status === 'SUCCEEDED' && payment.providerChargeId).toMatch(/^sim_ch_/);
    expect(t.balance(alice.mainAccountId)).toBe(5_800);
    expect(t.reserved(alice.mainAccountId)).toBe(0);
    expect(t.simulator.inspect().successfulCharges).toBe(1);
    expect(ledgerFor(payment.id)).toEqual([
      ['PAYMENT_RESERVE', -4_200, 4_200],
      ['PAYMENT_CAPTURE', 0, -4_200],
    ]);
    const read = await t.http().get(`/api/payments/${payment.id}`).set(HEADER, alice.id).expect(200);
    expect(read.body).toEqual(payment);
  });

  it('AC10: without enough available balance it is rejected, the provider is never called, and nothing changes', async () => {
    t = await createTestApp();
    const alice = await t.createUser('Alice', 1_000);
    const before = t.snapshot();
    const res = await t.pay(alice, { accountId: alice.mainAccountId, amountMinor: 1_001, reference: 'Room 5' });
    expectSafeError(res, 422, 'INSUFFICIENT_FUNDS');
    expect(t.simulator.inspect().chargeCalls).toBe(0);
    expect(t.snapshot()).toEqual(before);
  });

  it('AC11: a definitive decline ends FAILED and releases the reservation', async () => {
    t = await createTestApp();
    const alice = await t.createUser('Alice', 10_000);
    t.simulator.configure({ mode: 'decline' });
    const payment = (await t.pay(alice, { accountId: alice.mainAccountId, amountMinor: 3_000, reference: 'Room 9' }).expect(201)).body as Payment;

    expect(payment.status).toBe('FAILED');
    expect(t.balance(alice.mainAccountId)).toBe(10_000);
    expect(t.reserved(alice.mainAccountId)).toBe(0);
    expect(t.simulator.inspect().successfulCharges).toBe(0);
    expect(ledgerFor(payment.id)).toEqual([
      ['PAYMENT_RESERVE', -3_000, 3_000],
      ['PAYMENT_RELEASE', 3_000, -3_000],
    ]);
  });

  it('AC12: works unchanged against a different PaymentProvider implementation', async () => {
    const calls: ChargeRequest[] = [];
    const otherProvider: PaymentProvider = {
      charge(request): Promise<ProviderOutcome> {
        calls.push(request);
        return Promise.resolve({ status: 'succeeded', providerChargeId: 'other_123' });
      },
      lookup: notFoundLookup,
    };
    t = await createTestApp({ provider: otherProvider });
    const alice = await t.createUser('Alice', 10_000);
    const payment = (await t.pay(alice, { accountId: alice.mainAccountId, amountMinor: 700, reference: 'Room 3' }).expect(201)).body as Payment;

    expect(payment).toMatchObject({ status: 'SUCCEEDED', providerChargeId: 'other_123' });
    expect(calls).toEqual([{ idempotencyKey: payment.id, amountMinor: 700, currency: 'USD', reference: 'Room 3' }]);
    expect(t.balance(alice.mainAccountId)).toBe(9_300);
  });

  it('AC12: a definitive decline from a different provider also releases the reservation', async () => {
    const decliner: PaymentProvider = { charge: () => Promise.resolve({ status: 'declined', reason: 'Insufficient limit.' }), lookup: notFoundLookup };
    t = await createTestApp({ provider: decliner });
    const alice = await t.createUser('Alice', 10_000);
    const res = await t.pay(alice, { accountId: alice.mainAccountId, amountMinor: 700, reference: 'Room 3' }).expect(201);
    expect(res.body).toMatchObject({ status: 'FAILED', failureReason: 'Insufficient limit.' });
    expect(t.balance(alice.mainAccountId)).toBe(10_000);
  });

  it('a provider error is UNKNOWN: funds stay reserved, nothing is guessed, and no internals leak', async () => {
    const failing: PaymentProvider = { charge: () => Promise.reject(new Error('socket hang up at internal.host:443')), lookup: notFoundLookup };
    t = await createTestApp({ provider: failing });
    const alice = await t.createUser('Alice', 10_000);
    const res = await t.pay(alice, { accountId: alice.mainAccountId, amountMinor: 2_000, reference: 'Room 4' }).expect(201);

    expect(res.body).toMatchObject({ status: 'UNKNOWN', attempts: [{ operation: 'charge', result: 'error' }] });
    expect(JSON.stringify(res.body)).not.toContain('internal.host');
    expect(t.balance(alice.mainAccountId)).toBe(8_000);
    expect(t.reserved(alice.mainAccountId)).toBe(2_000);
  });

  it('a malformed provider answer leaves the payment UNKNOWN and reserved, and a later reconcile can settle it', async () => {
    let lookups = 0;
    const malformed: PaymentProvider = {
      charge: () => Promise.resolve({ status: 'weird' } as unknown as ProviderOutcome),
      lookup: () => {
        lookups += 1;
        return Promise.resolve(lookups === 1 ? ({ status: 'weird' } as never) : { status: 'succeeded', providerChargeId: 'other_9' });
      },
    };
    t = await createTestApp({ provider: malformed });
    const alice = await t.createUser('Alice', 10_000);
    const created = (await t.pay(alice, { accountId: alice.mainAccountId, amountMinor: 2_000, reference: 'Room 5' }).expect(201)).body as Payment;
    expect(created.status).toBe('UNKNOWN');
    expect(t.reserved(alice.mainAccountId)).toBe(2_000);

    const first = (await t.http().post(`/api/payments/${created.id}/reconcile`).set(HEADER, alice.id).expect(200)).body as Payment;
    expect(first.status).toBe('UNKNOWN');
    expect(t.reserved(alice.mainAccountId)).toBe(2_000);
    const second = (await t.http().post(`/api/payments/${created.id}/reconcile`).set(HEADER, alice.id).expect(200)).body as Payment;
    expect(second.status).toBe('SUCCEEDED');
    expect(t.balance(alice.mainAccountId)).toBe(8_000);
    expect(t.reserved(alice.mainAccountId)).toBe(0);
  });

  it('AC13: cannot pay from, read, or list another user’s account or payments', async () => {
    t = await createTestApp();
    const alice = await t.createUser('Alice', 10_000);
    const bob = await t.createUser('Bob', 10_000);
    const bobPayment = (await t.pay(bob, { accountId: bob.mainAccountId, amountMinor: 100, reference: 'Bob room' }).expect(201)).body as Payment;

    const before = t.snapshot();
    const debit = await t.pay(alice, { accountId: bob.mainAccountId, amountMinor: 100, reference: 'Steal' });
    expectSafeError(debit, 404, 'NOT_FOUND');
    expect(t.snapshot()).toEqual(before);
    expect(t.simulator.inspect().chargeCalls).toBe(1);

    expectSafeError(await t.http().get(`/api/payments/${bobPayment.id}`).set(HEADER, alice.id), 404, 'NOT_FOUND');
    expectSafeError(await t.http().get(`/api/payments/${randomUUID()}`).set(HEADER, alice.id), 404, 'NOT_FOUND');
    expect((await t.http().get('/api/payments').set(HEADER, alice.id).expect(200)).body).toEqual([]);
  });

  it.each([
    ['status', 'SUCCEEDED'],
    ['providerChargeId', 'sim_ch_fake'],
    ['userId', '00000000-0000-4000-8000-000000000000'],
    ['attempts', []],
    ['outcome', { status: 'succeeded' }],
  ])('rejects client-supplied server-controlled field %s', async (field, value) => {
    t = await createTestApp();
    const alice = await t.createUser('Alice', 10_000);
    const before = t.snapshot();
    const res = await t.pay(alice, { accountId: alice.mainAccountId, amountMinor: 100, reference: 'Room 1', [field]: value });
    expectSafeError(res, 400, 'VALIDATION_FAILED');
    expect(t.snapshot()).toEqual(before);
    expect(t.simulator.inspect().chargeCalls).toBe(0);
  });

  it.each([
    ['zero amount', { amountMinor: 0, reference: 'Room 1' }],
    ['fractional amount', { amountMinor: 1.5, reference: 'Room 1' }],
    ['string amount', { amountMinor: '100', reference: 'Room 1' }],
    ['empty reference', { amountMinor: 100, reference: '' }],
    ['reference with markup', { amountMinor: 100, reference: '<img src=x>' }],
    ['card-number-like extra field', { amountMinor: 100, reference: 'Room 1', cardNumber: '4242424242424242' }],
  ])('rejects invalid payment input (%s)', async (_label, partial) => {
    t = await createTestApp();
    const alice = await t.createUser('Alice', 10_000);
    const before = t.snapshot();
    const res = await t.pay(alice, { accountId: alice.mainAccountId, ...partial });
    expectSafeError(res, 400, 'VALIDATION_FAILED');
    expect(t.snapshot()).toEqual(before);
  });

  it.each([
    ['missing', undefined],
    ['too short', 'abc'],
    ['bad characters', 'key with spaces!!'],
    ['too long', 'k'.repeat(101)],
  ])('rejects a %s Idempotency-Key with 400 and no state change', async (_label, key) => {
    t = await createTestApp();
    const alice = await t.createUser('Alice', 10_000);
    const before = t.snapshot();
    const req = t.http().post('/api/payments').set(HEADER, alice.id);
    const res = await (key === undefined ? req : req.set('idempotency-key', key)).send({ accountId: alice.mainAccountId, amountMinor: 100, reference: 'Room 1' });
    expectSafeError(res, 400, 'VALIDATION_FAILED');
    expect(t.snapshot()).toEqual(before);
  });

  it('dev provider controls exist only when dev tools are enabled', async () => {
    t = await createTestApp({ devTools: false });
    expectSafeError(await t.http().post('/api/dev/provider/mode').send({ mode: 'decline' }), 404, 'NOT_FOUND');
    await t.app.close();

    t = await createTestApp({ devTools: true });
    const res = await t.http().post('/api/dev/provider/mode').send({ mode: 'charge_then_timeout' }).expect(201);
    expect(res.body).toMatchObject({ mode: 'charge_then_timeout' });
    expectSafeError(await t.http().post('/api/dev/provider/mode').send({ mode: 'charge_everyone' }), 400, 'VALIDATION_FAILED');
  });
});
