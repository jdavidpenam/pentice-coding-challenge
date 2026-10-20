import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import type { ChargeRequest, PaymentProvider } from '../src/payments/payment-provider.js';
import type { Payment, ProviderOutcome } from '../src/store/models.js';
import { createTestApp, expectSafeError, HEADER, type TestApp, type TestUser } from './helpers.js';

const pay = (t: TestApp, actor: TestUser, body: object) => t.http().post('/api/payments').set(HEADER, actor.id).send(body);

describe('payments through the simulated provider', () => {
  let t: TestApp;
  afterEach(async () => {
    t.expectLedgerConsistent();
    await t.app.close();
  });

  it('AC9: succeeds with enough balance, charges once, and debits exactly the amount', async () => {
    t = await createTestApp();
    const alice = await t.createUser('Alice', 10_000);
    const res = await pay(t, alice, { accountId: alice.mainAccountId, amountMinor: 4_200, reference: 'Room 101 #BK-7' }).expect(201);
    const payment = res.body as Payment;

    expect(payment).toMatchObject({ status: 'SUCCEEDED', amountMinor: 4_200, currency: 'USD', accountId: alice.mainAccountId });
    expect(payment.status === 'SUCCEEDED' && payment.providerChargeId).toMatch(/^sim_ch_/);
    expect(t.balance(alice.mainAccountId)).toBe(5_800);
    expect(t.simulator.inspect().successfulCharges).toBe(1);
    expect(t.store.ledger.filter((e) => e.referenceId === payment.id).map((e) => [e.kind, e.amountMinor])).toEqual([['PAYMENT_HOLD', -4_200]]);

    const read = await t.http().get(`/api/payments/${payment.id}`).set(HEADER, alice.id).expect(200);
    expect(read.body).toEqual(payment);
  });

  it('AC10: without enough balance it is rejected, the provider is never called, and nothing changes', async () => {
    t = await createTestApp();
    const alice = await t.createUser('Alice', 1_000);
    const before = t.snapshot();
    const res = await pay(t, alice, { accountId: alice.mainAccountId, amountMinor: 1_001, reference: 'Room 5' });
    expectSafeError(res, 422, 'INSUFFICIENT_FUNDS');
    expect(t.simulator.inspect().totalCalls).toBe(0);
    expect(t.snapshot()).toEqual(before);
  });

  it('AC11: a definitive decline ends FAILED and restores the balance', async () => {
    t = await createTestApp();
    const alice = await t.createUser('Alice', 10_000);
    t.simulator.configure({ mode: 'decline' });
    const res = await pay(t, alice, { accountId: alice.mainAccountId, amountMinor: 3_000, reference: 'Room 9' }).expect(201);
    const payment = res.body as Payment;

    expect(payment.status).toBe('FAILED');
    expect(t.balance(alice.mainAccountId)).toBe(10_000);
    expect(t.simulator.inspect().successfulCharges).toBe(0);
    expect(t.store.ledger.filter((e) => e.referenceId === payment.id).map((e) => [e.kind, e.amountMinor])).toEqual([
      ['PAYMENT_HOLD', -3_000],
      ['PAYMENT_RELEASE', 3_000],
    ]);
  });

  it('AC12: works unchanged against a different PaymentProvider implementation', async () => {
    const calls: ChargeRequest[] = [];
    const otherProvider: PaymentProvider = {
      charge(request): Promise<ProviderOutcome> {
        calls.push(request);
        return Promise.resolve({ status: 'succeeded', providerChargeId: 'other_123' });
      },
    };
    t = await createTestApp({ provider: otherProvider });
    const alice = await t.createUser('Alice', 10_000);
    const res = await pay(t, alice, { accountId: alice.mainAccountId, amountMinor: 700, reference: 'Room 3' }).expect(201);
    const payment = res.body as Payment;

    expect(payment).toMatchObject({ status: 'SUCCEEDED', providerChargeId: 'other_123' });
    expect(calls).toEqual([{ idempotencyKey: payment.id, amountMinor: 700, currency: 'USD', reference: 'Room 3' }]);
    expect(t.balance(alice.mainAccountId)).toBe(9_300);
  });

  it('AC12: a definitive decline from a different provider also releases the hold', async () => {
    const decliner: PaymentProvider = { charge: () => Promise.resolve({ status: 'declined', reason: 'Insufficient limit.' }) };
    t = await createTestApp({ provider: decliner });
    const alice = await t.createUser('Alice', 10_000);
    const res = await pay(t, alice, { accountId: alice.mainAccountId, amountMinor: 700, reference: 'Room 3' }).expect(201);
    expect(res.body).toMatchObject({ status: 'FAILED', failureReason: 'Insufficient limit.' });
    expect(t.balance(alice.mainAccountId)).toBe(10_000);
  });

  it('provider error (unknown outcome) keeps the payment PENDING with funds held — never released or guessed', async () => {
    const failing: PaymentProvider = { charge: () => Promise.reject(new Error('socket hang up at internal.host:443')) };
    t = await createTestApp({ provider: failing });
    const alice = await t.createUser('Alice', 10_000);
    const res = await pay(t, alice, { accountId: alice.mainAccountId, amountMinor: 2_000, reference: 'Room 4' }).expect(201);

    expect(res.body).toMatchObject({ status: 'PENDING', attempts: [{ error: 'PROVIDER_ERROR' }] });
    expect(JSON.stringify(res.body)).not.toContain('internal.host');
    expect(t.balance(alice.mainAccountId)).toBe(8_000);
  });

  it('AC13: cannot pay from, read, or list another user’s account or payments', async () => {
    t = await createTestApp();
    const alice = await t.createUser('Alice', 10_000);
    const bob = await t.createUser('Bob', 10_000);
    const bobPayment = (await pay(t, bob, { accountId: bob.mainAccountId, amountMinor: 100, reference: 'Bob room' }).expect(201)).body as Payment;

    const before = t.snapshot();
    const debit = await pay(t, alice, { accountId: bob.mainAccountId, amountMinor: 100, reference: 'Steal' });
    expectSafeError(debit, 404, 'NOT_FOUND');
    expect(t.snapshot()).toEqual(before);
    expect(t.simulator.inspect().totalCalls).toBe(1);

    expectSafeError(await t.http().get(`/api/payments/${bobPayment.id}`).set(HEADER, alice.id), 404, 'NOT_FOUND');
    expectSafeError(await t.http().get(`/api/payments/${randomUUID()}`).set(HEADER, alice.id), 404, 'NOT_FOUND');
    expect((await t.http().get('/api/payments').set(HEADER, alice.id).expect(200)).body).toEqual([]);
  });

  it.each([
    ['status', 'SUCCEEDED'],
    ['providerChargeId', 'sim_ch_fake'],
    ['userId', '00000000-0000-4000-8000-000000000000'],
    ['attempts', []],
  ])('rejects client-supplied server-controlled field %s', async (field, value) => {
    t = await createTestApp();
    const alice = await t.createUser('Alice', 10_000);
    const before = t.snapshot();
    const res = await pay(t, alice, { accountId: alice.mainAccountId, amountMinor: 100, reference: 'Room 1', [field]: value });
    expectSafeError(res, 400, 'VALIDATION_FAILED');
    expect(t.snapshot()).toEqual(before);
    expect(t.simulator.inspect().totalCalls).toBe(0);
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
    const res = await pay(t, alice, { accountId: alice.mainAccountId, ...partial });
    expectSafeError(res, 400, 'VALIDATION_FAILED');
    expect(t.snapshot()).toEqual(before);
  });

  it('dev provider controls exist only when dev tools are enabled', async () => {
    t = await createTestApp({ devTools: false });
    expectSafeError(await t.http().post('/api/dev/provider/mode').send({ mode: 'decline' }), 404, 'NOT_FOUND');
    await t.app.close();

    t = await createTestApp({ devTools: true });
    const res = await t.http().post('/api/dev/provider/mode').send({ mode: 'decline' }).expect(201);
    expect(res.body).toMatchObject({ mode: 'decline' });
    expectSafeError(await t.http().post('/api/dev/provider/mode').send({ mode: 'charge_everyone' }), 400, 'VALIDATION_FAILED');
  });
});
